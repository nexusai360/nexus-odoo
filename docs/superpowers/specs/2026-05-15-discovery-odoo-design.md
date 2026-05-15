# F0 — Discovery do Odoo Tauga — Design

> Spec do Sub-projeto F0. Saída do brainstorming. Aprovada em 2026-05-15.
> Branch: `feat/discovery-odoo`.

## 1. Contexto e objetivo

O projeto `nexus-odoo` precisa de um cache local alimentado a partir do ERP
Odoo da Matrix Fitness Group (instância Tauga, `grupojht.tauga.online`). Não há
acesso ao banco de dados — só à API. Os modelos são de uma customização OCA
brasileira; seus campos e relações não são conhecidos de antemão.

**Objetivo do F0:** produzir o mapa do Odoo — versão do servidor, inventário de
modelos, e para os modelos relevantes: campos, tipos, relações, amostras de
dados reais e aptidão para sincronização delta. Esse mapa alimenta o schema do
cache (F2) e o catálogo de tools (F4).

O F0 entrega **documentação e dados de descoberta**. Não entrega código de
aplicação, não cria banco, não tem UI.

## 2. Escopo

**Faz parte do F0:**
- Script(s) Python que conectam ao Odoo via API e extraem metadados.
- Descoberta da versão do Odoo e dos protocolos de API disponíveis.
- Inventário completo dos modelos (censo).
- Mapeamento profundo dos modelos selecionados após checkpoint humano.
- Documentos legíveis + JSONs estruturados como entregável.

**NÃO faz parte do F0:**
- Modelagem do schema Prisma do cache (é F2).
- Worker de sincronização (é F2).
- Qualquer UI ou container.
- Decisão final do protocolo de produção — o F0 apenas coleta a informação
  que embasa essa decisão no checkpoint.

## 3. Arquitetura

Script Python standalone, executado localmente sob demanda, organizado em
etapas. Comunicação com o Odoo via `xmlrpc.client` (biblioteca padrão).

```
ETAPA 0 — Handshake      →  versão do Odoo + protocolos disponíveis + uid
       │
ETAPA A — Censo          →  todos os modelos, contagem, agrupados por área
       │
   CHECKPOINT (humano)   →  revisão do censo; define a lista da Camada 2
       │                    e o protocolo do worker (F2)
       ▼
ETAPA B — Mapa profundo  →  campos, tipos, relações, amostras, aptidão delta
```

As etapas 0 e A rodam juntas; o processo para no checkpoint; a etapa B roda
depois, com a lista de modelos confirmada.

## 4. As etapas

### 4.1 Handshake

- Conecta em `{ODOO_URL}/xmlrpc/2/common`.
- Chama `version()` → captura `server_version`, `server_serie`, `protocol_version`.
- Chama `authenticate(db, user, password, {})` → obtém `uid`. Falha de
  autenticação encerra o processo com mensagem clara.
- Deriva disponibilidade da API JSON/2: `server_serie >= 19.0` indica JSON/2
  disponível. Faz também um probe HTTP real — uma requisição leve a
  `{ODOO_URL}/json/2/` — para confirmar se o endpoint responde, em vez de
  apenas inferir pela versão.
- Verifica se o usuário autenticado tem leitura em `ir.model` e
  `ir.model.fields` — sem isso, o censo não roda; falha cedo com mensagem clara.
- **Saída:** `output/handshake.json` (versão, série, uid, protocolos detectados).

### 4.2 Censo

- Lê o modelo `ir.model` via `search_read`, campos `model`, `name`, `modules`,
  `transient`.
- Para cada modelo **persistente** (não-transient e não-abstract), chama
  `search_count([])` para obter a volumetria. Modelos transient (wizards) e
  abstratos são listados mas não contados — não têm tabela própria.
- Aplica um *throttle* entre chamadas (ver §7) — são 200+ chamadas e o ERP
  está em produção.
- Cada modelo recebe um status de acesso: `ok`, `sem-acesso` (`AccessError`)
  ou `contagem-falhou` (timeout).
