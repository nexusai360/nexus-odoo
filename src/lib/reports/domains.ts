// src/lib/reports/domains.ts
import type { PlatformRole, ReportDomain } from "@/generated/prisma/client";

export type ReportDomainId = ReportDomain;

export interface ReportDomainMeta {
  id: ReportDomainId;
  label: string;
}

export const REPORT_DOMAINS: ReportDomainMeta[] = [
  { id: "estoque", label: "Estoque" },
  { id: "financeiro", label: "Financeiro" },
  { id: "fiscal", label: "Fiscal" },
  { id: "comercial", label: "Comercial" },
  { id: "cadastros", label: "Cadastros" },
  { id: "contabil", label: "Contábil" },
  { id: "rh", label: "RH" },
  { id: "crm", label: "CRM" },
  { id: "producao", label: "Produção" },
];

const ALL_DOMAINS: ReportDomainId[] = REPORT_DOMAINS.map((d) => d.id);

export function seesAll(role: PlatformRole): boolean {
  return role === "super_admin" || role === "admin";
}

/** Domínios que o usuário consegue ver. Privilegiados veem todos. */
export function visibleDomains(
  role: PlatformRole,
  granted: ReportDomainId[],
): ReportDomainId[] {
  if (seesAll(role)) return [...ALL_DOMAINS];
  return ALL_DOMAINS.filter((d) => granted.includes(d));
}

/** Domínios que o concedente pode conceder a terceiros. */
export function grantableDomains(
  role: PlatformRole,
  granted: ReportDomainId[],
): ReportDomainId[] {
  if (seesAll(role)) return [...ALL_DOMAINS];
  if (role === "manager") return ALL_DOMAINS.filter((d) => granted.includes(d));
  return [];
}
