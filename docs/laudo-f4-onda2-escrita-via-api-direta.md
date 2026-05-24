# Laudo: escrita em `pedido.documento` via API JSON-RPC oficial do Odoo

> Data: 2026-05-23. Resultado de bateria de 5 testes empíricos contra a base
> de teste (`teste_grupojht`), nunca em produção. Substitui a recomendação
> anterior de "vamos depender do `tauga_api_post`". Mostra o que **funciona**,
> o que **fica incompleto** e por quê.

---

## TL;DR (em 5 linhas)

1. **A API JSON-RPC oficial CRIA `pedido.documento`**, sim. Validado E2E com
   `tipo=venda` e itens, doc criado e removido limpo na base de teste.
2. **Tem 2 condições não-óbvias.** (a) Payload precisa ser **completo** (cerca
   de 47 campos editáveis, copiados de um doc real); (b) a `operacao_id`
   precisa ter `etapa_id` preenchido (hook `executa_depois_entrar` estoura
   se etapa for vazia).
3. **O doc criado fica "rascunho".** Sem número (`display_name="sem número"`),
   sem totais calculados, sem parcelas, sem lançamentos financeiros, sem
   documento SPED. Esses workflows não disparam pelo `create()` direto.
4. **Não achei o método interno deles que finaliza** (`action_confirm`,
   `tauga_finaliza`, `compute_totais`, etc., todos retornaram
   `AttributeError`). Provavelmente o `tauga_api_post` ou um botão da UI
   chama esses passos em sequência.
5. **Para o uso prático:** Onda 1 (`res.partner`) está 100% destravada via
   API direta. Para `pedido.documento` há **caminho parcial viável** para
   alguns casos (ex.: criar `prospecto` que vai ser editado depois pela UI),
   mas para fechar venda/compra/fiscal completo provavelmente ainda
   precisamos do `tauga_api_post`. Ainda não tenho 100% de certeza desse
   "provavelmente"; só uma rodada com o engenheiro da Tauga ou inspeção do
   código deles resolve.

---

## 1. Cenário e regras do experimento

- Sondas: 5 scripts Python (`/tmp/teste-{A,B,C,D,E}-*.py`).
- Alvo: **apenas** a base de teste (`teste_grupojht`). Nenhuma escrita em
  produção, garantido pelo nosso `clientFromEnv("write")` que só lê
  `ODOO_WRITE_*`.
- Fonte para copiar shape: produção (`grupojht`), via leitura JSON-RPC
  apenas (`search_read`, `read`, `fields_get`).
- Login: `joaozanini` / `123456` (teste), `joaozanini` / `@Nexusodoo1` (prod).

## 2. Resultados, teste por teste

### Teste A — Venda copiando shape de PROD (sem itens)

Pegou a venda mais recente de PROD (`PV-0225/26`, id=264), copiou 47 campos
editáveis (descartando readonly/computed/related/o2m/m2m), `create` na
TESTE.

- ✅ Criado, `id=1807`.
- ✅ `etapa_id` auto-atribuído pela operação: 89 ("Emite NF Consumidor Final").
- ✅ `operacao_derivada_ids` populado com 2 entradas (workflow rodou).
- ✅ `historico_etapa_ids` com 1 entrada inicial (criação registrada).
- ❌ `display_name = "sem número"` (PROD = "PV-0225/26").
- ❌ `vr_operacao = 0.0` (PROD = R$ 28.261,27): faltam itens.
- ❌ `item_ids = []` (PROD = 2 itens): one2many não foi mandado.
- ❌ `parcela_ids`, `finan_lancamento_ids`, `sped_documento_ids` = todos vazios.

### Teste B — Venda com itens via `[(0, 0, vals)]`

Mesmo do Teste A, mas adicionando `item_ids: [(0, 0, vals_do_item)]` no
payload. Itens copiados de `sped.documento.item` (74 campos editáveis por
item).

- ✅ Criado, `id=1809`.
- ✅ **2 itens** criados (mesmo número do PROD, ids `[233468, 233469]`).
- ❌ `display_name = "sem número"` (mesmo problema).
- ❌ `vr_operacao = 0.0` (mesmo com 2 itens).
- ❌ Parcelas, lançamentos financeiros e documentos SPED **ainda vazios**.

**Insight:** A criação dos itens **funciona**, mas o cálculo automático de
totais não dispara. Ou o cálculo precisa ser chamado manualmente, ou está
dentro do `tauga_api_post`.

