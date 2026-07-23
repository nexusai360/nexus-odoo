/**
 * Motor de filtro/regras GENÉRICO da tabela avançada (portado do ERP Nexus,
 * `vendas-filtros.ts`, sem acoplamento a domínio). Só dados e funções puras:
 * operadores adaptativos ao tipo, árvore de regras aninhadas E/OU e o avaliador
 * recursivo. Consumido pela searchbar, pelo construtor de filtro avançado, pelo
 * agrupamento e pelo seletor de colunas.
 *
 * Rótulos: internamente o conector é "todas"/"qualquer"; a UI apresenta E/OU
 * (decisão D1 do dono). Ver `LABEL_CONECTOR`.
 */

// ===== Tipos de campo e operadores =====

export type CampoTipo = "texto" | "opcao" | "numero" | "data" | "tags";

export interface OperadorDef {
  op: string;
  label: string;
  args: 0 | 1 | 2;
}

export const OPERADORES: Record<CampoTipo, OperadorDef[]> = {
  texto: [
    { op: "contem", label: "contém", args: 1 },
    { op: "naocontem", label: "não contém", args: 1 },
    { op: "igual", label: "é igual a", args: 1 },
    { op: "comeca", label: "começa com", args: 1 },
    { op: "definido", label: "está preenchido", args: 0 },
    { op: "vazio", label: "está vazio", args: 0 },
  ],
  opcao: [
    { op: "igual", label: "é", args: 1 },
    { op: "diferente", label: "não é", args: 1 },
  ],
  numero: [
    { op: "igual", label: "é igual a", args: 1 },
    { op: "maior", label: "maior que", args: 1 },
    { op: "menor", label: "menor que", args: 1 },
    { op: "entre", label: "está entre", args: 2 },
  ],
  data: [
    { op: "em", label: "é em", args: 1 },
    { op: "antes", label: "antes de", args: 1 },
    { op: "depois", label: "depois de", args: 1 },
    { op: "entre", label: "está entre", args: 2 },
  ],
  tags: [
    { op: "contemtag", label: "contém", args: 1 },
    { op: "naocontemtag", label: "não contém", args: 1 },
  ],
};

/** Rótulo do conector na UI: E/OU (decisão D1), a partir do id interno. */
export const LABEL_CONECTOR: Record<"todas" | "qualquer", string> = {
  todas: "E",
  qualquer: "OU",
};

// ===== Árvore de regras (filtro avançado) =====

export interface Regra {
  id: string;
  tipo: "regra";
  /** Conector (E/OU) que liga esta regra ao irmão ANTERIOR do mesmo grupo. O
   * primeiro filho ignora. Ausente = cai no `conector` do grupo (compat). */
  conectorAntes?: "todas" | "qualquer";
  campo: string;
  op: string;
  valor: string;
  valor2?: string;
}

export interface GrupoRegras {
  id: string;
  tipo: "grupo";
  /** Conector padrão do grupo: fallback usado quando um filho não define o seu
   * próprio `conectorAntes` (mantém idênticas as árvores antigas de operador único). */
  conector: "todas" | "qualquer";
  /** Conector (E/OU) que liga este grupo ao irmão ANTERIOR, quando ele é filho de
   * outro grupo. O primeiro filho ignora. */
  conectorAntes?: "todas" | "qualquer";
  filhos: (Regra | GrupoRegras)[];
}

export type NoRegra = Regra | GrupoRegras;

/** Forma mínima de um campo para o motor de regras (independe de domínio). */
export interface CampoLike {
  tipo: CampoTipo;
  get: (row: never) => string | number | string[];
  opcoes?: { valor: string; label: string }[];
}

export function testaRegra(
  p: unknown,
  r: Regra,
  campoBy: Record<string, CampoLike>,
): boolean {
  const campo = campoBy[r.campo];
  if (!campo) return true;
  const bruto = (campo.get as (row: unknown) => string | number | string[])(p);
  const alvo = r.valor?.toLowerCase?.() ?? "";
  if (campo.tipo === "tags") {
    const arr = (bruto as string[]).map((t) => t.toLowerCase());
    if (r.op === "contemtag") return arr.some((t) => t.includes(alvo));
    return !arr.some((t) => t.includes(alvo));
  }
  if (campo.tipo === "numero") {
    const n = Number(bruto);
    const a = Number(r.valor);
    const b = Number(r.valor2);
    switch (r.op) {
      case "igual":
        return n === a;
      case "maior":
        return n > a;
      case "menor":
        return n < a;
      case "entre":
        return n >= Math.min(a, b) && n <= Math.max(a, b);
    }
  }
  if (campo.tipo === "data") {
    const v = String(bruto);
    switch (r.op) {
      case "em":
        return v === r.valor;
      case "antes":
        return v < r.valor;
      case "depois":
        return v > r.valor;
      case "entre":
        return v >= (r.valor || "") && v <= (r.valor2 || "9999");
    }
  }
  // texto / opcao
  const v = String(bruto).toLowerCase();
  switch (r.op) {
    case "contem":
      return v.includes(alvo);
    case "naocontem":
      return !v.includes(alvo);
    case "igual":
      return v === alvo;
    case "diferente":
      return v !== alvo;
    case "comeca":
      return v.startsWith(alvo);
    case "definido":
      return v.length > 0;
    case "vazio":
      return v.length === 0;
  }
  return true;
}

/** Avalia a árvore de regras contra uma linha. Grupo vazio = true (sem filtro).
 *
 * Conector POR PAR de irmãos: cada filho, do 2º em diante, carrega em
 * `conectorAntes` o operador (E/OU) que o liga ao irmão anterior; o 1º filho não
 * tem conector. A avaliação é left-associative: `((A op1 B) op2 C) op3 D`, onde
 * `opN` é o `conectorAntes` do filho N. Quando um filho não define `conectorAntes`,
 * usa o `conector` do grupo , então uma árvore antiga (operador único por grupo)
 * produz exatamente o mesmo resultado de antes (todos "todas" = E de todos; todos
 * "qualquer" = OU de todos). Sem short-circuit: a lógica mista não permite. */
export function testaNo(
  p: unknown,
  no: NoRegra,
  campoBy: Record<string, CampoLike>,
): boolean {
  if (no.tipo === "regra") return testaRegra(p, no, campoBy);
  if (no.filhos.length === 0) return true;
  let acc = testaNo(p, no.filhos[0], campoBy);
  for (let i = 1; i < no.filhos.length; i += 1) {
    const filho = no.filhos[i];
    const conector = filho.conectorAntes ?? no.conector;
    const val = testaNo(p, filho, campoBy);
    acc = conector === "todas" ? acc && val : acc || val;
  }
  return acc;
}

let _seq = 0;
export function novaRegraId(): string {
  _seq += 1;
  return `r${_seq}`;
}
