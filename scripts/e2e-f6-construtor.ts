/**
 * scripts/e2e-f6-construtor.ts , E2E real do construtor de relatorios (F6, G2c).
 *
 * Roda os 8 prompts golden (com fonte) + 2 sem fonte de
 * docs/superpowers/plans/_f6-onda1-prompts.md contra o LLM real (modelo do card,
 * default openai/gpt-5-mini) e o cache real de estoque (fato_estoque_saldo).
 *
 * Criterio de aceite: >= 7/8 com fonte geram ficha valida que renderiza
 * (validarFicha ok + secao DataTable/tabela + o produtor real entrega dado);
 * os 2 sem fonte disparam recusa honesta.
 *
 * Custo: ~10 conversas curtas do mini (centavos). Uso:
 *   npx tsx --env-file=.env.local scripts/e2e-f6-construtor.ts
 */
import { prisma } from "@/lib/prisma";
import { runBuilder } from "@/lib/reports/builder/agent/run-builder";
import { validarFicha } from "@/lib/reports/builder/tools";
import { obterProdutor } from "@/lib/reports/builder/source-registry";
import { obterConfigModeloConstrutor } from "@/lib/reports/builder/agent/model-config";
import type { BuilderReportEntry } from "@/lib/reports/builder/types";

const COM_FONTE = [
  "Quero uma tabela com o saldo de estoque de cada produto",
  "Mostre o valor parado em estoque por produto",
  "Lista de produtos com saldo e valor, agrupando por familia",
  "Tabela de estoque por marca, com saldo e valor",
  "Saldo de estoque do armazem principal",
  "Produtos de uma familia especifica com seus saldos",
  "Relatorio de itens em estoque com nome, familia, marca, saldo e valor",
  "Tabela de produtos ordenada pelo maior valor em estoque",
];

const SEM_FONTE = [
  "Faturamento por vendedor no ultimo trimestre",
  "Comissoes pagas por mes aos representantes",
];

async function fichaRenderiza(ficha: BuilderReportEntry): Promise<{ ok: boolean; motivo: string }> {
  const v = validarFicha(ficha);
  if (!v.ok) return { ok: false, motivo: `ficha invalida: ${v.erros.join("; ")}` };
  const secao = ficha.secoes.find(
    (s) => s.template === "DataTable" && s.shapeDerivado === "tabela",
  );
  if (!secao) return { ok: false, motivo: "sem secao DataTable/tabela" };
  // Resolve o produtor real (sem guard de sessao) para confirmar que o dado flui.
  const produtor = obterProdutor(secao.fato, secao.shapeDerivado);
  if (!produtor) return { ok: false, motivo: `sem produtor para ${secao.fato}/${secao.shapeDerivado}` };
  const raw = await produtor({});
  return { ok: true, motivo: `${raw.linhas.length} linhas` };
}

async function main() {
  const cfg = await obterConfigModeloConstrutor();
  console.log(`[e2e-f6] modelo do construtor: ${cfg.provider}/${cfg.model}`);

  const admin = await prisma.user.findFirst({
    where: { platformRole: { in: ["super_admin", "admin"] } },
    select: { id: true, email: true },
  });
  if (!admin) throw new Error("nenhum usuario admin/super_admin no banco dev");
  const user = { id: admin.id };
  console.log(`[e2e-f6] user de teste: ${admin.email}`);

  let comFonteOk = 0;
  const linhas: string[] = [];

  console.log("\n=== 8 casos COM fonte ===");
  for (let i = 0; i < COM_FONTE.length; i++) {
    const prompt = COM_FONTE[i];
    try {
      const r = await runBuilder({ prompt, fichaAtual: null, user });
      if (r.bloqueado) {
        linhas.push(`| ${i + 1} | ${prompt} | BLOQUEADO (teto) | FALHA |`);
        console.log(`  ${i + 1}. FALHA (bloqueado): ${prompt}`);
        continue;
      }
      if (r.recusa || !r.ficha) {
        linhas.push(`| ${i + 1} | ${prompt} | recusou/sem ficha | FALHA |`);
        console.log(`  ${i + 1}. FALHA (recusou): ${prompt} , ${r.mensagem.slice(0, 80)}`);
        continue;
      }
      const render = await fichaRenderiza(r.ficha);
      const cols = r.ficha.secoes
        .flatMap((s) => ((s.config?.colunas as { key?: string }[]) ?? []).map((c) => c.key))
        .filter(Boolean)
        .join(", ");
      if (render.ok) {
        comFonteOk++;
        linhas.push(`| ${i + 1} | ${prompt} | tabela: ${cols} (${render.motivo}) | OK |`);
        console.log(`  ${i + 1}. OK: ${prompt} , [${cols}] , ${render.motivo}`);
      } else {
        linhas.push(`| ${i + 1} | ${prompt} | ${render.motivo} | FALHA |`);
        console.log(`  ${i + 1}. FALHA (${render.motivo}): ${prompt}`);
      }
    } catch (e) {
      linhas.push(`| ${i + 1} | ${prompt} | erro: ${(e as Error).message.slice(0, 60)} | FALHA |`);
      console.log(`  ${i + 1}. ERRO: ${prompt} , ${(e as Error).message.slice(0, 120)}`);
    }
  }

  console.log("\n=== 2 casos SEM fonte ===");
  const semFonte: string[] = [];
  let semFonteOk = 0;
  for (let i = 0; i < SEM_FONTE.length; i++) {
    const prompt = SEM_FONTE[i];
    try {
      const antes = await prisma.featureRequest.count();
      const r = await runBuilder({ prompt, fichaAtual: null, user });
      const depois = await prisma.featureRequest.count();
      const recusouOuSemFicha = r.recusa === true || !r.ficha || r.ficha.secoes.length === 0;
      const ok = recusouOuSemFicha;
      if (ok) semFonteOk++;
      semFonte.push(
        `| ${String.fromCharCode(65 + i)} | ${prompt} | recusa=${r.recusa ?? false}, FR +${depois - antes} | ${ok ? "OK" : "FALHA"} |`,
      );
      console.log(`  ${String.fromCharCode(65 + i)}. ${ok ? "OK" : "FALHA"}: ${prompt} , recusa=${r.recusa ?? false}`);
    } catch (e) {
      semFonte.push(`| ${String.fromCharCode(65 + i)} | ${prompt} | erro | FALHA |`);
      console.log(`  ${String.fromCharCode(65 + i)}. ERRO: ${prompt} , ${(e as Error).message.slice(0, 120)}`);
    }
  }

  console.log(`\n=== RESULTADO: com fonte ${comFonteOk}/8 (meta >=7), sem fonte ${semFonteOk}/2 ===`);

  // Emite o bloco markdown do aceite no stdout (o operador cola em _f6-onda1-aceite.md).
  console.log("\n----- COLAR EM _f6-onda1-aceite.md -----");
  console.log(`Modelo: ${cfg.provider}/${cfg.model}`);
  console.log(`Com fonte: ${comFonteOk}/8 | Sem fonte: ${semFonteOk}/2\n`);
  console.log("| # | Prompt | Resultado | Veredito |");
  console.log("|---|--------|-----------|----------|");
  linhas.forEach((l) => console.log(l));
  semFonte.forEach((l) => console.log(l));

  await prisma.$disconnect();
  if (comFonteOk < 7 || semFonteOk < 2) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
