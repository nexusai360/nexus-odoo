// src/lib/reports/builder/agent/builder-progress-labels.ts
// F6 (chat = Nex) , rotulo humanizado de cada tool do construtor para a trilha
// "Raciocinio" da bolha. Frases de acao (ProgressStep.raw=true), com acentuacao
// correta. Quando a MESMA acao se repete em sequencia, a trilha colapsa numa
// unica linha no PLURAL (ver builderProgressLabelPlural + dedupe no consumidor).

const LABELS: Record<string, string> = {
  listar_componentes: "Vendo os componentes",
  descrever_componente: "Detalhando o componente",
  listar_fontes: "Vendo as fontes de dado",
  prever_dado: "Conferindo o formato do dado",
  criar_relatorio: "Criando o relatório",
  adicionar_secao: "Adicionando uma seção",
  editar_secao: "Ajustando uma seção",
  remover_secao: "Removendo uma seção",
  mover_secao: "Reposicionando uma seção",
  definir_titulo: "Renomeando o relatório",
  definir_titulo_secao: "Renomeando uma seção",
  definir_cor_secao: "Definindo a cor de uma seção",
  definir_filtro: "Aplicando um filtro",
  atualizar_entendimento: "Entendendo o que você quer",
  registrar_seccao_pretendida: "Anotando o que você quer ver",
  marcar_dimensao_relevante: "Percebendo mais um recorte",
  declarar_sem_kpi: "Anotando que não precisa de indicador",
  oferecer_opcoes: "Preparando opções",
  validar: "Validando o relatório",
};

// Forma plural usada quando a mesma acao se repete em sequencia (a trilha colapsa).
const LABELS_PLURAL: Record<string, string> = {
  descrever_componente: "Detalhando os componentes",
  prever_dado: "Conferindo o formato dos dados",
  adicionar_secao: "Adicionando seções",
  editar_secao: "Ajustando seções",
  remover_secao: "Removendo seções",
  mover_secao: "Reposicionando seções",
  definir_titulo_secao: "Renomeando seções",
  definir_cor_secao: "Definindo as cores das seções",
  definir_filtro: "Aplicando filtros",
};

const FALLBACK = "Montando o relatório";

/** Frase de acao (singular) de uma tool do construtor. Nunca devolve o id cru. */
export function builderProgressLabel(toolName: string): string {
  return LABELS[toolName] ?? FALLBACK;
}

/** Frase no plural (quando a acao se repete). Cai no singular se nao houver plural. */
export function builderProgressLabelPlural(toolName: string): string {
  return LABELS_PLURAL[toolName] ?? LABELS[toolName] ?? FALLBACK;
}

/**
 * Colapsa rotulos de acoes repetidas EM SEQUENCIA numa unica entrada no plural.
 * Ex.: ["Adicionando uma secao" x3] -> ["Adicionando secoes"]. Recebe a lista de
 * tool names na ordem e devolve os rotulos ja deduplicados.
 */
export function rotulosDeduplicados(toolNames: string[]): { label: string }[] {
  const out: { label: string; toolName: string; count: number }[] = [];
  for (const name of toolNames) {
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo.toolName === name) {
      ultimo.count += 1;
      ultimo.label = ultimo.count > 1 ? builderProgressLabelPlural(name) : builderProgressLabel(name);
    } else {
      out.push({ label: builderProgressLabel(name), toolName: name, count: 1 });
    }
  }
  return out.map((o) => ({ label: o.label }));
}

/** Passo da trilha (forma estrutural de ProgressStep, sem acoplar ao componente). */
type StepLike = {
  id: string;
  label: string;
  state: "running" | "done";
  raw?: boolean;
  toolName?: string;
};

/**
 * Colapsa AO VIVO os passos consecutivos da MESMA tool numa unica entrada,
 * pluralizando o rotulo e somando o estado (running se qualquer um do grupo
 * ainda roda; senao done). Mantem o id e o raw do primeiro do grupo. Passos
 * sem `toolName` (ex.: trilha do Nex) nunca fundem , a igualdade exige
 * toolName definido em ambos.
 */
export function colapsarProgressSteps(steps: StepLike[]): StepLike[] {
  const grupos: { primeiro: StepLike; toolName?: string; count: number; algumRodando: boolean }[] = [];
  for (const s of steps) {
    const ultimo = grupos[grupos.length - 1];
    const mesmaTool = !!ultimo && !!s.toolName && ultimo.toolName === s.toolName;
    if (mesmaTool) {
      ultimo.count += 1;
      if (s.state === "running") ultimo.algumRodando = true;
    } else {
      grupos.push({
        primeiro: s,
        toolName: s.toolName,
        count: 1,
        algumRodando: s.state === "running",
      });
    }
  }
  return grupos.map((g) => {
    const { id, raw } = g.primeiro;
    const label =
      g.count > 1 && g.toolName
        ? builderProgressLabelPlural(g.toolName)
        : g.primeiro.label;
    const out: StepLike = { id, label, state: g.algumRodando ? "running" : "done" };
    if (raw !== undefined) out.raw = raw;
    return out;
  });
}
