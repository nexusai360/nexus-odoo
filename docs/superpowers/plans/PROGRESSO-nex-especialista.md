# PROGRESSO , Milestone "Nex Especialista"

> Ponto de retomada entre sessões. Modo autônomo TOTAL autorizado pelo usuário
> (2026-06-11: "resolve isso tudo aí, confio em vc"; redesenhar o que precisar;
> orçamento LLM sem teto rígido , qualidade decide, custo desempata).
> Ler junto: SPEC v3 `docs/superpowers/specs/2026-06-11-nex-especialista-design.md`
> e LAUDO `docs/superpowers/research/2026-06-11-laudo-forense-agente-nex.md`.
> Branch: `feat/nex-reconstrucao` (worktree).

## Grafo de fases
A0 (instrumentação) → A1 (A/B preliminar + troca) → B (contrato de lista) →
C (filtros/composição) → A2 (A/B confirmatório) → D (prompt 2.0) → E (blindagem).
Cada fase: plano próprio (bite-sized) + 2 reviews quando material → execução TDD
→ E2E real → commit atômico → atualizar ESTE arquivo.

## Estado
- [x] LAUDO forense completo (commit 9fd47f9) , causas: modelo mini, listas sem
  contrato (84 tools, só 3 declaram ordenação), filtros faltantes, prompt-remendo.
- [x] SPEC v1 → 2 reviews adversariais Opus (18 achados, 3 BLOCKERs) → **SPEC v3**.
  Achados-chave aplicados: golden atual NÃO roda LLM (chama tool.handler direto);
  só 4/124 kpiOuro; gate de contrato deve ser incremental; AutoValidator integrado;
  composição multi-eixo + follow-up contextual no escopo; A/B roda 2x (A1/A2).
- [x] **Fase A0 , Instrumentação** (commit 708f4cb):
  - [x] A0.3 pre-flight: OpenAI ok; OpenRouter SALDO ZERO (testar Claude exige
        o usuário creditar; slug certo é anthropic/claude-sonnet-4.6 / opus-4.7 /
        opus-4.8 , o catalog.ts interno tem sonnet-4.7 que NÃO existe lá).
  - [x] A0.1 harness scripts/ab-cerebro.ts (runAgent+llmOverride, canal backtest,
        kpiOuro AO VIVO via fonteOuroSql, juiz alucinação via resultPreview novo
        no evento tool_result, custo end-to-end, toolsAceitas). Juiz calibrado.
  - [~] A0.2 kpiOuro: 4 casos com SQL-vivo; expandir para ≥60 segue pendente.
