// Helper de formatacao de timestamp para a bubble do Agente Nex.
// Regra (pedido do usuario em 2026-05-24 22:34):
//   - Mesma data hoje  : "hh:mm".
//   - Outro dia, mesmo ano  : "dd/mm hh:mm".
//   - Outro ano  : "dd/mm/yy hh:mm".
// Tudo em pt-BR. Hora 24h, sem segundos.

export function formatRelativeDateTime(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";

  const now = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(2);
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");

  // Regra reforcada (pedido usuario 2026-05-25 01:28): sempre mostrar
  // dd/mm a esquerda do horario, mesmo no dia atual. So suprime ano
  // quando ano da mensagem == ano atual. Mensagem antiga de outro ano:
  // dd/mm/yy hh:mm.
  const sameYear = d.getFullYear() === now.getFullYear();
  return sameYear ? `${dd}/${mm} ${hh}:${mi}` : `${dd}/${mm}/${yy} ${hh}:${mi}`;
}

// Formato fixo para os logs/relatorios (.txt): sempre dd/mm/yyyy hh:mm.
export function formatFullDateTime(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}