- Agrupa os modelos por módulo de origem (campo `modules`) e por prefixo do
  nome técnico, para leitura por área de negócio.
- **Saídas:**
  - `output/censo.json` — todos os modelos com nome técnico, rótulo, módulo,
    tipo (persistente/transient/abstract), status de acesso e contagem.
  - `output/censo.md` — versão legível, agrupada por área de negócio, com um
    resumo no topo: total de modelos, quantos sem acesso, quantos sem contagem.

### 4.3 Checkpoint (humano)

Não é código — é um ponto de revisão do processo. Após o censo:
- Claude apresenta o `censo.md` classificado por área (RH, comissões,
  financeiro, estoque, contratos, empresas, usuários, vendas, fiscal...).
- Define-se em conjunto **a lista de modelos da Camada 2** (Etapa B). A lista
  confirmada é gravada em `discovery/camada2.json` — arquivo versionável que
  serve de entrada para o `mapa_profundo.py` (torna a Etapa B reproduzível).
- Define-se o **protocolo do worker (F2)**: JSON/2 se o Odoo for 19+
  (exige API key da Tauga), ou XML-RPC encapsulado caso contrário.
- Se o censo revelar muitos modelos `sem-acesso`, decide-se aqui se é preciso
  solicitar à Tauga um usuário Odoo com mais permissões antes da Etapa B.

### 4.4 Mapa profundo

Lê a lista de modelos de `discovery/camada2.json`. Para cada modelo:
- `fields_get()` → todos os campos: nome, rótulo, tipo, relação (`relation`),
  obrigatoriedade, somente-leitura, campo calculado.
- Amostra de até 8 registros reais via `search_read`, ordenada pelos **mais
  recentes** (`id desc`) — dados recentes refletem o uso atual do ERP.
- **Campos temporais em destaque:** identifica e sinaliza `create_date`,
  `write_date` e campos de data de negócio (ex.: `data_orcamento`) — são a
  base do polling delta (F2) e dos relatórios temporais (F3/F4).
- **Aptidão para delta:** o `write_date` existe por padrão em modelos
  persistentes; o que importa é se ele é *confiável como cursor*. Faz um
  `search` ordenado por `write_date desc` e confirma que os timestamps são
  coerentes e monotônicos. Veredito por modelo: `apto` / `verificar`.
- **Saídas:**
  - `output/modelos/<modelo>.json` — um arquivo por modelo (campos, campos
    temporais, amostra, veredito de aptidão delta).
  - `output/mapa-profundo.md` — consolidado legível.

## 5. Estrutura de arquivos

```
discovery/
├── README.md            Como configurar e rodar cada etapa, na ordem
├── odoo_client.py       Camada de acesso: conecta, autentica, execute_kw,
│                        timeout, retry com backoff, throttle
├── handshake.py         Etapa 0
├── censo.py             Etapa A
├── mapa_profundo.py     Etapa B (lê camada2.json)
├── camada2.json         Lista de modelos da Camada 2 (gerada no checkpoint;
│                        versionável)
└── output/              gitignored — contém amostras de dados reais e logs
    ├── handshake.json
    ├── censo.json
    ├── censo.md
    ├── modelos/<modelo>.json
    ├── mapa-profundo.md
    └── discovery.log
```

## 6. Decisões técnicas

- **Linguagem:** Python 3.10+. Acesso ao Odoo via `xmlrpc.client` (stdlib).
- **Dependência externa:** apenas `python-dotenv` para ler o `.env.local`.
  Nenhuma outra (sem `pandas`, sem `OdooRPC`). Declarada em
  `discovery/requirements.txt`.
- **Credencial:** lida do `.env.local` na raiz do projeto — `ODOO_URL`,
  `ODOO_DB`, `ODOO_USERNAME`, `ODOO_PASSWORD`. Nunca hardcoded, nunca no chat.
