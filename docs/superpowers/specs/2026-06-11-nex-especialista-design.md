# SPEC v3 , Milestone "Nex Especialista"

> Objetivo do usuário (verbatim, 2026-06-11): "ter esse Agente mega inteligente e
> acertando todas e qualquer respostas que forem feitas". Autorização: total
> (redesenhar/refazer o que for preciso). Orçamento de LLM: sem teto rígido;
> decidir pela qualidade no golden, custo como desempate (hoje 0,44 cent/turno).
> Base factual: `docs/superpowers/research/2026-06-11-laudo-forense-agente-nex.md`.
>
> **v3 = v1 + 2 reviews adversariais aplicadas (18 achados, 3 BLOCKERs).**
> Achados decisivos: (1) o harness golden chama `tool.handler` DIRETO , não roda
> LLM, não mede seleção de tool nem alucinação do modelo; a Fase A exigia um
> instrumento que não existia → nasce a Fase A0. (2) Só 4/124 casos do golden têm
> `kpiOuro` → M1 era estatisticamente vazio. (3) 84 tools retornam lista; só 3
> declaram ordenação; o gate de contrato precisa ser incremental (allowlist).
> (4) Ordem corrigida: A/B de modelo roda 2x (preliminar + confirmatório pós-B/C).
> (5) AutoValidator V1-V7 já existe e é integrado ao plano (não ignorado).
> (6) Composição multi-eixo e follow-up contextual entram como escopo explícito.

## Métricas de sucesso (mensuráveis com a instrumentação da Fase A0)

- **M1** , Golden agêntico (via `runAgent`, não `tool.handler`) ≥ **98% correto**
  com `kpiOuro` populado em ≥ 60 casos SELECT-verificados (hoje: 4).
- **M2** , Perícia (juiz Claude host-side, `judge-scheduler` local) ≥ **95%
  CORRETO** na média móvel semanal do canal in_app. (Honesto: o juiz roda
  host-side em dev; produção é amostrada quando o host está ativo.)
- **M3** , Votos do usuário na bubble: maioria CORRETO (hoje 8/9 negativos).
- **M4** , Latência p50 ≤ 15s e custo p50 medidos **end-to-end por turno**
  (incluindo enhance, guardrail e retries do auto-validator , não só o loop).
- **M5** , Zero regressão: golden agêntico como gate pre-push local (contra
  cache vivo; caso `estado:"preparando"` conta como FALHA de cobertura, não skip).

## Fases (grafo de dependência declarado)

```
A0 (instrumentação) → A1 (A/B preliminar + troca provisória)
A0 → B (contrato de lista) → C (filtros/composição) → A2 (A/B confirmatório)
A2 → D (prompt 2.0) → E (blindagem contínua)
```

### Fase A0 , Instrumentação (pré-requisito de tudo)
1. **Harness agêntico A/B**: runner novo que roda os casos do golden via
   `runAgent` com `llmOverride` (campo já existe em `RunAgentInput`,
   `run-agent.ts:360`) por candidato, capturando: tool(s) chamada(s), resposta
   final, custo end-to-end do turno (todas as origens do `LlmUsage`), latência,
   e veredito de alucinação (juiz compara resposta × toolResults).
2. **Popular `kpiOuro`**: ≥ 60 casos do golden com número-ouro SELECT-verificado
   contra o cache real (priorizar os domínios com mais erro: financeiro, fiscal,
   estoque). Trabalho real e orçado , é o gargalo do M1.
3. **Pre-flight de credenciais**: confirmar credencial frontier ativa COM saldo
   (`llm_credentials.balanceStatus`) antes de prometer candidatos.
**Aceite:** harness roda 3 candidatos em ≥ 60 casos e emite relatório por
candidato (número-ouro %, tool certa %, alucinação %, custo/turno, p50).

### Fase A1 , Cérebro, troca preliminar (maior alavanca imediata)
- A/B/C: `gpt-5.4-mini` (baseline) × `gpt-5.4` × frontier Anthropic (OpenRouter).
- Promover o vencedor em `llm_configs` (rollback em segundos = repromover).
**Aceite:** relatório A0 + smoke na bubble; vencedor em produção.
**Nota da review:** a medição preliminar acontece com tools ainda imperfeitas;
por isso existe a A2 confirmatória pós-B/C. A troca preliminar se justifica por
ser a alavanca de maior ganho com rollback trivial.

### Fase B , Contrato de lista universal (84 tools de lista mapeadas)
0. **Task-zero auditoria**: varrer as 84 tools de lista e classificar: tem
   `orderBy` determinístico? declara ordenação? trunca onde? (a truncagem real
   vive no `guardToolResult` do run-agent , 30/10 itens , e não nas queries).
