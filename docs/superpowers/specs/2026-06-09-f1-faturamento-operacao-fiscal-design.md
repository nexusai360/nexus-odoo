# SPEC , Fase 1: Tabela de Regras + Faturamento por Operação Fiscal (CFOP/categoria)

> Versão: **v3** (pós 2 reviews adversariais , fiscal + arquitetura). Pronta para PLAN.
> Base: `docs/superpowers/research/2026-06-09-pericia-faturamento-consolidado.md`.
> Escopo ESTRITO. Intercompany, ponte, margem e DRE são fases seguintes.

## 0. Mudanças aplicadas das reviews (rastreabilidade)

**Review arquitetura (BLOQUEIOS):**
- A tool/métrica de CFOP **já existe** (`src/lib/metrics/fiscal/faturamento-por-cfop.ts`,
  `mcp/tools/fiscal/faturamento-por-cfop.ts` id `fiscal_faturamento_por_cfop`, formatador
  `fmtFaturamentoPorCfop` em `responder.ts`, trigger em `tool-triggers.data.ts`). **Decisão:
  EVOLUIR a tool existente** (não criar nova, não colidir no roteamento).
- Base única: migrar para `vr_produtos` (escolha do usuário; difere de `vr_nf` do item em só
  R$ 28k / 0,0015%). Reconciliação ao `vr_nf` por nota. Registrar no RADAR (muda número de
  tool em produção, ainda que ínfimo).
- Usar **`groupBy` nativo por `cfopId`** (138.088 itens, 58 CFOPs, 364 nulos), não findMany+Map.
- Atualizar o **formatador existente** `fmtFaturamentoPorCfop` para o novo shape + `agruparPor`;
  manter na allowlist `TOOLS_QUE_PRECISAM_FORMATADOR`.

**Review fiscal (BLOQUEIOS, validados no dado real):**
- `6152` transferência (R$ 234 mi) NÃO pode cair em venda → precedência transferência > venda.
- `6202` é **devolução de COMPRA** (R$ 103 mi) → `ehReceita=false, deduzReceita=false` (NÃO deduz venda).
- CFOPs de **entrada (1xxx/2xxx) com saída** (R$ 607k) → categoria `entrada_anomala`, fora de receita.
- **Serviço ISSQN** `5933/6933/5353/6353` (~R$ 3,5 mi) → categoria `servico`, NÃO "remessa".
- **Venda de ativo** `5551/6551` (R$ 2,3 mi) → `venda_ativo`, fora do faturamento de mercadoria.
- **Entrega futura**: `x922` (simples faturamento) `ehReceita=false`; `x117` (venda) `ehReceita=true`
  → regra anti-dupla-contagem (R$ 58 mi em jogo) + teste.
- **Sem-CFOP** confirmado R$ 23,3 mi (364 itens) → linha própria + **alerta de qualidade**, não "outras".
- Reconciliação produto×nota é pequena no agregado (0,06%) → calibrar o texto (não vender como grande).

**Cortado do escopo da Fase 1 (vira task isolada, risco de regressão):**
- Issue 1 (limpeza da natureza) e Issue 2 (rótulos/animação UI) saem desta spec. Issue 2 é UI
  pequena e independente; tratar em PR próprio. Issue 1 fica subsumida pela superioridade do CFOP.

## 1. Objetivo

Evoluir a quebra de faturamento por CFOP existente para uma visão de **operação fiscal**
rigorosa: além do CFOP cru, agregar por **categoria gerencial** compreensível (venda,
serviço, transferência, devolução, remessa, exportação...), com flag **`ehReceita`** que
separa venda real de movimentação que não é receita. Introduzir a **Tabela de Regras**
(o "coração" parametrizável e reutilizável pelas Fases 2-4).

## 2. Fora de escopo

Intercompany/eliminação (Fase 2), ponte completa (Fase 3), margem/custo (Fase 4),
DRE/lucro (bloqueado: contábil vazio). Issue 1/Issue 2 (PRs próprios).

## 3. Componentes

### 3.1 Tabela de Regras , `src/lib/fiscal/regras/`

Separar DADO de LÓGICA (reuso nas fases seguintes):

```
src/lib/fiscal/regras/
  tipos.ts          # CategoriaGerencial (union) + RegraOperacao (interface). Zero lógica.
  cfop-mapa.ts      # MAPA_CFOP: Record<string, RegraOperacao> , dado CURADO (1 linha/CFOP).
  cfop-prefixo.ts   # regraPorPrefixo(cfop): fallback por grupo, com PRECEDÊNCIA fixada.
  extrair-cfop.ts   # extrairCfop(cfopNome): string|null (4 dígitos do início). Pura.
  classificar.ts    # classificarCfop(cfop4dig): mapa > prefixo > fallback conservador.
  index.ts          # API pública.
  __tests__/        # 1 arquivo por unidade.
```

