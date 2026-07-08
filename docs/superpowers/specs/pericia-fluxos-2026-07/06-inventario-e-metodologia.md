# 06 , Inventário da plataforma e metodologia

## 1. Inventário , onde a lógica vive hoje (a periciar ponto a ponto)
Cada item precisa adotar o helper único de classificação (operação + intragrupo +
venda-externa + bucket de etapa) e ser validado com E2E contra o cache real.

### Queries base
- `src/lib/reports/queries/comercial.ts`
- `src/lib/reports/queries/fiscal.ts` (+ `fiscal.test.ts`)

### Tools MCP , fiscal / faturamento (~30)
`mcp/tools/fiscal/faturamento-periodo.ts`, `faturamento-mensal-serie.ts`,
`faturamento-por-cfop.ts`, `faturamento-por-cliente.ts`, `faturamento-por-empresa.ts`,
`faturamento-por-marca.ts`, `faturamento-por-operacao.ts`, `faturamento-por-regime.ts`,
`faturamento-por-uf.ts`, `faturamento-por-vendedor.ts`, `faturamento-recebido.ts`,
`faturamento-nao-autorizado.ts`, `receita-consolidada.ts`, `ponte-faturamento.ts`,
`intercompany.ts`, `notas-emitidas.ts`, `notas-emitidas-por-cliente.ts`,
`notas-emitidas-por-produto.ts`, `produtos-faturados.ts`,
`vendas-produto-por-empresa.ts`, `contar-notas.ts`, `margem-aproximada.ts`,
`notas-sem-cfop.ts`.

### Tools MCP , comercial / pedido / etapa
`mcp/tools/comercial/pedidos-por-etapa.ts`, `pedido-travados-por-etapa.ts`,
`pedido-historico-etapas.ts`, `contar-pedidos.ts`, `pedidos-periodo.ts`,
`pedidos-listar-top-valor.ts`, `pedidos-por-vendedor.ts`, `pedidos-por-uf.ts`,
`pedidos-atrasados.ts`, `pedidos-sem-vendedor.ts`, `detalhar-pedido.ts`,
`tempo-medio-fechamento.ts`. E as tools NOVAS (04 §7).

### Relatórios da diretoria (front + lib + api)
`src/components/diretoria`, `src/lib/diretoria`,
`src/app/(protected)/diretoria/{pedidos,vendas,agenda}`,
`src/app/api/diretoria/*`, `src/app/(protected)/relatorios/*`.

### Agente Nex (prompt/identidade)
`identity-base.ts` e afins , vocabulário de "demanda em aberta", "faturamento de
venda", "estoque disponível", com os critérios corretos e a instrução de responder
em tabela + resumo + distribuição por etapa + follow-ups.

### Worker / ingestão (para os fatos novos)
`src/worker/**` (catálogo de modelos, builders) , adicionar sync de
`fato_pedido_item` e enriquecer `fato_serial`. Lembrar da armadilha do rebuild do
worker (rebuildar via `app`, ver CLAUDE.md §2.1).

## 2. Núcleo a construir primeiro (ordem sugerida)
1. **Helper de classificação** `classificaOperacao` / `isVendaExterna` /
   `classificaEtapaDemanda` (com testes sobre o dado real). É a base de tudo.
2. **`fato_pedido_item`** (worker) , destrava produto/estoque/serial.
3. **Tools de demanda** (`comercial_demanda_em_aberta`, `comercial_pedido_situacao`)
   e **estoque disponível**.
4. **Uniformização** das ~30 tools de faturamento + queries + relatórios diretoria.
5. **Renderização de tabela** no Nex (UI, sessão principal + ui-ux-pro-max).

## 3. Metodologia (workflow do projeto)
Quando o usuário autorizar sair do dossiê para a construção:
SPEC v1 → review adversarial → SPEC v2 → review mais profunda → SPEC v3 →
PLAN v1 → 2 reviews → PLAN v3 → execução em microtarefas (TDD) → verificação com
**E2E obrigatório contra o cache real** (cada número conferido com SELECT) →
code review + UI review. Nada em produção sem validação do usuário. A F6 e a branch
da diretoria seguem a regra durável de aprovação explícita antes de qualquer merge
para `main`.

## 4. Validações E2E de referência (para a fase de execução)
- Total de demanda aberta = SELECT aplicando o motor (03 §2) e conferência manual.
- Faturamento de venda real do dia/mês = soma só das notas VENDA_EXTERNA, batendo
  com o exemplo real (as "15 notas do dia" menos triangulação/transferência).
- Estoque disponível de um produto (ex.: T600X) = saldo (`fato_estoque_saldo`)
  menos soma dos itens em demanda aberta (após `fato_pedido_item`).

## 5. O que ainda depende do usuário / Mariane (antes da SPEC)
1. Métrica de demanda e "produto com mais demanda": R$, quantidade, ou ambos?
2. Demanda consolidada do grupo ou por empresa (com filtro)?
3. `Peças` entra no faturamento de venda? `Venda Futura` conta quando?
4. Confirmar buckets `(confirmar)` (Concluída/Confirmada/Confirmado; Armazenagem -
   NF CONFIRMA) , idealmente com a Mariane validando a tabela de 03 §4.
