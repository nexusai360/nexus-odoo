# HANDOFF — F4 Expansão da base de leitura (L1/L2/L3)

> Retomada da fase. Branch: `feat/f4-leitura-expansao` (de `origin/main`).
> Modo autônomo. Atualizado em 2026-05-21.

## Contexto

O acesso ao Odoo passou a ser `joaozanini` (103 grupos, quase admin). Objetivo:
ampliar a base de **leitura** do MCP ao máximo do acesso e validar o agente
Nex com 1000+ requisições reais (meta 97%+ de acerto). Três sub-projetos:
**L1** (expansão), **L2** (bateria de leitura), **L3** (validação do agente).

## Artefatos

- Censo: `docs/superpowers/research/2026-05-21-censo-novo-acesso.md`
- Spec L1 v3: `docs/superpowers/specs/2026-05-21-f4-leitura-expansao-spec.md`
- Plano L1 v3: `docs/superpowers/plans/2026-05-21-f4-leitura-expansao.md`

## Estado atual

Metodologia cumprida até o plano (censo, spec v1→v3 com 2 reviews, plano
v1→v3 com 2 reviews). Investigação de schema `fields_get` feita.

Execução iniciada:
- **Commit `6d64043`:** schema da Onda L1a (modelos `Raw*` e `Fato*` de
  preços, serviços, apuração, carta de correção) + entradas no `MODEL_CATALOG`.
  `prisma validate` verde.
- **Chave da OpenAI** guardada em `.env.local` (`OPENAI_API_KEY`). L3
  deixa de estar bloqueada por credencial. Ainda falta semear a
  `LlmCredential` cifrada no banco (o agente lê a chave de lá, não do env).
- **Stack local de pé:** containers `db` (5436), `redis` (6380), `mcp` (3100).

## ATENÇÃO — drift de banco a resolver primeiro

O banco local `nexus_odoo` tem 4 migrations da branch `feat/f4-onda2-mcp-escrita`
(`f4_onda2_mcp_writes`, `external_mcp_servers`, `user_tour_seen`,
`external_mcp_call_log`) que **não existem** nesta branch. `prisma migrate dev`
exige reset do banco. Resolução recomendada (banco isolado para esta branch,
sem destruir o ambiente da outra):

```
docker compose exec -T db psql -U nexus -d nexus_odoo \
  -c "CREATE DATABASE nexus_odoo_l1 OWNER nexus;"
# repontar no .env.local: DATABASE_URL, MCP_DATABASE_URL, MCP_BI_DATABASE_URL
#   para o banco nexus_odoo_l1
DATABASE_URL=...nexus_odoo_l1 npx prisma migrate dev --name f4l_l1a_dados
npm run db:provision   # roles nexus_mcp / nexus_mcp_bi
```

Alternativa: `prisma migrate reset` no `nexus_odoo` (mais simples, mas apaga o
estado local da outra branch; aceitável por ser banco de dev).

## Próximo passo exato (retomar o plano L1)

1. Resolver o drift de banco (acima) e aplicar a migration `f4l_l1a_dados`.
2. Plano L1, Onda 1 T1.5+: builder `fato-preco.ts`, queries, tools
   `preco_produto`/`preco_tabela`, testes TDD. Depois Ondas 2-5, L1b.
3. Onda I: rodar o worker (`npm run worker`) para popular o cache com os
   modelos novos; verificar contagem contra o Odoo.
4. **Expandir o catálogo** conforme o pedido do usuário ("79 é pouco"): além
   dos domínios do plano, avaliar incluir mais modelos do censo (a spec L1 v3
   tinha recortado; o usuário pediu cobertura ampla, então a próxima sessão
   deve revisar o escopo da spec para abranger mais modelos com dado).
5. **L3 — validação do agente Nex:** semear `LlmCredential` (OpenAI) no banco
   via `src/lib/agent/llm/credentials.ts` e a `LlmConfig` ativa com o modelo
   **`gpt-5.4-nano`** (instrução do usuário: todas as requisições do teste
   usam esse modelo); montar harness de 1000+ perguntas reais variadas (temas
   e modos diversos); para cada uma, comparar a resposta do agente com uma
   consulta independente à mesma base; relatório geral de acerto (meta 97%+).

## Notas

- `npx tsc` acusa erros em `.next/types/validator.ts` (páginas
  `servidor-mcp`/`plugar-mcps`): artefatos `.next` obsoletos da outra branch.
  Não é regressão; `rm -rf .next` limpa.
- F4 Onda 2 escrita (PR #10) segue bloqueada: base de teste
  `grupojht.teste.tauga.online` com erro Postgres de schema. Credenciais em
  `.env.local` (`ODOO_WRITE_*`).
- Protocolo multi-agente: `docs/agents/active/claude-f4-leitura-expansao.md`.
