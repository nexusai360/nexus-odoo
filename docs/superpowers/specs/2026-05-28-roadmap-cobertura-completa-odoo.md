# Roadmap Cobertura Completa do Odoo no Nex, 2026-05-28

> **Referência canônica de longo prazo.** Este documento descreve o destino final
> da cobertura do MCP semântico (F4) e do agente Nex sobre o ERP da Tauga,
> e como vamos chegar lá em sub-projetos com SPEC + PLAN próprios.
>
> Ler junto: `CLAUDE.md`, `STATUS.md`, `docs/discovery/2026-05-28-gap-odoo-mcp.md`.

---

## 1. Norte declarado

**Meta final:** o Nex passa a enxergar e responder sobre **todos os módulos de
negócio relevantes** do Odoo da Tauga, cobrindo o universo dos 652 modelos
catalogados, exceto os que forem comprovadamente "inúteis técnicos" (ver §3).

**Critério de "pronto" da meta:** para qualquer pergunta legítima de negócio
que o Odoo da Matrix Fitness conseguiria responder em tela, o Nex tem caminho
para responder via tool, dado em fato, ou via Caminho 3c (BI livre) com
recurso semântico equivalente. Cobertura medida pela bateria de auditoria
R-X com baseline atual de 95,5%.

**Não está no escopo deste roadmap:** mexer em F5 (WhatsApp), F6 (construtor
de relatórios) nem na Onda 2 da F4 (escrita). Aqui o foco é puramente
**ampliação da camada de leitura semântica**.

---

## 2. Princípios canônicos (não rediscutir sem motivo forte)

P1. **Tudo aditivo, nada destrutivo.** Tools existentes (79 hoje), fatos
existentes (20 hoje) e tabelas raw existentes (114 hoje) ficam intocadas.
Nenhuma onda quebra função do Nex atual.

P2. **Padrão de tool é congelado.** Toda tool nova segue rigorosamente o
padrão das existentes: input Zod curto, query Prisma sempre no fato (jamais
no raw), processamento e agregação em TypeScript, retorno em envelope com
`linhas`, `_RESPOSTA`, `_DESTAQUE`, `_agregado`, `withFreshness`, sanitizer,
testes pareados em `*.test.ts`. Filosofia "mastigar no código e entregar
pronto pro LLM" é inegociável.

P3. **V1-V5 cobre tudo automaticamente.** O validador atual é agnóstico a
tool, observa output final. Adicionar 50 tools novas não exige refazer
validador.

P4. **Qualidade gatilho de promoção.** Nenhuma onda sobe para `main` se a
métrica da rodada R-X correspondente cair abaixo de 95,5% (baseline atual).
Caiu, volta para ajuste antes de merge.

P5. **Uma onda por vez.** Cada onda é um sub-projeto independente: branch
própria, SPEC v1 → v2 → v3, PLAN v1 → v2 → v3, execução, verificação, code
review, merge gated pelo usuário. Não rodar duas ondas em paralelo.

P6. **Router de catálogo é pré-requisito.** Antes da primeira onda real
(O1), o Router de catálogo por embedding (Sub-projeto R1) precisa estar
mergeado, mesmo que em modo shadow. Sem ele, qualquer expansão empurra o
LLM para o teto de seleção de tool.

P7. **Discovery enxuto antes das ondas.** Antes da primeira onda (O1), o
Discovery enxuto (Sub-projeto R2) classifica os 652 modelos em 3 baldes
(§3). As ondas consomem essa classificação.

P8. **Construir Balde B antes da ativação.** Módulos legítimos com 0
registros hoje (ex.: `sped.mdfe`) entram nas ondas mesmo sem dado real,
testados com dado sintético e validados em sandbox. Quando o cliente
ativar no ERP, a capacidade já existe sem espera.

P9. **Reaproveitar embeddings já existentes.** O Router (R1) usa
`src/lib/agent/rag/embed.ts`, não cria infra paralela.

P10. **Nada de UI nova sem `ui-ux-pro-max`.** As ondas são quase 100%
backend. Quando alguma onda exigir UI (ex.: aba de calibragem do Router no
painel admin), a skill `ui-ux-pro-max` é obrigatória.

---

## 3. Classificação dos 652 modelos em 3 baldes

A classificação real é produzida pelo Sub-projeto R2 (Discovery enxuto).
Critérios formais:

### Balde A, Módulos com dado real hoje

Critério: `search_count` via JSON-RPC retorna `> 50` registros na Tauga
(threshold conservador para evitar tabelas de configuração com 1 a 5
linhas), **E** o modelo não é técnico (não cai nos descartes do Balde C).

**Tratamento:** prioridade máxima nas ondas. Cada modelo do Balde A vira
no mínimo uma tool MCP no domínio correspondente. Valor de produto imediato.

### Balde B, Módulos legítimos mas vazios hoje

Critério: `search_count` retorna `0` ou um número muito baixo, **E** o
modelo é parte do fluxo de negócio padrão da Tauga (ex.: `sped.mdfe`,
parte do CRM, alguns submódulos do contábil), **E** não é técnico.