**Tipos:**
```ts
type CategoriaGerencial =
  | "venda" | "exportacao" | "servico"
  | "transferencia" | "devolucao_venda" | "devolucao_compra"
  | "remessa" | "retorno" | "simples_faturamento" | "bonificacao"
  | "venda_ativo" | "entrada_anomala" | "sem_cfop" | "outras";

interface RegraOperacao {
  categoria: CategoriaGerencial;
  ehReceita: boolean;        // entra no faturamento de mercadoria/serviço?
  deduzReceita: boolean;     // F1: INFORMATIVO (não subtrai aqui; usado na ponte/Fase 3)
  afetaEstoque: boolean;
  ehIntercompanySeGrupo: boolean; // FUTURO (Fase 2); presente no tipo desde já
}
```

**Precedência de `classificarCfop` (crítica , review fiscal Achado 1):**
1. `MAPA_CFOP[cfop]` se existir (curado).
2. `regraPorPrefixo(cfop)` , avaliar nesta ORDEM (primeira que casar vence):
   entrada (`^[12]`) → `entrada_anomala`; serviço (`x933|x35x`) → `servico`;
   transferência (`x15[12]|x55[127]|x601`) → `transferencia`; ativo (`x551`) → `venda_ativo`;
   devolução (`x20[129]|x41[12]`) → `devolucao_*`; simples faturamento (`x922`) →
   `simples_faturamento`; remessa/retorno (`x9[0-4]x`) → `remessa`/`retorno`;
   venda encomenda (`x117|x120`) e venda (`x10[0-9]|x40[0-9]`) → `venda` POR ÚLTIMO.
3. Fallback: `outras`, `ehReceita=false` ("na dúvida não é receita").

**`MAPA_CFOP` curado** , 1 linha por CFOP real do dado (tabela completa no Apêndice A).
Decisões fixadas: `venda` colapsa venda própria + revenda nesta fase (ambas receita;
distinção própria×revenda depende do produto, não do CFOP , perícia §6). `6108`→`venda`.

### 3.2 Métrica , evoluir `src/lib/metrics/fiscal/faturamento-por-cfop.ts`

`faturamentoPorCfop(prisma, input)`:
- **Fonte/base:** `fato_nota_fiscal_item`, **`groupBy({ by:['cfopId'], _sum:{vrProdutos}, _count }) `**
  com `where`: `entradaSaida='1'`, `situacaoNfe='autorizada'`, período (`buildPeriodoWhere`),
  empresa (`buildEmpresaWhere` no `empresaId` do item , R10-safe).
- Resolve cada `cfopId` → `cfopNome` (carregar o nome de um representante do grupo) →
  `extrairCfop` → `classificarCfop`. ~58 grupos, classificação em memória.
- **Input:** `+ agruparPor?: 'cfop' | 'categoria'` (default `'categoria'`). Demais campos atuais
  preservados (periodoDe/Ate, empresaId, limit/offset).
- **Saída:**
  - `agruparPor` (ecoado).
  - `linhas`: `{ chave: string, rotulo: string, categoria, ehReceita, totalItens, valorProdutos }[]`
    ordenado por valorProdutos desc. (chave = CFOP "5102" ou categoria "venda".)
  - `totalProdutos`, `totalReceita` (só `ehReceita`), `totalNaoReceita`.
  - `reconciliacao`: `{ somaProdutosItens, faturamentoVrNfPorNota, diferenca, observacao }`.
  - `semCfop`: `{ totalItens, valorProdutos }` (linha própria + alimenta alerta).
- **Compat:** o modo `agruparPor='cfop'` mantém a semântica da tool atual (lista por CFOP),
  mas com a base `vr_produtos` e os campos novos. Atualizar os testes existentes.

### 3.3 Tool MCP , evoluir `mcp/tools/fiscal/faturamento-por-cfop.ts`

- Mantém id `fiscal_faturamento_por_cfop`. Input zod ganha `agruparPor?: 'cfop'|'categoria'`.
- Triggers: acrescentar "por operação fiscal", "composição do faturamento", "quanto é
  venda/serviço/transferência/devolução", "faturamento por categoria". Manter os de CFOP.
