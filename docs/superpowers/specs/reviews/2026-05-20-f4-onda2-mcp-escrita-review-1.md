# Review Crítica #1 — F4 Onda 2 (MCP Escrita)

> **Reviewer:** Claude Opus 4.7 (Esta sessão — modo adversarial)
> **Spec alvo:** `docs/superpowers/specs/2026-05-20-f4-onda2-mcp-escrita-design.md` v1
> **Data:** 2026-05-20
> **Postura:** Auditoria adversarial. O objetivo é achar erro, inconsistência, premissa frágil, requisito ambíguo, gap ou coisa esquecida. Se nada material for achado, esta review falhou. Achei material em todas as seções da spec.

## Resumo Executivo

Spec v1 tem boa estrutura macro mas contém:

- **4 bloqueadores externos não-mitigados** que travam a Onda 0 se não forem resolvidos antes.
- **9 contradições internas / inconsistências** entre seções (precisam ser harmonizadas).
- **17 gaps técnicos com impacto direto na implementação** (decisões implícitas, placeholders, fluxos sub-especificados).
- **6 premissas frágeis** sobre o ambiente / protocolo MCP / Odoo que precisam ser confirmadas ou refeitas.
- **5 TBDs em §22 que afetam Onda 0** (não podem esperar — decidir agora).

Conclusão: a v1 **não está pronta** para virar plano. Aplicar os achados desta review produz **v2**. Após a v2, Review #2 vai (provavelmente) achar mais — é o esperado.

---

## A. Bloqueadores externos (4)

São pré-requisitos fora do nosso controle. Sem eles, Onda 0 não inicia.

### A1. Usuário Odoo dedicado na base de teste — não confirmado

**Onde:** §2.3 (Suposições) — "Usuário Odoo dedicado para escrita pode ser criado/configurado pela Tauga ou pelo cliente."

**Problema:** Suposição leve. Sem o user Odoo com permissões plenas em `grupojht.teste.tauga.online`, nenhuma write tool roda. Onda 0 inteira fica em pé de página.

**Correção:** Mover de "Suposição" para "Pré-requisito externo" em seção dedicada. Inclui: nome do user, permissões necessárias (grupo Odoo), método de comunicação da credencial (não-Slack, não-email; via cofre/Portainer). Definir prazo aceitável (3 dias úteis após início). Sem isso, Onda 0 inicia em modo **dry-run** (handlers montam payload, validam, mas não chamam Odoo).

### A2. Acesso confirmado à base `grupojht.teste.tauga.online`

**Onde:** §2.3 — "Base de teste... é espelho funcional da produção e permanece disponível durante a entrega."

**Problema:** "Permanece disponível" é torcida, não acordo. Tauga pode derrubar a base de teste para manutenção ou rebuilds. Onda 0 precisa de SLA mínimo.

**Correção:** Adicionar pré-requisito: confirmação por escrito da Tauga sobre disponibilidade da base durante a entrega (mín. 30 dias), aviso prévio para manutenção, e canal direto (Slack/email/telefone) com a Tauga para reportar indisponibilidade.

### A3. Estado real do PR #9 / F4 Onda 1 em produção

**Onde:** Implícito — spec assume que F4 Onda 1 (leitura, estoque+financeiro) está pelo menos próxima de mergeada.

**Problema:** Status atual: PR #9 foi mergeado nesta sessão (commit `682b9a7`), mas é F5 (WhatsApp + agente + UI) — não F4 Onda 1. A camada de fatos e tools de leitura de estoque/financeiro **não estão prontas** no `main`. A Onda 0 desta spec depende de infra básica do servidor MCP (transport HTTP, catálogo, tool dispatcher) — verificar o que existe HOJE no repositório.

**Correção:** Adicionar §0.5 "Estado atual do servidor MCP" baseado em inspeção real do código em `src/mcp/` (ou onde estiver). Listar o que existe vs o que precisa ser criado. **Sem essa inspeção, a Onda 0 pode estar refazendo trabalho ou pulando uma fundação que não existe.**

### A4. Especificação do protocolo MCP versão alvo

