# SPEC, Onda O1: Expansão SPED Fiscal , DF-e de entrada (piloto da esteira nova)

> **Versão:** v3 (2026-05-30). Final, base do PLAN. Aplica review #1
> (`reviews/2026-05-29-o1-spec-review-1.md`) e review #2
> (`reviews/2026-05-30-o1-spec-review-2.md`, aterrada no shape real via JSON-RPC).
> **Onda:** O1 do roadmap (primeira onda de produto).
> **Branch:** `feat/router-ativacao-r2` (roadmap inteiro nesta branch, decisão do usuário).
> **Roadmap pai:** `docs/superpowers/specs/2026-05-28-roadmap-cobertura-completa-odoo.md` (§4 O1).
> **Insumo:** `discovery/odoo-schema/baldes.json` (R2).

---

## 1. Objetivo

O1 é a **onda piloto** que valida a esteira nova (Router R1 + baldes R2) sobre um
gap real e de alto valor do SPED Fiscal: **DF-e de entrada** , as notas de
fornecedores capturadas eletronicamente (manifestação do destinatário), que a F4
**não** cobre (a F4 cobre só documentos próprios via `fato_nota_fiscal`).

**Critério de "pronto":**
- O Nex responde "quais notas de fornecedores (DF-e) chegaram no período", "compras
  via DF-e por fornecedor", "DF-e pendentes de manifestação".
- O modelo novo aparece no painel "Estado da ingestão" com status **ok** (113->114).
- Bateria R-X >= 95,5%, baseline não regride (P1/Q4).

---

## 2. Cobertura atual (NÃO refazer)

- F4: `FatoNotaFiscal`/`FatoNotaFiscalItem` + 13 tools fiscais (documentos PRÓPRIOS).
- `notas-recebidas` = documentos PRÓPRIOS de entrada, **não** DF-e de terceiros.
- Referência NCM/CFOP/CEST: já têm `fato-referencia` + tool `fiscal_referencia_buscar`.
- Cobrança/títulos a vencer: já cobertos por `FatoFinanceiroTitulo` (de `finan.lancamento`).

> O1 NÃO toca nada disso (P1 aditivo). NÃO cria lookup de NCM/CFOP (review O1-A2),
> NÃO cria tools de duplicata a vencer (redundante com financeiro, review O1-B6/B7).

---

## 3. Escopo do piloto (travado pós-review #2, aterrado no dado real)

**Fonte única:** `sped.consulta.dfe.item` (6.288 regs, Balde A). 1 linha = 1 DF-e
(nota de terceiro consultada/manifestada). Pertence a `sped.consulta.dfe` (lote de
consulta NSU por empresa, sem valor). **Não há granularidade de produto** no DF-e
(review O1-B3), então é um fato único por nota, sem fato de item.

### Cortado (com justificativa do dado real)
- `FatoDfeItem` / `dfe_itens_por_produto`: sem linha de produto na fonte (O1-B3).
- `FatoDuplicata` / `duplicatas_*`: cobrança é do financeiro; duplicata fiscal não
  tem situação/saldo (O1-B6/B7).
- `sped.dfe.importacao` como fonte: é config de sistema, não nota (O1-B1).

---

## 4. Modelo de dado novo: `FatoDfe`