- **Protocolo do F0:** XML-RPC com usuário/senha. Funciona hoje na Tauga
  (provado pelos scripts da VSM). O F0 roda uma vez — não precisa ser à prova
  de futuro; essa preocupação é do worker (F2).
- **Entrada da Etapa B:** `mapa_profundo.py` lê a lista de modelos de
  `discovery/camada2.json` — não recebe argumentos soltos por CLI, para que a
  execução seja reproduzível e auditável.
- **Idempotência:** cada etapa é re-executável; sobrescreve suas saídas.
- **Execução local**, sob demanda. Não é serviço, não vai para container.

## 7. Error handling e carga no ERP

- Timeout de socket por chamada XML-RPC (ex.: 30 s).
- Retry com backoff exponencial em falha de rede (ex.: 3 tentativas).
- **Throttle:** pequena pausa entre chamadas (ex.: 100–200 ms) para não
  sobrecarregar o ERP da Tauga, que está em produção e não é nosso.
- Falha de autenticação no handshake → encerra com mensagem explícita.
- Modelo sem permissão de leitura (`AccessError`) → registrado e pulado; não
  derruba o run. O censo marca esses modelos como `sem-acesso`.
- `search_count`/`search_read` que estoure timeout em modelo muito grande →
  registrado; o modelo entra no censo marcado `contagem-falhou`.
- **Logging:** todas as etapas registram progresso e erros em
  `discovery/output/discovery.log` (além da saída no terminal).

## 8. Segurança

- `discovery/output/` está no `.gitignore` — amostras de dados reais e o
  `handshake.json` nunca vão para o Git.
- `.env.local` nunca é commitado (coberto pelo `.gitignore`).
- A senha real do Odoo é fornecida pelo usuário diretamente no `.env.local`.
- Os entregáveis versionáveis (ver §9) não contêm dados de clientes — apenas
  metadados de estrutura.

## 9. Entregáveis

**Versionáveis (vão para o Git, na branch `feat/discovery-odoo`):**
- `discovery/` — os scripts e o `README.md`.
- `docs/runbooks/discovery-odoo.md` — runbook: como rodar, como interpretar.

**Não-versionáveis (ficam locais, em `discovery/output/`):**
- `handshake.json`, `censo.json`, `censo.md`.
- `modelos/<modelo>.json`, `mapa-profundo.md`.

O conteúdo descoberto será resumido em `docs/runbooks/discovery-odoo.md` de
forma sanitizada (estrutura, sem dados de clientes) para alimentar F2 e F4.

## 10. Critérios de sucesso

O F0 está concluído quando:
1. O handshake retorna a versão do Odoo da Tauga e os protocolos disponíveis.
2. O censo lista todos os modelos não-transient com contagem de registros,
   agrupados por área de negócio.
3. O checkpoint produz a lista confirmada de modelos da Camada 2 e a decisão
   de protocolo do worker.
4. O mapa profundo cobre 100% dos modelos selecionados, com campos, relações,
   amostra e veredito de aptidão para delta de cada um.
5. Nenhuma credencial ou dado de cliente foi commitado.
6. Os scripts são re-executáveis e o runbook permite reproduzir o processo.

## 11. Riscos e dependências externas

- **Permissões do usuário Odoo.** O Discovery só enxerga o que o usuário
  `suporte` pode ler. Se o censo mostrar muitos modelos `sem-acesso`, será
  preciso solicitar à Tauga um usuário com mais permissões — decisão tomada
  no checkpoint (§4.3).
- **Senha real do Odoo.** Dependência do usuário: deve ser preenchida no
  `.env.local` antes da execução. Sem ela, o F0 não roda.
- **API key da Tauga.** Só relevante se o checkpoint optar por JSON/2 para o
  worker (F2) — aí a Tauga precisará gerar uma API key. Não bloqueia o F0.
- **ERP em produção.** O Odoo da Tauga é usado pela operação real. O throttle
  (§7) mitiga, mas a janela de execução do censo deve evitar horário de pico.
