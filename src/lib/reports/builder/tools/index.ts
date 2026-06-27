// src/lib/reports/builder/tools/index.ts
// Catalogo BUILDER_TOOLS (metadados que o agente ve) + despacho (executarTool)
// + validar. Biblioteca de handlers chamada in-app pelo agente (onda 1) e, no
// futuro, exposta pelo servidor MCP de construcao (casca).
import { z } from "zod";
import {
  toolListarComponentes,
  toolDescreverComponente,
  toolListarFontes,
} from "./read-tools";
import { toolPreverDado } from "./prever-dado";
import {
  criarRelatorio,
  adicionarSecao,
  editarSecao,
  removerSecao,
  definirFiltro,
  moverSecao,
  definirTitulo,
  definirTituloSecao,
  definirCorSecao,
} from "./mutators";
import { validarReportEntry } from "../report-entry-schema";
import { checarCompatibilidade } from "../compat";
import {
  atualizarEntendimento,
  oferecerOpcoes,
  marcarDimensaoRelevante,
  type JourneyState,
  type OpcaoCard,
  type Dimensao,
} from "../journey/state";
import {
  registrarSeccaoPretendida,
  declararSemKpi,
  type SeccaoPretendida,
} from "../journey/intencao";
import type { BuilderReportEntry } from "../types";

export type BuilderModo = "jornada" | "refino";

export interface BuilderToolMeta {
  name: string;
  descricao: string;
  /** muta a ficha (precisa da ficha atual) ou e leitura pura. */
  muta: boolean;
  inputSchema: z.ZodTypeAny;
  /** Modos em que a tool e oferecida ao modelo. Ausente = ambos. */
  modos?: BuilderModo[];
}

const DIMENSOES_ENUM = ["objetivo", "dados", "indicadores", "visualizacao", "filtros", "layout", "periodo"] as const;

const filtroSchema = z.object({
  tipo: z.enum(["armazem", "familia", "marca", "sentido", "faixaDias"]),
  default: z.string().optional(),
});