**Sinalização adicional:** o Discovery marca módulos do Balde B com uma
nota de "previsão de ativação" quando houver evidência (ex.: módulo
instalado mas não usado, dependências preenchidas, registros relacionados
em outros modelos).

**Tratamento:** entram nas ondas **antes** de a Matrix ativar. Tools são
construídas, validadas com dado sintético em sandbox da própria Tauga (criar
1 a 3 registros de teste se possível, senão simular via mock) e ficam
prontas. Quando o cliente ativar lá no ERP, a tool já responde sem
trabalho adicional. Cobertura imediata sem atraso de produto.

### Balde C, Inúteis técnicos (descartados do roadmap)

Critério (qualquer um qualifica):
- Modelo `transient = True` no Odoo (wizard temporário, não persiste).
- Nome termina em `.base`, `.metodos`, `.arvore`, `.wizard`, `.modelo.impressao`,
  `.impressao`, `.configuracao` ou `.configuracao.base`.
- Modelo abstrato (herdado por outros, sem dado próprio).
- Pertence a módulos puramente de UI/configuração do Odoo (ex.: `ks_dashboard_ninja`,
  `web_editor`).

**Tratamento:** descartado do roadmap com justificativa registrada no
relatório do Discovery. **Não vira tool, não vira raw, não consome esforço.**

---

## 4. Decomposição em sub-projetos (ordem firme)

```
R1, Router de catálogo (embedding)          [habilitador, sem valor de produto direto]
        │
        ▼
R2, Discovery enxuto (search_count + 3 baldes)   [insumo das ondas]
        │
        ▼
O1, Onda 1: domínio escolhido como piloto    [primeiro valor de produto na esteira nova]
        │
        ▼
O2..ON, Demais ondas dos 5 domínios prioritários
        │
        ▼
ON+1..  , Ondas dos domínios secundários (relatorio.*, wms.*, auditoria.*)
        │
        ▼
META FINAL, cobertura completa do universo relevante
```

### R1, Router de catálogo por embedding

**Por que primeiro:** pré-requisito arquitetural. Sem ele, sair de 79 para
120+ tools degrada a seleção do `gpt-5.4-nano`. Sobe em modo **shadow**
(loga decisão sem filtrar), permite calibragem por 1 a 2 semanas, depois
ativa com flag de admin. Detalhes completos na própria SPEC do R1 (próxima
a ser escrita).

**Dependência:** nenhuma além do que já está em produção (RAG embed).

**Tamanho:** pequeno-médio.

### R2, Discovery enxuto

**Por que vem depois do R1:** R1 é arquitetural e pode rodar em paralelo
com o discovery sem se atrapalhar; ordenamos R2 depois só por convenção
de "uma fase por vez" do método. Produz a lista classificada nos baldes
A, B e C para os 5 domínios prioritários (e estende depois aos
secundários quando chegarmos lá).

**Saída:** arquivo `discovery/odoo-schema/baldes.json` indexado por
domínio e modelo, com `count`, balde e justificativa de classificação.
Relatório legível em `docs/discovery/2026-05-28-baldes.md`.

**Dependência:** acesso JSON-RPC à Tauga (já existe via cliente do
worker).

**Tamanho:** pequeno.

### O1..ON, Ondas de expansão dos 5 domínios prioritários

**Domínios (ordem proposta, ajustável no momento de cada onda):**

| Onda | Domínio | Foco |
|---|---|---|
| O1 (piloto) | **SPED Fiscal** (cobertura complementar) | Onda piloto para validar a esteira nova com Router e Discovery aplicados. Foco no Balde A: notas recebidas (DF-e), código de barras, inscrições estaduais. |
| O2 | **CRM** | Funil, oportunidade, etapa, vendedor, conversão. Balde A se houver, Balde B inteiro (CRM está 0/2 no cache hoje). |
| O3 | **Pedido** | Completar cotação, proposta, follow-up, derivadas. |
| O4 | **Financeiro** | Cobrir os 25 modelos `finan.*` que faltam (cobrança, remessas detalhadas, pagamentos). |
| O5 | **Contábil** | Lançamento, plano de contas, balancete, DRE simplificada. Maior onda, exige input do contador da Matrix antes de codar. |

**Cada onda entrega:**
- `raw_*` para cada modelo novo (migration Prisma + sync no worker).
- `fato_*` derivados (views ou tabelas materializadas, indexados).
- Tools MCP no padrão canônico (P2).
- Testes pareados.
- Atualização do vocabulário do domínio no Router (R1).
- Validação contra bateria R-X correspondente.

**Tamanho médio por onda:** 5 a 10 dias para domínios pequenos a médios, até
2 semanas para Contábil.

### ON+1.., Ondas secundárias

Após cobertura dos 5 prioritários, o roadmap retoma com:
- `relatorio.*` (19 modelos, baixa prioridade até confirmar uso real)
- `wms.*` (6 modelos, só se Matrix usar o WMS do Odoo)
- `auditoria.*` (3 modelos, compliance)
- `producao.*` (4 modelos faltantes, baixo volume)
- Resto dos `sped.*` ainda não cobertos no SPED da O1.