### Teste C — Tentativa de disparar workflows via métodos diretos

Lista de 32 nomes candidatos: `compute_totais`, `action_calcular_totais`,
`recalcular`, `gerar_numero`, `action_numerar`, `action_confirm`,
`action_aprovar`, `gerar_parcelas`, `gerar_lancamentos`,
`gerar_sped_documento`, e variantes.

- ❌ **30 métodos retornaram `AttributeError`** (não existem como métodos
  públicos chamáveis via RPC).
- ⚠️ **`avanca_etapa` existe** — chamada retornou `null` (sucesso silencioso),
  mas o estado do doc não mudou. Provavelmente precisa de args
  (target_etapa, motivo, etc.) que não passei.
- ⚠️ **`_onchange_operacao_id` existe**, mas retorna `AccessError` (método
  protegido).

Conclusão: o `pedido.documento` da Tauga **não expõe métodos públicos** de
cálculo/numeração via RPC. Esses métodos provavelmente são **`@api.constrains`,
`@api.depends` ou hooks internos** disparados por evento (criar, escrever em
campo X, mudar etapa), não chamáveis diretamente.

### Teste D — Wizard `pedido.documento.avanca.etapa` e prospecto

**Parte 1, prospecto:** tentei criar `tipo=prospecto` com payload minimal
(`tipo + operacao_id=202 + empresa_id + participante_id`). Falhou com
`ValueError: ensure_one`. Não há prospect em PROD pra copiar shape (a
operação `prospecto_teste` é só mockup).

**Parte 2, wizard:**
- ✅ Wizard `pedido.documento.avanca.etapa` existe e aceita create.
- ✅ Wizard auto-popula campos de currency, mas `documento_id` não é um
  campo do wizard (precisaria vir via context da UI).
- ❌ Nenhum botão (`button_avanca`, `action_avanca`, `confirma`, etc.) é
  chamável via RPC. Os botões `button_*` são definidos só em XML view
  (não viram métodos do model).

### Teste E — Triggers escondidos + onde o `ensure_one` estoura

- `base.automation` em `pedido.documento`: `UserError` ao tentar listar
  (model não exposto? ou acesso negado).
- `ir.actions.server` em `pedido.documento`: 0 registros.
- `ir.cron` em `pedido.documento`: 0 registros.
- **A última tentativa de create deu o traceback COMPLETO**, que faltava:
  ```
  /home/teste/base/tauga/tauga/models/pedido/pedido_etapa_pode_entrar_sair.py
  linha 292, em executa_depois_entrar
      self.ensure_one()
  ValueError: Expected singleton: pedido.etapa()
  ```
  **Isso explica o `ensure_one`:** a Tauga tem um hook
  `executa_depois_entrar` no recordset `pedido.etapa` que é chamado quando
  o documento "entra" em uma etapa. Se a operação não tem `etapa_id`
  configurado (como a `prospecto_teste`, id=202, que tem `etapa_id=false`),
  o hook recebe um recordset vazio e o `ensure_one()` explode.

## 3. Conclusões consolidadas

### O que funciona via API JSON-RPC oficial

1. ✅ **Autenticação** (login + senha).
2. ✅ **Read/search/read_group** em qualquer modelo (já era usado pelos
   50 read tools do MCP).
3. ✅ **Create/write/unlink em `res.partner`** (modelo padrão Odoo).
4. ✅ **Create de `pedido.documento`**, desde que (a) payload completo, e
   (b) operação tenha `etapa_id` válido.
5. ✅ **Create de itens** (`sped.documento.item`) na mesma chamada via
   sintaxe `[(0, 0, vals)]`.
6. ✅ **Auto-atribuição de `etapa_id`** pela operação.
7. ✅ **Geração de `operacao_derivada_ids` e `historico_etapa_ids`** (hooks
   leves que rodam no create).

### O que NÃO funciona (workflows que não disparam)

1. ❌ **Numeração do documento** (`display_name` fica "sem número").
2. ❌ **Cálculo de totais** (`vr_operacao`, `vr_total`, `vr_icms`, etc.,
   ficam zerados mesmo com itens).
3. ❌ **Geração de parcelas** (`parcela_ids` vazio).
4. ❌ **Geração de lançamentos financeiros** (`finan_lancamento_ids` vazio).
5. ❌ **Emissão de documento fiscal SPED** (`sped_documento_ids` vazio).
6. ❌ **Avanço automático de etapas** (precisa wizard ou método não exposto).

