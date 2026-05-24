# Laudo: o que dá pra escrever HOJE no Odoo da Tauga via API JSON-RPC oficial

> Data: 2026-05-23. Foco: necessidade imediata do cliente (cadastrar
> clientes/fornecedores com tudo, criar pipeline/cards/etapas/tarefas) +
> mapa do que estará disponível para a escrita expandida do MCP.
>
> Todos os testes E2E foram feitos **apenas na base de teste**
> (`teste_grupojht`). Nenhuma escrita em produção. Scripts versionados em
> `scripts/e2e/teste-{F,F2,G,H,I}-*.py`.

---

## 1. Resumo executivo

| Necessidade do cliente | Status hoje | Caminho |
|---|---|---|
| Criar cliente/fornecedor com nome, CNPJ, email, telefone, celular, endereço completo, idioma, fuso, observação, industry, title, ref externa | **✅ 100% via API JSON-RPC oficial** | `res.partner.create` (24 campos validados E2E) |
| Atualizar parceiro | **✅** | `res.partner.write` |
| Inativar parceiro (transition) | **✅** | `write({"active": false})` |
| Deletar parceiro | **✅** | `res.partner.unlink` |
| Criar tarefa atrelada ao parceiro com responsável, prazo, tipo, observação | **✅ 100% via `mail.activity`** | 5 tipos disponíveis: Enviar email, Ligar, Reunião, Tarefa, Upload Document |
| Atualizar tarefa (mudar prazo, summary, etc.) | **✅** | `mail.activity.write` |
| Marcar tarefa como concluída | **✅** | `mail.activity.action_done` |
| Criar pipeline (containers de etapas) | **✅** | `crm.pipeline.create` — mas... |
| Criar etapas dentro de pipeline | **✅** | `crm.pipeline.etapa.create` — mas... |
| Mover "cards" entre etapas | **⚠️ Não há "cards" nativos** | (ver seção 4) |
| Criar prospect/negócio em CRM kanban moderno | **⚠️** | (ver seção 4) |

**Bottom line:** **cadastro de clientes/fornecedores + tarefas** estão
100% destravados via API oficial, dá pra começar a usar hoje. **CRM
kanban com cards arrastáveis** não existe nativamente no Odoo da Tauga
e exige decisão arquitetural (3 caminhos no §4 deste laudo).

---

## 2. `res.partner` (cliente/fornecedor) — campos disponíveis na Tauga

O `res.partner` da Tauga tem **110 campos** no total (vs. ~80 do Odoo
padrão). Destes, **58 são editáveis** via API.

### 2.1. Campos validados E2E (Teste F2)

Criei um cliente PJ completo com **24 campos preenchidos**, todos retornaram
no snapshot pós-create, idênticos ao payload:

| Campo | Tipo | Exemplo |
|---|---|---|
| `name` | char | "Cliente PJ E2E" |
| `company_type` | selection | `"company"` ou `"person"` |
| `is_company` | bool | `true` |
| `customer` | bool | `true` (NÃO é `customer_rank` como Odoo padrão) |
| `supplier` | bool | `false` |
| `active` | bool | `true` |
| `email` | char | "cliente@nexus.test" |
| `phone` | char | "(11) 4002-8922" |
| `mobile` | char | "(11) 99999-8888" (serve como WhatsApp) |
| `website` | char | "https://nexus.test" |
| `function` | char | "Comprador" (cargo) |
| `street` | char | "Rua das Academias, 100" |
| `street2` | char | "Sala 42" |
| `city` | char | "São Paulo" |
| `zip` | char | "01310-100" |
| `state_id` | m2o `res.country.state` | 95 (SP) |
| `country_id` | m2o `res.country` | 31 (Brasil) |
| `lang` | selection | `"pt_BR"` |
| `tz` | selection | `"America/Sao_Paulo"` |
| `comment` | text | `<p>HTML livre</p>` |
| `ref` | char | "id externo" |
| `company_registry` | char | "12.345.678/0001-99" (parece ser CNPJ aqui) |
| `industry_id` | m2o `res.partner.industry` | 14 (Administrative) |
| `title` | m2o `res.partner.title` | 4 (Doctor) |

