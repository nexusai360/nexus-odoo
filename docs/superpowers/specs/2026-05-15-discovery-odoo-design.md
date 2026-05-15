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
  disponível (a confirmação definitiva fica para o checkpoint).
- **Saída:** `output/handshake.json` (versão, série, uid, protocolos inferidos).

### 4.2 Censo

- Lê o modelo `ir.model` via `search_read`, campos `model`, `name`, `modules`,
  `transient`.
- Para cada modelo **não-transient**, chama `search_count([])` para obter a
  volumetria. Modelos transient (wizards) são listados mas não contados.
- Agrupa os modelos por módulo de origem (campo `modules`) e por prefixo do
  nome técnico, para leitura por área de negócio.
- **Saídas:**
  - `output/censo.json` — todos os modelos com nome técnico, rótulo, módulo,
    transient (sim/não), contagem de registros.
  - `output/censo.md` — versão legível, agrupada por área de negócio.

### 4.3 Checkpoint (humano)

Não é código — é um ponto de revisão do processo. Após o censo:
- Claude apresenta o `censo.md` classificado por área (RH, comissões,
  financeiro, estoque, contratos, empresas, usuários, vendas, fiscal...).
- Define-se em conjunto **a lista de modelos da Camada 2** (Etapa B).
- Define-se o **protocolo do worker (F2)**: JSON/2 se o Odoo for 19+
  (exige API key da Tauga), ou XML-RPC encapsulado caso contrário.

### 4.4 Mapa profundo

Para cada modelo selecionado no checkpoint:
- `fields_get()` → todos os campos: nome, rótulo, tipo, relação (`relation`),
  obrigatoriedade, somente-leitura, campo calculado.
- Amostra de até 8 registros reais via `search_read` (campos relevantes).
- **Aptidão para delta:** verifica se `write_date` existe nos campos e se a
  amostra traz valores; tenta um `search` ordenado por `write_date desc` para
  confirmar que o campo é utilizável como cursor de sincronização.
- **Saídas:**
  - `output/modelos/<modelo>.json` — um arquivo por modelo (campos + amostra +
    aptidão delta).
  - `output/mapa-profundo.md` — consolidado legível.

## 5. Estrutura de arquivos

```
discovery/
├── README.md            Como configurar e rodar cada etapa
├── odoo_client.py       Camada de acesso: conecta, autentica, execute_kw,
│                        timeout, retry com backoff
├── handshake.py         Etapa 0
├── censo.py             Etapa A
├── mapa_profundo.py     Etapa B (recebe a lista de modelos)
└── output/              gitignored — contém amostras de dados reais
    ├── handshake.json
    ├── censo.json
    ├── censo.md
    ├── modelos/<modelo>.json
    └── mapa-profundo.md
```

## 6. Decisões técnicas

- **Linguagem:** Python 3. Acesso ao Odoo via `xmlrpc.client` (stdlib).
- **Dependência externa:** apenas `python-dotenv` para ler o `.env.local`.
  Nenhuma outra (sem `pandas`, sem `OdooRPC`).
- **Credencial:** lida do `.env.local` na raiz do projeto — `ODOO_URL`,
  `ODOO_DB`, `ODOO_USERNAME`, `ODOO_PASSWORD`. Nunca hardcoded, nunca no chat.
- **Protocolo do F0:** XML-RPC com usuário/senha. Funciona hoje na Tauga
  (provado pelos scripts da VSM). O F0 roda uma vez — não precisa ser à prova
  de futuro; essa preocupação é do worker (F2).
- **Idempotência:** cada etapa é re-executável; sobrescreve suas saídas.
- **Execução local**, sob demanda. Não é serviço, não vai para container.

## 7. Error handling

- Timeout de socket por chamada XML-RPC (ex.: 30 s).
- Retry com backoff exponencial em falha de rede (ex.: 3 tentativas).
- Falha de autenticação no handshake → encerra com mensagem explícita.
- Modelo sem permissão de leitura (`AccessError`) → registrado em log e pulado;
  não derruba o run. O censo marca esses modelos como "sem acesso".
- `search_count`/`search_read` que estoure timeout em modelo muito grande →
  registrado; o modelo entra no censo sem contagem (marcado "contagem falhou").

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
