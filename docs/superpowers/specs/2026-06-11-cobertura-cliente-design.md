# SPEC , Cobertura Cliente: 8 perguntas + raio expandido + honestidade de fonte

> **v3** (2026-06-11). v1 + 2 reviews adversariais Opus aplicadas (review #1:
> premissas de dado , 4 BLOCKERs; review #2: arquitetura , 2 BLOCKERs).
> Requisitos verbatim do usuário no §1.
> Princípios: "não ajustar só para responder essas perguntas; ir a fundo para
> responder todo o restante" e "nunca parecer erro da plataforma quando o
> dado não existe no sistema".

## 1. Requisitos (do usuário, 2026-06-11)

As 8 perguntas do cliente:
1. Faturamento de venda por CNPJ.
2. Faturamento de operações de demonstração e quantidade de NF emitidas por UF.
3. Volume de estoque de produto X.
4. Venda de produto X por empresa e CMV.
5. Quantidade de pedidos emitidos de operação de venda por UF.
6. Segmento com mais orçamentos (Residencial, Condomínio, Hotel, Academia).
7. Valor total de estoque (filtrado por estoques X/Y/Z), apenas físicos.
8. Valor total de estoque em demonstração.

Transversais:
- **Raio expandido**: cobrir perguntas DERIVADAS (drill-down, vizinhas).
- **Honestidade de fonte**: gap de dado = "não há esse dado cadastrado no
  sistema", nunca recusa seca que pareça defeito da plataforma.

## 2. Fatos do discovery (CORRIGIDOS pela review #1 contra o banco real)

- **Demonstração (números reproduzíveis):** a fonte da verdade é o **CFOP do
  item** (a natureza da nota é NULL em 5.458/10.037 notas , filtrar por nome
  de natureza perde metade da base). Com `situacao_nfe='autorizada'`
  (obrigatório: há 3.651 notas em digitação na fato):
  remessa **5912/6912 = 173 notas / R$ 14.892.391** (valor de produtos);
  retorno **1913/2913 = 93 notas** (NUNCA 1912/2912). O R$ 11,36mi da v1 era
  SELECT solto no raw com rascunho , descartado.
- **Remessa de demonstração NÃO é receita** , a resposta da tool deve dizer
  isso explicitamente (mercadoria pode retornar; há notas de retorno).
- **Estoque demonstração**: vive na árvore **`Terceiros / Demonstração / ...`**
  (folhas = clientes). Valor atual **R$ 1.855.763,50 (167 saldos)**. Matching
  ancora em `nome_completo ILIKE 'Terceiros / Demonstração%'`, nunca termo
  solto. "Apenas físicos" = subárvore **`Próprio`** = **R$ 37.399.967,01**
  (e corretamente EXCLUI demonstração, que é Terceiros).
- **GRANT: `raw_estoque_local` NÃO tem GRANT para nexus_mcp/nexus_mcp_bi**
  (mesma classe do bug C.0/raw_res_partner). Task obrigatória da onda A.
- **CRM/prospecção: ZERO** (raw e fato 0 linhas; módulo existe, não operado).
- **Segmento**: não há campo estruturado (industry_id 0/7.108; sem campo
  custom). Proxy textual fraco existe nos nomes dos locais de demonstração
  ("Condominio...", "Edificio...") , registrado como derivada com ressalva,
  não como fonte canônica.
- **CNPJ**: campo real é **`vat`**, formato `BR-18.282.961/0001-00`
  (4.813/4.928 empresas preenchido). Agrupar por raiz exige normalização
  (strip `BR-` + máscara; raiz = 8 primeiros dígitos) , função pura com teste.
- **Pedido TEM operação**: `operacao_id` com sufixo parseável ("(venda)");
  mistura venda, produção (montagem kit), inventário, romaneio (inclui
  remessa demonstração), transferência, compra. A pergunta 5 exige **filtro
  de operação venda** em `comercial_pedidos_por_uf` (mudança de filtro, não
  de trigger).
- **CMV**: custo vive nas tabelas de preço de custo (`fato_preco`: `valor`,
  `operacao`, `tabela_nome`, vigência `data_inicial/final`); produto não tem
  custo no raw; contabilidade não operada (CMV contábil inexiste). O CMV
  aproximado exige critério de seleção de tabela + vigência (ver spike S1).
- **UF**: resolve via parceiro (caminho do `fiscal_faturamento_por_uf`;
  ATENÇÃO: o nome real da coluna de UF em fato_parceiro NÃO é literalmente
  "uf" , validar o nome na task, reusar o caminho da tool existente).
- **Orçamentos EXISTEM** (pedido em etapa de orçamento / `fato_cotacao` /
  `raw_pedido_etapa`) , a pergunta 6 é **gap de DIMENSÃO (segmento) sobre
  métrica EXISTENTE (orçamentos)**, não gap de domínio.

## 3. Mapa pergunta → entrega

| # | Estado | Entrega |
|---|---|---|
| 1 | extensão | `fiscal_faturamento_por_cliente`: expõe CNPJ (`vat` normalizado) por linha + `agruparPor: "cnpj_raiz"`; normalização com teste unit |
| 2 | tool nova | `fiscal_demonstracoes` (§4.1): fonte = CFOP item (5912/6912 remessa; 1913/2913 retorno), só autorizadas; `agruparPor: uf\|empresa\|mes` (uma dimensão por chamada , respeita contrato de lista); KPIs full-set (vrRemessa, vrRetorno, nNotasRemessa, nNotasRetorno); ressalva fixa "valor de remessa, não é receita de venda" |
| 3 | pronto | nada |
| 4 | tool nova + spike | `fiscal_vendas_produto_por_empresa` (produto via termo; linhas = empresas, ordenadoPor valor desc, sem paginação , poucas empresas); CMV aproximado GATED pelo spike S1; CMV contábil = honestidade de fonte |
| 5 | extensão | `comercial_pedidos_por_uf` ganha filtro `operacao: "venda"` (parse do sufixo de operacao_id), default mantém comportamento atual; descrição/trigger atualizados |
| 6 | fluxo cravado | Tool de orçamentos responde o N + a resposta EXPLICA o gap de dimensão: "temos N orçamentos no período, mas o cadastro de clientes não tem segmento (Residencial/Hotel...) preenchido; essa classificação viria do cadastro/prospecção, hoje sem dados". Implementação: §5 (gap de dimensão) + caso golden com `esperaNaResposta`. NUNCA rotear a pergunta inteira para crm_status_dominio (esconderia o dado que existe) |
| 7 | extensão | `estoque_valor_armazem` ganha `locais: string[]` (match por nome_completo) + `apenasFisicos: boolean` (subárvore Próprio); exige GRANT raw_estoque_local (B3) |
| 8 | extensão | mesma tool: `local: "demonstração"` ancora em `Terceiros / Demonstração%`; trigger "estoque em demonstração" |

### 4.1 Fronteira e desambiguação (review #2 M1)

- `fiscal_demonstracoes` é a tool **canônica** para QUALQUER recorte de
  demonstração (faturamento/remessa, por UF, retorno, aging). As descrições
  de `fiscal_faturamento_por_operacao` e `fiscal_faturamento_por_uf` ganham
  a frase "para demonstração use fiscal_demonstracoes"; triggers de
  demonstração saem delas.
- `estoque_valor_armazem` segue dona de valor agregado por local;
  `estoque_saldo_produto` segue dona de produto específico (inalterado).

## 4. Raio expandido (derivadas , 32 casos novos no golden)

Mix obrigatório (review #2 m2 + #1 m5): **20 casos tool-certa + 12 casos de
honestidade de fonte** (falta_honesta/gap de dimensão). Temas:
- CNPJ: raiz vs filial; top por CNPJ; faturamento de um CNPJ específico.
- Demonstração: remessas por UF/empresa/mês; retorno; **aging remessa sem
  retorno (pareia 5912/6912 ↔ 1913/2913)**; estoque em demo por cliente
  (folhas da árvore); proxy de segmento textual COM ressalva.
- Estoque: físico vs terceiros vs virtual; por local específico; produto em
  qual local.
- Vendas: produto×empresa; produto por UF/mês; ticket médio de produto.
- CMV/margem: por produto/família/empresa (aproximado com ressalva, se S1
  aprovar); evolução de custo; honestidade sobre CMV contábil.
- Pedidos/orçamentos: por operação de venda por UF; orçamentos no período;
  orçamentos por segmento (gap de dimensão , resposta honesta).
- Prospecção/CRM: leads/funil/oportunidades → status de fonte.

## 5. Honestidade de fonte (camada transversal , mecanismo verificável)

Taxonomia:
1. **Tool não existe** (gap nosso): registrar_lacuna (como hoje).
2. **Módulo vazio/não operado** (CRM, produção, RH, contábil, cheques, PIX):
   resposta nomeia o sistema ("o módulo existe, não há dados cadastrados").
   Vocabulário: "prospecção", "lead", "oportunidade", "funil de prospecção"
   → domínio crm (status_dominio responde).
3. **Gap de DIMENSÃO sobre métrica existente** (segmento de orçamentos):
   responde a métrica que existe + explica a dimensão faltante e onde ela
   seria cadastrada. Regra de prompt nova (curta) + casos golden.
4. **Período pré-corte**: entregue (Limpa 2026+).

**Mecanismos (review #2 B1/M4 , decisão cravada):**
- **Harness**: ab-cerebro passa a avaliar classes != prosseguir via campos
  novos do golden: `esperaNaResposta: string[]` (regex/substring, todas
  devem aparecer) e `proibidoNaResposta: string[]` (nenhuma pode , default
  global: "não consigo te responder", "não foi possível obter"). Amostra
  estratificada passa a incluir falta_honesta quando tiver esses campos.
- **V9 (AutoValidator) FIRME, com disparo restrito**: dispara apenas quando
  a resposta contém padrão de recusa seca (regex local, sem custo LLM) E
  não menciona fonte (sistema|módulo|cadastr|registr|Odoo→"sistema").
  Retry com instrução de citar a fonte. Latência só no caso ruim.
- **Prompt**: regra curta de gap de fonte/dimensão (substitui qualquer
  tentação de "não consigo"); proibido culpar a plataforma.

## 6. Critérios de aceite (v3)

1. As 8 perguntas LITERAIS respondidas pelo agente real (E2E), com kpiOuro
   SQL-vivo onde houver valor estável; números-âncora REPRODUZÍVEIS (a query
   do kpi é a definição).
2. 32 derivadas no golden (20 tool-certa + 12 honestidade), TODAS verdes no
   **benchmark FULL** com o harness estendido (que agora avalia honestidade).
3. Pergunta 6 responde o N de orçamentos E explica o gap de segmento (caso
   golden com esperaNaResposta: ["orçamento", "segmento", "cadastr"]).
4. Benchmark full não regride (≥99% prosseguir; kpi-vivo 6/6).
5. GRANT verificado para TODA tabela nova lida (raw_estoque_local incluso) ,
   teste/registro explícito.
6. tsc + jest verdes; contrato de lista cumprido (allowlist continua vazia);
   E2E real por tool; **rebuild mcp com verificação da DATA da imagem**
   (build da worktree + up da pasta principal); validação na bubble.
7. Ressalva semântica da demonstração presente na resposta da tool (M1).

## 7. Spikes (ANTES da onda B)

- **S1 , cobertura de custo**: % dos produtos VENDIDOS (2026+) com custo de
  tabela vigente. Corte: ≥70% → CMV aproximado entra (com % de cobertura na
  resposta); <70% → CMV vira honestidade de fonte ("custo cadastrado cobre
  só X% das vendas").
- ~~S2 pedido tem operação?~~ RESOLVIDO no discovery: tem (`operacao_id`).

## 8. Fora de escopo

Criar campo segmento no Odoo (cliente+Tauga); CMV contábil; operar CRM.

## 9. Ondas

- **A (dado rico)**: GRANT raw_estoque_local → `fiscal_demonstracoes` →
  extensão `estoque_valor_armazem` (locais/apenasFisicos/demonstração) →
  E2E real + casos golden das 3.
- **B (cruzamentos)**: S1 → `fiscal_vendas_produto_por_empresa` (+CMV se S1
  ok) → CNPJ no por_cliente (normalização testada) → filtro venda no
  pedidos_por_uf → E2E + golden.
- **C (honestidade + raio)**: harness estendido (esperaNaResposta/proibido) →
  V9 → vocabulário prospecção → regra de prompt gap de dimensão → 32 casos →
  benchmark FULL final + relatório.
