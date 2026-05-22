# HANDOFF — F4 Expansão da base de leitura (L1/L2/L3)

> Retomada da sessão de 2026-05-21. Branch: `feat/f4-leitura-expansao`
> (criada de `origin/main`). Modo autônomo.

## Contexto

O acesso ao Odoo passou a ser `joaozanini` (103 grupos, quase admin). O
objetivo é ampliar a base de **leitura** ao máximo desse acesso e validar o
agente Nex. Três sub-projetos: **L1** (expansão), **L2** (bateria de 1000+
leituras reais) e **L3** (validação do agente Nex, 1000+ perguntas, meta
97-100%).

Em paralelo, a F4 Onda 2 (escrita, PR #10 na branch `feat/f4-onda2-mcp-escrita`)
está **bloqueada**: a base de teste `grupojht.teste.tauga.online` recusa
autenticação com erro Postgres `permissão negada para esquema public` (defeito
de configuração da Tauga). Credenciais de teste guardadas em `.env.local`
(`ODOO_WRITE_*`).

## Artefatos desta fase

- Censo: `docs/superpowers/research/2026-05-21-censo-novo-acesso.md`
- Spec L1 v3: `docs/superpowers/specs/2026-05-21-f4-leitura-expansao-spec.md`
- Plano L1 v3: `docs/superpowers/plans/2026-05-21-f4-leitura-expansao.md`

## Estado atual (o que já foi feito)

Metodologia cumprida até o plano: censo, spec v1 com 2 reviews adversariais
até v3, plano v1 com 2 reviews até v3. Investigação de schema (`fields_get`
read-only) feita e decisões travadas no plano.

**Execução iniciada — Onda L1a, camada de dados (commit `6d64043`):**
modelos `Raw*` (tabela.preco, tabela.preco.regra, servico, apuracao,
carta.correcao), fatos `FatoPreco` e `FatoServico`, e as 5 entradas no
`MODEL_CATALOG`. `prisma validate` verde.

## Próximo passo exato

Retomar o plano L1 em **Onda 1, tarefa T1.4** (migration). Sequência:

1. **Onda I parcial primeiro:** subir `docker compose up -d db redis`,
   `prisma migrate dev` das ondas, `npm run db:provision` (GRANT).
2. Onda 1 T1.5-T1.12: builder `fato-preco.ts`, queries, tools `preco_produto`
   /`preco_tabela`, testes (TDD).
3. Ondas 2, 3, 4, 5 do plano; depois L1b; depois a carga de ingestão (Onda I)
   completa e a verificação de contagem.
4. L1 verde → L2 (spec própria) → L3.

## Bloqueio conhecido de L3

O agente Nex tira a chave de LLM do banco (`LlmCredential` cifrada), não do
`.env.local`. O ambiente local não tem chave da OpenAI. **L3 (1000+ perguntas
ao agente) não roda sem uma chave real da OpenAI** semeada na config local. O
usuário foi avisado; aguarda a chave. L1 e L2 não dependem dela.

## Notas

- `npx tsc` acusa erros em `.next/types/validator.ts` referentes a páginas
  `servidor-mcp`/`plugar-mcps`: são artefatos `.next` obsoletos da branch
  `feat/f4-onda2-mcp-escrita`. Não é regressão desta branch; `rm -rf .next`
  limpa. Confirmar com build limpo.
- Protocolo multi-agente: `docs/agents/active/claude-f4-leitura-expansao.md`.