`@@map("fato_dfe")`, de `raw_sped_consulta_dfe_item`. Campos (nomes finais saem da
inspeção do raw no PLAN; baseados nos campos reais confirmados na review #2):

| Campo Prisma | Origem (campo Odoo) | Tipo | Nota |
|---|---|---|---|
| `odooId` @id | `id` | Int | PK |
| `chave` | `chave` | String? | chave de acesso da NF-e/NFS-e |
| `numero` | `numero` | String? | número da nota |
| `modelo` | `modelo` | String? | "55" NF-e, "03" NFS-e, etc. |
| `cnpjFornecedor` | `cnpj_cpf` | String? | **chave de agregação por fornecedor** (FK `participante_id` é frequentemente nula, O1-B5) |
| `fornecedorId` | `participante_id` | Int? | nice-to-have, nulável |
| `fornecedorNome` | (resolvido do participante) | String? | nulável |
| `vrNf` | `vr_nf` | Decimal(18,2) | **frequentemente 0 nesta base** (O1-B5); valor confiável de compra vem do financeiro |
| `dataEmissao` | `data_hora_emissao` | DateTime? | índice |
| `dataRecebimento` | `data_hora_recebimento` | DateTime? | |
| `manifestacao` | `manifestacao` | String? | char livre: "conhecido" (621) / vazio (5.667); índice |
| `podeManifestar` | `pode_manifestar` | Boolean | critério auxiliar de "pendente" |
| `empresaId` | via `consulta_id.empresa_id` | Int? | empresa do grupo que recebeu |
| `atualizadoEm` | now() | DateTime | |

Índices: `dataEmissao`, `cnpjFornecedor`, `manifestacao`.

**Builder** `src/worker/fatos/fato-dfe.ts` no padrão `fato-nota-fiscal.ts` (lê raw,
mapeia escalares do JSONB, upsert por `odooId`), registrado no pipeline de fatos +
`FatoBuildState`. **Ciclo:** incremental se `raw_sped_consulta_dfe_item` tem
`rawWriteDate` (delta), senão snapshot , decidido no PLAN contra o raw.

---

## 5. Raw novo + MODEL_CATALOG + painel (requisito do usuário §9)

`sped.consulta.dfe.item` NÃO tem raw hoje. Adicionar ao
`src/worker/catalog/model-catalog.ts`: `{ odooModel: "sped.consulta.dfe.item",
mode: "incremental" }` (confirmar modo no PLAN: se tem `write_date`, incremental).
Migration aditiva cria `raw_sped_consulta_dfe_item`.

**Painel "Estado da ingestão"** (`/configuracao`,
`configuracao-content.tsx` via `sync-config.ts`) é data-driven do `MODEL_CATALOG` +
`SyncState` (review O1-B8: só raw, fatos NÃO aparecem). Logo, registrar o modelo no
catálogo + rodar o worker faz o painel ir de **113 -> 114 modelos**, com o novo em
status **ok**, registros > 0, última sync recente. Nenhuma outra superfície precisa
de update (não há aba de fatos no painel).

> Avaliar no PLAN se `sped.consulta.dfe` (o lote, 35 regs) também deve ser
> sincronizado para resolver `empresaId`/`empresaNome` do DF-e (provável: sim, é
> barato e enriquece). Se sim, é +1 no MODEL_CATALOG (114->115).

---

## 6. Tools (3, padrão canônico P2)

| Tool | Responde | Lógica |
|---|---|---|
| `dfe_importados_periodo` | DF-e de fornecedores no período | filtra `dataEmissao`/`dataRecebimento` no range; lista + KPIs (qtd, total `vrNf` com aviso). |
| `dfe_por_fornecedor` | compras via DF-e agregadas por fornecedor | group by `cnpjFornecedor`; conta DF-e + soma `vrNf`; ordena por qtd. |
| `dfe_pendentes_manifestacao` | DF-e ainda sem manifestação | filtra `manifestacao` vazio (e/ou `podeManifestar=true`, critério decidido no PLAN contra o dado). |

Cada tool: input Zod curto, query SEMPRE no `FatoDfe`, agregação em TS, envelope
`linhas`/`_RESPOSTA`/`_DESTAQUE`/`_agregado`/`withFreshness`, sanitizer (CNPJ
formatado/mascarado conforme padrão), testes pareados. Em `mcp/tools/fiscal/`.
Descrições discriminam "DF-e/notas de fornecedores (terceiros)" de "notas recebidas
próprias" (review O1-A3). Domínio `fiscal`.

**3 registros por entrega:** builder no pipeline de fatos; tool no catálogo do MCP
(domínio fiscal); modelo no `MODEL_CATALOG` do worker.

---

## 7. Vocabulário do Router (R1)

Adicionar ao domínio fiscal em `domain-vocabulary.ts`: "DF-e", "manifestação do
destinatário", "notas de fornecedor", "notas importadas", "compras eletrônicas",
distintos de "notas recebidas" (próprias). Re-calibrar se o Router cair.

---

## 8. Restrições (roadmap)

Aditivo (P1); leitura do cache + `withFreshness` (decisão #2); padrão de tool
congelado (P2); migration no Postgres dev compartilhado AVISADA antes + `agente
schema-changed` depois; RBAC domínio `fiscal`.

---

## 9. Painel "Estado da ingestão" (requisito do usuário, 2026-05-30)

Todo modelo novo sincronizado entra no `MODEL_CATALOG` e aparece no painel com
status ok + rotina de atualização. Confirmado (review O1-B8) que o painel é só raw
(sem aba de fatos), então o registro no catálogo + sync é suficiente e a verificação
(§10.4) confere 113->114 (ou ->115 se incluir o lote). Pendência fechada.

---

## 10. Verificação (CLAUDE.md §6 [9], dado real obrigatório)

1. `tsc` + `eslint` + `jest` verdes (raiz e mcp).
2. Migration aplicada no dev (AVISADA antes) + `prisma generate`.
3. Worker: `sped.consulta.dfe.item` sincroniza; builder popula `fato_dfe` contra o raw.
4. **Painel "Estado da ingestão"** mostra o(s) modelo(s) novo(s) com status **ok**,
   registros > 0, última sync recente; contagem subiu (113->114, ou ->115).
5. **E2E contra dado real:** as 3 tools exercidas contra o cache; números batem
   (ex.: `dfe_pendentes_manifestacao` retorna ~5.667 contra o read_group da review;
   `dfe_por_fornecedor` soma por cnpj_cpf coerente).
6. **Rebuild `worker` e `mcp`** (CLAUDE.md §2.1).
7. Bateria R-X (R24+) com perguntas DF-e; >= 95,5% e sem regressão do baseline.
8. `/gsd-code-review`. UI review: n/a (painel já é data-driven, sem UI nova).

---

## 11. Sequência de execução (review O1-A7)

migration (avisada) -> `prisma generate` -> rebuild+rodar `worker` (sync
`sped.consulta.dfe.item` + build `fato_dfe`) -> conferir painel "Estado da ingestão"
(113->114) -> rebuild `mcp` (3 tools) -> E2E fiscal contra dado real -> vocabulário
Router -> bateria R-X -> code review -> PR -> merge gated.

---

## 12. Decisões finais

D1. **Piloto = só DF-e de entrada** (1 raw, 1 fato, 3 tools). Coeso, alto valor,
exercita a esteira inteira. Demais sped do Balde A: ondas secundárias.
D2. **Fonte = `sped.consulta.dfe.item`** (review O1-B1/B2); `sped.dfe.importacao` e
itens-de-produto descartados (não existem como imaginado).
D3. **Duplicatas e referência fiscal fora** (já cobertas: financeiro / fato-referencia).
D4. **Agregação por `cnpj_cpf`**, não FK (dado real, O1-B5); avisar que `vr_nf` ~0.
D5. **Modelo novo no MODEL_CATALOG -> painel "Estado da ingestão" ok** (req. usuário §9).
D6. **`manifestacao` é char**, "pendente" = vazio (critério final decidido no PLAN
contra o dado, possivelmente com `pode_manifestar`).