1. `orderBy` determinístico (+ desempate por id) em toda query de lista.
2. Campo **`ordenadoPor`** no envelope (ex.: "valor desc") , `dadosBaseShape` é
   passthrough, não quebra schemas.
3. **`topMaiores`/`topPor*`** em toda tool de lista monetária (1ª:
   `financeiro_titulos_vencidos`, caso do print).
4. Formatador declara a ordenação ("10 primeiros por vencimento; maior é X").
5. **Gate INCREMENTAL**: teste de contrato com allowlist de tools migradas
   (espelha o padrão TOOLS_SEM_FORMATADOR_REAL da F4); allowlist precisa
   ESVAZIAR até o fim da fase.
6. **AutoValidator V-novo**: "enquadramento de lista" , resposta afirma
   "maiores/top" mas `ordenadoPor` ≠ "valor desc" → retry (defesa pós-resposta
   exata contra o caso forense #1).
7. **EmbeddingText audit** das tools monetárias (frases reais: "maiores
   vencidos", "quem mais me deve") , o retrieval corta antes do LLM ver.
**Aceite:** allowlist vazia; E2E real: "10 maiores vencidos" → Johnson
R$ 170,8mi no topo; jest verde.

### Fase C , Filtros e composição
1. **Mineração estruturada**: classificador LLM sobre `razoes` (texto livre) das
   perícias ERRADO/PARCIAL → matriz pergunta-real × gap (filtro faltante,
   composição multi-eixo, follow-up).
2. **Filtros isolados**: completar parâmetros consistentes (empresa,
   participante, período, sinal, status). Caso 1: faturamento por cliente ×
   empresa (KS).
3. **Composição multi-eixo** (escopo explícito): perguntas com 2 dimensões
   ("por empresa E operação") , decidir por tool: parâmetro composto OU
   orientação de prompt para compor 2 chamadas; registrar a decisão por caso.
4. **Follow-up contextual**: dimensão nova no golden , turno 2 herda filtros do
   turno 1 ("e da empresa X?", "e no mês passado?") sem o usuário repetir.
**Aceite:** cada linha da matriz vira teste; perguntas antes-erradas acertam
contra o cache real; golden de follow-up verde.

### Fase A2 , Cérebro, confirmação
- Re-rodar o A/B com tools consertadas (B/C). Se o ranking mudar, repromover.
**Aceite:** relatório final; modelo definitivo em produção.

### Fase D , Prompt 2.0
- Reescrever: identidade + contrato de envelope ÚNICO (`_RESPOSTA`, `_DESTAQUE`,
  `topMaiores`, `ordenadoPor`, paginação, vazio-vs-erro) + 10-12 regras de ferro.
- Remover regras-curativo obsoletas pós B/C (ex.: 13c vira contrato universal).
- **Atualizar AutoValidator V1-V7** aos novos contratos (a review pegou: mudar o
  envelope sem atualizar os validadores = falso-positivo de retry).
**Aceite:** golden agêntico ≥ baseline em TODAS as dimensões com o prompt novo.

### Fase E , Blindagem contínua
- Casos reais errados (10 maiores, KS, negativos, limite-como-total) entram no
  golden agêntico.
- Gate: script pre-push local contra cache vivo (CI não tem cache populado;
  `preparando` = falha de cobertura, nunca skip silencioso).
- `kpiOuro` cresce continuamente (meta: 100% dos casos de número).
- M1-M5 publicados no STATUS a cada fase.
**Aceite:** gate ativo e documentado; STATUS com painel de métricas.

## Fora de escopo (explícito e honesto)
- F5 WhatsApp/n8n (outra fase do roadmap).
- Reescrever tools que já acertam (proteção: golden de CLASSE; a proteção
  NUMÉRICA só vale onde `kpiOuro` existe , por isso A0.2 o expande).
- Trocar arquitetura MCP/cache (decisões canônicas #1-#4 intactas).

## Riscos e mitigações
- **Custo frontier**: medido end-to-end no A0 (inclui retries); prompt caching
  ativo + retrieval cortam o grosso.
- **Latência frontier**: medida no A0; mitigação: modos rápidos.
- **Regressão em massa (84 tools)**: mudanças mecânicas uniformes + allowlist
  incremental + golden + commits atômicos por grupo.
- **Medição A1 "suja"** (tools imperfeitas): mitigada pela A2 confirmatória.
- **Contexto entre sessões**: `docs/superpowers/plans/PROGRESSO-nex-especialista.md`
  atualizado a cada bloco; plano detalhado POR FASE no início de cada fase.