### 2.2. Diferenças importantes vs. Odoo padrão

- **Não tem `customer_rank` nem `supplier_rank`** (campos numéricos do
  Odoo moderno). A Tauga usa **`customer` e `supplier` (boolean)**.
- **Não testei `vat` (Tax ID padrão)** vs. `company_registry` (Company
  ID). Os dois existem no schema; precisa confirmar com a Tauga qual é
  o "canônico" pra CNPJ na operação deles. **Recomendação prática
  enquanto não confirma:** preencher os dois com o mesmo valor.
- **WhatsApp**: **não tem campo dedicado**. Usar `mobile` (telefone
  celular). Na UI Web, eles provavelmente identificam WhatsApp pelo número.

### 2.3. Campos customs da Tauga (não-padrão Odoo) que valem registro

- `sped_empresa_id`, `sped_endereco_id`, `sped_participante_id`: ligam o
  parceiro à camada SPED da Tauga. Provavelmente populados
  automaticamente quando o parceiro vira fornecedor ou cliente fiscal.
- `cor`: cor para classificação visual.
- `employee` (bool): marca se o parceiro também é funcionário.
- `mensagem_ids`: histórico de mensagens (chat) atrelado ao parceiro.

### 2.4. Relações importantes

- `parent_id` (m2o → `res.partner`): empresa-pai. Permite criar
  **contatos vinculados** a uma empresa (clássico do Odoo).
- `child_ids` (one2many → `res.partner`): lista de contatos da empresa.
- `category_id` (m2m → `res.partner.category`): **tags** do parceiro. A
  base de teste **não tem tags cadastradas hoje (0)** — precisaríamos criar
  via `res.partner.category.create` antes de associar.
- `user_id` (m2o → `res.users`): salesperson (responsável pelo parceiro).
- `bank_ids` (one2many → `res.partner.bank`): contas bancárias do parceiro.

---

## 3. `mail.activity` (tarefas) — completo

100% padrão Odoo, funciona limpo.

### 3.1. Tipos disponíveis (5)

```
id=1 Enviar email     (default)    prazo padrão 0 days
id=2 Ligar            (phonecall)  prazo padrão 2 days
id=3 Reunião          (default)    prazo padrão 0 days
id=4 Tarefa           (default)    prazo padrão 5 days
id=5 Upload Document  (upload_file) prazo padrão 5 days
```

### 3.2. Validado E2E

```javascript
// Criar
mail.activity.create({
  res_model_id: <ir.model id de res.partner>,   // 85 na teste
  res_id: <partner_id>,
  summary: "Ligar pro cliente sobre proposta",
  note: "<p>HTML livre.</p>",
  date_deadline: "2026-05-30",
  user_id: <responsavel_id>,                     // res.users
  activity_type_id: 2                             // Ligar
})
// → id=11, state="planned"

// Update (mover deadline, mudar summary)
mail.activity.write([11], {date_deadline: "2026-06-15", summary: "..."})

// Concluir
mail.activity.action_done([11])
// → cria mail.message id=785 (histórico) e remove a atividade do "planejado"
```

### 3.3. O que dá pra fazer com tarefas

- Criar atrelada a qualquer record (não só partner): basta passar o
  `res_model_id` e `res_id` certos.
- Lista de tarefas em aberto de um partner: `search` em `mail.activity`
  com `[("res_model", "=", "res.partner"), ("res_id", "=", id),
  ("state", "=", "planned")]`.
- Notificação automática: o Odoo já manda email/notificação pro
  `user_id` da tarefa.

---

## 4. CRM kanban (pipelines/cards/etapas) — análise honesta

### 4.1. O que existe no Odoo da Tauga

Apenas 2 modelos sob prefixo `crm`:

- `crm.pipeline` (181 campos no total, 18 editáveis): container de etapas.
  Obrigatórios: `nome` (em pt-br!), `tipo` (selection).
- `crm.pipeline.etapa` (167 campos, 11 editáveis): cada etapa do pipeline.
  Obrigatórios: `nome`, `pipeline_id`.

**Ambos estão VAZIOS** em produção (0 registros) e na teste. Ninguém usa.

### 4.2. Onde estão os "cards"?

