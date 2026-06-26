"use server";

// src/lib/actions/builder-config.ts
// G1 , Server action do card de modelo do construtor (na tela agente/configuracao).
// Grava builderModelProvider/builderModelId no singleton AgentSettings. So
// super_admin (mesma regra dos demais cards de modelo da config).
import { requireSuperAdmin } from "./_helpers";
import { definirConfigModeloConstrutor } from "@/lib/reports/builder/agent/model-config";

export interface SalvarModeloConstrutorInput {
  provider: string;
  model: string;
  credentialId?: string | null;
}

export type SalvarModeloConstrutorResult =
  | { ok: true }
  | { ok: false; error: string };

export async function salvarModeloConstrutor(
  input: SalvarModeloConstrutorInput,
): Promise<SalvarModeloConstrutorResult> {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Acesso negado" };
  }

  const provider = input.provider?.trim();
  const model = input.model?.trim();
  if (!provider || !model) {
    return { ok: false, error: "Selecione um provedor e um modelo." };
  }

  await definirConfigModeloConstrutor({
    provider,
    model,
    credentialId: input.credentialId ?? null,
  });
  return { ok: true };
}
