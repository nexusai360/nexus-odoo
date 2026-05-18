/**
 * Funções puras extraídas de user-form-dialog.tsx para facilitar testes unitários.
 */
import type { PlatformRole } from "@/generated/prisma/client";
import type { ReportDomainId } from "@/lib/reports/domains";

export type RoleValue = PlatformRole;
export type Step = 1 | 2 | 3;

export interface FormState {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: RoleValue;
  isActive: boolean;
  domains: ReportDomainId[];
}

/**
 * Handler puro para troca de role no UserFormDialog.
 *
 * N10: ao escolher role privilegiado (admin / super_admin):
 *   - zera `form.domains` (privilegiados não têm domínios)
 *   - se o passo atual >= 2, recua para o passo anterior (a etapa Acesso
 *     deixa de existir para roles privilegiados)
 *
 * Recebe o estado atual do form, o novo role e o step atual.
 * Devolve { form, step } com os valores atualizados.
 */
export function handleRoleChange(
  prevForm: FormState,
  novoRole: RoleValue,
  step: Step,
): { form: FormState; step: Step } {
  const privilegiado = novoRole === "super_admin" || novoRole === "admin";

  const nextForm: FormState = {
    ...prevForm,
    role: novoRole,
    domains: privilegiado ? [] : prevForm.domains,
  };

  let nextStep: Step = step;
  if (privilegiado && step >= 2) {
    nextStep = (step > 2 ? 2 : 1) as Step;
  }

  return { form: nextForm, step: nextStep };
}
