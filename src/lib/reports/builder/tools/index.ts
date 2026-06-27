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
  oferecerGeracao,
  montarResumo,
  type JourneyState,
  type OpcaoCard,
  type Dimensao,
} from "../journey/state";
import type { BuilderReportEntry } from "../types";

export interface BuilderToolMeta {
  name: string;
  descricao: string;
  /** muta a ficha (precisa da ficha atual) ou e leitura pura. */
  muta: boolean;
  inputSchema: z.ZodTypeAny;
}

const filtroSchema = z.object({
  tipo: z.enum(["armazem", "familia", "marca", "sentido", "faixaDias"]),
  default: z.string().optional(),
});

export const BUILDER_TOOLS: BuilderToolMeta[] = [
  { name: "listar_componentes", muta: false, descricao: "Lista os componentes de visualizacao disponiveis e quando usar cada um.", inputSchema: z.object({}) },
  { name: "descrever_componente", muta: false, descricao: "Detalha um componente (shape exigido, parametros, interacao).", inputSchema: z.object({ chave: z.string() }) },
  { name: "listar_fontes", muta: false, descricao: "Lista as fontes de dado disponiveis e os shapes que oferecem.", inputSchema: z.object({}) },
  { name: "prever_dado", muta: false, descricao: "Mostra os campos que uma fonte entrega num dado shape.", inputSchema: z.object({ fato: z.string(), shapeDerivado: z.string() }) },
  { name: "criar_relatorio", muta: true, descricao: "Cria uma ficha de relatorio vazia.", inputSchema: z.object({ titulo: z.string(), dominio: z.string().optional() }) },
  { name: "adicionar_secao", muta: true, descricao: "Adiciona uma secao (template + fonte + shape) se compativel.", inputSchema: z.object({ template: z.string(), fato: z.string(), shapeDerivado: z.string(), config: z.record(z.string(), z.unknown()).optional() }) },
  { name: "editar_secao", muta: true, descricao: "Edita uma secao existente (config/template/shape), re-checa compatibilidade.", inputSchema: z.object({ secaoId: z.string(), patch: z.object({ template: z.string().optional(), shapeDerivado: z.string().optional(), config: z.record(z.string(), z.unknown()).optional() }) }) },
  { name: "remover_secao", muta: true, descricao: "Remove uma secao pela id.", inputSchema: z.object({ secaoId: z.string() }) },
  { name: "mover_secao", muta: true, descricao: "Reposiciona uma secao (reordena): por direcao (cima/baixo) ou posicao (1-based).", inputSchema: z.object({ secaoId: z.string(), direcao: z.enum(["cima", "baixo"]).optional(), posicao: z.number().int().positive().optional() }) },
  { name: "definir_titulo", muta: true, descricao: "Renomeia o relatorio (titulo do topo).", inputSchema: z.object({ titulo: z.string() }) },
  { name: "definir_titulo_secao", muta: true, descricao: "Define o titulo de uma secao (config.titulo).", inputSchema: z.object({ secaoId: z.string(), titulo: z.string() }) },
  { name: "definir_cor_secao", muta: true, descricao: "Define a cor de uma secao de grafico (Bar/Pie/Line). cor = token da paleta (violet|blue|cyan|emerald|green|amber|orange|pink|red|slate) ou 'padrao' para limpar.", inputSchema: z.object({ secaoId: z.string(), cor: z.string().nullable() }) },
  { name: "definir_filtro", muta: true, descricao: "Acrescenta um filtro a uma secao.", inputSchema: z.object({ secaoId: z.string(), filtro: filtroSchema }) },
  { name: "atualizar_entendimento", muta: true, descricao: "Atualiza o reflexo de entendimento mostrado ao usuario (resumo em linguagem natural do que voce ja entendeu). Use sempre que avancar no entendimento.", inputSchema: z.object({ texto: z.string(), dimensoes: z.array(z.enum(["objetivo", "dados", "indicadores", "visualizacao", "filtros", "layout", "periodo"])).optional() }) },
  { name: "oferecer_opcoes", muta: false, descricao: "Oferece ao usuario 2 a 4 opcoes para ele escolher (ex.: jeitos de visualizar). Cada opcao tem id, rotulo, descricao e tipoVisual opcional (KPIRow|BarChart|PieChart|LineChart|DataTable).", inputSchema: z.object({ titulo: z.string(), opcoes: z.array(z.object({ id: z.string(), rotulo: z.string(), descricao: z.string().optional(), tipoVisual: z.string().optional() })) }) },
  { name: "oferecer_geracao", muta: true, descricao: "Sinaliza que voce ja entendeu o suficiente e oferece gerar o relatorio. So sera aceito se a ficha tiver evidencia suficiente; caso contrario, continue entrevistando.", inputSchema: z.object({ motivo: z.string() }) },
  { name: "montar_resumo", muta: true, descricao: "Monta o resumo estruturado das escolhas para a tela de resumo. So apos oferecer_geracao aceito.", inputSchema: z.object({}) },
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
    case "oferecer_geracao": {
      if (!journeyState) return { tipo: "erro", erro: "sem_jornada" };
      const r = oferecerGeracao(journeyState);
      return "journeyState" in r ? { tipo: "jornada", journeyState: r.journeyState } : { tipo: "erro", erro: `${r.erro}: ${r.falta ?? ""}`.trim() };
    }
    case "montar_resumo":
      if (!journeyState) return { tipo: "erro", erro: "sem_jornada" };
      return jornadaResult(montarResumo(journeyState));
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
