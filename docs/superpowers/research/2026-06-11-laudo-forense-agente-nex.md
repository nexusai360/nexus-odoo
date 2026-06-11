# LAUDO FORENSE , Agente Nex: por que ele erra e o plano para virar especialista

> Perícia completa a pedido do usuário (2026-06-11). Tudo abaixo é medido no
> banco real (perícias, votos, telemetria), no código e em casos reais de erro
> (prints do usuário). Zero achismo. Objetivo declarado: agente que acerta
> qualquer pergunta sobre o ERP Odoo.

## 0. Resumo executivo

O Nex erra por **quatro causas estruturais que se multiplicam**, em ordem de impacto:

1. **O cérebro é um modelo mini** (`gpt-5.4-mini`) operando um trabalho de modelo
   de fronteira: loop agêntico com 50-65 tools oferecidas por pergunta e um system
   prompt de 387 linhas com ~40 regras numeradas. Mini erra exatamente no que o
   usuário vê: enquadrar listas, seguir regra fina, escolher entre tools parecidas.
2. **As tools entregam listas sem contrato**: sem ordenação determinística, sem
   declarar a ordenação, truncadas em 50. O modelo recebe 50 linhas em ordem
   arbitrária e inventa o enquadramento ("10 maiores" que não são os maiores).
3. **Faltam filtros básicos nas tools** (ex.: faturamento DA empresa X) , o
   agente não tem como acertar o que a tool não permite perguntar.
4. **O prompt virou remendo**: boa parte das ~40 regras existe para ensinar o
   modelo a contornar deficiências das tools (regra 13c ensina `topMaiores` que
   só existe em 2 tools; regra 11 combate confusão de envelope; etc.).