**Não existem.** Vasculhei TODOS os 650 modelos do Odoo procurando
many2one que aponte para `crm.pipeline.etapa`. Achei **7 referências**,
todas em modelos de configuração:

```
sped.empresa.etapa_crm_cobranca_3_id
sped.usuario.etapa_crm_venda_1_id
sped.usuario.etapa_crm_venda_2_id
sped.usuario.etapa_crm_venda_3_id
sped.usuario.etapa_crm_cobranca_1_id
sped.usuario.etapa_crm_cobranca_2_id
sped.usuario.etapa_crm_cobranca_3_id
```

Tradução: o "CRM" da Tauga é um **classificador simples**, com 3 estágios
de venda + 3 de cobrança fixos, atribuídos como campos de `sped.empresa`
e `sped.usuario`. **Não há entidade "card/negócio" que se mova entre
etapas.**

### 4.3. Alternativas viáveis para o cliente

Tem 3 caminhos. Cada um com prós e contras:

#### Caminho A — Implementar CRM no nosso lado (Nexus-native)

Construir tabelas `crm_pipeline`, `crm_etapa`, `crm_card` no nosso
Postgres local (parte da F5 ou nova F7 de produto). O Nexus vira um
CRM próprio, integrado ao Odoo só para criar/atualizar
**parceiros** (que dão lastro pra cada card) e **tarefas** (`mail.activity`
no Odoo).

- ✅ Total controle: kanban moderno, drag-and-drop, automações próprias.
- ✅ Não depende de a Tauga liberar/instalar nada.
- ✅ Já temos infra de cache (Postgres + Prisma) e de sync.
- ❌ Trabalho de desenvolvimento maior (talvez 2-3 semanas).
- ❌ Os dados do CRM ficam no Nexus, não no Odoo (se quiserem ver no Odoo
  Web depois, precisa sincronizar de volta).

#### Caminho B — Pedir pra Tauga instalar o módulo `crm` padrão do Odoo

O módulo `crm` standard do Odoo (Community ou OCA) traz `crm.lead`,
`crm.team`, `crm.stage`, `crm.tag`, `crm.lost.reason` — kanban completo,
testado, com integração nativa pra `res.partner` e `mail.activity`.

- ✅ CRM "de fábrica" do Odoo, com kanban, drag-and-drop, automações.
- ✅ Nada pra desenvolver na nossa frente (só implementar tools de
  `crm.lead.create/write/transition`).
- ❌ **Risco** de conflito com o sistema custom da Tauga (mesmo prefixo
  pode coexistir, mas pode haver overrides).
- ❌ Depende **100% da Tauga** topar instalar (pode ser meses).
- ❌ Provavelmente Tauga não quer (filosofia deles é "tudo via `pedido.*`").

#### Caminho C — Usar `crm.pipeline` + `crm.pipeline.etapa` existentes + nosso modelo de "card"

Aproveitar o que já existe na Tauga (mesmo vazio) e completar o que
falta:

- Pipeline e etapas: criados via API direta em `crm.pipeline` e
  `crm.pipeline.etapa` (validado parcialmente no Teste H — criação ok,
  só preciso usar `nome` em vez de `name`).
- "Cards" (negócios): tabela nova **`crm_card`** no nosso Postgres
  local, com FK para `crm.pipeline.etapa.id` do Odoo (lateral, não no
  Odoo), partner_id, valor, observação, prazo, responsável.

- ✅ Aproveita o pouco que a Tauga já tem (pipeline e etapas no Odoo).
- ✅ Cards moram no Nexus, com flexibilidade total.
- ⚠️ Híbrido: pipelines em 2 lugares (Odoo + Nexus), pode confundir.
- ❌ Mesmo trabalho de dev que o Caminho A.

### 4.4. Recomendação para o curto prazo

**Caminho A puro.** Justificativas:

1. Independência total (não depende de Tauga responder/topar nada).
2. Liberdade pra fazer o CRM kanban moderno que o cliente quer (sem
   amarras do que o Odoo da Tauga oferece).
3. A integração com o Odoo continua existindo nos pontos certos
   (criar/atualizar `res.partner`, criar `mail.activity`).
