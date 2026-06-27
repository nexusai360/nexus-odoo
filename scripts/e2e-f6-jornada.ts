// scripts/e2e-f6-jornada.ts
// E2E real da Jornada Guiada (F6) contra o LLM + cache de estoque reais.
// Rodar: npx tsx --env-file=.env.local scripts/e2e-f6-jornada.ts
// Asserts ROBUSTOS a nao-determinismo: checam invariantes (fase, gate, honestidade,
// ficha renderizavel), nao texto exato.
import { prisma } from "@/lib/prisma";
import { runBuilder } from "@/lib/reports/builder/agent/run-builder";
import { journeyStateInicial, entendimentoElegivel, defaultParaConversa } from "@/lib/reports/builder/journey/state";

let ok = 0;
let fail = 0;
function check(nome: string, cond: boolean, extra = "") {
  if (cond) {
    ok++;
    console.log(`  PASS  ${nome}`);
  } else {
    fail++;
    console.log(`  FAIL  ${nome} ${extra}`);
  }
}

async function main() {
  const admin = await prisma.user.findFirst({
    where: { platformRole: { in: ["admin", "super_admin"] } },
    select: { id: true, email: true },
  });
  if (!admin) throw new Error("Nenhum admin/super_admin no banco para o teste");
  const user = { id: admin.id };
  console.log(`[e2e-jornada] user: ${admin.email}\n`);

  // (1) Legado: conversa com SavedReport e sem journeyState -> refino.
  console.log("(1) default condicional do legado");
  check("legado com savedReport -> refino", defaultParaConversa({ temSavedReport: true }).fase === "refino");
  check("conversa nova -> entrevista", defaultParaConversa({ temSavedReport: false }).fase === "entrevista");

  // (2) Pedido raso -> NAO atinge maturidade no 1o turno (gate por evidencia).
  console.log("\n(2) pedido raso nao gera (gate)");
  const raso = await runBuilder({
    prompt: "quero um relatorio",
    fichaAtual: null,
    user,
    modo: "jornada",
    journeyState: { ...journeyStateInicial(), turnosUsuario: 1 },
    historico: [],
  });
  // Invariante real: sem geracao precoce (a IA nao saltou pra resumo no turno raso).
  check("fase segue entrevista (sem geracao precoce)", raso.journeyState?.fase === "entrevista", `(fase=${raso.journeyState?.fase})`);

  // (3) Honestidade: pedido de vendas -> "ainda" e a jornada nao morre como recusa.
  console.log("\n(3) honestidade 'ainda nao e possivel' (vendas)");
  const vendas = await runBuilder({
    prompt: "quero um relatorio das minhas vendas por vendedor no mes",
    fichaAtual: null,
    user,
    modo: "jornada",
    journeyState: { ...journeyStateInicial(), turnosUsuario: 1 },
    historico: [],
  });
  const msgVendas = vendas.mensagem.toLowerCase();
  check("resposta menciona 'ainda'", msgVendas.includes("ainda"), `(msg="${vendas.mensagem.slice(0, 80)}")`);
  check("nao usa linguagem proibida (impossivel/nao da)", !/imposs|n[aã]o d[aá]\b/.test(msgVendas));

  // (4) Pedido claro multi-turno -> a IA monta ficha e pode chegar a resumo.
  console.log("\n(4) pedido claro -> ficha montada, caminho ate resumo");
  let js = { ...journeyStateInicial(), turnosUsuario: 1 };
  const t1 = await runBuilder({
    prompt: "monte um relatorio do estoque parado: um indicador de valor imobilizado no topo e uma tabela com os produtos e os dias parado",
    fichaAtual: null,
    user,
    modo: "jornada",
    journeyState: js,
    historico: [],
  });
  js = t1.journeyState ?? js;
  const temSecoes = (t1.ficha?.secoes.length ?? 0) > 0;
  check("a IA montou ao menos uma secao", temSecoes, `(secoes=${t1.ficha?.secoes.length ?? 0})`);
  check("fichaRascunho espelhada no journeyState", (js.fichaRascunho?.secoes.length ?? 0) > 0);

  // Turno 2: confirma e pede pra gerar; o gate decide.
  js = { ...js, turnosUsuario: js.turnosUsuario + 1 };
  const t2 = await runBuilder({
    prompt: "isso mesmo, pode montar",
    fichaAtual: js.fichaRascunho ?? null,
    user,
    modo: "jornada",
    journeyState: js,
    historico: [
      { role: "user", content: "monte um relatorio do estoque parado com valor imobilizado e tabela" },
      { role: "assistant", content: t1.mensagem },
    ],
  });
  js = t2.journeyState ?? js;
  const elegivelAgora = entendimentoElegivel(js).ok;
  console.log(`     [info] fase apos t2 = ${js.fase}; elegivel = ${elegivelAgora}`);
  check("apos 2 turnos com ficha completa, fica elegivel OU ja foi pro resumo", elegivelAgora || js.fase === "resumo");

  // (5) A ficha montada le dados do cache real (testa o PRODUTOR direto, sem o
  // guard de dominio do resolveSecao, que exige sessao logada , inexistente em script).
  console.log("\n(5) os fatos da ficha leem dados do cache real (produtor direto)");
  const fichaFinal = js.fichaRascunho ?? t1.ficha;
  if (fichaFinal && fichaFinal.secoes.length > 0) {
    const { obterProdutor, obterContrato } = await import("@/lib/reports/builder/source-registry");
    let ok5 = 0;
    for (const sec of fichaFinal.secoes) {
      const contrato = obterContrato(sec.fato);
      const produtor = obterProdutor(sec.fato, sec.shapeDerivado);
      if (!contrato || !produtor) continue;
      const raw = await produtor({});
      // ok = produziu linhas OU kpis (dado real do cache)
      if ((raw.linhas?.length ?? 0) > 0 || Object.keys(raw.kpis ?? {}).length > 0) ok5++;
    }
    check("todos os fatos da ficha leram dados reais", ok5 === fichaFinal.secoes.length, `(${ok5}/${fichaFinal.secoes.length})`);
  } else {
    check("havia ficha para resolver", false, "(sem ficha)");
  }

  console.log(`\n[e2e-jornada] ${ok} PASS, ${fail} FAIL`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
