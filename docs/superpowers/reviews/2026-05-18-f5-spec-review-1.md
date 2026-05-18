# F5 — Review adversarial da SPEC v1 → achados para a v2

> Review #1 (de 2). Auditoria crítica da `2026-05-18-f5-whatsapp-agente-spec.md` v1.
> Critério: achar erro, lacuna, premissa frágil, ambiguidade. Não é carimbo.

## Achados materiais

**A1 — Conversão de schema de tool MCP → schema do provedor LLM (LACUNA).**
A v1 diz "o orquestrador pede o catálogo de tools ao MCP e executa cada tool
call". Mas o MCP devolve tools no **formato MCP** (`inputSchema` JSON Schema); a
camada de provedores do Nex espera `NEX_TOOLS` no formato de cada provedor
(`mapTools` por adapter). Falta uma etapa explícita: **adaptador
`mcpToolsToProviderTools()`** que converte o catálogo MCP para o JSON Schema que
`mapTools` consome. Sem isso o loop não fecha. Adicionar à §4.5.

**A2 — Caminho 3c precisa de schema das fact tables no prompt (LACUNA).**
A v1 diz "o agente gera o SQL". Para gerar SQL válido o LLM precisa conhecer as
tabelas `fato_*`, colunas e tipos. A v1 não diz de onde vem esse schema. Decidir:
(a) injetar um DDL resumido das fact tables no system prompt quando o usuário é
admin/super_admin; (b) ou expor uma tool MCP `bi_schema` que lista o schema. A
F4 tem `bi_consulta_avancada` — verificar se a F4 já expõe o schema. Resolver na
v2: a v2 deve checar o catálogo da F4 e definir a fonte do schema.

**A3 — Relação entre API keys da plataforma e o `MCP_SERVICE_TOKEN` (AMBÍGUO).**
§7.3.2 (Integrações→MCP) e §7.3.4 (Integrações→API) se sobrepõem. O node Agent
do n8n conecta **direto** no servidor MCP via Streamable HTTP — ele usa o
**service token do MCP**, não uma API key da plataforma. Então: para que servem
as API keys da plataforma? A v2 precisa definir claramente:
- O n8n→MCP usa o `MCP_SERVICE_TOKEN` (gerido em Integrações→MCP).
- As API keys da plataforma (Integrações→API) autenticam o **webhook receptor**
  e/ou um futuro consumo de API da plataforma. Se não há consumidor real nesta
  fase, a tela de API keys vira CRUD básico + placeholder de uso, e o webhook
  receptor usa **HMAC** (já definido), não API key. Eliminar a sobreposição.

**A4 — runAgent não carrega histórico da conversa (LACUNA).**
§4.3 diz "persiste a mensagem do usuário e a resposta". Mas para o WhatsApp ser
conversacional o orquestrador precisa **carregar as mensagens anteriores** da
`Conversation` ativa e passá-las como contexto. A v1 não diz isso explicitamente.
Adicionar: `runAgent` recebe um `conversationId`, carrega as últimas N mensagens
(budget de tokens), e as inclui no array `ChatMessage[]`.

**A5 — Streaming × loop de tool calling (SUBESPECIFICADO).**
§8.1 promete streaming SSE, mas o loop de tool calling roda inteiro no servidor
antes da resposta final. Não dá para "streamar tokens" durante as iterações de
tool. A v2 deve especificar: durante o loop, emitir **eventos de status** ("Nex
consultando estoque…"); só o **turno final** do assistente é streamado token a
token (se o provedor suportar stream — exige adicionar `stream:true` aos
adapters, que hoje não têm). Se o esforço de streaming real for alto, a v2 pode
rebaixar para "resposta em bloco com indicador de progresso por tool" e deixar
streaming token-a-token como melhoria — decidir explicitamente, não prometer
vago.

**A6 — Áudio de WhatsApp exige download de mídia da Graph API (LACUNA).**
§4.7/§6.1 mencionam áudio no WhatsApp. Uma nota de voz chega como **media ID**;
é preciso baixar o binário da Graph API (com as credenciais Meta) antes de
transcrever. A v1 só porta o `transcribe.ts` (que assume bytes em mãos). A v2
deve incluir o passo de download de mídia no fluxo inbound, ou marcar áudio de
WhatsApp como fora do escopo da F5 (áudio só no chat in-app). Decidir.

**A7 — Quem pode usar o chat in-app? (LACUNA DE RBAC).**
A v1 define RBAC de consumo, playground e Integrações, mas não diz quem acessa
**o chat**. A v2 deve afirmar: o chat in-app está disponível a **todo usuário
autenticado**; o MCP aplica o RBAC por tool (catálogo filtrado por `userId`), de
modo que um `viewer` simplesmente vê menos tools. Não recriar RBAC no agente.

**A8 — Rate limiting do endpoint receptor (LACUNA DE SEGURANÇA).**
`POST /inbound` é endpoint externo. Mesmo com HMAC, precisa de rate limit (anti
abuso/replay). A v2 deve adicionar rate limit (reusar `mcp/lib/rate-limit.ts`
como referência) e janela de validade do timestamp na assinatura HMAC (rejeitar
assinaturas antigas → anti-replay).

**A9 — `ProcessedWhatsappMessage` cresce sem limite (FRÁGIL).**
Tabela de idempotência sem retenção. Adicionar: limpeza periódica (registros >
7 dias) — um job no worker, ou índice por `processedAt` + delete agendado.

**A10 — Worker precisa do código do agente (PREMISSA NÃO DECLARADA).**
A onda 4 roda o agente numa fila BullMQ no container `worker`. O `worker`
precisa importar `src/lib/agent/*` (orquestrador, providers, cliente MCP) e ter
as envs `MCP_URL`/`MCP_SERVICE_TOKEN`. A v2 deve declarar essa dependência e
confirmar que o build do `worker` inclui `src/lib/agent`.

**A11 — `src/lib/encryption` pode não existir (PREMISSA NÃO VERIFICADA).**
A v1 assume `src/lib/encryption` da F1. Verificar; se não existir, portar de
`nexus-insights`. A v2 confirma.

**A12 — pgvector exige imagem Postgres com a extensão (RISCO DE DEPLOY).**
A v1 cita en passant. Elevar a item firme: a imagem atual do `docker-compose`
provavelmente é `postgres:N` puro. Trocar para `pgvector/pgvector:pgN` (ou
instalar a extensão). `CREATE EXTENSION` exige role com privilégio. A v2 fixa a
imagem e o passo de deploy.

**A13 — 33 tools no prompt de tool calling (CUSTO).** Enviar 33 tool definitions
em toda chamada infla o prompt. Aceitável com Claude, mas a v2 deve registrar a
decisão (não filtrar; confiar no catálogo já reduzido por RBAC — um viewer vê
menos que 33).

**A14 — Agrupamento de conversa de WhatsApp (Q7 ainda aberto).** A v2 deve
fechar: nova `Conversation` após 24h de silêncio do mesmo usuário; senão,
anexa à conversa aberta.

## Itens menores
- Geração de `title` da `Conversation`: derivar da 1ª pergunta (truncada) ou via
  LLM barato — decidir na v2 (proposta: truncar a 1ª mensagem).
- `.env.example` precisa listar todas as envs novas — garantir no plano.

## Veredito
A v1 tem espinha correta e cobre o escopo, mas tem **lacunas de integração**
(A1, A2, A4) que quebrariam a execução, **ambiguidade de produto** (A3) e
**lacunas de segurança** (A8, A9). A v2 deve resolver A1–A14 e fechar Q1–Q7.
