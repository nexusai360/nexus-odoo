# F4 Onda 2 — Capacidade de Escrita no Servidor MCP (Design)

> **Status:** v3 (consolidada com 2 reviews críticas internas)
> **Data:** 2026-05-20
> **Branch alvo:** `feat/f4-onda2-mcp-escrita`
> **Fase predecessora:** F4 Onda 1 (estoque + financeiro, leitura) — em andamento
> **Decisão canônica afetada:** `CLAUDE.md` §5 #2 (revisada nesta spec)

## 0. Histórico de Reviews Internas

Esta spec foi escrita já incorporando duas reviews críticas. Pontos de inflexão:

**Review #1 (escopo e segurança):**
- Faltava onda 0 de fundação — não dá pra começar pelo CRM sem schema/middleware/painel/testes E2E prontos.
- Faltava versionamento da capability — chaves antigas precisam continuar válidas quando novas ações são adicionadas.
- Faltava hot reload — mudança de capability no painel precisava invalidação imediata, não TTL.
- Faltava classificação de erros do Odoo (AccessError, ValidationError, UserError, MissingError) para HTTP status.

**Review #2 (consistência e operacional):**
- `external_id` não pode usar campo `x_*` custom — usar `ir.model.data` nativo do Odoo.
- Sync direcionado pós-write deve aproveitar o snapshot `after` em vez de fazer novo `search_read` (otimização).
- Sync direcionado de DELETE precisa lógica diferente — remover do cache, não buscar.
- Concurrency: optimistic locking via `write_date` com header `If-Unmodified-Since` opcional.
- Documentação interna do painel: não é Markdown estático, é componente React com syntax highlighting e tabs por linguagem.
- Reorganização do menu ("Plugar MCPs" → Nex; "API REST" com tag "Em breve") integra a esta onda — não é trabalho separado.

---

## 1. Contexto e Objetivos

### 1.1. O quê

Estender o servidor MCP semântico (F4) para permitir **escrita** no Odoo Tauga, cobrindo **todos os módulos de negócio** que o Odoo expõe, com **gate de segurança por API Key com capabilities por módulo × ação**, configurado e auditado pelo painel `Integrações → Servidor MCP`.

### 1.2. Por quê

O usuário precisa orquestrar fluxos de escrita no Odoo a partir de plataformas externas (n8n é o caso imediato, mas a arquitetura suporta múltiplos clientes MCP: Make, Zapier, scripts, outras plataformas), tipicamente para sincronizar dados que vivem em outras ferramentas (plataforma de atendimento comercial, automações de marketing, etc) com o ERP. Hoje a única interface de escrita no Odoo é a UI ou a API Tauga raw — ambas inadequadas para automação confiável.

### 1.3. Princípios não-negociáveis

1. **Agente Nex (in-app + WhatsApp) NUNCA escreve.** A trava é estrutural: a chave do Nex tem `capabilities.write = {}`. Defesa pela credencial, não pelo prompt.
2. **Escrita exige Idempotency-Key obrigatória.** Não há fallback automático.
3. **Auditoria total.** Toda chamada (read e write, success e denied) é registrada com snapshot.
4. **Discovery completo do Odoo.** A onda 2 ataca módulos por prioridade, mas o objetivo é mapear 100% dos write paths do Odoo Tauga em ondas sucessivas. Nenhum módulo fica incompleto.
5. **Testes E2E reais.** Toda onda é validada contra `grupojht.teste.tauga.online` antes do merge. Não é opcional.

---

## 2. Escopo

### 2.1. Dentro

- Servidor MCP ganha tools de escrita organizadas por módulo Odoo (`crm`, `vendas`, `estoque`, `compras`, `financeiro`, `fiscal`, `contabil`, `producao`, `rh`, `projeto` e demais ativos no Odoo Tauga).
- Modelo de capability `<acao>:<modulo>` com 4 ações canônicas (`create`, `update`, `delete`, `transition`) e ações sensíveis específicas por módulo (descobertas no discovery; exemplos: `emit_nfe`, `cancel_nfe`, `post_journal`, `reconcile`, `validate_picking`).
- Modelo de dados Prisma: `McpAccessKey`, `McpAuditLog`, `McpIdempotencyRecord`.
- Middleware HTTP: auth (Bearer), idempotency, capability check, rate limit.
- Sync direcionado pós-write (worker BullMQ).
- Painel `Integrações → Servidor MCP`: visão geral, chaves de acesso (CRUD + matriz de capabilities), logs/audit, documentação interactive.
- Reorganização de menu: `Integrações → MCP` (atual, MCPs externos) vira `Agente Nex → Plugar MCPs`. Card "APIs" renomeado para "API REST" com tag "Em breve" estilo BI.
- Discovery de write paths do Odoo: extensão dos scripts Python em `discovery/`.
- Bateria de testes E2E na base `grupojht.teste.tauga.online`.
- Revisão da decisão canônica #2 em `CLAUDE.md`.

### 2.2. Fora

- Construção de UI de cliente MCP no Agente Nex para consumir o próprio servidor MCP (Nex segue read-only neste design — não chama write tools).
- Endpoints REST não-MCP (a "API REST" da plataforma fica como "Em breve" — design separado quando demandado).
- BI/Caminho 3c de escrita (ad-hoc SQL não escreve; já era política).
- Migração de fluxos n8n existentes do cliente (fora do escopo desta entrega; cliente cuida).

### 2.3. Suposições

- Tauga continua expondo JSON-RPC estável (já validado na F0).
- Base de teste `grupojht.teste.tauga.online` é espelho funcional da produção e permanece disponível durante a entrega.
- Usuário Odoo dedicado para escrita pode ser criado/configurado pela Tauga ou pelo cliente.
- Cron de sync incremental (F2, 3min) permanece como mecanismo principal de hidratação do cache; sync direcionado é complemento por linha tocada via write.

