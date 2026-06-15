// src/worker/fatos/dim-empresa-regime.ts
// De-para CNPJ-raiz -> regime tributario (Fase 5).
//
// O campo `sped.empresa.regime_tributario` e `store=false` (computado), entao NAO
// chega no raw pelo sync generico (field-selection so traz store=true). Aqui fazemos
// uma LEITURA DIRECIONADA pedindo o campo nominalmente (assim o Odoo retorna o
// computado), parseamos o CNPJ do label de `company_id`, reduzimos a raiz (8 digitos)
// e gravamos `dim_empresa_regime`. NAO tocar o field-selection global (contaminaria
// ~70 modelos e arriscaria o bug que motivou JSON-RPC, decisao #8).
//
// Invariante: 1 raiz de CNPJ -> 1 regime (o regime e opcao da PJ; filiais herdam).
// Divergencia => erro alto (nunca silenciar).

import type { PrismaClient } from "../../generated/prisma/client";
import type { OdooClient } from "../odoo/client";
import { parseEmpresaNome } from "../../lib/metrics/_shared/empresa";
import { cnpjRaiz, regimeLabel } from "../../lib/fiscal/regime/regime";

interface SpedEmpresaRow {
  id: number;
  regime_tributario: string | false;
  company_id: [number, string] | false;
}

/** Calcula o mapa raiz->codigo a partir das linhas do Odoo (puro, testavel isolado). */
export function mapearRegimePorRaiz(regs: SpedEmpresaRow[]): Map<string, string> {
  const porRaiz = new Map<string, string>();
  for (const r of regs) {
    const codigo = typeof r.regime_tributario === "string" ? r.regime_tributario.trim() : "";
    if (!codigo) continue; // empresa sem regime informado -> ignora (nao inventa)
    const label = Array.isArray(r.company_id) ? r.company_id[1] : null;
    const cnpj = parseEmpresaNome(r.id, label).cnpj;
    const raiz = cnpjRaiz(cnpj);
    if (!raiz) continue; // CNPJ nao parseavel -> ignora (registro malformado/duplicado)
    const existente = porRaiz.get(raiz);
    if (existente && existente !== codigo) {
      throw new Error(
        `dim_empresa_regime: raiz ${raiz} com regimes divergentes (${existente} vs ${codigo}); ` +
          `o regime deve ser unico por pessoa juridica.`,
      );
    }
    porRaiz.set(raiz, codigo);
  }
  return porRaiz;
}

/**
 * Popula `dim_empresa_regime` por leitura direcionada de `sped.empresa`.
 * Retorna o numero de raizes gravadas. Recebe `odoo` (atipico p/ builder) porque o
 * regime nao vive no raw.
 */
export async function rebuildDimEmpresaRegime(
  prisma: PrismaClient,
  odoo: OdooClient,
): Promise<number> {
  const regs = await odoo.searchRead<SpedEmpresaRow>(
    "sped.empresa",
    [],
    ["id", "regime_tributario", "company_id"],
  );
  const porRaiz = mapearRegimePorRaiz(regs);

  const agora = new Date();
  let n = 0;
  for (const [raiz, codigo] of porRaiz) {
    await prisma.dimEmpresaRegime.upsert({
      where: { cnpjRaiz: raiz },
      create: {
        cnpjRaiz: raiz,
        regimeCodigo: codigo,
        regimeLabel: regimeLabel(codigo),
        atualizadoEm: agora,
      },
      update: {
        regimeCodigo: codigo,
        regimeLabel: regimeLabel(codigo),
        atualizadoEm: agora,
      },
    });
    n++;
  }
  return n;
}
