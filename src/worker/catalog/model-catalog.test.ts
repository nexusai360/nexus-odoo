import { MODEL_CATALOG, rawTableFor } from "./model-catalog";
import fs from "node:fs";
import path from "node:path";

// Modelos acrescentados na F4 L1a (expansão da base de leitura). Entraram pela
// investigação `fields_get`, não pela varredura F0, então não têm arquivo
// correspondente em discovery/output/modelos.
const MODELOS_L1A = new Set([
  "sped.tabela.preco",
  "sped.tabela.preco.regra",
  "sped.servico",
  "sped.apuracao",
  "sped.carta.correcao",
]);

// Modelos acrescentados na F4 L1c (resíduo operacional 4a). Mesma situação da
// L1a: entraram via sondagem `fields_get`, não pela varredura F0.
const MODELOS_L1C = new Set([
  "sped.certificado",
  "finan.baixa.lancamento",
  "pedido.faturamento",
]);

// Modelos acrescentados na F4 L1b (camada de referência). Também via sondagem.
const MODELOS_L1B = new Set([
  "sped.ncm", "sped.cfop", "sped.cest", "sped.cnae", "sped.nbs",
  "sped.natureza.operacao", "sped.unidade", "sped.cst.icms",
  "sped.cst.icms.sn", "sped.cst.ipi", "sped.cst.pis.cofins", "sped.cst.cibs",
  "sped.municipio", "sped.pais", "sped.estado", "sped.condicao.pagamento",
  "sped.feriado", "sped.aliquota.icms.proprio", "sped.aliquota.icms.st",
  "sped.aliquota.inss", "sped.aliquota.ipi", "sped.aliquota.irpf",
  "sped.aliquota.iss", "sped.aliquota.pis.cofins",
  "sped.aliquota.simples.aliquota", "sped.aliquota.simples.anexo",
  "sped.aliquota.simples.teto",
]);

// Modelos que existem em discovery/output/modelos (varredura F0 historica)
// mas foram INTENCIONALMENTE removidos do MODEL_CATALOG. Excluir do "noDisco"
// para que a comparacao bata. Documentar SEMPRE o motivo + data no comentario
// inline em src/worker/catalog/model-catalog.ts.
const MODELOS_REMOVIDOS = new Set([
  // pedido.documento.historico.tempo: removido em 2026-05-25 — eh view (sem
  // coluna `id`), sync incremental falha com "ERRO: coluna id nao existe".
  // Nao tem fato consumidor; raw orfa. Comentario fonte em
  // src/worker/catalog/model-catalog.ts L44-L48.
  "pedido.documento.historico.tempo",
]);

// Modelo acrescentado na onda O1 (DF-e). Entrou via sondagem `fields_get`, não
// pela varredura F0, então não tem arquivo em discovery/output/modelos.
const MODELOS_O1 = new Set(["sped.consulta.dfe.item"]);
const MODELOS_B1 = new Set(["contabil.lancamento", "contabil.lancamento.item"]);
const MODELOS_B2 = new Set(["sped.mdfe", "reinf.evento"]);

describe("model-catalog", () => {
  it("tem 125 modelos", () => {
    expect(MODEL_CATALOG).toHaveLength(125);
  });

  // discovery/output/ é gitignored (saídas brutas locais , ver .gitignore).
  // Em dev, com os field-maps presentes, valida-se que o catálogo bate com
  // o discovery; em CI o diretório não existe e o caso é pulado.
  const discoveryDir = path.join(process.cwd(), "discovery/output/modelos");
  const temDiscovery = fs.existsSync(discoveryDir);
  (temDiscovery ? it : it.skip)(
    "cobre exatamente os modelos de discovery/output/modelos (fora os da L1a)",
    () => {
      const arquivos = fs
        .readdirSync(discoveryDir)
        .filter((f) => f.endsWith(".json"));
      const noDisco = new Set(
        arquivos
          .map((f) => f.replace(/\.json$/, ""))
          .filter((m) => !MODELOS_REMOVIDOS.has(m)),
      );
      const noCatalogo = new Set(
        MODEL_CATALOG.map((m) => m.odooModel).filter(
          (m) =>
            !MODELOS_L1A.has(m) &&
            !MODELOS_L1C.has(m) &&
            !MODELOS_L1B.has(m) &&
            !MODELOS_O1.has(m),
        ),
      );
      expect(noCatalogo).toEqual(noDisco);
    },
  );

  it("todo modo é incremental, snapshot ou estatico", () => {
    for (const m of MODEL_CATALOG) {
      expect(["incremental", "snapshot", "estatico"]).toContain(m.mode);
    }
  });

  it("rawTableFor converte ponto em underscore com prefixo raw_", () => {
    expect(rawTableFor("estoque.saldo.hoje")).toBe("raw_estoque_saldo_hoje");
  });
});
