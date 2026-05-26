/**
 * /agente/inteligencia , decommissioned. Redireciona pra /agente/qualidade.
 *
 * 307 (temporary redirect) preserva metodo HTTP e permite reverter sem
 * cache permanente.
 *
 * Spec: docs/superpowers/specs/2026-05-26-agente-qualidade-design.md §5.7
 */

import { redirect, RedirectType } from "next/navigation";

export const dynamic = "force-dynamic";

export default function InteligenciaPage(): never {
  redirect("/agente/qualidade", RedirectType.replace);
}
