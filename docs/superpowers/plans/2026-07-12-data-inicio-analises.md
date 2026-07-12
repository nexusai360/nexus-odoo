# Data de início das análises (parâmetro global) + centavos + KPIs

> Sessão de 2026-07-11/12. Estado: **em produção** (PRs #166, #167, #168).
> Continuação: ver "O que falta" no fim.

## A REGRA DE OURO (decisão do dono, 2026-07-12)

A data configurada em **Configuração > Intervalos de sincronização > "Analisar dados a
partir de"** é um **FILTRO DE ANÁLISE**, não uma faxina.

- **Nada é apagado.** O cache guarda todo o histórico ingerido.
- Mover a data **para trás** faz o histórico **reaparecer na hora**, sem re-sync, sem perda.
- Mover a data **para frente** apenas estreita a janela analisada.
- A data **parametriza a plataforma inteira**: dashboard da diretoria, Relatórios,
  Relatórios 2.0, agente Nex (MCP), KPIs, e o calendário (não deixa escolher antes dela).
- A **ingestão tem corte técnico próprio e fixo** (`src/worker/sync/corte.ts`,
  `2026-01-01`), que define o quanto de histórico o cache guarda. Ele NÃO se confunde com a
  data da tela. Amarrar a ingestão à data da tela faria o worker parar de puxar o que
  ficasse fora dela e a reconciliação marcaria esses registros como removidos (foi o erro
  corrigido no PR #168).

Fonte única: **`src/lib/corte-dados.ts`**.
- `getCorteDados(prisma)` , lê o `AppSetting` `sync.corte_dados` (cache de 60s).
- `corteAtual()` / `corteAtualDate()` , valor vigente, síncrono (caminho quente dos wheres).
- `clampIsoAoCorte` / `clampDateAoCorte` , grampeiam qualquer período ao início.
- `invalidarCacheCorte()` , chamado ao salvar a configuração.
- Padrão quando ninguém configurou: **16/03/2026**.

## O que já está em produção

### PR #166 , faturamento pela OPERAÇÃO fiscal
- Cache ganhou `operacao_id`/`operacao_nome` (nota e item).
- Regra de venda: operação contém "venda", NÃO contém "interna" nem "imobilizado",
  finalidade <> 4 (devolução), modelo 55/65, destinatário fora do grupo.
- Materializada em `fato_nota_fiscal.is_venda_externa`, **na mesma transação** que reconstrói
  a nota (antes ficava NULL entre builders e o faturamento aparecia como R$ 0,00).
- Agente Nex, relatórios e dashboard passaram a ler a MESMA verdade (antes o agente
  respondia outro número: jan/2026 dava 21,05 mi no agente e 16,57 mi no dashboard).
- Filtro por EMPRESA na Visão geral.
- **Julho/2026 = R$ 7.242.504,80 em 136 notas** (bate com o Odoo). Validado em produção.

### PR #167 , data configurável + centavos + KPIs
- Campo de data na Configuração, com calendário que navega por **mês e ano**.
- **Centavos** em toda a plataforma (o tooltip mostrava `R$ 7.242.505`).
- Pedidos/demandas nasciam sem classificação e a tela mostrava 0 a cada ciclo , agora a
  classificação é gravada junto com o pedido (Ticket médio voltou: R$ 54 mil / 134 pedidos).
- **Valor em estoque a CUSTO** (quantidade x `preco_custo`): R$ 45,7 mi -> R$ 37,2 mi.
  Produto com saldo e sem custo vira gap visível (`produtosSemCusto`).
- **Contas a receber/pagar**: respeitam o início da análise e **excluem títulos intragrupo**
  (eram R$ 15,1 mi em 192 títulos no "a receber"). A pagar: R$ 106,0 mi -> R$ 45,4 mi.

### PR #168 , correção de rumo (este)
- A data da tela voltou a ser SÓ filtro de leitura; a ingestão tem corte fixo.
- Rótulo "Analisar dados a partir de" + texto dizendo que nada é apagado.
- Purge saiu do fluxo (continua como ferramenta avulsa).

## O que falta (próxima sessão)

1. **Revisão completa das regras de consulta** (pedido explícito do dono): varrer TODA
   consulta que lê histórico e garantir que ela respeita o início da análise , dashboard,
   Relatórios, Relatórios 2.0, tools do MCP, KPIs, séries temporais, acumulados. Hoje o
   clamp está em `metrics/_shared/periodo` (piso), `diretoria/periodo` (presets),
   `mcp/tools/fiscal/_periodo-padrao` e nas contas. **Falta auditar o resto**: estoque
   (saldo é foto atual, provavelmente não filtra por data , decidir), entregas/demandas,
   compras/DF-e, séries mensais, relatórios 2.0.
2. **Cache local do Nexus Odoo foi purgado por engano** (`nexus_odoo_l1` só tem >= 16/03).
   O worker repõe sozinho (a ingestão volta a puxar desde 2026-01-01); conferir que o
   histórico voltou.
3. **Replicar tudo no ERP Nexus** (projeto local, `Projetos Internos/ERP Nexus`): ele já tem
   o faturamento por operação (mergeado na main local), mas **não tem** a data configurável,
   os centavos nem as correções de KPI.
4. **"A receber" ainda parece alto** (~R$ 53 mi de cliente externo, contra ~R$ 7 mi/mês de
   faturamento). Investigar a composição (parcelamentos? títulos sem baixa no Odoo?).
5. Estoque: as demais telas de estoque (catálogo, seriais) ainda usam `vr_saldo` em alguns
   pontos , alinhar tudo ao custo.