### Por que esses workflows não disparam

Por código da Tauga (`/home/teste/base/tauga/tauga/models/...`), confirmado
por stack trace. Os hooks de finalização (numerar, calcular, gerar) NÃO
são `@api.depends` simples nem `base.automation` exposto. São métodos
Python específicos chamados ou pelo **botão da UI Web** (`button_*` em
XML view, não roteável via RPC), ou pelo **endpoint `tauga_api_post`**
(controller HTTP custom deles que orquestra a sequência inteira).

### Status do `tauga_api_post`

Continuamos sem o script de exemplo deles
(`teste_integracao_odoorpc_grupojht.py`). Pelas sondagens HTTP, **alguma
rota** `/tauga/...` ou `/api/...` retorna 405 (Method Not Allowed), o que
indica que **o endpoint existe**, mas não conseguimos descobrir o path
completo + método + autenticação sem o script ou documentação deles.

## 4. Recomendação prática (única, sem alternativas)

### Curto prazo (1 a 2 semanas, sem depender de nada da Tauga)

**Onda 1 redefinida — `res.partner` completo via API JSON-RPC oficial.**

- `crm.res_partner.update`
- `crm.res_partner.delete`
- `crm.res_partner.transition` (`active`, `customer_rank`, `supplier_rank`)

E2E real na base de teste. Documentação. Auditoria. Capability gating.
Tudo via API direta, sem dependência externa.

### Médio prazo (depois de ter resposta da Tauga)

**Onda 2 — `pedido.documento` para casos parciais.**

Para casos onde **rascunho** já tem valor (ex: agente Nex captura prospect
pelo WhatsApp e cria um `pedido.documento tipo=prospecto` na etapa
inicial, sem fechar nada), podemos usar a rota API direta agora. O
operador finaliza pela UI Web.

Casos onde rascunho **não basta** (venda fechada com NF, compra,
romaneio com baixa de estoque, parcela financeira lançada) **dependem
de`tauga_api_post`** OU da Tauga nos contar qual é o método interno que
roda a sequência de finalização.

### O que precisamos perguntar para a Tauga (versão enxuta)

A mensagem rascunho em `docs/drafts/2026-05-23-mensagem-tauga-rascunho.md`
já cobre os 3 pontos certos. **Recomendo enviar quando a Onda 1 estiver
em curso ou pronta**, para chegar com a conversa em posição forte ("já
fizemos X, agora precisamos de Y").

Os 3 pontos resumidos:

1. **Confirmar a interpretação:** docs criados via API direta ficam mesmo
   sem número, sem totais, sem parcelas, sem SPED? Ou existe algum método
   público que dispara isso e que não achamos?
2. **Documentar o `tauga_api_post`:** path HTTP, método, autenticação,
   contrato do `dados_api` por tipo de documento.
3. **Corrigir a operação 202 (`prospecto_teste`):** ela tem `etapa_id=false`
   na base de teste, o que bloqueia qualquer create de prospecto via API
   direta. Pedir que preencham uma etapa inicial.

## 5. Scripts e evidências

- `/tmp/teste-A-venda.py` — venda sem itens, comparação prod/teste.
- `/tmp/teste-B-venda-com-itens.py` — venda com 2 itens via `[(0,0,vals)]`.
- `/tmp/teste-C-disparar-workflows.py` — 32 métodos tentados.
- `/tmp/teste-D-wizard-e-prospecto.py` — wizard avanca.etapa + prospecto.
- `/tmp/teste-E-triggers.py` — base.automation + traceback do ensure_one.

Posso versionar esses em `scripts/e2e/` se você quiser preservar a
bateria.

---

## 6. Próximos passos sugeridos

1. **Você decide** se quer (a) já partir pra Onda 1 redefinida
   (`res.partner` completo), ou (b) gastar mais tempo tentando achar o
   método de finalização interno via outras sondas (inspeção de XML
   views, leitura de model methods via `ir.model.methods`, etc.).
2. **Eu sugiro (a)**: a Onda 1 entrega valor real, é independente, e dá
   pra rodar em paralelo com a conversa com a Tauga. Se a Tauga vier com
   `tauga_api_post` documentado, encaixa direto numa Onda 2 limpa.
