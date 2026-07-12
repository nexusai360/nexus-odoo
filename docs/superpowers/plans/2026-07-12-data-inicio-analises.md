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

## Revisão completa das regras de consulta (feita em 2026-07-12)

Auditoria de TODA leitura de histórico (7 frentes em paralelo): **148 pontos** não respeitavam
a data. Corrigidos por domínio, com teste, e provados contra o cache real.

### A raiz era arquitetural
`corteAtual()` é síncrono e lê um **cache em memória do processo**, que só é preenchido quando
alguém chama `getCorteDados(prisma)`. **Só o app chamava.** O MCP é outro processo: nunca lia o
`AppSetting`, então **todas as tools do Nex grampeavam pela data padrão** e mudar a data na tela
não mudava nada nas respostas do agente. Agora o pipeline de tools (`mcp/server.ts` e o
dispatcher externo) hidrata o corte, e `aquecerCorte()` (`src/lib/corte-app.ts`) faz o mesmo nos
pontos de entrada do app.

Peça nova, canônica: **`janelaClampada(de?, ate?)`** em `corte-dados.ts` , piso no corte inclusive
quando não vem período, borda de fim exclusiva, e `cortado` para a resposta poder ser honesta.
Vale para QUALQUER campo de data (emissão, vencimento, movimento, lançamento).

### O corte da ingestão não era fixo (bug do PR #168)
O #168 trocou `corteAtual()` por `CORTE_DADOS_ISO`, mas essa constante era o **próprio
`corteAtual()` avaliado no import**, ou seja, o padrão da tela (16/03). A ingestão continuou
amarrada à data de análise e o worker **nunca repunha janeiro a março**. Agora
`CORTE_INGESTAO_ISO = "2026-01-01"` é literal e `worker/sync/corte.ts` não importa nada de
`corte-dados.ts`. Teste garante que o domínio do Odoo nunca é igual à data da tela.

### O que mais saiu daqui
- **KPIs zeravam a cada sync.** `fato_pedido_classificacao` fazia `is_venda_externa = false` em
  TODAS as notas e só depois remarcava, **fora de transação**: por alguns segundos, a cada ciclo,
  o faturamento e os gráficos liam zero. `fato_pedido_item` usava `TRUNCATE` solto. Agora a troca
  é atômica (a leitura vê o estado antigo até o commit) e existe um **marcador de fim de ciclo**:
  a tela só se atualiza quando o dado está inteiro, com uma troca suave (sem tela vazia).
- **"A receber" era R$ 49,2 mi; é R$ 17,8 mi.** O Odoo da Tauga gera o financeiro pelo PEDIDO ou
  pela NOTA, e o cache não guardava a origem: R$ 31,3 mi de **pedidos sem nenhuma nota emitida**
  (carteira, receita contratada) entravam como recebível, mais R$ 146 mil de dupla contagem.
  `fato_financeiro_titulo` agora materializa `pedido_id`, `nota_fiscal_id` e `pedido_faturado`;
  a tela mostra "A receber" (faturado) e "Carteira a faturar" separados.
- **Estoque a custo em toda parte**: catálogo, linhas granulares e giro/cobertura ainda somavam
  `vr_saldo`. R$ 45,7 mi -> R$ 37,2 mi, igual ao KPI.
- **Calendário da Configuração** no padrão do sistema: mês por extenso, selects do design system
  (não o `<select>` nativo do react-day-picker), trava em 01/01/2026 (limite do cache).

### Prova (E2E contra `nexus_odoo_l1`)
`scripts/e2e-data-inicio-analises.ts`: move a data e confere que os 7 indicadores de histórico
reagem, que o saldo de estoque (foto) NÃO muda, e que a contagem das tabelas é idêntica no fim
(nada é apagado).

### O histórico voltou (e a regra de ouro ficou provada de verdade)

O purge não voltava sozinho: o incremental filtra por `write_date > marca d'água`, e registro
antigo não "mudou". Zerando `sync_state.last_incremental_at` dos 15 modelos transacionais, o
backfill repuxou desde o corte técnico de ingestão:

**fato_nota_fiscal: 9.586 notas (a partir de 16/03) -> 13.198 notas (a partir de 01/01).**

Com o histórico de volta, o E2E prova a regra de ouro no sentido que importa , mover a data
para TRÁS traz o dado de volta **na hora**, sem re-sync e sem perda:

```
                                 16/03/2026       01/05/2026       01/01/2026
Faturamento                   R$ 61.698.111    R$ 41.483.978    R$ 91.607.087
Contas a receber              R$ 17.786.659    R$ 13.611.980    R$ 17.815.637
Contas a pagar                R$ 27.517.240     R$ 9.699.641    R$ 43.162.247
Demandas abertas                        331              234              393
Saldo de estoque (FOTO)       R$ 37.211.689    R$ 37.211.689    R$ 37.211.689
```

O saldo de estoque (foto do agora) não se mexe, e a contagem das tabelas do cache é idêntica no
fim: **nada é apagado**.

## O que falta

1. **Replicar no ERP Nexus** (projeto local, `Projetos Internos/ERP Nexus`): ele já tem o
   faturamento por operação; falta a data configurável, os centavos e as correções de KPI.
   Em andamento na branch local `feat/data-inicio-analises`.
2. Ver `docs/RADAR.md` (seção R-corte) para os pontos que ficaram como decisão de produto (dias
   parado, DRE com lançamento sem data, comparativo de estoque pré-corte).