---

## 3. Arquitetura

### 3.1. Visão macro

```
Clientes externos
(n8n, Make, scripts, outras plataformas)
       │
       │ HTTPS POST /mcp
       │ Authorization: Bearer mcp_live_<token>
       │ Idempotency-Key: <uuid>
       ▼
┌─────────────────────────────────────────────────────┐
│ Container "mcp" (Next.js route /api/mcp)             │
│                                                       │
│  ┌────────────────────────────────────────────────┐  │
│  │ Auth Middleware                                 │  │
│  │  - SHA-256 do token → busca McpAccessKey       │  │
│  │  - active? expiresAt? revokedAt? → 401         │  │
│  │  - rate limit Redis (sliding window)           │  │
│  │  - carrega capabilities em ctx                  │  │
│  └────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────┐  │
│  │ Idempotency Middleware (writes apenas)         │  │
│  │  - header ausente → 400                         │  │
│  │  - McpIdempotencyRecord existe?                 │  │
│  │    - mesmo payloadHash → devolve result        │  │
│  │    - payloadHash diferente → 422               │  │
│  │  - não existe → segue (registra após handler)  │  │
│  └────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────┐  │
│  │ Tool Dispatcher                                 │  │
│  │  - lookup no catálogo (read OU write)          │  │
│  │  - tool exige capability "create:crm"          │  │
│  │  - capability presente na chave? → 403 senão   │  │
│  │  - validação Zod do input → 400 senão          │  │
│  └────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────┐  │
│  │ Tool Handler                                    │  │
│  │  READ:                                          │  │
│  │    - SELECT no Postgres cache                  │  │
│  │  WRITE:                                         │  │
│  │    1. snapshot before (read no Odoo)           │  │
│  │    2. chama Odoo (create/write/unlink/action)  │  │
│  │    3. snapshot after                           │  │
│  └────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────┐  │
│  │ Post-handler (writes)                          │  │
│  │  - grava McpAuditLog (before, after, payload)  │  │
│  │  - grava McpIdempotencyRecord (TTL 24h)        │  │
│  │  - enfileira sync direcionado em Redis         │  │
│  │    (payload: {modelo, ids, snapshot_after})    │  │
│  └────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
       │ JSON-RPC                            │
       ▼                                     │ enfileira
   Odoo Tauga                            ┌───┴────┐
   ├─ leitura: produção                  │ Worker │
   ├─ writes:  base de teste durante     │ BullMQ │
   │           entrega; produção         └───┬────┘
   │           depois de validado            │
   │                                          │ atualiza cache
   │                                          ▼
   └────────────────────────────────────► Postgres cache
                                          (raw + fato_*)
```

### 3.2. Revisão da decisão canônica #2