export const BUILDER_TOOLS: BuilderToolMeta[] = [
  { name: "listar_componentes", muta: false, descricao: "Lista os componentes de visualizacao disponiveis e quando usar cada um.", inputSchema: z.object({}) },
  { name: "descrever_componente", muta: false, descricao: "Detalha um componente (shape exigido, parametros, interacao).", inputSchema: z.object({ chave: z.string() }) },
  { name: "listar_fontes", muta: false, descricao: "Lista as fontes de dado disponiveis e os shapes que oferecem.", inputSchema: z.object({}) },
  { name: "prever_dado", muta: false, descricao: "Mostra os campos que uma fonte entrega num dado shape.", inputSchema: z.object({ fato: z.string(), shapeDerivado: z.string() }) },
  // --- Tools de construcao da ficha: SO no modo refino (jornada nao constroi). ---
  { name: "criar_relatorio", muta: true, modos: ["refino"], descricao: "Cria uma ficha de relatorio vazia.", inputSchema: z.object({ titulo: z.string(), dominio: z.string().optional() }) },
  { name: "adicionar_secao", muta: true, modos: ["refino"], descricao: "Adiciona uma secao (template + fonte + shape) se compativel.", inputSchema: z.object({ template: z.string(), fato: z.string(), shapeDerivado: z.string(), config: z.record(z.string(), z.unknown()).optional() }) },
  { name: "editar_secao", muta: true, modos: ["refino"], descricao: "Edita uma secao existente (config/template/shape), re-checa compatibilidade.", inputSchema: z.object({ secaoId: z.string(), patch: z.object({ template: z.string().optional(), shapeDerivado: z.string().optional(), config: z.record(z.string(), z.unknown()).optional() }) }) },
  { name: "remover_secao", muta: true, modos: ["refino"], descricao: "Remove uma secao pela id.", inputSchema: z.object({ secaoId: z.string() }) },
  { name: "mover_secao", muta: true, modos: ["refino"], descricao: "Reposiciona uma secao (reordena): por direcao (cima/baixo) ou posicao (1-based).", inputSchema: z.object({ secaoId: z.string(), direcao: z.enum(["cima", "baixo"]).optional(), posicao: z.number().int().positive().optional() }) },
  { name: "definir_titulo", muta: true, modos: ["refino"], descricao: "Renomeia o relatorio (titulo do topo).", inputSchema: z.object({ titulo: z.string() }) },
  { name: "definir_titulo_secao", muta: true, modos: ["refino"], descricao: "Define o titulo de uma secao (config.titulo).", inputSchema: z.object({ secaoId: z.string(), titulo: z.string() }) },
  { name: "definir_cor_secao", muta: true, modos: ["refino"], descricao: "Define a cor de uma secao de grafico (Bar/Pie/Line). cor = token da paleta (violet|blue|cyan|emerald|green|amber|orange|pink|red|slate) ou 'padrao' para limpar.", inputSchema: z.object({ secaoId: z.string(), cor: z.string().nullable() }) },
  { name: "definir_filtro", muta: true, modos: ["refino"], descricao: "Acrescenta um filtro a uma secao.", inputSchema: z.object({ secaoId: z.string(), filtro: filtroSchema }) },
  // --- Tools de brainstorm: SO no modo jornada (coleta, nao constroi ficha). ---
  { name: "atualizar_entendimento", muta: true, modos: ["jornada"], descricao: "Atualiza o reflexo de entendimento mostrado ao usuario (resumo em linguagem natural do que voce ja entendeu). Use sempre que avancar no entendimento.", inputSchema: z.object({ texto: z.string(), dimensoes: z.array(z.enum(DIMENSOES_ENUM)).optional() }) },
  { name: "registrar_seccao_pretendida", muta: true, modos: ["jornada"], descricao: "Anota uma secao que a pessoa quer no relatorio (sem montar nada): fato (fonte), template (KPIRow|BarChart|PieChart|LineChart|DataTable), recorte e rotulo. So aceita se for viavel no catalogo de estoque; se nao for, registra como impossivel por enquanto. E assim que voce confirma que entendeu o que mostrar.", inputSchema: z.object({ fato: z.string(), shapeDerivado: z.string().optional(), template: z.string(), recorte: z.string().optional(), rotulo: z.string().optional() }) },
  { name: "marcar_dimensao_relevante", muta: true, modos: ["jornada"], descricao: "Marca uma dimensao OPCIONAL (filtros|layout|periodo) como relevante para este relatorio, quando perceber que o pedido e mais complexo. E aqui que o roteiro de perguntas cresce. Informe o motivo.", inputSchema: z.object({ dimensao: z.enum(["filtros", "layout", "periodo"]), motivo: z.string() }) },
  { name: "declarar_sem_kpi", muta: true, modos: ["jornada"], descricao: "Registra que a pessoa NAO quer indicadores (KPIs) neste relatorio, dispensando o KPIRow.", inputSchema: z.object({}) },
  { name: "oferecer_opcoes", muta: false, modos: ["jornada"], descricao: "Oferece ao usuario 2 a 4 opcoes para ele escolher (ex.: jeitos de visualizar). Cada opcao tem id, rotulo, descricao e tipoVisual opcional (KPIRow|BarChart|PieChart|LineChart|DataTable).", inputSchema: z.object({ titulo: z.string(), opcoes: z.array(z.object({ id: z.string(), rotulo: z.string(), descricao: z.string().optional(), tipoVisual: z.string().optional() })) }) },
  { name: "validar", muta: false, descricao: "Valida a ficha atual (schema + compatibilidade de todas as secoes).", inputSchema: z.object({}) },
];

/** Valida a ficha: schema (Zod) + compatibilidade de cada secao. */
export function validarFicha(
  ficha: BuilderReportEntry,
): { ok: true } | { ok: false; erros: string[] } {
  const v = validarReportEntry(ficha);
  if (!v.ok) return { ok: false, erros: v.erros };
  for (const secao of ficha.secoes) {
    const c = checarCompatibilidade(secao);
    if (!c.ok) return { ok: false, erros: [`secao ${secao.id}: ${c.motivo}`] };
  }
  return { ok: true };
}

export type ToolExec =
  | { tipo: "leitura"; resultado: unknown }
  | { tipo: "ficha"; ficha: BuilderReportEntry }
  | { tipo: "jornada"; journeyState: JourneyState }
  | { tipo: "opcoes"; titulo: string; opcoes: OpcaoCard[] }
  | { tipo: "erro"; erro: string };

function jornadaResult(
  r: { journeyState: JourneyState } | { erro: string },
): ToolExec {
  return "journeyState" in r ? { tipo: "jornada", journeyState: r.journeyState } : { tipo: "erro", erro: r.erro };
}

function mutResult(
  r: { ficha: BuilderReportEntry } | { erro: string },
): ToolExec {
  return "ficha" in r ? { tipo: "ficha", ficha: r.ficha } : { tipo: "erro", erro: r.erro };
}