Decisão de seguir ou parar em "5 prioritários cobertos" é do usuário no
momento.

---

## 5. Critérios de qualidade (gatilho de promoção para `main`)

Q1. **Auditoria R-X:** cada onda passa pela bateria de qualidade do Nex
(R24, R25, R26... numeradas automaticamente, ver `CLAUDE.md` §5 decisão 11).
Métrica mínima para merge: **>= 95,5%**.

Q2. **Verificação contra dado real (ou sintético no Balde B):** seguindo a
regra de raiz do `CLAUDE.md` §6, toda onda exerce as tools novas contra o
cache real populado (Balde A) ou contra cenário sintético validado (Balde B).
TS + Lint + Jest **não bastam**.

Q3. **Code review + UI review (se aplicável):** `/gsd-code-review` em toda
onda. `/gsd-ui-review` se a onda tocou UI.

Q4. **Sem degradação de baseline:** o conjunto de perguntas usadas hoje
nas rodadas R8..R23 precisa continuar respondendo com a mesma qualidade
após a onda. Auditoria nessa direção é parte do pacote da onda.

Q5. **Router (R1) shadow mode antes de ativo:** R1 só vira `routerEnabled = true`
após 1 a 2 semanas em shadow com decisões logadas analisadas. Critério de
ativação: top-1 do Router acertou o domínio da tool finalmente chamada em
**>= 90%** dos turnos analisados, OU usuário decide subir manualmente
mesmo com taxa menor.

---

## 6. Como retomar entre sessões

1. **Sessão nova abre:** ler `CLAUDE.md`, este roadmap e `STATUS.md`.
2. `STATUS.md` aponta qual sub-projeto está em curso e em que etapa
(brainstorm, spec v1, spec v2, plan v1, execução, etc.).
3. Cada sub-projeto tem sua pasta em `docs/superpowers/specs/` e
`docs/superpowers/plans/` com versionamento explícito.
4. Branches por sub-projeto: `feat/router-catalogo`, `feat/discovery-enxuto`,
`feat/onda-sped-fiscal-expansao`, `feat/onda-crm`, etc.
5. Multi-agente: respeitar `docs/agents/_README.md`.

---

## 7. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Router (R1) filtra errado e Nex perde precisão | Média | Alto | Shadow mode + janela de calibragem + flag de admin + fallback duro quando score baixo + retry V1-V5 expandindo catálogo (já previsto no design do R1). |
| Balde B construído sem dado real fica desalinhado quando ativar | Média | Médio | Q1: bateria R-X exercita Balde B com cenário sintético; quando dado real chegar, re-validar antes de promover Router para ativo. |
| Catálogo cresce demais (> 200 tools) e degrada nano | Baixa após R1 | Alto | R1 já endereça; se ultrapassar 200 tools sustentado, considerar subir modelo padrão ou Router por tool individual (P9 fica como opção residual). |
| Onda quebra Nex existente | Baixa | Alto | P1 (aditivo) + Q4 (baseline) + V1-V5 + bateria R-X. |
| Esforço explode em Contábil | Alta | Médio | Spec da O5 começa só após reunião com contador da Matrix; sem essa entrada, O5 fica enfileirada e a gente avança nas outras. |
| Tauga muda schema (módulo atualizado) e quebra raw/fato | Baixa | Alto | Discovery (R2) gera snapshot do schema; agendar re-rodada do R2 a cada 3 meses para detectar mudanças cedo. |

---

## 8. Apêndice, Cobertura atual (snapshot 2026-05-28)

Resumo do relatório `docs/discovery/2026-05-28-gap-odoo-mcp.md`:

| Prefixo | Modelos no Odoo | No cache (raw_*) | Cobertura |
|---|---:|---:|---:|
| `sped.*` | 256 | 73 | 28,5% |
| `finan.*` | 44 | 19 | 43,2% |
| `contabil.*` | 29 | 2 | 6,9% |
| `pedido.*` | 26 | 8 | 30,8% |
| `estoque.*` | 16 | 8 | 50,0% |
| `producao.*` | 5 | 1 | 20,0% |
| `crm.*` | 2 | 0 | 0,0% |
| `relatorio.*` | 19 | 0 | 0,0% |
| `auditoria.*` | 3 | 0 | 0,0% |
| `wms.*` | 6 | 0 | 0,0% |

Tools MCP hoje: **79** em 9 domínios. Fatos: **20**. Tabelas raw: **114**.

---

## 9. Próxima ação após este roadmap

Brainstorming retoma para fechar a SPEC do **Sub-projeto R1 (Router de
catálogo por embedding)**. Saída: `docs/superpowers/specs/2026-05-28-router-catalogo-design.md`.
Em seguida: PLAN v1 → v2 → v3 do mesmo sub-projeto.

Tudo abaixo na hierarquia (R2, O1..ON, ON+1..) **é roteiro, não é compromisso
de implementação até o usuário aprovar cada sub-projeto no seu momento**.