- [x] **Fase A1 , VEREDITO: MANTER gpt-5.4-mini.** A/B 60 casos:
  mini 83,3% tool / 4-4 kpi / 5 haluc / $0,0055 / 13,3s;
  gpt-5.4 81,7% / 4-4 / 6 haluc / $0,0384 (7x) / 20,0s.
  **Os 10 erros de seleção são IDÊNTICOS nos 2 modelos (interseção 100%) =
  estruturais, modelo não resolve.** Decomposição: ~6 são golden ruim
  (perguntas-placeholder "Consulta: servico buscar" sem termo , o router ATÉ
  ofereceu a tool; consertar o GOLDEN); ~4 são seleção entre tools irmãs
  (contabil_plano_de_contas × contabil_estrutura_conta → toolsAceitas/triggers).
  Anthropic não testado (OpenRouter 402, saldo 0; max_tokens 65536 do adapter
  agrava). Detalhes: docs/superpowers/research/ab-cerebro/*.json.
- [~] **Fase B , contrato de lista (EM CURSO):**
  - [x] Task-zero auditoria deterministica (78 tools com lista; doc
        2026-06-11-auditoria-contrato-lista.md). Gate incremental criado
        (mcp/__tests__/contrato-lista.test.ts + allowlist contrato-lista.data.ts).
  - [x] B.1 caso forense #1: financeiro_titulos_vencidos (orderBy valor desc +
        ordenadoPor + topMaiores + formatador declara). E2E real ✓ (d1f45b4).
  - [x] FINANCEIRO 12/12 migrado (af566ea). Allowlist 77→66.
  - [x] FISCAL 26 (subagente; +topMaiores em notas_emitidas/recebidas com 4a
        query top-10 por vrNf sobre o recorte) + ESTOQUE/COMERCIAL/CADASTROS 29
        (subagente; fix real: pedidos_por_etapa era ordem de Map) (4532779).
  - [x] CONTABIL 7 + bi_consulta_avancada + write tools excluidas do gate.
        **ALLOWLIST VAZIA , 78/78 (1b9e785). Criterio de saida do nucleo da
        Fase B atingido.**
  - [x] B.6 AutoValidator V8 "enquadramento de lista" (2368688): alegou
        'maiores/top' sem topMaiores/ordenadoPor de valor desc => retry.
  - [x] B.7 embeddingText audit: retrieval 8/8 com frases reais ("maiores
        vencidos", "quem mais me deve"...), sem mudanca necessaria (provado).
- [~] **Fase C (EM CURSO) , mineracao das pericias revelou a MAIOR classe:**
  - [x] **C.0 ACHADO GIGANTE: 20 tabelas fato_*/dim_* SEM GRANT para nexus_mcp**
        (e 22 p/ nexus_mcp_bi). Dominios INTEIROS quebrados desde que nasceram
        (contabil, DFe, REINF, MDFe, cobranca, producao, auditoria, CRM,
        comissoes, pedido_historico, lancamento_item, min/max, cotacao, PIX,
        cheque): tool dava "permission denied" -> "Erro interno" -> agente dizia
        "nao consegui obter" (a falsa "burrice"). Fix de raiz: migration
        20260611150000 (GRANT em massa + ALTER DEFAULT PRIVILEGES , tabela
        futura nasce legivel; classe de bug morta). E2E: DFe pendentes (995) e
        plano SPED (2.216) respondem certo pelo agente real.
  - [x] C.1a CASO KS resolvido (8c1b7cc): guardrail de grupo na tool
        notas_emitidas_por_cliente + excecao na regra 3 dos FLUXOS. E2E: agente
        chama fiscal_faturamento_periodo({empresaRef}) e responde o faturamento
        DELA.
  - [x] C.1b CASO NCM resolvido (8c1b7cc): cadastro_detalhar_produto aceita
        termo (codigo OU palavras AND), ambiguidade ate 5 candidatos, descricao
        para retrieval. E2E: lista candidatos reais.
  - [x] C.1c Smartfit: _RESPOSTA da busca embute top-5 com documento (tool ok;
        o mini ainda corta a lista ao reescrever , reforco para Fase A2/D).
        "Quantas E quais" ja respondia certo (15 filiais listadas).
  - [x] C.1d apuracao zerada: flag fonteZerada + ressalva honesta (ed52629).
  - [x] C.1e top-10 pedidos: ja responde top geral (consertado pela onda B).
  - [x] C.1f composicao multi-eixo: agente COMPOE 2 tools (por_empresa +
        por_operacao) numa resposta , funciona sem build novo.
  - [x] Fase E parcial: 6 casos reais no golden (130 total) + fonteOuroSql/
        toolsAceitas no schema (2f3d2d0). Validacao: 6/6 tool + 6/6 kpi-vivo.
- [x] Benchmark pos-fixes (60 casos, mini): headline 83,3% IGUAL ao baseline,
      MAS a composicao mudou por completo: os 10 erros restantes sao 8 casos
      cov-* de golden-placeholder ("Consulta: preco tabela" sem termo , pergunta
      impossivel de atender; consertar o GOLDEN) + 2 escolhas entre tools irmas
      (contabil_estrutura x plano; cidades_listar x parceiros_por_cidade ,
      toolsAceitas). TODOS os casos reais de usuario passam. kpi 5/6 (1 flake de
      formatacao do mini no 10-maiores , reforca A2). custo p50 caiu 0,55->0,48c.
- [x] **Onda 3 EM PRODUCAO**: fix do "papagaio engessado" (regra 5b de
      contestacao + skip V3/V5 via CONTESTACAO_RE + ressalva de cobertura em
      filiais_listar). E2E final PENDENTE de quota OpenAI.
