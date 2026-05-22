// scripts/f4l-l3-harness.ts
// Bateria L3 — validação do agente Nex.
// Gera 1000+ perguntas reais a partir de dados do cache, roda cada uma pelo
// agente Nex (gpt-5.4-nano + MCP), confere a resposta contra uma consulta
// independente ao mesmo cache e mede a assertividade (meta 97%+).
// Uso: tsx --env-file=.env.local scripts/f4l-l3-harness.ts [maxCasos]
import { prisma } from "../src/lib/prisma";
import { createConversation } from "../src/lib/agent/conversation";
import { runAgent } from "../src/lib/agent/run-agent";
import fs from "node:fs";

const USER_ID = "794e5207-599a-47b9-b84b-e68f07acf479"; // owner super_admin
const CONCORRENCIA = 4;
const RELATORIO = "docs/superpowers/research/2026-05-22-l3-relatorio.md";

interface Caso {
  categoria: string;
  pergunta: string;
  esperado: string;
  verificar: (resposta: string) => boolean;
}

// ─── Helpers de verificação ───────────────────────────────────────────────────

/** Extrai todos os números de um texto em pt-BR (1.234,56 → 1234.56). */
function numeros(texto: string): number[] {
  const out: number[] = [];
  const re = /-?\d[\d.]*(?:,\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    const norm = m[0].replace(/\./g, "").replace(",", ".");
    const n = Number(norm);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/** A resposta contém o número esperado (tolerância relativa para arredondamento)? */
function contemNumero(resposta: string, esperado: number): boolean {
  const tol = Math.max(1, Math.abs(esperado) * 0.01);
  return numeros(resposta).some((n) => Math.abs(n - esperado) <= tol);
}

/** A resposta contém o texto-alvo (case-insensitive, sem acento)? */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}
function contemTexto(resposta: string, alvo: string): boolean {
  return norm(resposta).includes(norm(alvo));
}

// ─── Geração de casos ─────────────────────────────────────────────────────────

/** Nome do participante sem o CNPJ entre colchetes. */
function nomeFornecedor(participante: string): string {
  return participante.replace(/\[[^\]]*\]/g, "").trim();
}