**Onde:** §3.1 (transport "Streamable HTTP") e §6 (body JSON-RPC 2.0).

**Problema:** Spec mistura termos do protocolo MCP sem fixar a versão da spec MCP. O protocolo evoluiu rápido (versões 2024-11-05, 2025-03-26, 2025-06-18). "Streamable HTTP" foi adicionado em 2025-03-26 (substitui SSE+HTTP). A Onda 0 implementa o servidor sem saber qual versão do protocolo está construindo.

**Correção:** Fixar versão de protocolo MCP (recomendado: **`2025-06-18`** — última estável conhecida em 2026-05). Citar a spec oficial (https://modelcontextprotocol.io/specification). Toda decisão de formato (`tools/list`, `tools/call`, content types) deve ser consistente com essa versão. Bibliotecas: `@modelcontextprotocol/sdk` versão compatível.

---

## B. Contradições internas (9)

Duas partes da spec dizendo coisas diferentes — precisam alinhar.

### B1. Servidor MCP: container próprio ou rota Next.js?

**Onde:** §3.1 (texto e diagrama) diz "container 'mcp' (Next.js route /api/mcp)".
**Conflito:** `CLAUDE.md` §3 (arquitetura macro) define `mcp/` como container separado, e §3 também menciona `app/` (Next.js) como container distinto.

**Problema:** Spec mistura: ou o servidor MCP é um container Node.js standalone (com seu próprio entry point) ou é uma route do Next.js do container `app`. São arquiteturas diferentes — implicam Dockerfile diferente, entry point diferente, deploy diferente, scaling diferente.

**Correção:** Decidir explicitamente. Recomendação: **container `mcp` separado**, processo Node.js puro com `@modelcontextprotocol/sdk` (não Next.js), comunicando com Postgres/Redis. Justificativa: isola failures (se o servidor MCP cai, o dashboard continua); permite scaling independente; deploy próprio; e segue a arquitetura macro do `CLAUDE.md` que já tinha planejado isso.

### B2. F2 (ingestão) — "full + incremental + reconcile" vs realidade

**Onde:** §3.2 (texto novo da decisão #2) menciona "cron de sincronização (full + incremental + reconcile)".
**Conflito:** F2 e `src/worker/recovery.ts` falam em **2 ciclos** (incremental 3min e snapshot/reconcile 24h). Não existe "full" separado de "snapshot".

**Correção:** Trocar "(full + incremental + reconcile)" por "(incremental 3min + snapshot/reconcile 24h)" — alinhado com o que existe.

### B3. Onda 0 vs Onda 1 — sobreposição em CRM

**Onde:** §18 Onda 0 sugere "`crm.partner.get` + `crm.partner.create`" como POC; §18 Onda 1 promete "Todas as tools de read + write para módulos CRM".

**Problema:** Limite ambíguo. Se a Onda 0 já entrega `crm.partner.create`, a Onda 1 reimplementa? Ou só adiciona o resto?

**Correção:** Explicitar: Onda 0 entrega `crm.partner.get` + `crm.partner.create` **como POC da fundação**. Onda 1 expande pra completude de CRM (update, delete, transition em partner; tools para lead, team, stage, tag, lost.reason; ações sensíveis). A POC da Onda 0 permanece como "primeira tool de cada tipo".

### B4. `account.move` em duas ondas (Financeiro vs Contábil)

**Onde:** §18 Onda 3 (Financeiro) inclui `account.payment`, `account.move`, `account.move.line`. §18 Onda 5 (Contábil) inclui `account.move` (post/unpost), `account.period`.

**Problema:** `account.move` é o mesmo modelo Odoo. Ações sobre ele em duas ondas = retrabalho ou duplicação.

**Correção:** `account.move` é "modelo contábil que serve ao financeiro". Estratégia: Onda 3 (Financeiro) cuida das tools que **enxergam** `account.move` mas operam só em **campos financeiros** (linhas, conciliação, pagamento). Onda 5 (Contábil) cuida das **transições contábeis** (post/unpost, fechar período). Documentar essa fronteira para evitar conflito.

### B5. Snapshot ≠ resposta do handler — mas exemplo mistura

**Onde:** §5.1 (`WriteTool.handler` retorna `{ id, data: any }`) e §5.5 (handler retorna `{ id: newId, data: mapOdooToOutput(after[0]) }`). §10.2 diz "snapshot é responsabilidade do middleware".

**Problema:** Handler já lê `after` para snapshot. `data` retornado é o mesmo `after` mapeado. Middleware vai usar o `data` como snapshot_after ou vai chamar Odoo de novo? Duplicação ou ambiguidade.

**Correção:** Definir contrato explícito: handler retorna o `data` (output para o cliente). Middleware, no caso de create/update, **reusa o `data` como snapshot_after** sem re-chamar Odoo. No caso de update, middleware faz o snapshot_before **antes** do handler (read pré-write) e usa o retorno do handler como snapshot_after.

### B6. ApiKey → McpAccessKey vs card "API REST"

**Onde:** §15.1 mostra "API REST" como item separado de "Servidor MCP". §16.2 diz "Tabela existente ApiKey → renomeada para McpAccessKey".

**Problema:** Se a única tabela existente vira `McpAccessKey`, o que alimenta o futuro card "API REST"? Se hoje não tem nada, OK. Mas se houver alguma `ApiKey` em uso, sua semântica muda.

**Correção:** Verificar se há `ApiKey` em uso hoje. Se sim, decidir caso a caso (não migrar automaticamente para `McpAccessKey` com `capabilities=vazio` — pode quebrar consumidores). Se vazio, renomear. Documentar a verificação como pré-requisito.

### B7. "Plugar MCPs" no Nex vs Spec da F5

**Onde:** §16 desta spec move "Integrações → MCP" para "Agente Nex → Plugar MCPs".

**Problema:** A F5 (spec `2026-05-18-f5-whatsapp-agente-design.md`) definiu o menu Integrações conforme entregue no PR #9. Mover um submenu **já mergeado** afeta UX que o cliente acabou de aprovar. Spec não cita aprovação explícita da reorganização nem coordenação com F5.

**Correção:** Adicionar nota: "Reorganização aprovada pelo usuário em brainstorm 2026-05-20 (esta spec, §16). Não conflita com F5 porque o card 'MCP' atual em Integrações é o mesmo conteúdo que vira 'Plugar MCPs' no Nex — apenas movido, não reescrito."

### B8. "100% dos write paths" vs "Heurística no discovery"

**Onde:** §1.3 princípio 4 — "Discovery completo. Mapear 100% dos write paths".
**Conflito:** §17.1 — "Heurística: métodos `action_*`, `_post`, `confirm`, `cancel`, `validate`, `reconcile`".

**Problema:** Heurística por padrão de nome não pega 100%. Métodos com nomes não-padronizados (`do_validate`, `process_picking`, `_check_and_post`) escapam.

**Correção:** Substituir "100%" por "cobertura abrangente, com gap conhecido". Estratégia mais honesta: heurística + introspecção (`ir.model.methods` se Odoo expor) + iteração manual conforme uso real revelar gaps. Documentar o gap como conhecido.

### B9. Defesa Camada 5 — "user Odoo de menos privilégio" não é por-chave

**Onde:** §7 — "A chave do MCP autentica no Odoo com um user de menos privilégio. Odoo recusa write em modelos não autorizados (defesa final)."

**Problema:** Há UMA conexão Odoo do servidor MCP (ou um pool), com **um user Odoo**. Toda `McpAccessKey` passa por essa mesma conexão. A Camada 5 protege "o MCP como um todo não passa do escopo do user Odoo", mas não diferencia por `McpAccessKey`. Se o user Odoo tem permissão de delete em `crm.lead`, qualquer chave que passe pela Camada 3 vai conseguir delete via Camada 4 sem barreira na Camada 5.

**Correção:** Reescrever a Camada 5 como "guard-rail global, não diferenciador por chave". Documentar que a defesa por-chave acontece nas Camadas 1, 3, 4. A Camada 5 protege contra bug nosso (ex: dispatcher com bug que permitiria escalada).

---

## C. Gaps técnicos com impacto direto (17)

Decisões implícitas, placeholders ou fluxos sub-especificados que vão emperrar a execução.

### C1. Entropia do token e formato exato

**Onde:** §15.3 "Gera token... mostra uma única vez". §4.1 `tokenHash` = SHA-256(token).

**Gap:** Quantos bits de entropia? Formato exato (`mcp_live_<32hex>`? `<43 chars base64url>`?). Sem isso, vulnerabilidade de força bruta possível.

**Correção:** Definir formato: **`mcp_live_<32 bytes base64url>`** (256 bits de entropia, comprimento ~43 chars). Geração: `crypto.randomBytes(32).toString('base64url')`. Prefix visível: primeiros 8 chars após `mcp_live_`.

### C2. Canonicalização do `payloadHash` para idempotência

**Onde:** §4.1 `McpIdempotencyRecord.payloadHash` = "SHA-256(JSON.stringify(input))".

**Gap:** `JSON.stringify` ordem de chaves é não-determinística entre runtimes/versões. Mesmo input com chaves reordenadas → hashes diferentes → não detecta retry. Pior: detecta abuso falso (mesmo payload com chaves em ordens diferentes vira "payload diferente" → 422).

**Correção:** Usar canonicalização determinística. Recomendação: `json-stable-stringify` (lib NPM) ou implementação inline com `Object.keys(...).sort()` recursivo. Hash = SHA-256(canonical_json(input)).

### C3. Race condition em Idempotency-Key concorrente

**Onde:** §9.1.

**Gap:** Dois requests chegam simultaneamente com mesma Idempotency-Key, antes do primeiro escrever em `McpIdempotencyRecord`. Ambos executam → duplicação que a idempotência deveria evitar.

**Correção:** Lock distribuído. Antes do handler, `SET NX EX 60 mcp:idem:<key>` em Redis. Se setado → segue. Se já existia → 409 Conflict ("operação em andamento, retry em alguns segundos") OU espera o resultado da execução em curso (mais complexo, deixar para iteração).

### C4. `FIELDS_PARTNER`, `mapInputToOdoo`, `mapOdooToOutput` — placeholders

**Onde:** §5.5 (exemplo do handler).

**Gap:** Funções referenciadas sem definição. Vai cada tool ter as suas? Sistema central de mapeamento?

**Correção:** Definir arquitetura de mapeamento. Recomendação: cada tool define **internamente** `FIELDS_<MODEL>` (whitelist de campos) e `mapToOdoo` / `mapFromOdoo` específicos. **Não** criar mapeamento central — cada tool tem semântica própria.

### C5. "Modelo curto" na nomenclatura — convenção não definida

**Onde:** §5.4.

**Gap:** `res.partner` vira `partner`. `crm.lead` vira `lead`. `sale.order` vira `order`. Mas `account.move` vira `move`? `account.payment` vira `payment`? Vão colidir.

**Correção:** Substituir nomenclatura por mais explícita: **`<modulo>.<modelo_completo_underscore>.<ação>`**. Ex: `crm.crm_lead.create`, `vendas.sale_order.confirm`, `financeiro.account_move.post`. Não bonito mas não-ambíguo.

### C6. `transition`: `action_*()` vs write em `state` — guideline ausente

**Onde:** §5.2 (tabela diz "OU").

**Gap:** Qual usar? Cada tool decide? Sem guideline, inconsistências.

**Correção:** Regra: **sempre preferir o método `action_*` quando existe** (dispara workflow, hooks, audit do Odoo). Write direto em `state` só quando não há método (raro). Documentar exceções.

### C7. Conteúdo do snapshot — "campos relevantes" não definido

**Onde:** §10.2.

**Gap:** Gravar TODOS os 80 campos do partner? Só alguns? Sem decisão, audit log explode ou perde informação.

**Correção:** Padronizar: **snapshot grava TODOS os campos retornados pelo método `read` da tool** (ou seja, a whitelist `FIELDS_<MODEL>` definida em C4). Não inclui `__last_update` ou metadados internos do Odoo. Limite de tamanho de campo: truncar valores >10KB com sufixo `...[truncated]`.

### C8. JSON-RPC dentro de MCP — formato de resposta inventado

**Onde:** §6.2 (resposta com `result.ok: true` e `result.data: ...`).

**Gap:** A spec inventou estrutura. O protocolo MCP define que `tools/call` retorna `result.content: Array<{type: "text" | "image" | "resource", ...}>`. Misturar com `ok/data` quebra compatibilidade com clientes MCP padrão (Claude Desktop, n8n MCP node, etc).

**Correção:** Conformar com o protocolo MCP 2025-06-18:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      { "type": "text", "text": "{\"id\":1234,\"name\":\"21 Fitness\",\"external_id\":\"atendimento_8842\"}" }
    ],
    "isError": false,
    "_meta": {
      "request_id": "req_abc123",
      "idempotency_key": "550e8400-...",
      "duration_ms": 412
    }
  }
}
```
Erro vira `result.content` com `type: "text"` + `result.isError: true`, OU JSON-RPC error padrão. Decidir e documentar com referência à spec MCP.

### C9. Streaming progress para writes longas

**Onde:** §3.1 menciona "Streamable HTTP" mas §6 só mostra request/response síncrono.

**Gap:** Algumas writes do Odoo são lentas (NFe pode levar 5-15s na SEFAZ). Streamable HTTP permite enviar `notifications/progress` durante a execução. Spec não usa.

**Correção:** Tools sensíveis lentas (emit_nfe, post_journal em massa) devem usar progress notifications. Definir contrato: `params._meta.progressToken` permite cliente subscrever; servidor emite `notifications/progress` periodicamente. Spec MCP §progress define o formato.

### C10. Erro do Odoo em **português** vs inglês

**Onde:** §12 — "Mensagem do Odoo é preservada em error.message".

**Gap:** Odoo Tauga (l10n_br) retorna mensagens em pt-BR. Cliente n8n pode esperar EN. Sem normalização, mensagens vêm misturadas.

**Correção:** Preservar mensagem do Odoo no campo `error.message` (cru, na língua que vier). Adicionar campo `error.code` próprio nosso (em snake_case ASCII) que cliente pode usar para lógica. Documentar que `message` é human-readable na língua do Odoo.

### C11. Health check do servidor MCP

**Onde:** Implícito em §15.2 ("Status: ● Ativo/Offline/Degradado") mas não definido.

**Gap:** Onde vem o status? Endpoint? Métricas?

**Correção:** Endpoint `GET /api/mcp/health` (sem auth) retornando:
```json
{
  "status": "healthy" | "degraded" | "unhealthy",
  "checks": {
    "postgres": "ok" | "fail",
    "redis": "ok" | "fail",
    "odoo": "ok" | "fail" | "skip",
    "worker_queue_depth": 12
  },
  "version": "0.1.0",
  "commit": "abc1234"
}
```
Painel `Servidor MCP > Visão Geral` chama este endpoint para o "Status".

### C12. Logging operacional (não-audit)

**Onde:** Não mencionado.

**Gap:** Onde vão erros do middleware (panics, exceptions, deploys)? `console.log`? `pino`? Sentry?

**Correção:** Usar a infra de log atual do projeto (verificar — provavelmente `console` ou `pino`). Padronizar formato JSON. Errors fatais → Sentry (se houver) ou stdout estruturado. **Audit log é separado** (DB, via Prisma) e cobre só chamadas; logs operacionais cobrem o resto.

### C13. Documentação interativa: auto-gerada ou manuscrita?

**Onde:** §15.5.

**Gap:** Spec promete documentação rica por tool. Sem decisão sobre origem do conteúdo, ou vira manuscrito (e desatualiza) ou precisa de auto-geração (e não está especificado).

**Correção:** **Auto-gerada do catálogo + supplements opcionais manuscritos.** Cada tool no catálogo tem `description`, `inputSchema`, `outputSchema`, `examples`. A documentação interativa renderiza isso. Para Quickstart, Autenticação, Erros — manuscrito em MDX, versionado.

### C14. Versionamento do protocolo MCP vs versão do servidor

**Onde:** §15.2 ("Versão atual do servidor MCP: semver + commit hash").

**Gap:** Versão do nosso servidor (semver `0.1.0`) é uma coisa; versão do protocolo MCP (`2025-06-18`) é outra. Cliente precisa saber as duas.

**Correção:** Header de resposta `X-MCP-Server-Version: 0.1.0` e endpoint `/api/mcp/health` retorna `protocol_version: "2025-06-18"`. Quando mudar o protocolo, breaking change documentado no changelog.

### C15. Tenant scoping

**Onde:** §15.2 ("URL pública: `https://app.nexus-odoo/<tenant>/mcp`") aparece mas §15.1 não detalha; §4.1 (McpAccessKey) não tem `tenantId`.