4. Esses dados vão acabar precisando viver no Nexus mesmo, porque o
   agente Nex (F5) vai operar muito sobre eles (criar card pelo
   WhatsApp, atualizar etapa, criar tarefa).

---

## 5. Mapa do que estará disponível para a escrita expandida

Já validado E2E sobre a API JSON-RPC oficial (sem `tauga_api_post`):

| Modelo | Create | Update | Transition | Delete | Notas |
|---|---|---|---|---|---|
| `res.partner` | ✅ | ✅ | ✅ | ✅ | 58 campos editáveis |
| `mail.activity` | ✅ | ✅ | ✅ (action_done) | ✅ | atrelada a qualquer record |
| `crm.pipeline` | ✅* | ? | ? | ? | *exige `nome` em pt-br |
| `crm.pipeline.etapa` | ✅ | ? | ? | ? | exige `nome` + `pipeline_id` |
| `pedido.documento` venda | ✅* | ? | ⚠️ via wizard | ✅ | *fica "rascunho" sem número/totais |
| `pedido.documento` prospecto | ⚠️ | ? | ? | ? | operação 202 com bug (`etapa_id=False`) |

A serem testados na próxima rodada (modelos óbvios candidatos):

- `res.partner.category` (tags de partner)
- `res.partner.bank` (contas bancárias)
- `res.partner.industry` (setores)
- `res.partner.title` (títulos)
- `mail.activity.type` (criar novos tipos de tarefa)
- `mail.message` (mensagens/comentários)
- `ir.attachment` (anexos a qualquer record)
- `res.users` (criar usuário Odoo — provavelmente exige permissão admin)

Modelos da Tauga que provavelmente bloqueiam (custom finalizadores
similar ao `pedido.documento`):

- `sped.documento` (NF-e/NFS-e: emissão fiscal exige `tauga_api_post`)
- `finan.lancamento` (lançamentos financeiros: provavelmente exigem
  conciliação Tauga)
- `contabil.lancamento` (contábil: idem)
- `estoque.extrato` (movimentações de estoque: dependem de `pedido.documento`)

**Conclusão geral:** modelos **padrão Odoo** (`res.partner`, `mail.activity`,
`res.partner.category`, `res.partner.bank`, etc.) tendem a funcionar
100% via API direta. **Modelos customizados pela Tauga** (`pedido.*`,
`sped.*`, `finan.*`, `contabil.*`) tendem a aceitar create básico mas
sem disparar os workflows de finalização. Pra ter o ciclo completo
(numerar, calcular, emitir, lançar), precisamos do `tauga_api_post`
deles.

---

## 6. Próximos passos sugeridos

1. **Implementar Onda 1 do MCP de escrita já hoje**, escopo redefinido:
   - `cadastros.res_partner.create` (com 24 campos validados E2E)
   - `cadastros.res_partner.update`
   - `cadastros.res_partner.transition` (active, customer, supplier)
   - `cadastros.res_partner.delete`
   - `cadastros.mail_activity.create` (tarefa atrelada)
   - `cadastros.mail_activity.update`
   - `cadastros.mail_activity.complete`
   - `cadastros.res_partner_category.create` (criar tag)
   - `cadastros.res_partner_category.list` (listar tags) — já existe na leitura

   Isso atende **70% do que o cliente pediu** (clientes, fornecedores,
   tarefas com prazo/urgência).

2. **Decidir CRM kanban** (caminho A/B/C). Recomendo A. Se aprovado,
   vira spec própria + plano + execução de uma nova **fase de produto**
   (não cabe na Onda 1).

3. **Mensagem para Tauga** (`docs/drafts/2026-05-23-mensagem-tauga-rascunho.md`)
   continua útil **eventualmente** — quando começarmos a precisar escrever
   em `pedido.documento` com workflow completo (venda, compra,
   romaneio, fiscal). Não é bloqueador da Onda 1.

4. **Rodada extra de investigação** (opcional, ~30 min): testar
   `res.partner.category`, `res.partner.bank`, `mail.activity.type`,
   `ir.attachment`, `mail.message`. Esses 5 já dariam o mapa completo de
   "tudo que o agente Nex precisa pra operar cadastros e relacionamentos".