**Texto antigo (CLAUDE.md §5 #2):**
> "Sem fallback JSON-RPC nas tools. O Odoo é tocado somente pelo cron de sincronização. Nenhuma pergunta de usuário dispara chamada ao Odoo."

**Texto novo (a ser aplicado em CLAUDE.md ao concluir esta onda):**
> "Leitura **sempre** do cache; o cache é alimentado pelo cron de sincronização (full + incremental + reconcile). Escrita pode ir ao Odoo **exclusivamente** via tools `write:*` do servidor MCP, gated por capability de `McpAccessKey`. Toda write é seguida de sync direcionado da(s) linha(s) afetada(s), retornando ao cache em <2s. O Agente Nex permanece read-only por design (sua chave interna não tem capabilities de escrita)."

---

## 4. Modelo de Dados

### 4.1. Schema Prisma (adições)

```prisma
// Renomeada de ApiKey, expandida.
model McpAccessKey {
  id            String   @id @default(cuid())
  name          String                       // "n8n-crm-prod"
  description   String?
  tokenHash     String   @unique             // SHA-256(token) — bcrypt é lento demais p/ cada req
  prefix        String                       // "mcp_live_aBcD" — primeiros chars visíveis
  capabilities  Json                         // ver §4.2
  capabilitiesVersion Int   @default(1)      // versionamento — ver §8
  rateLimit     Int      @default(60)        // requests/minuto (default 60, max 600)
  active        Boolean  @default(true)
  expiresAt     DateTime?
  lastUsedAt    DateTime?
  createdBy     String                       // userId do super_admin
  createdAt     DateTime @default(now())
  rotatedAt     DateTime?
  revokedAt     DateTime?
  revokedReason String?
  isSystemKey   Boolean  @default(false)     // true = Agente Nex; bloqueia delete pelo painel

  auditLogs     McpAuditLog[]

  @@index([active, revokedAt])
  @@index([prefix])
}

model McpAuditLog {
  id              String        @id @default(cuid())
  accessKeyId     String
  accessKey       McpAccessKey  @relation(fields: [accessKeyId], references: [id])

  toolName        String                      // "crm.partner.create"
  operation       String                      // "read" | "write"
  capability      String?                     // "create:crm" (null em reads)
  module          String?                     // "crm" — facilita filtros
  action          String?                     // "create" — facilita filtros

  requestId       String                      // uuid gerado no middleware p/ correlacionar logs
  idempotencyKey  String?

  payload         Json                        // input bruto recebido (com PII se houver)
  result          Json?                       // output da tool (null em erro pré-handler)
  snapshotBefore  Json?                       // estado before (writes; create=null)
  snapshotAfter   Json?                       // estado after (writes; delete=null)

  status          String                      // "success" | "denied" | "validation_error" | "odoo_error" | "internal_error"
  httpStatus      Int                         // 200, 401, 403, 422, 500…
  errorCode       String?                     // "capability_missing", "odoo_access_denied", "validation_failed"...
  errorMessage    String?

  durationMs      Int
  ipAddress       String?
  userAgent       String?

  createdAt       DateTime      @default(now())

  @@index([accessKeyId, createdAt(sort: Desc)])
  @@index([toolName, createdAt(sort: Desc)])
  @@index([status, createdAt(sort: Desc)])
  @@index([idempotencyKey])
  @@index([module, action, createdAt(sort: Desc)])
}

model McpIdempotencyRecord {
  key           String   @id                // Idempotency-Key recebido do cliente
  accessKeyId   String                      // amarrado à chave que originou
  toolName      String
  payloadHash   String                      // SHA-256(JSON.stringify(input)) — detecta abuso
  result        Json                        // resposta a devolver em retry
  status        String                      // "success" | "error"
  httpStatus    Int                         // status code da resposta original
  expiresAt     DateTime                    // now() + 24h
  createdAt     DateTime @default(now())

  @@index([expiresAt])
}
```

### 4.2. Formato do campo `capabilities`

```json
{
  "version": 1,
  "read": ["estoque", "financeiro", "crm", "vendas"],
  "write": {
    "crm":        ["create", "update", "transition"],
    "estoque":    ["create", "update"],
    "fiscal":     ["update", "emit_nfe", "cancel_nfe"],
    "financeiro": ["update", "transition", "reconcile"],
    "contabil":   ["update", "post_journal"]
  }
}
```

- `read`: array de módulos com leitura liberada. Vazio = sem leitura.
- `write`: objeto onde a chave é o módulo e o valor é array de ações permitidas (4 canônicas + sensíveis específicas).
- `version`: versão do schema (ver §8).

---

## 5. Tools

### 5.1. Tipos de tool no catálogo

```typescript
// src/mcp/types.ts
type ToolBase = {
  name: string;                 // "crm.partner.create"
  module: string;               // "crm"
  description: string;
  inputSchema: ZodSchema;
  outputSchema: ZodSchema;
};

type ReadTool = ToolBase & {
  operation: 'read';
  capability: { read: string };  // { read: "crm" }
  handler: (input, ctx) => Promise<any>;
};

type WriteTool = ToolBase & {
  operation: 'write';
  capability: { write: { module: string; action: string } };
  // Ex: { write: { module: "crm", action: "create" } }
  sensitive: boolean;            // ações sensíveis ficam marcadas para alertas no audit
  odooModel: string;             // "res.partner" — para sync direcionado saber qual modelo re-buscar
  affectsModels?: string[];      // modelos adicionais a sincronizar (FKs criados em cascata)
  handler: (input, ctx) => Promise<{ id: number | number[]; data: any }>;
};
```

### 5.2. Ações canônicas (4 — todos os módulos)

| Ação | Capability | Método Odoo | Snapshot |
|---|---|---|---|
| `create` | `create:<modulo>` | `model.create(vals)` | before=null, after=read pós-create |
| `update` | `update:<modulo>` | `model.write(ids, vals)` | before=read pré-write, after=read pós-write |
| `delete` | `delete:<modulo>` | `model.unlink(ids)` | before=read pré-unlink, after=null |
| `transition` | `transition:<modulo>` | `model.action_*()` ou write em `state` | before=read pré, after=read pós |

### 5.3. Ações sensíveis (exemplos — discovery confirma)

| Módulo | Ações sensíveis | Modelo Odoo principal | Observação |
|---|---|---|---|
| **fiscal** | `emit_nfe`, `cancel_nfe`, `inutilize_nfe` | `l10n_br_fiscal.document` | SEFAZ — irreversível pós-autorização |
| **contabil** | `post_journal`, `unpost_journal`, `close_period` | `account.move`, `account.period` | Lock contábil |
| **financeiro** | `reconcile`, `pay`, `cancel_payment`, `refund` | `account.payment`, `account.move.line` | Movimenta caixa |
| **estoque** | `validate_picking`, `apply_inventory`, `adjust_quant` | `stock.picking`, `stock.inventory` | Altera saldo físico |
| **vendas** | `confirm_order`, `cancel_order`, `mark_done` | `sale.order` | Gera NF + commitment estoque |
| **compras** | `confirm_purchase`, `receive`, `cancel_purchase` | `purchase.order` | Gera obrigação financeira |
| **producao** | `confirm_mo`, `mark_done_mo`, `cancel_mo` | `mrp.production` | Consome componentes |
| **rh** | `confirm_payslip`, `cancel_payslip` | `hr.payslip` | Folha de pagamento |

### 5.4. Nomenclatura de tools

Padrão: `<modulo>.<modelo_curto>.<ação>` em snake_case dentro de cada nível.

- `crm.partner.create`
- `crm.lead.update`
- `crm.lead.transition` (input precisa `stage_id` ou nome do estágio)
- `fiscal.documento.emit_nfe`
- `financeiro.payment.reconcile`

### 5.5. Estrutura de um handler de write

```typescript
// src/mcp/tools/crm/partner.create.ts
export const crmPartnerCreate: WriteTool = {
  name: 'crm.partner.create',
  module: 'crm',
  operation: 'write',
  capability: { write: { module: 'crm', action: 'create' } },
  sensitive: false,
  odooModel: 'res.partner',
  description: 'Cria um novo parceiro (cliente/fornecedor) no CRM.',

  inputSchema: z.object({
    name: z.string().min(1).max(128),
    cnpj_cpf: z.string().optional(),
    is_company: z.boolean().default(false),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    street: z.string().optional(),
    city_id: z.number().int().optional(),
    state_id: z.number().int().optional(),
    external_id: z.string().max(64).optional(),    // armazenado em ir.model.data
    // ... demais campos
  }),

  outputSchema: z.object({
    id: z.number().int(),
    name: z.string(),
    external_id: z.string().nullable(),
    // ... espelha o registro criado
  }),

  handler: async (input, ctx) => {
    const { odoo, requestId } = ctx;

    // 1. Validação de external_id (NÃO faz upsert — apenas checa duplicação)
    if (input.external_id) {
      const externalKey = `mcp_external_${input.external_id}`;
      const exists = await odoo.searchIrModelData('res.partner', externalKey);
      if (exists) {
        throw new ConflictError(
          'external_id já existe',
          { existing_id: exists.res_id, external_id: input.external_id }
        );
      }
    }

    // 2. Cria no Odoo
    const odooVals = mapInputToOdoo(input);
    const newId = await odoo.create('res.partner', odooVals);

    // 3. Se external_id veio, registra em ir.model.data
    if (input.external_id) {
      await odoo.create('ir.model.data', {
        name: `mcp_external_${input.external_id}`,
        model: 'res.partner',
        module: 'mcp_nexus',
        res_id: newId,
        noupdate: true,
      });
    }

    // 4. Lê o registro completo para snapshot after
    const after = await odoo.read('res.partner', [newId], FIELDS_PARTNER);

    return { id: newId, data: mapOdooToOutput(after[0]) };
    // snapshot_after preenchido automaticamente pelo middleware com after
    // sync direcionado disparado automaticamente pelo middleware
  },
};
```

---

## 6. Fluxo Completo de uma Chamada

### 6.1. Requisição de exemplo

```
POST /api/mcp
Authorization: Bearer mcp_live_aBcD1234EfGh5678IjKl9012MnOp3456
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
If-Unmodified-Since: 2026-05-20T15:00:00Z          (opcional, p/ updates)
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "crm.partner.create",
    "arguments": {
      "name": "21 Fitness Academia",
      "cnpj_cpf": "21.085.714/0001-10",
      "is_company": true,
      "external_id": "atendimento_crm_8842"
    }
  }
}
```

### 6.2. Resposta de sucesso

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "ok": true,
    "data": {
      "id": 1234,
      "name": "21 Fitness Academia",
      "external_id": "atendimento_crm_8842"
    },
    "meta": {
      "request_id": "req_abc123",
      "idempotency_key": "550e8400-...",
      "cached_at": "2026-05-20T15:30:01Z",
      "duration_ms": 412
    }
  }
}
```

### 6.3. Resposta de erro padronizada

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32000,
    "message": "Forbidden",
    "data": {
      "ok": false,
      "error": {
        "code": "capability_missing",
        "message": "A chave de acesso não tem capability 'delete:crm'",
        "details": {
          "required": "delete:crm",
          "current_write": ["create", "update", "transition"]
        },
        "retryable": false
      },
      "meta": {
        "request_id": "req_def456"
      }
    }
  }
}
```