async function montarCasos(): Promise<Caso[]> {
  const casos: Caso[] = [];

  // T1 — serviço por trecho de descrição → código.
  // Usa um trecho de 80 chars (dentro do limite da tool) e só serviços cujo
  // trecho é único, para a pergunta ter resposta inequívoca.
  const todosServicos = await prisma.fatoServico.findMany({
    where: { descricao: { not: "" } },
    select: { codigo: true, codigoFormatado: true, descricao: true },
  });
  const trechoContagem = new Map<string, number>();
  for (const s of todosServicos) {
    const t = s.descricao.slice(0, 80).trim().toLowerCase();
    trechoContagem.set(t, (trechoContagem.get(t) ?? 0) + 1);
  }
  let nServico = 0;
  for (const s of todosServicos) {
    if (nServico >= 220) break;
    const trecho = s.descricao.slice(0, 80).trim();
    if ((trechoContagem.get(trecho.toLowerCase()) ?? 0) !== 1) continue;
    const cod = s.codigoFormatado ?? s.codigo;
    casos.push({
      categoria: "servico_codigo",
      pergunta: `Qual é o código do serviço cuja descrição começa com "${trecho}"?`,
      esperado: `código ${cod}`,
      verificar: (r) => contemTexto(r, cod) || contemTexto(r, s.codigo),
    });
    nServico++;
  }

  // T2 — quantas regras de preço por produto
  const produtosComPreco = await prisma.fatoPreco.groupBy({
    by: ["produtoId", "produtoNome"],
    where: { produtoId: { not: null }, produtoNome: { not: null } },
    _count: { _all: true },
    orderBy: { produtoNome: "asc" },
    take: 230,
  });
  for (const p of produtosComPreco) {
    casos.push({
      categoria: "preco_regras_produto",
      pergunta: `Quantas regras de preço existem para o produto "${p.produtoNome}"?`,
      esperado: `${p._count._all} regras`,
      verificar: (r) => contemNumero(r, p._count._all),
    });
  }

  // T3 — saldo de estoque por produto
  const saldos = await prisma.fatoEstoqueSaldo.groupBy({
    by: ["produtoNome"],
    where: { produtoNome: { not: null } },
    _sum: { quantidade: true },
    orderBy: { produtoNome: "asc" },
    take: 210,
  });
  for (const s of saldos) {
    const q = Number(s._sum.quantidade ?? 0);
    casos.push({
      categoria: "estoque_saldo_produto",
      pergunta: `Qual é o saldo total em estoque do produto "${s.produtoNome}"?`,
      esperado: `${q} unidades`,
      verificar: (r) => contemNumero(r, q),
    });
  }

  // T4 — parceiros por UF
  const ufs = await prisma.fatoParceiro.groupBy({
    by: ["uf"],
    where: { uf: { not: null } },
    _count: { _all: true },
  });
  for (const u of ufs) {
    casos.push({
      categoria: "parceiros_por_uf",
      pergunta: `Quantos parceiros estão cadastrados na UF ${u.uf}?`,
      esperado: `${u._count._all} parceiros`,
      verificar: (r) => contemNumero(r, u._count._all),
    });
  }

  // T5 — notas de entrada por fornecedor
  const fornecedores = await prisma.fatoNotaFiscal.groupBy({
    by: ["participanteNome"],
    where: { entradaSaida: "0", participanteNome: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { participanteNome: "desc" } },
    take: 210,
  });
  // Só fornecedores cujo nome (sem o CNPJ) é único, para a pergunta ser
  // inequívoca — o agente filtra a tool por esse nome.
  const fornCont = new Map<string, number>();
  for (const f of fornecedores) {
    const n = nomeFornecedor(f.participanteNome ?? "");
    fornCont.set(n, 1 + (fornCont.get(n) ?? 0));
  }
  for (const f of fornecedores) {
    const nome = nomeFornecedor(f.participanteNome ?? "");
    if (nome.length < 4 || (fornCont.get(nome) ?? 0) !== 1) continue;
    casos.push({
      categoria: "notas_entrada_fornecedor",
      pergunta: `Quantas notas fiscais de entrada recebemos do fornecedor "${nome}"?`,
      esperado: `${f._count._all} notas`,
      verificar: (r) => contemNumero(r, f._count._all),
    });
  }

  // T6 — conta contábil por código → nome
  const contas = await prisma.fatoContaContabil.findMany({
    select: { codigo: true, nome: true },
    take: 230,
  });
  for (const c of contas) {
    casos.push({
      categoria: "conta_contabil_codigo",
      pergunta: `Qual é o nome da conta contábil de código ${c.codigo}?`,
      esperado: c.nome,
      verificar: (r) => contemTexto(r, c.nome.slice(0, 24)),
    });
  }

  // T7 — pedidos por etapa
  const etapas = await prisma.fatoPedido.groupBy({
    by: ["etapaNome"],
    where: { etapaNome: { not: null } },
    _count: { _all: true },
  });
  for (const e of etapas) {
    casos.push({
      categoria: "pedidos_por_etapa",
      pergunta: `Quantos pedidos estão na etapa "${e.etapaNome}"?`,
      esperado: `${e._count._all} pedidos`,
      verificar: (r) => contemNumero(r, e._count._all),
    });
  }

  // T8 — totais globais (singletons)
  const totServicos = await prisma.fatoServico.count();
  casos.push({
    categoria: "global",
    pergunta: "Quantos serviços existem no catálogo de serviços?",
    esperado: `${totServicos}`,
    verificar: (r) => contemNumero(r, totServicos),
  });
  const totParceiros = await prisma.fatoParceiro.count();
  casos.push({
    categoria: "global",
    pergunta: "Quantos parceiros há no cadastro?",
    esperado: `${totParceiros}`,
    verificar: (r) => contemNumero(r, totParceiros),
  });
  const totPedidos = await prisma.fatoPedido.count();
  casos.push({
    categoria: "global",
    pergunta: "Quantos pedidos existem no total?",
    esperado: `${totPedidos}`,
    verificar: (r) => contemNumero(r, totPedidos),
  });
  const totNotas = await prisma.fatoNotaFiscal.count();
  casos.push({
    categoria: "global",
    pergunta: "Quantas notas fiscais existem no total?",
    esperado: `${totNotas}`,
    verificar: (r) => contemNumero(r, totNotas),
  });
  const totRegras = await prisma.fatoPreco.count();
  casos.push({
    categoria: "global",
    pergunta: "Quantas regras de preço existem no total?",
    esperado: `${totRegras}`,
    verificar: (r) => contemNumero(r, totRegras),
  });

  return casos;
}

