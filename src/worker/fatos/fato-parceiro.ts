// src/worker/fatos/fato-parceiro.ts
//
// FONTE: raw_sped_participante (modelo `sped.participante`).
//
// ATENCAO , ESTA E A CORRECAO DE UM ERRO DE RAIZ (pericia de 2026-07-12).
// Antes este fato vinha de `res.partner`, e era o join errado: TODO documento do Odoo da
// Tauga (nota fiscal, pedido, titulo financeiro, DF-e) referencia o destinatario pelo campo
// `participante_id`, que aponta para **sped.participante**, NAO para res.partner. As duas
// tabelas tem numeracao propria e independente, entao cruzar o id de uma com a outra pega
// PESSOA DIFERENTE. Exemplo real de producao: o participante 16104 e "PALMS VILLE VM
// CONDOMINIO RESORT", mas o res.partner 16104 e "GEORGE OLIVEIRA DA SILVA" , o mapa da
// diretoria pintava a venda do condominio no estado do George. Em julho/2026, 116 das 136
// notas estavam no estado errado, e uma nota foi classificada como intragrupo por colisao de
// id (sumindo do faturamento).
//
// Agora `fato_parceiro.odoo_id` E o id de `sped.participante`, ou seja, a MESMA chave que os
// documentos guardam. Todos os joins do sistema (mapa por UF, faturamento por cliente,
// intragrupo, agente Nex, relatorios) passam a bater com a pessoa certa.
//
// `partner_id` (o vinculo com res.partner) fica materializado para quem precisar do cadastro
// de contatos do Odoo. FILTRO: rawDeleted=false.
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";
// Fonte canonica de soDigitos: src/lib/entities/_documento (mesma usada pelo
// resolverParceiro). Reuso garante alinhamento builder x ramo documento x backfill.
import { soDigitos } from "@/lib/entities/_documento";

export interface FatoParceiroRow {
  odooId: number;
  nome: string | null;
  nomeCompleto: string | null;
  documento: string | null;
  // C3 (F2): documento so com digitos (CNPJ/CPF sem mascara nem prefixo BR-).
  documentoDigits: string | null;
  ehCliente: boolean;
  ehFornecedor: boolean;
  ehEmpresa: boolean;
  cidade: string | null;
  uf: string | null;
  pais: string | null;
  cep: string | null;
  email: string | null;
  telefone: string | null;
  ativo: boolean;
  /** Id do res.partner correspondente (o cadastro de contato do Odoo). */
  partnerId: number | null;
  // T-42 (Ronda 4): data de criacao (Odoo create_date) para permitir filtro
  // "parceiros novos cadastrados esta semana/mes".
  dataCriacao: Date | null;
  // NÃO inclui atualizadoEm , campo tem @default(now()) no schema
}

/** Texto util, ou null quando o Odoo devolve `false`/vazio (JSON-RPC usa false para vazio). */
function texto(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" || t === "false" ? null : t;
}

/**
 * UF do participante. `estado` ja vem como SIGLA ("SE"). Quando falta, extrai do rotulo do
 * municipio ("Aracaju - SE"), que o Odoo devolve no m2o , antes esses casos viravam "Sem UF"
 * na tela sem necessidade.
 */
function ufDoParticipante(raw: Record<string, unknown>): string | null {
  const sigla = texto(raw.estado);
  if (sigla) return sigla.toUpperCase();
  const mun = raw.municipio_id;
  if (Array.isArray(mun) && typeof mun[1] === "string") {
    const partes = mun[1].split(" - ");
    const ultima = partes[partes.length - 1]?.trim();
    if (ultima && ultima.length === 2) return ultima.toUpperCase();
  }
  return null;
}

/** Cidade do participante, com o mesmo fallback pelo rotulo do municipio. */
function cidadeDoParticipante(raw: Record<string, unknown>): string | null {
  const c = texto(raw.cidade);
  if (c) return c;
  const mun = raw.municipio_id;
  if (Array.isArray(mun) && typeof mun[1] === "string") {
    const cidade = mun[1].split(" - ")[0]?.trim();
    if (cidade) return cidade;
  }
  return null;
}

export function mapParceiroRow(raw: Record<string, unknown>): FatoParceiroRow {
  const documento = texto(raw.cnpj_cpf);
  // O participante guarda o nome fantasia em `nome` e a razao social em `razao_social`.
  const nome = texto(raw.nome) ?? texto(raw.razao_social);

  return {
    odooId: Number(raw.id),
    nome,
    nomeCompleto: texto(raw.razao_social) ?? nome,
    documento,
    // C3 (F2): so digitos; string vazia vira null, igual ao backfill da migration (NULLIF).
    documentoDigits: documento ? soDigitos(documento) || null : null,
    ehCliente: Boolean(raw.eh_cliente),
    ehFornecedor: Boolean(raw.eh_fornecedor),
    ehEmpresa: Boolean(raw.eh_empresa),
    cidade: cidadeDoParticipante(raw),
    uf: ufDoParticipante(raw),
    pais: texto(raw.pais) ?? "Brasil",
    cep: texto(raw.cep),
    email: texto(raw.email),
    telefone: texto(raw.fone) ?? texto(raw.fone_comercial),
    // `sped.participante` nao expoe `active` como o res.partner: so e inativo quando o Odoo
    // diz explicitamente que e. Na duvida, ativo (senao o cadastro sumiria das telas).
    ativo: raw.active === false ? false : true,
    partnerId: relId(raw.partner_id as OdooM2O),
    dataCriacao:
      typeof raw.create_date === "string"
        ? (() => {
            const d = new Date(raw.create_date);
            return Number.isNaN(d.getTime()) ? null : d;
          })()
        : null,
  };
}

/** Reconstrói fato_parceiro a partir de raw_sped_participante.
 * Filtro: rawDeleted=false. Ciclo: incremental (deleteMany+createMany, em transação). */
export async function rebuildFatoParceiro(
  prisma: PrismaClient,
): Promise<number> {
  const rawRows = await prisma.rawSpedParticipante.findMany({
    where: { rawDeleted: false },
  });
  const mapped = rawRows.map((r) =>
    mapParceiroRow(r.data as Record<string, unknown>),
  );
  await prisma.$transaction(
    async (tx) => {
      await tx.fatoParceiro.deleteMany({});
      if (mapped.length) {
        await tx.fatoParceiro.createMany({ data: mapped });
      }
      await markFatoBuilt(tx, "fato_parceiro");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );
  return mapped.length;
}