---

## 7. Defesa em Profundidade — 7 Camadas

| Camada | Trava | Responsável |
|---|---|---|
| 1. Catálogo filtrado | Lista de tools devolvida ao cliente (`tools/list`) só contém tools cobertas por suas capabilities. Tools fora do escopo nem aparecem (defesa por ocultação) | Dispatcher |
| 2. Auth na borda | Token inválido/revogado/expirado → 401 antes de qualquer lógica | Auth middleware |
| 3. Capability check no dispatcher | Tool requer `create:crm`; chave não tem? → 403 antes do handler rodar. Loga `denied` no audit | Dispatcher |
| 4. Validação Zod do input | Schema inválido → 400 com detalhes do campo | Dispatcher |
| 5. RBAC do user Odoo subjacente | A chave do MCP autentica no Odoo com um user de menos privilégio. Odoo recusa write em modelos não autorizados (defesa final) | Odoo |
| 6. Idempotency-Key | Retry não duplica; payload diferente com mesma key → 422 | Idempotency middleware |
| 7. Audit + rate limit | Toda chamada (success E denied) registrada; rate limit por chave (sliding window 60s; default 60req, max 600req) → 429 | Rate limit middleware + audit |

**Materialização da regra "Agente Nex nunca escreve":**
- Chave do Agente Nex é uma `McpAccessKey` com `isSystemKey=true` e `capabilities.write = {}`.
- A camada 1 (catálogo filtrado) faz com que o LLM do Nex nem **veja** tools de escrita — elas não estão no catálogo retornado.
- A camada 3 (capability check) garante que mesmo se algo escapasse, a chamada seria barrada antes do handler.
- A chave do Nex tem `isSystemKey=true`, o que impede deleção/alteração acidental no painel.

---

## 8. Capabilities — Versionamento e Evolução

### 8.1. Problema

Quando uma ação nova é adicionada (ex: discovery descobre `emit_nfe_complementar`), chaves antigas precisam continuar válidas — não podemos invalidar 50 chaves de produção do cliente quando adicionamos uma capability.

### 8.2. Estratégia

- Cada `McpAccessKey` armazena `capabilitiesVersion` (default `1`).
- Toda ação nova adicionada após a v1 entra **desligada por padrão** para chaves antigas — só ativa se o usuário editar a chave no painel e marcar.
- Ações **canônicas** (create/update/delete/transition) de **módulos novos** seguem a mesma regra: chaves antigas não ganham acesso automático a módulos novos.
- Resultado: chaves antigas continuam fazendo exatamente o que faziam, e o usuário precisa opt-in explicitamente para qualquer nova capability.