// ─── Execução ─────────────────────────────────────────────────────────────────

interface Resultado {
  caso: Caso;
  ok: boolean;
  resposta: string;
  erro?: string;
  ms: number;
}

async function rodarCaso(caso: Caso): Promise<Resultado> {
  const t = Date.now();
  try {
    const conv = await createConversation(USER_ID, "playground");
    const r = await runAgent({
      conversationId: conv.id,
      userId: USER_ID,
      userMessage: caso.pergunta,
      channel: "playground",
      isPlayground: true,
    });
    if (!r.ok) {
      return { caso, ok: false, resposta: "", erro: r.error, ms: Date.now() - t };
    }
    return {
      caso,
      ok: caso.verificar(r.message),
      resposta: r.message,
      ms: Date.now() - t,
    };
  } catch (err) {
    return {
      caso,
      ok: false,
      resposta: "",
      erro: err instanceof Error ? err.message : String(err),
      ms: Date.now() - t,
    };
  }
}

async function pool<T, R>(itens: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(itens.length);
  let idx = 0;
  let feitos = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (idx < itens.length) {
        const i = idx++;
        out[i] = await fn(itens[i], i);
        feitos++;
        if (feitos % 50 === 0) {
          console.log(`[l3] ${feitos}/${itens.length}`);
        }
      }
    }),
  );
  return out;
}

function gerarRelatorio(resultados: Resultado[]): string {
  const total = resultados.length;
  const acertos = resultados.filter((r) => r.ok).length;
  const pct = total ? (acertos / total) * 100 : 0;

  const porCat = new Map<string, { ok: number; total: number }>();
  for (const r of resultados) {
    const c = porCat.get(r.caso.categoria) ?? { ok: 0, total: 0 };
    c.total++;
    if (r.ok) c.ok++;
    porCat.set(r.caso.categoria, c);
  }

  const linhas: string[] = [];
  linhas.push("# Relatório L3 — Validação do agente Nex");
  linhas.push("");
  linhas.push(`> Data: 2026-05-22. Modelo: gpt-5.4-nano. ${total} requisições reais.`);
  linhas.push("");
  linhas.push(`## Assertividade geral: ${pct.toFixed(2)}% (${acertos}/${total})`);
  linhas.push("");
  linhas.push(`Meta: 97% ou mais. Resultado: ${pct >= 97 ? "ATINGIDA" : "ABAIXO DA META"}.`);
  linhas.push("");
  linhas.push("## Por categoria");
  linhas.push("");
  linhas.push("| Categoria | Acertos | Total | % |");
  linhas.push("|---|---|---|---|");
  for (const [cat, c] of [...porCat.entries()].sort()) {
    linhas.push(`| ${cat} | ${c.ok} | ${c.total} | ${((c.ok / c.total) * 100).toFixed(1)}% |`);
  }
  linhas.push("");

  const falhas = resultados.filter((r) => !r.ok);
  linhas.push(`## Falhas (${falhas.length})`);
  linhas.push("");
  for (const f of falhas.slice(0, 120)) {
    linhas.push(`- **P:** ${f.caso.pergunta}`);
    linhas.push(`  - esperado: ${f.caso.esperado}`);
    linhas.push(`  - resposta: ${f.erro ? "ERRO: " + f.erro : f.resposta.replace(/\n/g, " ").slice(0, 220)}`);
  }
  if (falhas.length > 120) linhas.push(`- ... e mais ${falhas.length - 120} falhas.`);
  linhas.push("");
  return linhas.join("\n");
}

async function main(): Promise<void> {
  const maxCasos = process.argv[2] ? Number(process.argv[2]) : Infinity;
  let casos = await montarCasos();
  if (casos.length > maxCasos) casos = casos.slice(0, maxCasos);
  console.log(`[l3] ${casos.length} casos gerados — rodando com concorrência ${CONCORRENCIA}`);

  const inicio = Date.now();
  const resultados = await pool(casos, CONCORRENCIA, rodarCaso);
  const dur = ((Date.now() - inicio) / 1000).toFixed(0);

  const relatorio = gerarRelatorio(resultados);
  fs.writeFileSync(RELATORIO, relatorio, "utf8");

  const acertos = resultados.filter((r) => r.ok).length;
  console.log(`[l3] concluído em ${dur}s — ${acertos}/${resultados.length} acertos`);
  console.log(`[l3] relatório: ${RELATORIO}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[l3] FALHA:", err);
  process.exit(1);
});
