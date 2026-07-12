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

/** Colunas extraidas do jsonb , so o que o fato usa. */
interface ParticipanteRow {
  id: number;
  nome: string | null;
  razao_social: string | null;
  cnpj_cpf: string | null;
  estado: string | null;
  cidade: string | null;
  municipio: string | null;
  cep: string | null;
  email: string | null;
  fone: string | null;
  fone_comercial: string | null;
  eh_cliente: boolean | null;
  eh_fornecedor: boolean | null;
  eh_empresa: boolean | null;
  partner_id: number | null;
  create_date: string | null;
}

/**
 * Reconstrói fato_parceiro a partir de raw_sped_participante.
 *
 * A leitura EXTRAI AS COLUNAS do jsonb no proprio Postgres, em vez de trazer o `data` inteiro
 * para o heap: o `findMany` carregava os 7,3 mil participantes com TODOS os campos e derrubou o
 * worker de producao por falta de memoria (heap OOM em serie, 2026-07-12). O fato usa 16 campos.
 *
 * Filtro: rawDeleted=false. Ciclo: incremental (delete + insert, na mesma transação).
 */
export async function rebuildFatoParceiro(
  prisma: PrismaClient,
): Promise<number> {
  const rows = await prisma.$queryRaw<ParticipanteRow[]>`
    SELECT
      odoo_id                                     AS id,
      NULLIF(data->>'nome', '')                   AS nome,
      NULLIF(data->>'razao_social', '')           AS razao_social,
      NULLIF(data->>'cnpj_cpf', '')               AS cnpj_cpf,
      NULLIF(data->>'estado', '')                 AS estado,
      NULLIF(data->>'cidade', '')                 AS cidade,
      CASE WHEN jsonb_typeof(data->'municipio_id') = 'array'
           THEN data->'municipio_id'->>1 END      AS municipio,
      NULLIF(data->>'cep', '')                    AS cep,
      NULLIF(data->>'email', '')                  AS email,
      NULLIF(data->>'fone', '')                   AS fone,
      NULLIF(data->>'fone_comercial', '')         AS fone_comercial,
      CASE WHEN data->>'eh_cliente' = 'true' THEN true ELSE false END    AS eh_cliente,
      CASE WHEN data->>'eh_fornecedor' = 'true' THEN true ELSE false END AS eh_fornecedor,
      CASE WHEN data->>'eh_empresa' = 'true' THEN true ELSE false END    AS eh_empresa,
      CASE WHEN jsonb_typeof(data->'partner_id') = 'array'
           THEN (data->'partner_id'->>0)::int END AS partner_id,
      NULLIF(data->>'create_date', '')            AS create_date
    FROM raw_sped_participante
    WHERE coalesce(raw_deleted, false) = false`;

  const mapped = rows.map((r) =>
    mapParceiroRow({
      id: r.id,
      nome: r.nome,
      razao_social: r.razao_social,
      cnpj_cpf: r.cnpj_cpf,
      estado: r.estado,
      cidade: r.cidade,
      // O mapper aceita o m2o do Odoo; aqui basta o rotulo ("Aracaju - SE").
      municipio_id: r.municipio ? [0, r.municipio] : false,
      cep: r.cep,
      email: r.email,
      fone: r.fone,
      fone_comercial: r.fone_comercial,
      eh_cliente: r.eh_cliente,
      eh_fornecedor: r.eh_fornecedor,
      eh_empresa: r.eh_empresa,
      partner_id: r.partner_id != null ? [r.partner_id, ""] : false,
      create_date: r.create_date,
    }),
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
