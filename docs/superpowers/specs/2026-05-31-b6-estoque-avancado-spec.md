# SPEC , B6 Estoque avançado / WMS (pré-build estrutural)

> Onda B6. SPEC v1 → review #1 → v2 → review #2 → v3. Discovery `b4b7.ts`.

## Discovery (fato real) , TUDO 0
estoque.minimo.maximo=0, estoque.local.endereco=0, estoque.norma.palete(.item)=0,
estoque.tipo.palete=0, estoque.requisito=0, wms.documento(.item/.historico)=0,
wms.etapa=0, wms.operacao=0, wms.modelo.impressao=0. Nada operado.

## v1
Modelar min/max + endereçamento + 3 tabelas WMS (documento/operação/etapa) +
palete. ~6 fatos, ~6 tools.

## Review #1
- 100% dos modelos têm 0 reg e 60-209 colunas não validáveis → over-modeling
  massivo. Modelar WMS doc/operação/palete/endereço agora é adivinhação total.
- O ÚNICO de alto valor operacional claro é `estoque.minimo.maximo` (produtos
  abaixo do mínimo / acima do máximo) , campos simples e óbvios mesmo com 0 reg:
  produto_id, local_id, unidade_id, quantidade_minima, quantidade_maxima.
- DECISÃO: B6 entrega só `FatoEstoqueMinMax` + 1 tool. WMS/palete/endereço/
  requisito ficam para quando forem operados (discovery ao vivo antes de modelar).

## v2 / Review #2
- Domínio: `estoque` É um ReportDomain válido → a tool é gated por domínio
  (dominio: "estoque"), SEM sempreVisivel. Sem poluição de RBAC nem churn de
  todas as roles (só estoque +1).
- A tool "abaixo do mínimo" precisaria comparar saldo atual (fato_estoque_saldo)
  vs mínimo. Mas com 0 reg de min/max não há o que comparar; e cruzar saldo×minmax
  é lógica que só vale quando houver min/max real. v3: a tool expõe os min/max
  cadastrados (honesta, count==0 → "não cadastrado"); o cruzamento saldo×mínimo
  vira evolução quando operado (documentar). Não inventar join sem dado.
- Nome/produto via m2o (relNome) para legibilidade.

## v3 (FINAL)
### Fato
`FatoEstoqueMinMax` (← `estoque.minimo.maximo`, raw novo `raw_estoque_minimo_maximo`):
`odooId, produtoId, produtoNome, localId, localNome, unidadeNome, quantidadeMinima,
quantidadeMaxima`. Índices: produtoId, localId.

### Tool (domínio `estoque`)
`estoque_minimo_maximo`: lista parâmetros de mín/máx cadastrados (produto, local,
mínimo, máximo). Filtros `produtoTermo`?(não, sem dado) → só `limite`. Honesta
(count==0 → "mín/máx não cadastrado no Odoo"). Evolução documentada: cruzar com
fato_estoque_saldo para "abaixo do mínimo" quando houver cadastro.

### Cortado (não modelado até operar)
local.endereco, norma.palete(.item), tipo.palete, requisito, wms.* (6 modelos).

### Verificação
tsc/eslint/jest verdes. E2E: builder 0 linhas + build_state (tool "não cadastrado").
Frontend: nenhum.