### 8.3. Hot reload

- Quando capabilities de uma chave são alteradas no painel, publica em canal Redis pub/sub `mcp:keys:invalidated`.
- Servidor MCP escuta o canal e descarta cache em memória da chave afetada.
- Próxima requisição força reload do banco. Latência típica <100ms.

---

## 9. Idempotência e `external_id`

### 9.1. `Idempotency-Key` (header HTTP — obrigatório em todo write)

- Cliente gera UUID por operação.
- Servidor mantém `McpIdempotencyRecord` por 24h com `(key, accessKeyId, toolName, payloadHash, result)`.
- Retry com mesma key + mesmo payloadHash → devolve result armazenado, **não reexecuta**.
- Retry com mesma key + payloadHash diferente → **422 Unprocessable Entity** ("Idempotency-Key reutilizada com payload diferente — gere uma key nova").
- Header ausente em write → **400 Bad Request**.

### 9.2. `external_id` (parâmetro opcional do payload em creates)

- Apenas um **identificador externo** armazenado em `ir.model.data` do Odoo.
- Permite ao cliente buscar depois pelo external_id (tool de leitura `<modulo>.<modelo>.get_by_external_id`).
- **NÃO faz upsert.** Se já existe → **409 Conflict**.
- Para atualizar, cliente chama `<modulo>.<modelo>.update` explicitamente.

### 9.3. Storage do `external_id`

- Mecanismo nativo do Odoo: `ir.model.data`.
- Naming convention: `module = "mcp_nexus"`, `name = "mcp_external_<external_id>"`.
- Nunca usa campo custom `x_*` (evita modificar schema do Odoo Tauga).

---

## 10. Reversibilidade e Audit

### 10.1. Estratégia

- **Não há undo automático.** Odoo limita undo de muitas operações (fatura postada, picking validado, NFe autorizada).
- **Toda write grava snapshot completo before + after** em `McpAuditLog`.
- Reconstrução manual sempre possível a partir do audit log.

### 10.2. Conteúdo do snapshot

- **Create:** `before = null`, `after = read(novo_id)` com todos os campos relevantes.
- **Update:** `before = read(id)` antes da chamada, `after = read(id)` depois.
- **Delete:** `before = read(id)` antes do unlink, `after = null`.
- **Transition:** `before` e `after` capturam estado + campos relacionados ao workflow.

### 10.3. Retenção

- `McpAuditLog`: indefinida em produção (decisão futura sobre purge — TBD §22).
- `McpIdempotencyRecord`: 24h (job de cleanup horário).

---

## 11. Cache: Sync Direcionado

### 11.1. Fluxo

1. Tool de write conclui com sucesso no Odoo.
2. Middleware pós-handler enfileira job em Redis (`bullmq` queue `odoo-sync:directed`).
3. Payload do job: `{ model: "res.partner", ids: [1234], operation: "create" | "update" | "delete", snapshot_after?: object }`.
4. Worker processa em <2s:
   - **create/update**: usa `snapshot_after` se presente (otimização — evita round-trip ao Odoo); senão faz `search_read` direcionado.
   - **delete**: remove a(s) linha(s) do cache local.
5. Cache fica consistente com o Odoo em <2s pós-write.

### 11.2. Relacionamentos (FKs)

- Sync direcionado cobre **apenas o modelo principal** da write.
- FKs (city, country, etc) são tabelas de domínio sincronizadas pelo cron full (diário). Mudança nelas é rara o suficiente para o cron pegar.
- Se uma write criar um FK novo (raro — ex: nova cidade criada junto com um partner), o snapshot_after grava esse ID; o próximo cron incremental pega o FK.

### 11.3. Falha do sync direcionado

- Se o worker falhar (Odoo offline, network), o job vai para retry exponencial (BullMQ default).
- Cache fica temporariamente inconsistente. O cron incremental (3min) pegaria de qualquer jeito.
- Alerta operacional se retry estourar (loga em `McpAuditLog` como `sync_failed` na linha da write).

### 11.4. Self-healing (reuso da F4 wave 1)

- O mecanismo `src/worker/recovery.ts` já trata Odoo offline para cron — reusar para sync direcionado.

---

## 12. Erros do Odoo — Classificação e Mapeamento

| Erro Odoo (JSON-RPC fault) | HTTP Status | `error.code` interno | Quando |
|---|---|---|---|
| `AccessError` | 403 | `odoo_access_denied` | User Odoo não tem permissão no modelo |
| `ValidationError` | 422 | `odoo_validation_failed` | Constraint Odoo violada (ex: required, format) |
| `UserError` | 422 | `odoo_business_rule` | Regra de negócio (ex: "não pode confirmar pedido sem cliente") |
| `MissingError` | 404 | `odoo_record_not_found` | Registro `id` não existe |
| `IntegrityError` (DB) | 422 | `odoo_integrity_violation` | Constraint Postgres do Odoo (unique, FK) |
| Timeout / connection refused | 502 | `odoo_unavailable` | Tauga offline ou rede |
| Erro 500 do Odoo | 500 | `odoo_internal_error` | Exceção não tratada do Odoo |

Mensagem do Odoo é preservada em `error.message` para o cliente decidir.

---

## 13. Concurrency e Locking

### 13.1. Problema

Dois clientes alterando o mesmo registro em race. Odoo tem optimistic locking via campo `write_date` mas não é obrigatório usar.

### 13.2. Estratégia

