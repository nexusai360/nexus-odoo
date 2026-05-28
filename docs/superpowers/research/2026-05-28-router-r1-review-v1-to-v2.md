# Review adversarial v1 → v2 do SPEC R1 (Router de catalogo)

Auditoria critica do SPEC v1. Cada achado vira mudanca obrigatoria na v2.
Achados foram numerados e classificados por severidade.

## Achados CRITICOS (bloqueiam v2)

**C1. Vocabulario da §7.2 e' stub, nao prosa.**
A tabela lista palavras-chave separadas por virgula ("Plano de contas,
lancamento contabil..."), nao descricao em linguagem natural. Embeddings
geram pessimo sinal para listas de keywords. Reescrever cada description
como **prose em portugues brasileiro do usuario final**, incluindo
contexto, sinonimos e exemplos curtos embutidos.

**C2. Multi-tool turn nao foi tratado.**
O agente Nex chama frequentemente 2-4 tools por turno (ex: detectar
cliente + buscar dado + agregar). A coluna `toolActuallyUsed` esta como
`String?` (singular). KPI top-1 fica ambiguo. Decidir e documentar:
- `toolActuallyUsed` vira `String[]` (array de nomes na ordem chamada).
- KPI top-1 valida se **qualquer** tool chamada esta no dominio top-1.
- KPI mais restrito (todas as tools no top-K) entra como metrica
  secundaria no painel.

**C3. Regra 1 ("< 3 palavras") e' frouxa.**
"Saldo bancario" tem 2 palavras e e' pergunta valida. "Como anda?" tem 2 e
e' saudacao. Trocar criterio para combinacao:
- `length < 10 chars` OR
- todas as palavras estao em stop-list (oi, ola, bom, dia, tarde, noite,
  obrigado, ok, sim, nao).
- Adicionar lista canonica em `domain-vocabulary.ts`.

**C4. Definicao formal de "dominio da tool" esta implicita.**
A spec deriva dominio do path `mcp/tools/<dominio>/`, mas o handler MCP
expoe tools via `catalog/`. Documentar a regra exata:
- O catalogo MCP expoe `ToolEntry` com nome (`fiscal_notas_emitidas`).
- Dominio = primeiro segmento antes do primeiro `_`.
- Excecao: tools cujo path em `mcp/tools/caminho3/*` viram dominio
  `"caminho3"` independente do nome.
- Manter mapa explicito em `src/lib/agent/router/tool-to-domain.ts` para
  desambiguar.

**C5. Falta secao de rollback / kill-switch.**
Se modo ativo regredir a qualidade, super_admin precisa **desligar
imediatamente sem deploy**. Adicionar secao §16:
- Toggle `routerEnabled = false` no painel volta a expor catalogo
  inteiro no proximo turno (sem precisar reiniciar containers).
- Endpoint admin `/api/admin/router/kill` que faz UPDATE direto na
  AppSetting (caso painel quebre).
- Documentar tempo de propagacao: < 5s (AppSetting tem cache de 60s
  no worker, mas no agente Next.js a leitura e' por request).

**C6. Threshold de retry V1-V5 hardcoded em 0.7.**
Tornar configuravel via nova coluna `routerRetryExpandBelow` em
AppSetting (default 0.7, range 0.3 a 0.9).

## Achados ALTOS (aplicar na v2)

**A1. Rebuild de containers nao mencionado.**
Mudancas em `src/lib/agent/run-agent.ts` exigem rebuild do `app` (CLAUDE.md
§2.1). Mudancas em `prisma/schema.prisma` exigem rebuild de TODOS (app,
mcp, worker). Adicionar checklist explicito na secao §12 (Criterios de
promocao).

**A2. Pergunta vaga em modo ativo.**
"Como anda a empresa?" provavelmente cai em fallback (todos scores
abaixo de 0.55) e expoe catalogo inteiro. Validar isso e documentar
explicitamente que e' comportamento esperado (nao bug).

**A3. Dominio que nao existe no MCP atual.**
`crm` esta na §7.2 mas hoje tem **0 tools** em `mcp/tools/crm/` (a pasta
existe mas vazia, ver auditoria 2026-05-28). Se router escolhe `crm`, o
filter-catalog devolve set vazio para esse dominio, e o LLM nao vai
chamar nada de CRM. Comportamento:
- Logar em `console.warn` (so dev).
- Ignorar silenciosamente o dominio sem tools.
- NAO incluir no fallback (o fallback existente cobre).

**A4. Sanity check obrigatorio antes de habilitar ativo.**
Adicionar como gate de promocao §12:
- Bateria R-X em shadow deve mostrar acerto top-1 >= 85% **antes** de
  ligar o toggle. Painel deve recusar ativar se nao atingiu.

**A5. forceIncludeOn de cadastros e' agressivo.**
`/cnpj|cpf|inscricao|endereco|telefone|email/i` casa em pergunta tipo
"qual o ICMS para empresa com inscricao estadual X?" (que e' fiscal).
Calibrar: regex deve casar quando termo aparece de forma isolada (`\b`).

## Achados MEDIOS (aplicar na v2 se nao adicionar muito risco)

**M1. Custo de embedding declarado sem benchmark.**
"<$2/mes" e' estimativa. Calibrar com `rag/embed.ts` que ja roda em
producao: medir custo medio por turno x 10k turnos/mes. Documentar
metodo de calculo.

**M2. `userQuestion` armazenada em claro.**
Compliance: a tabela `Message` ja armazena pergunta em claro hoje. Manter
mesmo padrao. Adicionar nota: tabela e' acessada apenas por super_admin
no painel.

**M3. `durationMs` confuso.**
Renomear para `pickDurationMs` para deixar claro que mede so
`pickDomains`, nao o turno todo.

**M4. Logging granular de scores.**
`scores JSON` armazena todos os 9 dominios. Vale espaco. Manter por
agora (queries por score sao raras), mas adicionar nota: se tabela
crescer demais, considerar so top-3 + total.

## Achados BAIXOS (registrar mas nao bloqueiam v2)

**B1. Referencia a "R24" na §11.3.**
Estamos em R23. R24 sera disparada manualmente. Trocar para "proxima
rodada R-X em shadow".

**B2. Hash do vocabulario truncado em 8 chars.**
Risco de colisao baixo mas existe. Aceitavel para escala interna.

**B3. Versionamento de vocabulario em runtime.**
Aceitar que mudanca de description exige rebuild do container `app`. Nao
e' problema na pratica.

## Conclusao

v1 tem **6 achados criticos** + **5 altos** + **4 medios**. Reescrever
secoes 5, 7, 8, 9, 10, 11, 12 e adicionar secao 16 (rollback). Manter
estrutura geral, fluxo logico ainda esta correto.

Saida: SPEC v2 no mesmo arquivo `2026-05-28-router-catalogo-design.md`.
Header passa a marcar "v2 (apos review adversarial #1)".
