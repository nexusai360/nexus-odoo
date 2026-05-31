// B2 (onda fiscal complementar): builder do MDF-e (manifesto de transporte).
// Estrutural (0 reg hoje; popula quando a Matrix operar MDF-e no Odoo).
// Fonte: raw_sped_mdfe (modelo sped.mdfe). Campos via fields_get ao vivo.
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";

export interface FatoMdfeRow {
  odooId: number;
  chave: string | null;
  numero: string | null;
  situacaoMdfe: string | null;
  situacaoFiscal: string | null;
  tipoEmissao: string | null;
  empresaId: number | null;
  empresaCnpj: string | null;
  dataEmissao: Date | null;
  dataAutorizacao: Date | null;
  dataEncerramento: Date | null;
  dataCancelamento: Date | null;
  protocoloAutorizacao: string | null;
  municipioCarregamento: string | null;
  municipioDescarregamento: string | null;
  pesoBruto: number;
  pesoCarga: number;
  vrNf: number;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const numStr = (v: unknown): string | null => {
  if (v == null || v === false || v === "") return null;
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  return null;
};
const num = (v: unknown): number => (typeof v === "number" ? v : 0);
const dt = (v: unknown): Date | null =>
  typeof v === "string" && v ? new Date(v.replace(" ", "T")) : null;

export function mapMdfeRow(raw: Record<string, unknown>): FatoMdfeRow {
  return {
    odooId: Number(raw.id),
    chave: str(raw.chave),
    numero: numStr(raw.numero), // float no Odoo
    situacaoMdfe: str(raw.situacao_mdfe),
    situacaoFiscal: str(raw.situacao_fiscal),
    tipoEmissao: str(raw.tipo_emissao_mdfe),
    empresaId: relId(raw.empresa_id as OdooM2O),
    empresaCnpj: str(raw.empresa_cnpj_cpf),
    dataEmissao: dt(raw.data_emissao) ?? dt(raw.data_hora_emissao),
    dataAutorizacao: dt(raw.data_autorizacao) ?? dt(raw.data_hora_autorizacao),
    dataEncerramento: dt(raw.data_encerramento) ?? dt(raw.data_hora_encerramento),
    dataCancelamento: dt(raw.data_cancelamento) ?? dt(raw.data_hora_cancelamento),
    protocoloAutorizacao: str(raw.protocolo_autorizacao),
    municipioCarregamento: relNome(raw.municipio_carregamento_id as OdooM2O),
    municipioDescarregamento: relNome(raw.municipio_descarregamento_id as OdooM2O),
    pesoBruto: num(raw.peso_bruto),
    pesoCarga: num(raw.peso_carga),
    vrNf: num(raw.vr_nf),
  };
}

export async function rebuildFatoMdfe(prisma: PrismaClient): Promise<number> {
  const rawRows = await prisma.rawSpedMdfe.findMany({ where: { rawDeleted: false } });
  const mapped = rawRows.map((r) => mapMdfeRow(r.data as Record<string, unknown>));
  await prisma.$transaction(
    async (tx) => {
      await tx.fatoMdfe.deleteMany({});
      if (mapped.length) await tx.fatoMdfe.createMany({ data: mapped });
      await markFatoBuilt(tx, "fato_mdfe");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );
  return mapped.length;
}