- Tools de `update` aceitam header opcional `If-Unmodified-Since: <ISO8601>` (igual ao padrão HTTP).
- Se enviado: servidor lê `write_date` do registro antes de chamar `write`. Se for posterior ao `If-Unmodified-Since` → **412 Precondition Failed** com o `write_date` atual no body.
- Cliente recebe 412 → decide se relê e tenta de novo.
- Sem o header, comportamento é "last write wins" (default Odoo).

---

## 14. Rate Limit

- **Por chave**, sliding window 60s, default **60 req/min**, máximo configurável **600 req/min**.
- Backend Redis (`mcp:ratelimit:<accessKeyId>:<bucket_60s>`).
- Headers de resposta:
  - `X-RateLimit-Limit: 60`
  - `X-RateLimit-Remaining: 47`
  - `X-RateLimit-Reset: 2026-05-20T15:30:30Z`
- Excedido → **429 Too Many Requests** com `Retry-After`.
- Read e write contam no mesmo bucket (simplicidade; pode evoluir se necessário).

---

## 15. Painel `Integrações → Servidor MCP`

### 15.1. Estrutura de telas

```
Integrações
├── Canais
├── Servidor MCP                       ← NOVO (renomeação + expansão)
│   ├── Visão geral                    (tab default)
│   ├── Chaves de Acesso               (lista + criar/editar/revogar)
│   ├── Logs / Audit                   (timeline de chamadas)
│   └── Documentação                   (interativa)
├── Webhooks
├── API REST                           ← renomeado de "APIs", tag "Em breve" (não-clicável)
└── BI                                 (tag "Em breve" — mantém)

Agente Nex
├── Configurações
├── Histórico / Playground
└── Plugar MCPs                        ← NOVO (vem de Integrações → MCP)
```

### 15.2. Tab "Visão geral"

- **URL pública do MCP:** `https://app.nexus-odoo/<tenant>/mcp` (copy-to-clipboard).
- **Status:** ● Ativo (verde) / ● Offline / ● Degradado.
- **Transport:** Streamable HTTP.
- **Métricas (últimas 24h):** total de chamadas, % de erro, p50/p99 latência, top 5 tools chamadas, top 5 chaves ativas.
- **Versão atual do servidor MCP:** semver + commit hash.

### 15.3. Tab "Chaves de Acesso"

- **Lista:** nome, prefix (mcp_live_aBcD...), capabilities resumo ("CRM + Vendas R/W"), última utilização, status (ativo/expirado/revogado), criada por, criada em.
- **Botão "+ Nova chave":**
  1. Nome obrigatório, descrição opcional.
  2. **Matriz de permissões** — para cada módulo: checkbox para leitura, checkboxes para escrita (Create/Update/Delete/Transition + sensíveis específicas).
  3. Rate limit (slider 1-600/min, default 60).
  4. Expiração opcional (data ou "Nunca").
  5. Gera token → mostra **uma única vez** num modal com cópia (tipo Stripe, AWS).
- **Editar chave:** mesma matriz; mudança publica no Redis pub/sub para hot reload.
- **Rotacionar chave:** gera novo token, marca antigo como revogado em até X horas (grace period).
- **Revogar chave:** confirma, marca `revokedAt` + `revokedReason`; bloqueio imediato.

### 15.4. Tab "Logs / Audit"

- Timeline reversa (mais recente primeiro), paginação infinita.
- Filtros: chave, tool, módulo, ação, status (success/denied/error), faixa de data, busca por idempotency_key/request_id.
- Linha:
  - Timestamp · Chave (prefix) · Tool · Status · Duração · Capability checada.
  - Clique abre painel lateral com payload, snapshot_before, snapshot_after, erro completo.
- Export CSV (para investigações).

### 15.5. Tab "Documentação"

Componente React com renderização rica, **não Markdown estático**:
- **Quickstart** (3 passos: criar chave, exemplo curl, ver no log).
- **Autenticação** (Bearer token, gerar Idempotency-Key, headers obrigatórios/opcionais).
- **Como ler** — catálogo de read tools por módulo, exemplo de input/output, exemplo em (tabs) curl / n8n / Python / JavaScript.
- **Como escrever** — catálogo de write tools por módulo, mesmo formato, com aviso visual em ações sensíveis.
- **Permissões** — explicação da matriz, ações canônicas, ações sensíveis.
- **Idempotência** — como gerar key, comportamento de retry, TTL.
- **External ID** — como usar, comportamento em conflito, lookup por external_id.
- **Erros** — tabela completa de códigos.
- **Rate limits** — explicação, headers, retry recomendado.
- **Changelog do servidor MCP** — versões, novas tools, breaking changes.

Renderização: syntax highlighting (Shiki), tabs por linguagem com cópia, anchors permalinkáveis, busca interna por nome de tool.

### 15.6. Acesso

- Apenas `super_admin` da plataforma vê o submenu Servidor MCP (RBAC interno).
- `admin` regular não vê (decisão a confirmar com cliente; default fechado).

---

## 16. Reorganização do Menu (entregue nesta onda)

### 16.1. Movimentação

- **`Integrações → MCP`** (atual; configura MCPs externos para Nex consumir) → renomear e mover para **`Agente Nex → Plugar MCPs`**.
- **`Integrações → APIs`** → renomear para **`Integrações → API REST`**, aplicar tag "Em breve" estilo BI (não-clicável até existir API REST nossa).
- **`Integrações → Servidor MCP`** → criar novo card conforme §15.

### 16.2. Migração de dados

- Tabela existente `ApiKey` → renomeada para `McpAccessKey` via Prisma migration.
- Chaves existentes (se houver) ganham `capabilities = { version: 1, read: [], write: {} }` e marcação para o super_admin reconfigurar.
- Eventual chave "API REST" (não existe hoje) seria criada em modelo separado quando essa funcionalidade for desenhada.

