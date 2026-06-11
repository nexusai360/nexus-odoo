// src/lib/fiscal/cnpj.ts , B2 Cobertura Cliente.
//
// O campo de documento do parceiro no Odoo da Matrix e `vat`, no formato
// `BR-18.282.961/0001-00` (prefixo BR- + mascara). Estas funcoes puras
// normalizam para os usos da plataforma (agrupar por raiz, exibir).
// CPF (11 digitos) NAO e CNPJ: retorna null aqui (quem precisar de CPF
// trata em separado).

/** 14 digitos do CNPJ, sem prefixo/mascara; null se nao houver 14 digitos. */
export function normalizarCnpj(vat: string | null | undefined): string | null {
  if (!vat) return null;
  const digitos = vat.replace(/\D/g, "");
  return digitos.length === 14 ? digitos : null;
}

/** Raiz do CNPJ (8 primeiros digitos) , agrupa matriz + filiais. */
export function raizCnpj(vat: string | null | undefined): string | null {
  const n = normalizarCnpj(vat);
  return n ? n.slice(0, 8) : null;
}

/** Mascara de exibicao XX.XXX.XXX/XXXX-XX. */
export function formatarCnpj(vat: string | null | undefined): string | null {
  const n = normalizarCnpj(vat);
  if (!n) return null;
  return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`;
}
