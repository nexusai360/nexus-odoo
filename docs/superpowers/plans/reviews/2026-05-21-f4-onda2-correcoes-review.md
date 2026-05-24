# Review crítica — Plano F4 Onda 2 Correções

> Duas revisões adversariais do plano `2026-05-21-f4-onda2-correcoes.md` (CLAUDE.md §6[6][7]).

## Review #1 — lacunas, ordem, premissas

| # | Achado | Severidade | Resolução |
|---|--------|-----------|-----------|
| 1 | Task 3 mantinha `versionInfo` na `Props` mas removia os `InfoBadge` que o usavam → variável morta, warning de lint, e `getMcpVersion` órfão em `page.tsx`. | Material | Task 3 Step 1 reescrito: remover `versionInfo` da `Props`, atualizar a chamada em `page.tsx`, remover `getMcpVersion`. |
| 2 | Task 8 (Server Actions) assumia "util AES-256" sem fallback; o `src/lib/crypto.ts` conhecido só tem `sha256hex` (hash, não cifra reversível). O `authToken` precisa ser **decifrado** para uso. | Material | Task 7 Step 3 reescrito: verificar par `encrypt/decrypt`; se ausente, criar `src/lib/secret-box.ts` (AES-256-GCM) como pré-requisito. |
| 3 | `headers()` é assíncrono no Next 16 — Task 6 não explicitava `await`. | Menor | Task 6 Step 2 reescrito com `await headers()` e montagem da URL absoluta. |
| 4 | Task 11 empacotava 3 reescritas de componente + enriquecimento de conteúdo numa task só — é épico, viola decomposição máxima. | Material | Task 11 dividida em 11a/11b/11c/11d, cada uma com commit próprio. |

## Review #2 — granularidade, integração, testabilidade

- **Dependências entre tasks:** 7→8→9→10 corretas (`ExternalMcpServerListItem` definido em T8 antes de T9 importar; `listExternalMcpServers` antes de T10). Task 2 e Task 6 ambas tocam `page.tsx` — ordem 2 antes de 6 mantida. OK.
- **Task 4 (`chaves-lista.tsx`, 36 KB):** é um arquivo só / uma responsabilidade (lista + form de chave) — aceitável como task única; Step 1 obriga ler os tipos antes de mexer. OK.
- **`testExternalMcpServer`:** handshake MCP real é JSON-RPC `initialize`; o plano aceita um teste de alcançabilidade (GET/POST com timeout) — suficiente para um registro, não exige cliente MCP completo. OK.
- **Imports confirmados:** `requireSuperAdmin` de `@/lib/actions/_helpers`, `logAudit` de `@/lib/audit`, `DataResult` no padrão de `mcp-api-keys.ts`. OK.
- **Escopo:** runtime de consumo dos MCPs externos pelo loop do Nex declarado fora de escopo (F5) — honesto e alinhado ao HANDOFF §2.3.
- **Teste E2E de escrita (Task 16):** gated por falta de credenciais — documentado, não bloqueia.

**Conclusão:** sem achados materiais remanescentes após aplicar Review #1. Plano promovido a **v3** — apto para execução.