- Saída: envelope padrão + `_RESPOSTA`/`_DESTAQUE` com aviso de reconciliação e, quando
  `semCfop.valorProdutos > 0`, **aviso de gap** ("R$ X sem classificação fiscal").

### 3.4 Formatador , atualizar `fmtFaturamentoPorCfop` em `mcp/lib/responder.ts`

- Ramificar a frase por `agruparPor` (N CFOPs vs N categorias), listar linhas (rotulo+valor),
  marcar `ehReceita`, mostrar `totalReceita` separado do `totalProdutos`, e a observação de
  reconciliação. Manter a tool na allowlist `TOOLS_QUE_PRECISAM_FORMATADOR`. `responder.ts`
  é COMPARTILHADO , editar inline (protocolo multi-agente).

## 4. Estratégia de teste (TDD + E2E real)

- Unit `extrair-cfop`: 4 dígitos, nome inesperado, nulo.
- Unit `classificar`: 1 caso por categoria + fallback conservador + os 4 testes de regressão
  fiscal: (i) `6152`→transferencia (não venda); (ii) `5922`+`5117` não dobram receita;
  (iii) `6202`→devolucao_compra, `ehReceita=false`, não deduz; (iv) `5933/6933`→servico (não remessa).
- Unit métrica (mock prisma): agruparPor cfop e categoria, totalReceita exclui não-receita,
  reconciliacao, linha semCfop.
- Tool/formatador: shape + frase por modo + aviso de gap (mock).
- **E2E cache real:** conferir contra SQL independente: soma vr_produtos por CFOP; total de
  receita = venda+exportacao+servico (categorias ehReceita); semCfop = R$ 23,3 mi; reconciliação
  fecha. Rebuild do `mcp` (CLAUDE.md §2.1) antes de validar via tool.

## 5. Critérios de aceite

- Quebra por categoria agrega CFOPs em categorias compreensíveis; por CFOP mostra nome limpo.
- `totalReceita` NÃO infla: transferência/remessa/devolução/entrega-futura/ativo/entrada fora.
- 6152 não vira venda; 6202 não deduz; serviço separado; sem-CFOP visível com alerta.
- Reconciliação produto×nota explícita e calibrada.
- tsc + jest verdes (inclui testes existentes da tool migrados); E2E real confere números.
- RADAR registra a mudança de base (vrNf→vrProdutos) da tool em produção.

## 6. Apêndice A , MAPA_CFOP curado (dos CFOPs reais do cache)

> Fonte: review fiscal (validada no dado). `ehReceita` na ótica de faturamento de
> mercadoria/serviço do grupo (intercompany é ortogonal, Fase 2). Completar no plano com
> `SELECT DISTINCT` final para não faltar nenhum CFOP do dado.

| CFOP | Categoria | ehReceita | deduzReceita | afetaEstoque |
|---|---|:--:|:--:|:--:|
| 5101,5102,6101,6102,6107,6108,5403,6403,5405,6404 | venda | ✅ | ✗ | ✅ |
| 5117,6117,5119,6119,5120,6120 | venda | ✅ | ✗ | ✅ |
| 7101,7102,7105,7106,7127,7949 | exportacao | ✅ | ✗ | ✅ |
| 5933,6933,5353,6353,5301,6301 | servico | ✅ | ✗ | ✗ |
| 5151,5152,6151,6152,5409,6409 | transferencia | ✗ | ✗ | ✅ |
| 5552,6552,5557,6557 | transferencia | ✗ | ✗ | ✗ |
| 5601,6601 | transferencia | ✗ | ✗ | ✗ |
| 5202,5210,6202,6210,5411,6411,5209,6209 | devolucao_compra | ✗ | ✗ | ✅ |
| 1201,1202,2202,1410,1411,2410,2411 | devolucao_venda | ✗ | ✅ | ✅ |
| 5551,6551 | venda_ativo | ✗ | ✗ | ✅ |
| 5901..5949,6901..6949 (exceto x922/x933) | remessa/retorno | ✗ | ✗ | ✅ |
| 5922,6922 | simples_faturamento | ✗ | ✗ | ✗ |
| 5910,6910 | bonificacao | ✗ | ✗ | ✅ |
| 1352,1353,2352,2353 (e demais 1xxx/2xxx) | entrada_anomala | ✗ | ✗ | ✗ |
| (cfop nulo) | sem_cfop | ✗ | ✗ | ✗ |

Regra dos pares entrega futura (anti-dupla-contagem): `x922` simples_faturamento
`ehReceita=false`; `x117` venda `ehReceita=true`. A receita reconhece no `x117`.