/** Despacha uma chamada de tool para o handler certo. */
export function executarTool(
  name: string,
  // args ja validados pelo inputSchema da tool no chamador (E1b).
  args: Record<string, unknown>,
  ficha: BuilderReportEntry | null,
  journeyState?: JourneyState,
): ToolExec {
  switch (name) {
    case "atualizar_entendimento":
      if (!journeyState) return { tipo: "erro", erro: "sem_jornada" };
      return jornadaResult(atualizarEntendimento(journeyState, args as { texto: string; dimensoes?: Dimensao[] }));
    case "oferecer_opcoes": {
      const r = oferecerOpcoes(args as { titulo: string; opcoes: OpcaoCard[] });
      return "erro" in r ? { tipo: "erro", erro: r.erro } : { tipo: "opcoes", titulo: r.titulo, opcoes: r.opcoes };
    }
    case "registrar_seccao_pretendida": {
      if (!journeyState) return { tipo: "erro", erro: "sem_jornada" };
      const r = registrarSeccaoPretendida(journeyState.intencao, args as unknown as SeccaoPretendida);
      if ("erro" in r) return { tipo: "erro", erro: r.erro };
      return { tipo: "jornada", journeyState: { ...journeyState, intencao: r.intencao } };
    }
    case "marcar_dimensao_relevante": {
      if (!journeyState) return { tipo: "erro", erro: "sem_jornada" };
      return { tipo: "jornada", journeyState: marcarDimensaoRelevante(journeyState, (args as { dimensao: Dimensao }).dimensao) };
    }
    case "declarar_sem_kpi": {
      if (!journeyState) return { tipo: "erro", erro: "sem_jornada" };
      return { tipo: "jornada", journeyState: { ...journeyState, intencao: declararSemKpi(journeyState.intencao) } };
    }
    case "listar_componentes":
      return { tipo: "leitura", resultado: toolListarComponentes() };
    case "descrever_componente":
      return { tipo: "leitura", resultado: toolDescreverComponente(args as { chave: string }) };
    case "listar_fontes":
      return { tipo: "leitura", resultado: toolListarFontes() };
    case "prever_dado":
      return { tipo: "leitura", resultado: toolPreverDado(args as { fato: string; shapeDerivado: string }) };
    case "criar_relatorio":
      return { tipo: "ficha", ficha: criarRelatorio(args as { titulo: string; dominio?: string }) };
    case "adicionar_secao":
      if (!ficha) return { tipo: "erro", erro: "sem_ficha" };
      return mutResult(adicionarSecao(ficha, args as unknown as Parameters<typeof adicionarSecao>[1]));
    case "editar_secao":
      if (!ficha) return { tipo: "erro", erro: "sem_ficha" };
      return mutResult(editarSecao(ficha, args as unknown as Parameters<typeof editarSecao>[1]));
    case "remover_secao":
      if (!ficha) return { tipo: "erro", erro: "sem_ficha" };
      return { tipo: "ficha", ficha: removerSecao(ficha, args as { secaoId: string }).ficha };
    case "mover_secao":
      if (!ficha) return { tipo: "erro", erro: "sem_ficha" };
      return mutResult(moverSecao(ficha, args as unknown as Parameters<typeof moverSecao>[1]));
    case "definir_titulo":
      if (!ficha) return { tipo: "erro", erro: "sem_ficha" };
      return mutResult(definirTitulo(ficha, args as { titulo: string }));
    case "definir_titulo_secao":
      if (!ficha) return { tipo: "erro", erro: "sem_ficha" };
      return mutResult(definirTituloSecao(ficha, args as { secaoId: string; titulo: string }));
    case "definir_cor_secao":
      if (!ficha) return { tipo: "erro", erro: "sem_ficha" };
      return mutResult(definirCorSecao(ficha, args as { secaoId: string; cor: string | null }));
    case "definir_filtro":
      if (!ficha) return { tipo: "erro", erro: "sem_ficha" };
      return mutResult(definirFiltro(ficha, args as unknown as Parameters<typeof definirFiltro>[1]));
    case "validar": {
      if (!ficha) return { tipo: "erro", erro: "sem_ficha" };
      const v = validarFicha(ficha);
      return v.ok
        ? { tipo: "leitura", resultado: { ok: true } }
        : { tipo: "erro", erro: v.erros.join("; ") };
    }
    default:
      return { tipo: "erro", erro: "tool_desconhecida" };
  }
}