- [!] **BLOQUEIO OPERACIONAL: conta OpenAI insufficient_quota (saldo estourou
      2026-06-11 ~12h). O Nex esta SEM LLM em prod e dev ate o usuario
      recarregar.** Ao recarregar: rodar E2E do fix de contestacao (caso
      filiais do log) + smoke bubble.
- [x] **LIMPA 2026+ (prioridade maxima do usuario): SPEC v3 PRONTA**
      (docs/superpowers/specs/2026-06-11-limpa-2026-design.md), 2 reviews
      adversariais aplicadas (4 BLOCKERs: titulo vivo R$118mi por SITUACAO
      nunca data; filtro AND no incremental; snapshot dominio vazio + CR-02;
      DELETE fisico + VACUUM FULL). Inventario tabela a tabela MEDIDO no doc.
      **PLAN v3 PRONTO** (plans/2026-06-11-limpa-2026-plan.md): 2 reviews
      adversariais aplicadas (8 BLOCKERs: chave raw e situacao_divida_simples;
      'efetivo'=VIVO nunca deleta; FK filho e many2one array ->0; lote_serie
      2,9GB e BLOAT (vacuum sem delete = maior ganho); backfill since=null;
      assinaturas syncSnapshot/reconcileModel; stop worker vence
      unless-stopped; DELETE em lotes). **EXECUCAO INICIADA: T1-scaffolding (bc4036b) + T1a parcial 8 modelos
      verificados (3219d7c) + T1c titulo (5b3d394) + T1b 5 filhos SPED com FK
      verificada (7a4af24; rastreabilidade->ITEM via item_id; modelo "volume"
      nao esta no catalogo , conferir; pedido.documento data_orcamento validar
      no T3). FALTA: resto T1a (inventario/carta/pagamento_divida/estoque_
      rastreabilidade), T1d lista negativa + teste de conjunto, T2..T11.
      T1d FEITO (gate 6 testes, 9d45240). T2a/b/c FEITOS (eead7e1: corte.ts +
      clausula nos 3 ciclos; titulo sem clausula de proposito).
      **ALERTA DE ORDEM (review #2.8, agora real no codigo): NAO rebuildar o
      worker (dev) nem ship antes do pg_dump do T9 pre-flight , estoque.extrato
      e snapshot COM corte: o 1o full-refresh pos-deploy purga as linhas
      pre-2026 SEM rede de seguranca. Ordem: pg_dump -> deploy -> ciclos.**
      T3 FEITO: 8/8 campos validados AO VIVO no Odoo (valida-campos-odoo.ts;
      pedido.documento.data_orcamento confirmado; sped.documento 39.884
      pre-2026 de 49.847). T4a FEITO (d7d5977: predicados puros + 6 testes).
      T4b COMPLETO (ed16e1a): causa raiz das 3 falhas era FK m2o vazia =
      `false` , em jsonb escalar age como array de 1 elemento no ->0, 'false'
      passava no IS NOT NULL e quebrava o cast ::int; fix = guard
      jsonb_typeof='array' (filho e neto). volume ESTAVA no catalogo (anotacao
      anterior errada), ganhou cortePai. Dry-run 15/15 tabelas: 290.010 linhas
      (docs/superpowers/research/limpa-2026-dryrun.md , AGUARDA APROVACAO).
      T4c/T4d FEITOS (9002933): --apply em lotes ctid (ordem neto->filho->raiz
      via alvos.ts puro testado; gate duplo --apply --aprovado) + --vacuum
      FULL/ANALYZE com medicao (inclui lote_serie 2,9GB); VACUUM via prisma
      provado em smoke. T2d REVISTO (fba55e4): estoque.extrato PERMANECE
      snapshot+corte , Odoo vivo provou 207/17.508 com write_date (create_date
      100% false), incremental perderia 99% das linhas; decisao travada no
      gate corte-2026.test.ts. T5 TOOLING FEITO (f54843c):
      invariante-financeiro.ts --capturar/--comparar, celula a celula
      (tipo x situacao; vivas R$0,00; quitado/baixado informativo), smoke E2E
      real OK. T7a FEITO (bb599cf): preCorte no resolverPeriodoFiscal +
      TEXTO_HONESTO_PRE_CORTE (spec §5) no gancho central calcularExtras +
      16 tools fiscais; suite inteira 2.924 verdes.
      T8 FEITO (d7847e9/37a068c/ce45495): da lista nominal da spec, so 3
      artefatos tinham 2025 operante (conferencia-fiscal, gen-baseline,
      f5-regime , os demais ja estavam limpos, goldens 0 hits); recalibrados
      para 2026+ e validados E2E no dado real (conferencia TODOS os gates
      verdes). ATENCAO: baseline acumulado pos-corte = piso 59.576.817,08
      (valor 2026 ate jun); re-rodar gen-baseline POS-purge. T11 FEITO
      (b9d7735): runbook docs/runbooks/limpa-2026.md (ordem, rollback, gate de
      modelo novo); painel de ingestao verificado , nao alarma por volume.
      **T9 EM CURSO: pre-flight disco OK (395G livres no volume PG, banco
      5,5GB) + PG_DUMP FEITO E VERIFICADO (16 tabelas, 70MB,
      ~/Backups/nexus-odoo/limpa-2026-pre-purge-20260611T1405.dump) , destrava
      deploy do filtro em dev E o merge/ship do codigo da limpa.** DEPLOY DEV
      VERIFICADO: imagem nexus-odoo:local 17:07Z, worker recriado DA PASTA
      PRINCIPAL (recriar da worktree perde o env , OdooError variaveis
      ausentes; armadilha anotada), ciclos incremental E snapshot concluidos
      sem erro; dry-run pos-ciclo 289.890 (= 290.010 - 120 do estoque.extrato
      que o snapshot com corte ja purgou; NADA reimportou , filtro comprovado
      no ciclo real). **T9 PARADO NO GATE HUMANO: aguarda APROVACAO do dry-run
      (limpa-2026-dryrun.md, 289.890 linhas) para: stop worker -> capturar
      invariante -> --apply --aprovado -> rebuild titulo -> comparar
      invariante (R$0,00) -> --vacuum -> T6 rebuilds/ancoras -> re-rodar
      gen-baseline -> worker on + 2 ciclos.**
      **MERGE/SHIP DO CODIGO DA LIMPA: pg_dump do pre-flight FEITO , gate
      destravado; merge segue exigindo confirmacao humana padrao.** (T7b/T8-
      golden gated por recarga OpenAI; --apply gated por aprovacao humana).**
- [ ] **PROXIMA SESSAO:** (adicionar: reescrever os ~8 cov-* placeholder do
      golden como perguntas naturais com identificadores; toolsAceitas nas
      tools irmas) Fase D (prompt 2.0 enxuto + remover regras-curativo),
      follow-up contextual no golden, golden gate pre-push, A2 (A/B Claude ,
      exige usuario creditar OpenRouter; slugs: anthropic/claude-sonnet-4.6,
      opus-4.7, opus-4.8).
- [ ] Fase C , filtros + composição multi-eixo + follow-up (mineração das razoes).
- [ ] Fase A2 , A/B confirmatório.
- [ ] Fase D , prompt 2.0 + AutoValidator atualizado.
- [ ] Fase E , golden gate pre-push + métricas no STATUS.

## Fatos úteis (cravados na perícia de hoje)
- Modelo ativo: gpt-5.4-mini; custo p50 US$0,0044/turno; janela 12 msgs;
  router ativo (threshold 0.3, topK 3, oferta média 47-65 tools).
- Perícia: maio 69,6% correto; votos usuário 8/9 negativos.
- Caso forense #1: financeiro_titulos_vencidos sem orderBy nem topMaiores →
  "10 maiores" falsos (real: Johnson R$170,8mi). queryTitulosVencidos
  (src/lib/reports/queries/financeiro.ts) e handler são os alvos da Fase B.1.
- Truncagem real vive no guardToolResult (run-agent.ts ~141-189; 30/10 itens).
- Já corrigido em prod hoje: #94 cold start (batch embeddings), #95 financeiro
  provisorio + reconcile 3h (fantasmas R$172,7mi se autopurgam).
- Dev local: rodar `npm run dev:fresh` na pasta principal para o next dev pegar
  o código novo (o turno de 64,5s do print era processo velho).
