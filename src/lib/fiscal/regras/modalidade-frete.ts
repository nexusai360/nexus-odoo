/**
 * De-para da modalidade de frete da NF-e (campo `modFrete` no Odoo/SPED,
 * gravado como `modalidade_frete` no raw do pedido).
 *
 * O Odoo guarda o codigo numerico como string; a FONTE DA VERDADE e o codigo,
 * o rotulo e so apresentacao. Este de-para reproduz a tabela oficial da NF-e
 * (nao ha campo de rotulo textual no raw, conferido no cache), entao nao inventa
 * semantica. Reutilizavel pelas 4 pontas (Diretoria, Relatorios 1.0/2.0, Nex).
 *
 * Codigos (NT NF-e): 0 CIF (por conta do remetente), 1 FOB (por conta do
 * destinatario), 2 por conta de terceiros, 3 proprio por conta do remetente,
 * 4 proprio por conta do destinatario, 9 sem ocorrencia de transporte.
 */
export const MODALIDADE_FRETE_LABELS: Record<string, string> = {
  "0": "CIF (remetente)",
  "1": "FOB (destinatario)",
  "2": "Terceiros",
  "3": "Proprio (remetente)",
  "4": "Proprio (destinatario)",
  "9": "Sem frete",
};

/** Rotulo curto da modalidade de frete a partir do codigo cru do Odoo. */
export function rotuloModalidadeFrete(codigo: string | null | undefined): string {
  if (codigo == null || codigo === "") return "Nao informada";
  const conhecido = MODALIDADE_FRETE_LABELS[codigo];
  if (conhecido) return conhecido;
  return `Outra (${codigo})`;
}
