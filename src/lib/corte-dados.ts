// src/lib/corte-dados.ts
//
// DATA DE INICIO DAS ANALISES , de quando a plataforma passa a CONSIDERAR os dados.
// Configuravel em Configuracao > Intervalos de sincronizacao (AppSetting `sync.corte_dados`).
//
// E um FILTRO, nao uma faxina: o cache continua guardando todo o historico ingerido, e
// NADA e apagado por causa desta data. Mover a data para tras faz o historico reaparecer na
// hora, sem re-sync e sem perda; mover para frente estreita a janela de analise. A ingestao
// tem corte tecnico proprio e fixo (worker/sync/corte.ts).
//
// A data parametriza todas as camadas de LEITURA:
//   - consultas: todo periodo e grampeado a ela (metricas, diretoria, relatorios);
//   - UI: o calendario nao deixa escolher data anterior a ela;
//   - agente Nex: pediram periodo anterior, ele responde a partir dela e avisa.
//
// Mudar a data na tela reparametriza a plataforma inteira, sem deploy e sem tocar no dado.

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