---

## 17. Discovery — Estratégia

### 17.1. Reuso

- `discovery/` (Python) já mapeou modelos + campos para leitura (F0).
- Esta onda **estende** com descoberta de:
  - **Métodos públicos por modelo** (transitions, actions).
  - **Workflow stages** (`crm.stage`, `sale.order` states, etc).
  - **Constraints e required fields** (`fields_get` já tem; refinar).
  - **Ações sensíveis específicas** (heurística: métodos `action_*`, `_post`, `confirm`, `cancel`, `validate`, `reconcile`).

### 17.2. Output

- `discovery/output/write_paths/<modulo>.json` — listagem de modelos + ações + parâmetros descobertos.
- Consumido na geração de tools (template-driven).

### 17.3. Execução

- Roda manualmente uma vez por módulo no início da onda correspondente.
- Não-automatizado em CI (Tauga pode ter rate limit; rodadas raras).

---

## 18. Ondas de Implementação

> Cada onda = spec própria (ou subseção desta) → plan → execução → testes E2E reais na base de teste → code review + UI review (se aplicável) → merge → próxima onda.

### Onda 0 — Fundação (esta spec foca aqui em detalhe)

**Entregáveis:**
- Schema Prisma novo (`McpAccessKey`, `McpAuditLog`, `McpIdempotencyRecord`) + migration.
- Middleware HTTP completo (auth, idempotency, capability check, rate limit).
- Tool dispatcher com filtro de catálogo por capability.
- Sync direcionado worker.
- Painel `Integrações → Servidor MCP` (Visão geral + Chaves de Acesso + Logs + Documentação base).
- Reorganização do menu (Plugar MCPs no Nex; API REST com "Em breve").
- 1 read tool e 1 write tool de prova-de-conceito (sugestão: `crm.partner.get` + `crm.partner.create`) com testes E2E completos.
- Atualização do CLAUDE.md (decisão canônica #2 revisada).

### Onda 1 — CRM completo

**Entregáveis:**
- Todas as tools de read + write para módulos CRM: `res.partner`, `crm.lead`, `crm.team`, `crm.stage`, `crm.tag`, `crm.lost.reason`, etc.
- Ações canônicas (4) por modelo.
- Discovery de ações específicas do CRM.
- Testes E2E completos em base de teste.

### Onda 2 — Vendas + Estoque

- Vendas: `sale.order`, `sale.order.line`, `sale.report`.
- Estoque: `stock.picking`, `stock.move`, `stock.quant`, `stock.location`, `stock.warehouse`.
- Ações sensíveis (`confirm_order`, `validate_picking`, `apply_inventory`).

### Onda 3 — Financeiro + Compras

- Financeiro: `account.payment`, `account.move`, `account.move.line`, `account.journal`.
- Compras: `purchase.order`, `purchase.order.line`.
- Ações sensíveis (`reconcile`, `pay`, `confirm_purchase`, `receive`).

### Onda 4 — Fiscal

- Módulos OCA brasileiros: `l10n_br_fiscal.document`, `l10n_br_fiscal.document.line`, etc.
- Ações sensíveis (`emit_nfe`, `cancel_nfe`, `inutilize_nfe`).

### Onda 5 — Contábil

- `account.move` (post/unpost), `account.period`, plano de contas.
- Ações sensíveis (`post_journal`, `unpost_journal`, `close_period`).

### Onda 6 — Produção + RH + Projeto

- `mrp.production`, `mrp.bom`, `mrp.workorder`.
- `hr.employee`, `hr.payslip`, `hr.contract`.
- `project.project`, `project.task`.

### Onda 7 — Restantes

- Frota (`fleet.*`), manutenção (`maintenance.*`), e demais módulos ativos no Odoo Tauga descobertos.

### Critério de transição entre ondas

- Todos os testes E2E da onda passam contra `grupojht.teste.tauga.online`.
- Code review e UI review (se houver UI) executados via `/gsd-code-review` e `/gsd-ui-review`.
- Audit log inspecionado: nenhuma write deixou registro `error` não classificado.
- Documentação interativa atualizada com as novas tools.
- Merge da branch em `main`.

---

## 19. Estratégia de Testes E2E

### 19.1. Ambiente

- Base: `grupojht.teste.tauga.online` (configurada via `.env.test`).
- User Odoo dedicado: criado pela Tauga (`api_test` ou similar) com permissões plenas.

### 19.2. Prefixo de teste

- Todo registro criado em testes começa com `[MCP-TEST]` no campo `name` (ou equivalente).
- Cleanup automático em `afterAll` da suite: `unlink` em massa de tudo com esse prefixo.

### 19.3. Cobertura mínima por tool

- **Caminho feliz**: cria/atualiza/deleta com input válido → assert no Odoo via JSON-RPC direto.
- **Capability check**: chave sem capability tenta usar → 403.
- **Validação Zod**: input inválido → 400 com detalhes.
- **Idempotency-Key ausente**: 400.
- **Idempotency-Key repetida (mesmo payload)**: devolve cache sem reexecutar.
- **Idempotency-Key repetida (payload diferente)**: 422.
- **External_id duplicado**: 409.
- **Optimistic locking**: write_date inválido → 412.
- **Erro do Odoo**: handler simula AccessError, ValidationError, etc. → status correto.
- **Sync direcionado**: cache local reflete em <2s pós-write.

### 19.4. Frequência

- Por feature: roda local antes do PR.
- CI: roda inteiro em cada PR contra branch da feature.
- Não roda contra produção. Não roda em loop autônomo (custo na Tauga + risco de poluição).

---

## 20. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Cliente esquece Idempotency-Key e cria duplicatas em retry | Média | Alto | Header obrigatório (400 sem); documentação destaca; exemplo em todas as linguagens |
| Capability mal configurada deixa chave fazer mais do que devia | Baixa | Alto | Hot reload + audit log + alerta operacional em ações sensíveis |
| `tauga_api_post` mudaria comportamento (não usamos aqui, mas pra registro) | N/A | N/A | Não usamos; métodos diretos do Odoo. Decisão registrada. |
| Odoo retorna erro genérico (`UserError` sem código) — mensagem ruim ao cliente | Alta | Médio | Whitelist de mensagens conhecidas + log do raw |
| Sync direcionado falha e cache fica stale | Baixa | Médio | Retry exponencial + fallback ao cron incremental de 3min + alerta |
| Modelo Odoo customizado da Tauga não documentado | Alta | Médio | Discovery itera; testes E2E pegam; tools desconhecidas ficam fora do catálogo |
| Operação irreversível executada por engano (NFe emitida em teste indevida) | Média | Crítico | Ações sensíveis no painel exigem checkbox de confirmação separado ao gerar chave + alerta no audit |
| Token vazado em log/git | Média | Crítico | Token só aparece uma vez (Stripe-style); hash SHA-256 no banco; rotacionar fácil |
| Chave do Agente Nex deletada por engano | Baixa | Alto | `isSystemKey=true` bloqueia delete no painel |
| Multi-tenant cross-leakage (chave do tenant A vê dados do tenant B) | Baixa | Crítico | Tenant scoping injetado em todo handler; integration test cobre |

---

## 21. Critérios de Aceitação (por onda)

### Onda 0 (fundação)

- [ ] Migration Prisma rodada; tabelas novas existem.
- [ ] Endpoint `/api/mcp` aceita Streamable HTTP com Bearer auth.
- [ ] Chamada sem token → 401; com token inválido → 401.
- [ ] Chamada write sem Idempotency-Key → 400.
- [ ] Catálogo (`tools/list`) filtra por capabilities da chave.
- [ ] Capability missing → 403 + audit `denied`.
- [ ] Tool POC `crm.partner.create` funciona contra base de teste.
- [ ] Sync direcionado atualiza cache em <2s.
- [ ] Painel `Integrações → Servidor MCP` renderiza com Visão geral + Chaves + Logs + Documentação base.
- [ ] Reorganização de menu concluída.
- [ ] Testes E2E da fundação passam contra base de teste.
- [ ] `CLAUDE.md` atualizado.

### Ondas 1-7

- [ ] Discovery do módulo executado e validado.
- [ ] Todas as tools (canônicas + sensíveis) implementadas.
- [ ] Schemas Zod completos e documentados.
- [ ] Testes E2E cobrem todos os cenários da §19.3.
- [ ] Documentação interativa do painel atualizada.
- [ ] Code review aprovado.
- [ ] UI review aprovado (se houver UI).
- [ ] Audit log limpo (sem erros não classificados).
- [ ] Merge para `main` sem regressão.

---

## 22. Decisões em Aberto (TBD)

- **Retenção do audit log:** indefinida hoje. Definir política de purge (ex: detalhes >90 dias arquivados; resumo permanece) na onda 1 ou 2.
- **PII/LGPD em audit:** snapshot before/after pode capturar CPF, email, etc. Decidir se há campos sensíveis a mascarar antes da onda fiscal/contábil.
- **Acesso ao painel:** super_admin only por default; confirmar com cliente se admin de tenant deve ver suas próprias chaves.
- **Cobrança/observability:** se em algum momento as chamadas viram cobrança, métricas por chave/módulo já estão no audit — definir como expor.
- **Webhooks de eventos write:** se cliente quiser ser notificado de writes (ex: outra plataforma escutar "criou-se um lead"), webhooks ainda não estão no escopo desta onda.

---

## 23. Próximos Passos (após aprovação da spec)

1. `superpowers:writing-plans` → cria plano de implementação para Onda 0 (fundação).
2. Double-review crítica do plano (CLAUDE.md regra de raiz).
3. Execução em modo autônomo:
   - Onda 0 → testes E2E → review → merge.
   - Onda 1 (CRM) → testes E2E → review → merge.
   - ... até Onda 7.
4. Atualização final do `CLAUDE.md` com a nova decisão canônica #2 ao concluir Onda 0.
5. Documentação interativa do painel viva conforme as ondas adicionam tools.

---

## Anexo A — Mapeamento Rápido `<acao>:<modulo>` → Método Odoo

| Capability | Método Odoo subjacente | Modelo exemplo |
|---|---|---|
| `create:crm` | `res.partner.create(vals)`; `crm.lead.create(vals)` | `res.partner`, `crm.lead` |
| `update:crm` | `model.write(ids, vals)` | qualquer modelo CRM |
| `delete:crm` | `model.unlink(ids)` | qualquer modelo CRM |
| `transition:crm` | `crm.lead.action_set_won()`, write em `stage_id` | `crm.lead` |
| `create:vendas` | `sale.order.create(vals)`; `sale.order.line.create(vals)` | `sale.order` |
| `transition:vendas` (sensível: `confirm_order`) | `sale.order.action_confirm()` | `sale.order` |
| `validate_picking:estoque` | `stock.picking.button_validate()` | `stock.picking` |
| `reconcile:financeiro` | `account.move.line.reconcile()` | `account.move.line` |
| `post_journal:contabil` | `account.move.action_post()` | `account.move` |
| `emit_nfe:fiscal` | `l10n_br_fiscal.document.action_document_send()` | `l10n_br_fiscal.document` |

Discovery confirma e amplia esta tabela por módulo.
