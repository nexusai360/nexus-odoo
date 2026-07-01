# 05, Arquitetura-alvo do ERP Nexus

> O desenho de produto: o Odoo como motor fiscal invisível no porão; o Nexus como
> o produto que o cliente vê. A fronteira de rede (JSON-RPC) entre os dois é o que
> mantém a joia proprietária e cumpre o AGPL ao mesmo tempo.

## Princípio central

> **O cliente nunca "usa o Odoo". Ele usa o ERP Nexus (nosso frontend). O Odoo (CE
> + OCA) fica no porão fazendo o trabalho fiscal pesado, falando com o resto só por
> API.**

Isso não é reskin do Odoo (luta perdida contra o framework dele, e que ainda
embutiria o produto no mundo AGPL). É usar o Odoo **headless**, como motor, atrás
do frontend Nexus. É, aliás, exatamente o que o projeto já faz hoje com o cache +
MCP + Nex sobre a Tauga: **a arquitetura-alvo já começou a ser construída.**

## Diagrama de camadas

```
╔══════════════════════════════════════════════════════════════════╗
║   PRODUTO "ERP NEXUS"  (NOSSO, PROPRIETÁRIO, A MARCA)             ║
║                                                                    ║
║  L5  CANAIS / CONVERSAÇÃO                                          ║
║      Chatwoot (fork MIT, pode fechar) + WhatsApp via n8n + Nex     ║
║  ───────────────────────────────────────────────────────────────  ║
║  L4  FRONTEND / PRODUTO   ← a cara Nexus, o layout moderno         ║
║      Next.js: dashboards, relatórios, F6 construtor, telas de      ║
║      operação, agente Nex (chat in-app)                            ║
║  ───────────────────────────────────────────────────────────────  ║
║  L3  CAMADA SEMÂNTICA / MCP   (já construída na F4)                ║
║      MCP TS, tools de negócio, RBAC 7 camadas, Caminho 3          ║
║  ───────────────────────────────────────────────────────────────  ║
║  L2  SYNC / CACHE   (já construída na F2)                          ║
║      Worker BullMQ + Postgres cache (fatos_*) + write tools        ║
╚═══════════════════════════════╤══════════════════════════════════╝
                                 │  ⇅  FRONTEIRA DE REDE (JSON-RPC / API)
                                 │     ← aqui mora a separação legal
╔═══════════════════════════════╪══════════════════════════════════╗
║   MOTOR FISCAL/ERP  (PORÃO, AGPL/LGPL, "de fábrica")             ║
║  L1  Odoo 16 Community (LGPL) + OCA l10n-brazil (AGPL)            ║
║      NF-e / CT-e / MDF-e / NFS-e, SPED, apuração, plano de        ║
║      contas, financeiro/CNAB, estoque, compras/vendas             ║
║      Libs por baixo: nfelib + erpbrasil.edoc (Akretion)          ║
║      Operador fiscal usa o backoffice nativo do Odoo quando       ║
║      precisa de tela fiscal profunda                              ║
╚══════════════════════════════════════════════════════════════════╝
        L0  Infra: Postgres · Redis · Traefik · Docker (já existe)
```

## As camadas em detalhe

### L0, Infra
Containers, Postgres, Redis, Traefik (SSL). Já existe no projeto Nexus.

### L1, Motor fiscal/ERP (porão, AGPL/LGPL)
- **Odoo 16 Community (LGPL) + OCA `l10n-brazil` 16.0 (AGPL).** Mantido o mais "de
  fábrica" possível.
- Faz: emissão de NF-e/CT-e/MDF-e/NFS-e, SPED, apuração fiscal, plano de contas,
  financeiro/CNAB/boletos, estoque, compras/vendas core.
- Libs por baixo: **nfelib (MIT)** para todo XML fiscal, **erpbrasil.edoc** para a
  transmissão à SEFAZ. Ver [06-reuso-repositorios.md](06-reuso-repositorios.md).
- Operadores fiscais/contábeis usam o **backoffice nativo do Odoo** quando precisam
  de telas fiscais profundas (emissão, apuração, SPED). Não vale reconstruir tudo
  isso no Nexus.
- Exposto por **JSON-RPC** (a mesma API que o cache já consome).

### L2, Sync / Cache (nosso, proprietário) , já construída (F2)
- Worker BullMQ + cache Postgres (tabelas `fatos_*`). Lê o Odoo por JSON-RPC
  (incremental + snapshot/reconcile) e mantém o cache atualizado.
