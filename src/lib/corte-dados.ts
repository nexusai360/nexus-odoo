// src/lib/corte-dados.ts
//
// MARCO ZERO DA PLATAFORMA , a data a partir da qual existe dado confiavel.
//
// O Odoo tem documentos antigos que nao valem para a operacao atual: eles sujam
// faturamento, estoque, contas e entregas. A plataforma so considera o que foi emitido a
// partir do CORTE. A data e CONFIGURAVEL em Configuracao > Intervalos de sincronizacao
// (AppSetting `sync.corte_dados`), e manda em TODAS as camadas:
//
//   - sincronizacao: o worker so puxa do Odoo o que e >= ao corte (worker/sync/corte.ts);
//   - purge: o que ficou no cache antes do corte e apagado (worker/limpa);
//   - consultas: todo periodo e grampeado ao corte (metricas, diretoria, relatorios);
//   - UI: o calendario nao deixa escolher data anterior ao corte;
//   - agente Nex: perguntaram de antes do corte, ele diz que nao tem esse dado.
//
// Mudar a data na tela muda a plataforma inteira.

import type { PrismaClient } from "@/generated/prisma/client";

/** Chave do AppSetting que guarda a data (categoria "sync"). */
export const CORTE_DADOS_KEY = "sync.corte_dados";

/** Data usada enquanto ninguem configurou nada (decisao do dono, 2026-07-11). */
export const CORTE_DADOS_PADRAO = "2026-03-16";

/** AAAA-MM-DD. */
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Cache de processo. As funcoes de where (buildPeriodoWhere e afins) sao sincronas e vivem
 * no caminho quente das metricas, entao leem daqui. Quem tem `prisma` em maos (paginas RSC,
 * tools do MCP, ciclos do worker) chama `getCorteDados` e mantem este valor fresco.
 */
let corteEmMemoria: string = CORTE_DADOS_PADRAO;
let lidoEm = 0;
const TTL_MS = 60_000;

/** O corte vigente conhecido pelo processo (sincrono , nunca bloqueia consulta). */
export function corteAtual(): string {
  return corteEmMemoria;
}

/** O corte vigente como Date UTC. */
export function corteAtualDate(): Date {
  return new Date(`${corteEmMemoria}T00:00:00Z`);
}

/** Rotulo humano do corte vigente ("16/03/2026"). */
export function corteLabel(iso: string = corteEmMemoria): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** Frase padrao de aviso , usada na UI e nas respostas do agente Nex. */
export function avisoCorte(iso: string = corteEmMemoria): string {
  return `A plataforma considera apenas documentos a partir de ${corteLabel(iso)}; não há dados anteriores a essa data.`;
}

/** Le o corte configurado (com cache curto) e atualiza o valor em memoria. */
export async function getCorteDados(prisma: PrismaClient): Promise<string> {
  const agora = Date.now();
  if (agora - lidoEm < TTL_MS) return corteEmMemoria;
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: CORTE_DADOS_KEY } });
    const valor = typeof row?.value === "string" ? row.value : null;
    corteEmMemoria = valor && ISO_RE.test(valor) ? valor : CORTE_DADOS_PADRAO;
  } catch {
    // Banco indisponivel ou tabela ainda nao migrada: mantem o ultimo valor conhecido.
    corteEmMemoria = corteEmMemoria || CORTE_DADOS_PADRAO;
  }
  lidoEm = agora;
  return corteEmMemoria;
}

/** Força a releitura na próxima chamada (usado logo após salvar a configuração). */
export function invalidarCacheCorte(): void {
  lidoEm = 0;
}

/**
 * Grampeia uma data ISO ao corte: nada antes do marco zero. Usado em toda resolucao de
 * periodo , preset, filtro personalizado ou pergunta ao agente.
 */
export function clampIsoAoCorte(iso: string, corte: string = corteEmMemoria): string {
  return iso < corte ? corte : iso;
}

/** Idem, para Date. */
export function clampDateAoCorte(d: Date, corte: string = corteEmMemoria): Date {
  const c = new Date(`${corte}T00:00:00Z`);
  return d < c ? c : d;
}

/** Verdadeiro quando o periodo pedido comeca antes do corte (para avisar o usuario). */
export function pedeAntesDoCorte(deIso?: string, corte: string = corteEmMemoria): boolean {
  return !!deIso && deIso < corte;
}
