---
agent: claude-fato-produto-canonica
started_at: 2026-05-25T11:50-03:00
branch: feat/f4-leitura-expansao
target_phase: F4 leitura (catalogo canonico de produtos para busca/desambiguacao)
status: in_progress
---

## Tópico
Criar `fato_produto` canonica populada de `raw_sped_produto` (3787 linhas
hoje). A busca por nome (`searchProductByNameWithMeta`) passa a consultar
ela como primeira camada (catalogo completo), com `fato_estoque_saldo`
sendo apenas a fonte de saldo (enriquecimento). Resolve sintoma do
"so achei 1 mola espiral em aço quando o cadastro tem 4" — porque a
`fato_estoque_saldo` cobre so produtos com saldo, e a fato_produto vai
cobrir o cadastro inteiro (ativo + inativo).

## Arquivos que provavelmente vou tocar
- `prisma/schema.prisma` (novo model FatoProduto)
- `prisma/migrations/YYYYMMDDHHMM_fato_produto_canonica/migration.sql`
- `src/worker/fatos/fato-produto.ts` (novo builder)
- `src/worker/fatos/fato-produto.test.ts` (novo)
- `src/worker/jobs.ts` (registrar job de build)
- `src/lib/reports/queries/_search-universal.ts` (extender SearchTarget com fato_produto)
- `src/lib/reports/queries/_search-helpers.ts` (nova camada: catalogo + enriquecimento de saldo)
- `src/lib/reports/queries/estoque.ts` (querySaldoProduto consome novo helper)
- `mcp/tools/estoque/saldo-produto.ts` (campo ambiguidade pega cadastro)
- `src/lib/agent/prompt/identity-base.ts` (orientacao para top-N com aviso de total)
- `docs/superpowers/specs/2026-05-25-fato-produto-canonica-design.md`
- `docs/superpowers/specs/2026-05-25-fato-produto-review-1.md`
- `docs/superpowers/specs/2026-05-25-fato-produto-review-2.md`
- `docs/superpowers/plans/2026-05-25-fato-produto-canonica-plan.md`
- `docs/superpowers/plans/2026-05-25-fato-produto-plan-review-1.md`
- `docs/superpowers/plans/2026-05-25-fato-produto-plan-review-2.md`

## Arquivos compartilhados que VOU modificar
- `prisma/schema.prisma`, `prisma/migrations/` (alta prob conflito por
  outras specs simultaneas — verificar `docs/agents/active/` antes de
  criar migration).
- `src/worker/jobs.ts` (registro de novo job; coordenar se outro
  agente estiver mexendo em jobs).
- Demais arquivos sao area exclusiva desta entrega.

## Decisões / contexto importante
- `raw_sped_produto.data` (JSONB) ja tem `nome_unico` (normalizado),
  `codigo`, `codigo_unico`, `active`, `controla_estoque`, `marca_id`,
  `familia_id`. Vamos mapear pra colunas tipadas.
- Manter pattern dos builders existentes (`fato-parceiro.ts`,
  `fato-certificado.ts`).
- A camada de busca volta a fazer search em `fato_produto` (catalogo);
  `fato_estoque_saldo` so para enriquecimento de saldo nas linhas
  finais. Mantem retrocompat.
- REGRA DE RAIZ rebuild: ao finalizar, rebuilde `mcp` e `worker` +
  reinicie `app` para garantir aplicacao.

## Bloqueios
- (vazio)
