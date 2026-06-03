// Helper de formatacao de timestamp para a bubble do Agente Nex.
// Regra unica (pedido do usuario em 2026-05-25 01:53):
//   SEMPRE "dd/mm/yyyy  ·  hh:mm" (24h, horario local do servidor).
// Sem omissao de ano por contexto. Sem variacoes.

export function formatRelativeDateTime(value: Date | string | null | undefined): string {
  return formatFullDateTime(value);
}

// Rotulo de DIA para a tag flutuante de navegacao no chat:
//   hoje        -> "Hoje"
//   ontem       -> "Ontem"
//   mais antigo -> "dd/mm/yyyy" (sem dia da semana, por pedido do usuario)
// Comparacao por data de calendario local (zera horas), nao por 24h corridas.
export function formatDayLabel(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const today = startOfDay(new Date());
  const that = startOfDay(d);
  const diffDays = Math.round((today - that) / 86_400_000);
  if (diffDays <= 0) return "Hoje";
  if (diffDays === 1) return "Ontem";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

// Formato fixo para os logs/relatorios (.txt): sempre dd/mm/yyyy  ·  hh:mm
// (mesmo separador da bubble para consistencia visual).
export function formatFullDateTime(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy}  ·  ${hh}:${mi}`;
}