**Gap:** A plataforma é multi-tenant (vide F5/PR #9 que tem `tenant_id` no usuário). Cada `McpAccessKey` precisa ser amarrada a um tenant.

**Correção:** Adicionar `tenantId String` em `McpAccessKey` com `@@index([tenantId, active])`. O middleware extrai tenant do path (`/<tenant>/mcp`) e valida que `accessKey.tenantId === tenantOnPath`. Tools recebem `ctx.tenantId` e usam para scoping em queries Odoo (`company_id` no Odoo).

### C16. Recovery de chave perdida (não copiou no momento)

**Onde:** §15.3.

**Gap:** Cliente cria chave, fecha modal sem copiar. Chave vira inacessível mas existe no DB. Sem fluxo de recovery → painel polui.

**Correção:** Botão "Marcar como não-utilizada e regenerar" — revoga atual (`revokedAt = now()`, `revokedReason = "token_lost_in_creation"`) e cria nova. Auditável.

### C17. Cron `incremental` vs sync direcionado — race condition

**Onde:** §11.1 (sync direcionado em <2s) + §11.4 (recovery reuso) + fato que o cron incremental roda a cada 3min.

**Gap:** Sync direcionado escreve `partner_id=1234` no cache às 15:30:00. Cron incremental disparado às 15:30:01 também busca esse partner (mudou no Odoo recentemente, dentro da janela). Os dois workers podem escrever no mesmo registro simultaneamente. Sem coordenação → corrida.

**Correção:** Lock pessimista no Postgres (`SELECT FOR UPDATE`) ou no Redis (`SET NX` em `mcp:sync:<model>:<id>`) para coordenar escritas no cache. Documentar que o último write vence (com timestamp do Odoo).

---

## D. Premissas frágeis (6)

Suposições que podem estar erradas e quebrar a base.

### D1. "JSON-RPC do Odoo é estável" (F0 validou leitura)

**Onde:** §2.3.

**Problema:** F0 validou **leitura** de modelos padrão. Writes em modelos customizados (l10n_br_fiscal, scripts Tauga) podem expor bugs do JSON-RPC que não apareceram em reads. Em particular: writes que disparam callbacks Python customizados podem retornar `null` ou crashes JSON-RPC.

**Correção:** Adicionar fase de "validação JSON-RPC de write" no início da Onda 0: testar `create` + `write` + `unlink` em 3 modelos diferentes (1 padrão, 1 OCA, 1 customizado Tauga) antes de assumir estabilidade.

### D2. Tauga vai dar usuário Odoo com permissões plenas

**Onde:** §2.3.

**Problema:** Tauga pode oferecer só user limitado (sem `unlink` em modelos contábeis, por exemplo) por motivo de segurança da própria Tauga. Spec assume "permissões plenas" sem confirmar.

**Correção:** Pedir explicitamente à Tauga lista das permissões do user que vão dar. Se vier limitado, o catálogo de tools precisa ser ajustado (não criar `delete:contabil` se o user Odoo não pode).

### D3. `ir.model.data` aceita `module = mcp_nexus` arbitrário

**Onde:** §9.3.

**Problema:** `ir.model.data.name` é unique dentro de `(module, name)`. Se a Tauga já tem um módulo `mcp_nexus` interno (improvável mas possível), conflito.

**Correção:** Pré-Onda 0: verificar se `module = mcp_nexus` está livre no Odoo da Tauga. Se ocupado, escolher outro (`mcp_nexus_external`, `nexus360`, etc).

### D4. Streamable HTTP do MCP é suportado pelo `@modelcontextprotocol/sdk` atual

**Onde:** §3.1.

**Problema:** O SDK pode estar em versão que ainda usa transport antigo (SSE). Sem verificar versão atual do SDK e sua compatibilidade com 2025-06-18, build vai surpreender.

**Correção:** Pré-Onda 0: rodar `npm view @modelcontextprotocol/sdk versions` e checar a documentação do transport disponível. Fixar versão exata no `package.json`.

### D5. Multi-canal sem custo na entropia da chave

**Onde:** Brainstorm decidiu "Idempotency-Key obrigatória; deve funcionar para múltiplos canais".

**Problema:** Cada canal (n8n, Make, scripts) gera UUIDs próprios. Se um canal usa UUID v4 e outro usa hash determinístico do payload, podem colidir entre canais. Improvável mas não-zero.

**Correção:** Documentar que `Idempotency-Key` é único **por chave de acesso** (não global). DB constraint `(accessKeyId, key)` ao invés de só `(key)`. Atualizar §4.1 `McpIdempotencyRecord` para usar key composto.

### D6. PR #9 já mergeado não conflita com reorganização do menu

**Onde:** §16.

**Problema:** O PR #9 acabou de adicionar 6 cards em Integrações (Canais, MCP, Webhooks, APIs, BI, e talvez outros). Mover um e renomear outro é mudança visível pro cliente que **acabou de aprovar** a UI atual. Sem checagem com ele.

**Correção:** Esta mudança JÁ foi aprovada por ele no brainstorm desta sessão (resposta às perguntas 8 e seguinte). Documentar a aprovação explicitamente na §16 da spec com data e contexto.

---

## E. TBDs de §22 que precisam virar decisão na Onda 0 (5)

### E1. PII/LGPD em audit log

**Por quê não pode esperar:** Onda 0 já implementa `McpAuditLog` com `payload` e `snapshotBefore/After`. CPF, email, telefone vão entrar **na primeira chamada**. Sem decisão, expõe dados sensíveis sem controle.

**Decisão proposta para Onda 0:** Audit log NÃO criptografa por padrão (já está em DB com criptografia em repouso). Campos de máscara: nenhum por default. Política de retenção: 90 dias para `payload` e `snapshotBefore/After` (após isso, mantém só metadados — `toolName`, `status`, `httpStatus`, `durationMs`); padrão configurável. LGPD revisão completa na Onda 4 (Fiscal) ou em fase dedicada.

### E2. Acesso ao painel

**Por quê não pode esperar:** Onda 0 já constrói o painel `Integrações → Servidor MCP`. RBAC precisa ser definido.

**Decisão proposta:** Apenas **`super_admin`** vê o submenu na Onda 0. Quando demanda surgir, expandir para admin com permissão explícita. Default fechado.

### E3. Retenção do audit log

**Por quê não pode esperar:** Audit log vai crescer rápido (cada chamada = uma linha + 2 JSONs grandes). Sem política, DB explode.

**Decisão proposta:** Cleanup job diário (1h da manhã, BullMQ). Após **90 dias**: `payload`, `snapshotBefore`, `snapshotAfter`, `result` → NULL. Metadados (`toolName`, `status`, etc) permanecem. Após **2 anos**: linha completa apagada. Configurável por variável de ambiente.

### E4. Webhooks de eventos write (push notifications)

**Por quê não pode esperar:** Cliente pode pedir na Onda 1 ("quando criar lead, dispara webhook pra Y"). Sem decisão arquitetural na Onda 0, vai virar retrofit.

**Decisão proposta:** Fora do escopo da Onda 0 (confirma TBD), MAS reservar campo `eventName` no `McpAuditLog` desde já para futuro export → webhook. Cada write emite um event name padronizado (`crm.partner.created`, `crm.lead.transitioned`). Sem consumidor por enquanto, mas a "boca" do barramento já existe.

### E5. Cobrança/observability

**Pode esperar:** Métricas já estão no audit log. Painel "Visão geral" expõe agregados. Cobrança por chamada vira tema futuro.

**Decisão:** Confirmar TBD; sem ação agora.

---

## F. Ação consolidada — o que precisa entrar na v2

### F.1. Mudanças estruturais (alta prioridade)

- **§0.5 Estado atual do servidor MCP**: nova seção, baseada em inspeção do repo (o que existe hoje em `src/mcp/` ou onde quer que esteja).
- **§2.3 → Pré-requisitos externos**: separar suposições (frágeis) de pré-requisitos (bloqueadores) — listar A1-A4.
- **§3.1 Decidir container**: MCP é container Node.js próprio (não Next.js). Justificar.
- **§4.1 `McpAccessKey`**: adicionar `tenantId`; índice composto para auth.
- **§4.1 `McpIdempotencyRecord`**: key composto `(accessKeyId, key)`; canonicalização do payloadHash.
- **§5.4 Nomenclatura**: trocar para `<modulo>.<modelo_completo_underscore>.<ação>`.
- **§5.5 Handler**: definir contrato com o middleware (B5).
- **§6.2/6.3 Formato de resposta**: conformar com MCP 2025-06-18 (`content[]` + `isError`).
- **§7 Camada 5**: reescrever como guard-rail global, não diferenciador.
- **§9.1 Idempotência**: lock distribuído Redis pra concorrência.
- **§11.1 Sync direcionado**: lock pessimista vs cron incremental.

### F.2. Decisões de Onda 0 (de TBD para decidido)

- E1 PII/LGPD: política de retenção 90d/2a para payloads sensíveis.
- E2 Acesso ao painel: super_admin only.
- E3 Retenção do audit log: cleanup diário, parâmetros default.
- E4 Webhook events: fora de escopo + reservar `eventName` no schema.

### F.3. Esclarecimentos / harmonizações

- §18 Onda 0 vs Onda 1: explicitar fronteira (B3).
- §18 Onda 3 vs Onda 5 (`account.move`): explicitar fronteira (B4).
- §1.3 princípio 4 / §17.1: "100%" → "cobertura abrangente" (B8).
- §3.2 Texto novo da decisão #2: ciclos corretos da F2 (B2).
- §16 Reorganização: documentar aprovação explícita (B7/D6).

### F.4. Adições

- **§24 (nova) — Critérios de Saída da Onda 0**: lista detalhada amarrada à §19.3 (cenários de teste).
- **§25 (nova) — Versão do protocolo MCP alvo**: `2025-06-18`, com referência à spec.
- **§26 (nova) — Health check**: contrato do endpoint `/api/mcp/health`.
- **§27 (nova) — Cenários de teste E2E expandidos**: incluir burst com mesma key, revogação durante chamada, Tauga offline (D1 valida).

### F.5. Não-mudanças (manter)

- Estrutura macro de 7 ondas — boa.
- Modelo de capability `<acao>:<modulo>` com 4 canônicas + sensíveis — alinhado com brainstorm.
- Idempotency-Key obrigatória + external_id sem upsert — alinhado.
- Snapshot before/after no audit — boa.
- Defesa em profundidade 7 camadas — boa estrutura (ajustar texto da Camada 5).
- Princípio "Agente Nex nunca escreve" pela credencial — excelente.
- Reorganização do menu (Plugar MCPs no Nex; API REST em breve) — aprovado.

---

## G. Pronto para v2

Aplicar todos os achados acima na spec → produzir **v2**. A v2 entra na Review #2, que será **ainda mais crítica e profunda** sobre os pontos refeitos, procurando o que ainda escapou.

**Achados materiais nesta review:** 4 bloqueadores + 9 contradições + 17 gaps + 6 premissas frágeis + 5 TBDs urgentes = **41 itens acionáveis.**