Bônus já corrigidos hoje (eram "dado mentiroso", não burrice): cache com 707
títulos fantasmas (R$ 172,7mi) por reconcile de 24h , consertado para 3h, em
prod (#95); cold start de 60-310s do router , consertado (#94); MCP local sem
senha de DB (erro meu de operação) , consertado.

## 1. Evidências (medidas, não opinião)

### 1.1 A experiência do usuário real é ruim , e os dados confirmam
- **Votos do usuário na bubble: 8 de 9 negativos** (3 ERRADO, 3 PARCIAL,
  2 ALUCINOU, 1 CORRETO).
- Perícia (juiz Claude contra o cache): maio em massa = **69,6% correto**
  (1.266/552 em 1.818 turnos). Semana de 01/06 = 92,9% (n=126), semana atual =
  83,3% (n=12). Melhorou com as rondas, mas o teto está limitado pelas causas
  estruturais , e os casos novos do usuário (prints de hoje) continuam errando.

### 1.2 Caso forense #1 , "10 maiores vencidos" (print 2026-06-11 04:54)
- Pergunta: "Quais são os títulos vencidos a pagar?" → "Mostrando os 10 maiores
  da lista retornada" com títulos de **R$ 5.701 / R$ 3.999 / R$ 2.500**, quando
  existe vencido da Johnson de **R$ 170,8mi**.
- Causa no código: `queryTitulosVencidos` **não tem `orderBy`** (ordem de PK,
  arbitrária) e o handler **não tem `topMaiores`** (só contas_a_pagar/receber e
  saldo-produto têm). O envelope entrega ~50 linhas arbitrárias; o modelo mini
  rotulou as 10 primeiras de "maiores". A regra 13c do prompt ensina a usar
  `topMaiores`... que não existe nessa tool.
- Agravante: turno levou 64,5s no dev local (processo `next dev` antigo, sem o
  fix #94 , resolve com `npm run dev:fresh`).

### 1.3 Casos forenses da perícia (razões reais dos ERRADO/PARCIAL de junho)
- "Pediu o faturamento **DA KS Comercio**, resposta trouxe o **ranking genérico**"
  → a tool não aceita o filtro necessário (gap de parâmetro).
- "Agente chamou com `limite=5` e apresentou como se fosse o total" → semântica
  de paginação mal enquadrada (modelo fraco + envelope que permite).
- "Pediu os itens **NEGATIVOS**, listou os **maiores positivos**" → seleção de
  lista errada.
- "Quebra por empresa e operação É computável do cache, agente não entregou" →
  composição multi-dimensão que exige tool/parâmetro que não existe.

### 1.4 O cérebro e a carga
- Modelo ativo: **`gpt-5.4-mini`** (llm_configs). Custo real medido: **p50
  US$ 0,0044/turno** (~2,5 centavos de real). O alvo do projeto era 1-2
  centavos de dólar , estamos 3-5x ABAIXO do teto, ou seja: **há orçamento de
  sobra para um modelo de fronteira** (5-10x mini ainda fica em 2-4 cents).
- Catálogo oferecido por pergunta: média **47-65 tools** (router ativo,
  threshold 0.3, topK 3 + núcleo + domínio). Fallback baixo (2-15%): o router
  não é o gargalo principal.
- System prompt: **387 linhas, ~40 regras numeradas + fluxos + exceções**.
  Modelos mini degradam fortemente em rule-following dessa densidade.

### 1.5 Contratos de lista (varredura no código)
- Só **3 tools** têm `topMaiores` (contas_a_receber, contas_a_pagar,
  estoque_saldo_produto).
- Queries de lista **sem `orderBy`**: `financeiro.ts` (títulos), `cadastros.ts`,
  `financeiro-resultado.ts`, helpers de busca , ordem arbitrária do Postgres.
- O envelope não tem campo que **declare a ordenação** (`ordenadoPor`), então o
  LLM não tem como saber o que a lista representa , e inventa.

## 2. Diagnóstico consolidado

| # | Causa | Efeito visível | Correção |
|---|---|---|---|
| 1 | Modelo mini para trabalho de fronteira | Enquadramento errado de listas, regras ignoradas, tool errada | Trocar o modelo do agente (A/B no golden 124) |
| 2 | Listas sem contrato (ordem/truncamento não declarados) | "10 maiores" falsos, "limite=5 como total" | Contrato de lista universal nas tools |
| 3 | Filtros faltantes (empresa/participante/período inconsistentes) | Resposta genérica quando pediram específica | Matriz de filtros + completar gaps |
| 4 | Prompt-remendo de 387 linhas | Regras finas ignoradas pelo mini | Reescrever enxuto após 2-3 (remove regras-curativo) |
| 5 | (corrigido hoje) Dado mentiroso no cache (fantasmas, 24h de lag) | Números errados mesmo com tool certa | Reconcile 3h em prod (#95) ✓ |
| 6 | (corrigido) Cold start 60-310s | Latência absurda no 1º turno | Batch embeddings (#94) ✓ |

A leitura honesta: **não é "o agente é burro" , é um sistema que pede um
especialista e contratou um estagiário com um manual de 387 linhas e planilhas
desordenadas.** Cada camada (modelo, contrato de dados, filtros, prompt) tira
um pouco; juntas explicam a frustração.

## 3. Plano , Operação "Nex Especialista" (ordem de execução)

### Fase A , Cérebro (maior alavanca, menor esforço)
- A/B no golden dataset (124 perguntas) entre: `gpt-5.4-mini` (baseline),
  `gpt-5.4` (full) e um frontier da Anthropic via OpenRouter (credencial já
  existe). Medir: % número-ouro, seleção de tool, alucinação, custo/turno,
  latência.
- Promover o vencedor no painel (llm_configs). Orçamento: até ~4 cents/turno
  cabe no negócio (hoje 0,44 cent).

### Fase B , Contrato de lista universal (mata a família inteira do caso #1)
- Toda query de lista: `orderBy` determinístico explícito.
- Envelope ganha `ordenadoPor` (ex.: "valor desc", "vencimento asc") + os
  formatadores declaram ("10 primeiros por vencimento").
- `topMaiores` (ou equivalente `topPor*`) em TODA tool de lista monetária ,
  começando por `financeiro_titulos_vencidos` (caso do print).
- Gate de contrato no jest: lista sem `ordenadoPor` = teste vermelho.

### Fase C , Matriz de filtros
- Levantar das perícias ERRADO os filtros pedidos e não suportados (empresa,
  participante, período, negativo/positivo) e completar as tools com gap real.
- Caso KS (faturamento por cliente × empresa) é o primeiro.

### Fase D , Prompt 2.0
- Reescrever: identidade + contrato de envelope ÚNICO (o que é `_RESPOSTA`,
  `_DESTAQUE`, `topMaiores`, `ordenadoPor`, paginação) + 10-12 regras de ferro.
- Remover as regras-curativo que B/C tornam obsoletas. Validar no golden.

### Fase E , Eval contínuo (não regredir nunca mais)
- Os casos reais errados (10 maiores, KS, negativos, limite-como-total) entram
  no golden como casos novos.
- Golden vira gate de PR para mudanças no agente (harness já existe).

## 4. O que já está em produção desta perícia
- #94: cold start 73s+ → ~15s (batch embeddings).
- #95: a pagar real R$ 222,1mi com quebra confirmado/provisório + reconcile 3h
  (fantasmas se autopurgam em horas).
