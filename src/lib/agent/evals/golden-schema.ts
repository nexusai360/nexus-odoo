// F5 Evals , schema Zod do golden dataset (resposta-ouro por pergunta).
// Spec: docs/superpowers/specs/2026-06-07-f5-evals-golden-design.md secao 4.1.
import { z } from "zod";

export const CLASSES = [
  "prosseguir",
  "fora_de_escopo",
  "falta_honesta",
  "desambiguacao",
] as const;
export type Classe = (typeof CLASSES)[number];

/** Ouro INDEPENDENTE (verificado por SELECT/mao). `exato` e o default; `centavos`
 *  e `faixa` exigem `delta` justificado e so valem em KPI nao-volatil/ancorado. */
export const KpiOuroSchema = z.object({
  chave: z.string().min(1),
  valor: z.union([z.number(), z.string()]),
  match: z.enum(["exato", "centavos", "faixa"]).default("exato"),
  delta: z.number().optional(),
  fonteOuro: z.string().min(1),
  /** SQL executavel contra o cache: o harness A/B (ab-cerebro) executa AO VIVO
   *  e compara com o valor ATUAL (mata o drift de snapshot do valor estatico). */
  fonteOuroSql: z.string().optional(),
  ancora: z.string().optional(),
});
export type KpiOuro = z.infer<typeof KpiOuroSchema>;

export const GoldenEntrySchema = z
  .object({
    id: z.string().min(1),
    pergunta: z.string().min(1),
    dominio: z.string().nullable(),
    classe: z.enum(CLASSES),
    toolEsperada: z.string().nullable(),
    /** Tools alternativas que tambem respondem por completo (harness A/B). */
    toolsAceitas: z.array(z.string()).optional(),
    args: z.record(z.string(), z.unknown()).optional(),
    kpiOuro: z.array(KpiOuroSchema).optional(),
    volatil: z.boolean().optional(),
    esperaAmbiguidade: z
      .object({
        requiredExactMatch: z.boolean().optional(),
        minCandidatos: z.number().int().optional(),
        toleranteResultadoUnico: z.boolean().optional(),
      })
      .optional(),
    observacao: z.string().optional(),
  })
  .superRefine((e, ctx) => {
    if (e.kpiOuro && e.classe !== "prosseguir")
      ctx.addIssue({ code: "custom", message: "kpiOuro so em prosseguir", path: ["kpiOuro"] });
    if (e.volatil && e.kpiOuro?.some((k) => (k.match ?? "exato") === "exato"))
      ctx.addIssue({ code: "custom", message: "volatil nao pode ter kpiOuro match:exato", path: ["kpiOuro"] });
    if (e.esperaAmbiguidade && e.classe !== "desambiguacao")
      ctx.addIssue({ code: "custom", message: "esperaAmbiguidade so em desambiguacao", path: ["esperaAmbiguidade"] });
  });
export type GoldenEntry = z.infer<typeof GoldenEntrySchema>;

export const GoldenSchema = z.array(GoldenEntrySchema);
