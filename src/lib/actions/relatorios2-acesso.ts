"use server";

// src/lib/actions/relatorios2-acesso.ts
// Onda 4 , Server action do controle de acesso do menu Relatorios 2.0. So
// super_admin. Aplica as travas de coerencia (Construtor puxa Paineis/Meus) e
// devolve o acesso normalizado para a UI refletir.
import { requireSuperAdmin } from "./_helpers";
import {
  definirAcessoRelatorios2,
  type AcessoRelatorios2,
} from "@/lib/reports/acesso-relatorios2";

export type SalvarAcessoResult =
  | { ok: true; acesso: AcessoRelatorios2 }
  | { ok: false; error: string };

export async function salvarAcessoRelatorios2(
  acesso: AcessoRelatorios2,
): Promise<SalvarAcessoResult> {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Acesso negado" };
  }
  const norm = await definirAcessoRelatorios2(acesso);
  return { ok: true, acesso: norm };
}
