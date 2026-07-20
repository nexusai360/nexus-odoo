# Review 1 (adversarial) do PLANO v1 , Fase 1A

> Alvo: `docs/superpowers/plans/2026-07-20-fase1a-definicao-demanda.md`.
> Confrontado com o código real e o cache `nexus_odoo_l1`. Regra: sem travessão.
> Método: para cada suspeita, hipótese antes de olhar, depois verificação no
> código/SQL. Só achados materiais abaixo.

## Achados por severidade

### A1 (ALTA) , R-DEMANDA-ESTOQUE viola D8/INV1; furo de 13,9% (57 pedidos)
O plano só larga o corte em 4 pontas (relatório, card, blocos, Nex
`queryDemandaEmAberta`) e deixa a demanda a entregar GRAMPEADA no corte em:
- `src/lib/reports/queries/comercial.ts:525` (`queryDemandaPorProduto`): `WHERE f.bucket_demanda='ABERTA' ... AND f.data_orcamento >= ${corteAtualDate()}`.
- `src/lib/reports/queries/comercial.ts:640` (`queryEstoqueDisponivel`): idem.
- `src/lib/diretoria/queries/estoque.ts:927` e `:1130` (disponível + necessidade
  de compra / A12): filtram `bucketDemanda:"ABERTA"` sob `periodoWhere(...)`, e
  `periodoWhere` (estoque.ts:73-80) é `janelaClampada(de,ate)` com corte padrão.
- `mcp/tools/comercial/demanda-por-produto.ts` (embrulha `queryDemandaPorProduto`).

Medido no cache: `bucket_demanda='ABERTA'` tem 410 pedidos, dos quais **57
(13,9%) têm `data_orcamento < 2026-03-16`** (o corte). Depois da entrega, card e
relatório abrem no piso 2000 e contam os 57; necessidade de compra / estoque
comprometido / MCP demanda-por-produto continuam no corte e NÃO os contam. Isso é
exatamente o "valor numa tela, outro noutra" que D8 proíbe, e D8 nomeia verbatim
"necessidade de compra" e "Nex/MCP" como pontas que devem bater. O plano trata
como fast-follow opcional; pela decisão D8 é ESCOPO, não opcional.
**Correção:** adicionar task aplicando `janelaDemandaAberta`
(param `periodoDe/periodoAte`) às 4 leituras acima; no T11.4c comparar as 6
pontas, não 3. Cuidado ao validar: o comentário em estoque.ts:914-919 avisa que
demanda pré-corte já fabricou "disponível negativo" falso , confirmar no E2E que a
whitelist (que remove cancelado/cauda longa) evita a recaída, e não só abrir a
janela às cegas.

### A2 (MÉDIA) , Task 8 resolve 1 de 3 leituras de demanda no MESMO arquivo
Subconjunto concreto de A1, isolado porque a Task 8 diz "trocar o filtro de data
em `comercial.ts`" mas só toca `queryDemandaEmAberta` (`comercial.ts:222`). No
mesmo arquivo ficam `queryDemandaPorProduto:525` e `queryEstoqueDisponivel:640`
com `corteAtualDate()`. Um leitor do plano assume o arquivo inteiro coberto.
**Correção:** a Task 8 deve enumerar as 3 funções `ABERTA` do arquivo e dizer
quais mudam e por quê (as 3 são "demanda a entregar").

### A3 (MÉDIA) , RF-A6 (hints KPI==card) sem task que toque o código
O self-review mapeia RF-A6 para T9/T11, mas a spec RF-A6 aponta
`blocos-pedidos.tsx:163` e `atendimento-item.ts:3` ("mesma métrica, mesmo
número"). Nenhuma task edita esses comentários/hints. Impacto baixo (é texto),
mas fica um RF sem passo. **Correção:** dobrar em T10 (docs) ou T9 uma linha
revisando os dois hints, ou rebaixar RF-A6 explicitamente no plano.

## Verificado e DESCARTADO (falsos positivos que cacei)

- **Gate `tipo=venda` x whitelist 87/226 (a Frente B dizia "romaneio"): NÃO é
  furo.** Suspeita: o gate `tipo!=='venda' => IGNORAR` mataria as etapas 87
  (Reserva de Estoque) e 226 (Nota emitida e não entregue, exceção da Mariane),
  que a Frente B rotulou `tipo=romaneio`. Verificado no cache: os PEDIDOS nessas
  etapas têm `raw_pedido_documento.data->>'tipo' = 'venda'` (87 -> 5, 226 -> 7).
  O "romaneio" da Frente B é o tipo da ETAPA (`raw_pedido_etapa`), não do pedido,
  e o gate lê o tipo do PEDIDO. `raw_pedido_documento` tem o campo `tipo` e
  `fato_pedido` tem a coluna `tipo` (schema.prisma), então Task 3b (`p.data->>'tipo'`)
  e 3c (`f.tipo`) compilam e batem. **Mas** recomendo um guard no T11:
  `select count(*) from fato_pedido where etapa_id in (87,226) and tipo='venda' and bucket_demanda<>'ABERTA'` deve dar 0 (senão o gate derrubou a exceção da Mariane).
- **Mock do Task 3 (ordem $queryRaw): correto.** Suspeita: `carregarParticipantesGrupo`
  poderia usar `$queryRaw` e consumir o primeiro `mockResolvedValueOnce` destinado
  às etapas. Verificado: `src/lib/fiscal/grupo/participantes-grupo.ts:13` usa
  `prisma.fatoParceiro.findMany`, não `$queryRaw`. A ordem etapas->pedidos do mock
  se mantém. Sólido.
- **Remoção da exceção por nome (Task 4): segura.** `classificaEtapaDemanda` só é
  consumida pelo builder (`fato-pedido-classificacao.ts:13,131,217`); nenhuma
  outra ponta reimplementa a exceção "Nota emitida". Remover 226 do nome e deixá-la
  na whitelist não tem consumidor oculto.
- **Task 9 (páginas): assunções batem.** `pedidos/page.tsx` e `visao-geral/page.tsx`
  têm `param(...)`, `empresaSel`, `resolverPeriodoDir`, `hoje` como o plano supõe.
  Confirmei o furo D9: `visao-geral/page.tsx:75` chama
  `queryIndicadoresDemandas(prisma, hoje, { ufs })` sem período nem empresa , a
  Task 9 corrige e é factível.
- **Ordem/atomicidade T1->T11: sã.** T1 constante -> T2 helper (consome T1) -> T3
  fiação (consome T2) -> T4 remove exceção -> T5 janela -> T6/7/8 leitores -> T9
  páginas -> T10 docs -> T11 rebuild+E2E. Sem uso-antes-de-criar. Rebuild correto
  (build `app` p/ worker; build `mcp`). `janelaClampada` fica órfão em
  entregas-parciais após T7 e o plano já manda remover o import.
- **Helpers de janela: corretos.** `janelaClampada`/`Janela{gte,lt,cortado}` e
  `resolverPeriodoDirBruto` existem com as assinaturas que o plano usa; o teste de
  `resolverJanelaDemanda('este_mes', 2026-07-20)` bate com `resolverPeriodoDirBruto`
  (2026-07-01 / 2026-07-31). PISO 2000 nunca marca `cortado`.

## Cobertura RF
RF-A1..A5, A7, A8, A9 têm task e código real (sem placeholder). RF-A6 é o único
frouxo (A3). O grande buraco não é RF ausente, é o ESCOPO de A5 estar recortado
demais (A1): "janela GLOBAL para a métrica" na spec, mas o plano só aplica a 4 de
6+ pontas.