- Escrita ao Odoo só via `write tools` (gated por capability). Leitura sempre do
  cache.

### L3, Camada semântica / MCP (nosso, proprietário) , já construída (F4)
- Servidor MCP em TypeScript (`@modelcontextprotocol/sdk`, transporte Streamable
  HTTP). Tools semânticas de negócio, RBAC estrutural em 7 camadas, Caminho 3,
  audit log. Stateless.
- Pode ganhar **tools de dado público externo** (validar CNPJ de fornecedor,
  regime Simples, status SEFAZ), copiadas do `mcp-fiscal-brasil` (MIT). Ver
  [06](06-reuso-repositorios.md).

### L4, Frontend / produto (nosso, proprietário, A MARCA)
- Next.js "ERP Nexus": dashboards, relatórios, construtor F6, telas de operação
  diária que valha a pena reconstruir com a cara Nexus, e o agente Nex (chat
  in-app).
- É o que o cliente vê. É onde vive a diferenciação e a marca.

### L5, Canais / conversação (nosso)
- Fork do Chatwoot (MIT, pode fechar e rebrandear) + WhatsApp via n8n (F5) + Nex.
- **Decisão em aberto:** forkar o Chatwoot (mudar o miolo) vs integrar o Chatwoot
  de prateleira com uma ponte nativa ao Odoo/Nexus. Forkar dá muito mais trabalho
  de manutenção. Só forke se precisar mudar o núcleo; se só precisa que conversem,
  integre.

## A fronteira proprietário x aberto (a regra que define o produto)

| Camada | Licença | Proprietário? | Regra |
|---|---|---|---|
| L4/L5 frontend, Nex, canais | Nossa | **Sim, fechado** | Programa separado, fala por API. Não é obra derivada. |
| L3 MCP | Nossa | **Sim, fechado** | Idem. TS, fora do Odoo. |
| L2 cache/worker | Nossa | **Sim, fechado** | Idem. |
| L1 Odoo core | LGPL | Módulos por cima podem ser fechados | Manter "de fábrica". |
| L1 OCA fiscal | AGPL | Fonte disponível aos usuários | Já é público. Não dói. |
| Módulo Odoo que **herda** AGPL | vira AGPL | Teria que abrir | **EVITAR.** Inteligência vai em L2-L5. |

> **A linha entre L1 e L2 é a fronteira de rede (JSON-RPC).** Tudo de L2 para cima
> é programa separado, proprietário. L1 é AGPL/LGPL (e já público). Ver a
> fundamentação legal em [04-licencas-e-legal.md](04-licencas-e-legal.md), seção 3.

## Multi-tenant (modelo de venda)

Duas opções de isolamento; para fiscal BR, a primeira é a recomendada:

1. **Um motor Odoo por cliente (por grupo/CNPJ):** isolamento fiscal forte (cada
   cliente com seu certificado, apuração e SPED). Mais containers, mais simples de
   auditar e cumprir compliance. O Nexus (L2-L5) fica **multi-tenant por cima**,
   orquestrando vários motores.
2. **Um Odoo multi-company compartilhado:** menos infra, mais risco de vazamento e
   acoplamento fiscal entre clientes. Evitar em fiscal.

## Onde a Akretion e a KMEE entram

- **No L1 (motor fiscal):** contratar um integrador OCA em vez de dominar o fiscal
  sozinho. Akretion para o núcleo fiscal/SPED mais profundo; KMEE para oferta
  estruturada + financeiro/CNAB + o modelo White Label (referência de negócio).
  Usar as libs deles (nfelib, erpbrasil.edoc).
- **No L3 (MCP):** aproveitar o padrão de tools agênticas e o catálogo fiscal
  público do `mcp-fiscal-brasil` (MIT). Ver [06](06-reuso-repositorios.md).

## O impacto no projeto Nexus atual

A arquitetura é **resiliente à troca de motor**: o cache e o MCP leem por API e
apontariam para a instância nova. O que precisa de retrabalho é a **camada de
mapeamento** (`src/worker/fatos/*`), porque os nomes de modelo mudam de
`sped.*`/`finan.*` (Tauga) para `account.*`/`l10n_br_fiscal.*` (OCA). A fundação do
Nexus segue de pé; muda o de-para da ingestão. Ver
[07-roadmap-e-fases.md](07-roadmap-e-fases.md).
