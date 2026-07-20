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

/**
 * A data mais antiga que se pode escolher na tela. E o limite do que o cache guarda: a
 * ingestao tem corte tecnico proprio em 2026-01-01 (src/worker/sync/corte.ts), entao nao
 * existe documento anterior a isso para analisar. Escolher antes so daria falsa impressao
 * de cobertura. Se um dia a ingestao passar a puxar mais historico, os dois andam juntos.
 */
export const CORTE_DADOS_MINIMO = "2026-01-01";

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

/** Fim aberto do mundo: usado quando o periodo nao tem teto. */
const FIM_ABERTO = new Date("2100-01-01T00:00:00Z");

export interface Janela {
  /** Inicio inclusivo, ja grampeado ao corte. */
  gte: Date;
  /** Fim EXCLUSIVO (ate + 1 dia): o dia "ate" entra inteiro sem depender de hora. */
  lt: Date;
  /** Inicio efetivo em ISO (o que a resposta deve dizer que cobriu). */
  deIso: string;
  /** Fim efetivo em ISO, ou undefined quando a janela nao tem teto. */
  ateIso?: string;
  /** true quando o pedido comecava antes do corte e foi puxado para ele. */
  cortado: boolean;
}

/**
 * Janela de leitura canonica de QUALQUER campo de data do cache (emissao, vencimento,
 * pagamento, movimento, lancamento...). E a peca que faz a data de inicio das analises
 * valer em toda consulta:
 *
 *   - sem `de`: o piso e o corte (uma consulta "sem filtro" nunca varre o historico inteiro);
 *   - com `de` anterior ao corte: grampeia no corte e marca `cortado`;
 *   - sem `ate`: fim aberto.
 *
 * Use o resultado direto no where do Prisma:
 *   const j = janelaClampada(de, ate);
 *   where: { dataVencimento: { gte: j.gte, lt: j.lt } }
 *
 * Para SQL cru, use `j.deIso` / `j.ateIso` como parametros (nunca interpolar a data crua
 * do usuario).
 */
export function janelaClampada(
  de?: string,
  ate?: string,
  corte: string = corteEmMemoria,
): Janela {
  const deIso = clampIsoAoCorte((de ?? corte).slice(0, 10), corte);
  const ateIso = ate?.slice(0, 10);
  let lt = FIM_ABERTO;
  if (ateIso) {
    lt = new Date(`${ateIso}T00:00:00Z`);
    lt.setUTCDate(lt.getUTCDate() + 1);
  }
  return {
    gte: new Date(`${deIso}T00:00:00Z`),
    lt,
    deIso,
    ateIso,
    cortado: pedeAntesDoCorte(de?.slice(0, 10), corte),
  };
}

/**
 * Piso da metrica "demanda a entregar": ela NAO e recortada pelo corte de leitura (D8/RF-A5).
 * A janela vem so da pilula de periodo; o piso 2000 e "abre tudo" (na pratica, do primeiro
 * pedido). As OUTRAS metricas continuam usando janelaClampada (piso no corte).
 */
export const PISO_DEMANDA_ABERTA = "2000-01-01";

/** Janela de leitura da demanda a entregar: recorta pela pilula, sem grampear no corte. */
export function janelaDemandaAberta(de?: string, ate?: string): Janela {
  return janelaClampada(de, ate, PISO_DEMANDA_ABERTA);
}

/**
 * Grampeia um mes ("AAAA-MM") ao mes do corte. Para series mensais, cujo eixo e o mes e nao
 * o dia (fato_estoque_movimento.mes, por exemplo).
 *
 * ATENCAO: o mes do corte entra INTEIRO. Se a data de inicio for 16/03, o balde de marco
 * ainda soma os movimentos de 1 a 15/03. Onde a precisao do dia importa, combine com um
 * piso na coluna de data de verdade (`data: { gte: corteAtualDate() }`), que existe no fato.
 */
export function clampMesAoCorte(mes: string, corte: string = corteEmMemoria): string {
  const mesDoCorte = corte.slice(0, 7);
  return mes < mesDoCorte ? mesDoCorte : mes;
}

/**
 * Where de um campo de data, ja clampado. Acucar para o caso mais comum:
 *   where: { ...whereData("dataVencimento", de, ate) }
 */
export function whereData(
  campo: string,
  de?: string,
  ate?: string,
  corte: string = corteEmMemoria,
): Record<string, { gte: Date; lt: Date }> {
  const j = janelaClampada(de, ate, corte);
  return { [campo]: { gte: j.gte, lt: j.lt } };
}
