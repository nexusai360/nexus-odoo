# SPEC , Cobertura Cliente: 8 perguntas + raio expandido + honestidade de fonte

> v1 (2026-06-11). Requisitos dados pelo usuário em conversa (verbatim no §1).
> Princípio do usuário: "não quero que ajuste só para responder essas
> perguntas; quero que vá mais a fundo para responder todo o restante" e
> "nunca parecer erro da plataforma quando o dado não existe no sistema".

## 1. Requisitos (do usuário, 2026-06-11)

As 8 perguntas do cliente (nível de detalhe exigido):
1. Faturamento de venda por CNPJ.
2. Faturamento de operações de demonstração e quantidade de NF emitidas por UF.
3. Volume de estoque de produto X.
4. Venda de produto X por empresa e CMV.
5. Quantidade de pedidos emitidos de operação de venda por UF.
6. Segmento com mais orçamentos (Residencial, Condomínio, Hotel, Academia).
7. Valor total de estoque (filtrado por estoques X/Y/Z), apenas físicos.
8. Valor total de estoque em demonstração.

Mais dois requisitos transversais:
- **Raio expandido**: cobrir as perguntas DERIVADAS (mais detalhe, drill-down,
  assuntos vizinhos), não só as 8 literais.
- **Honestidade de fonte**: quando o dado não existe NO SISTEMA (ex.: CRM/
  prospecção sem nada montado, segmento não cadastrado), a resposta deve
  dizer isso ("não há esse dado cadastrado no sistema") , nunca um "não
  consigo te responder" que pareça defeito da plataforma. Sempre jogar a
  limitação para o sistema/dado, com naturalidade.

## 2. Fatos cravados no discovery (banco real, 2026-06-11)

- **Demonstração é dado RICO**: 358 notas com natureza "demonstração"
  (5912/6912, variantes Presumido/Real/Simples + "Entrada , Demonstração"),
  R$ 11.361.895,22 no cache. Locais de estoque "Demonstração" (sintético) e
  "JDS Demo <UF/cidade>" (analíticos) existem.
- **CRM/prospecção: ZERO** , raw_crm_pipeline 0 linhas, fato 0. Módulo
  existe e não é operado (tool crm_status_dominio já reporta isso).
- **Segmento (Residencial/Condomínio/Hotel/Academia): NÃO EXISTE** campo em
  res.partner nem em pedido.documento. É gap de FONTE; viria do CRM
  (prospecção), que está vazio.
- **Locais de estoque**: árvore com raízes "Próprio", "Terceiros", "Virtual";
  campos `tipo` (S=sintético/A=analítico), `nome_completo`, `parent_path`,
  `estoque_em_maos`. "Apenas físicos" = subárvore de Próprio (validar
  vs `estoque_em_maos` na execução).
- **CNPJ**: raw_res_partner NÃO tem `cnpj_cpf`; nome real do campo de
  documento a validar (fato_* de financeiro já expõe documento , a F4 usa).
- **CMV**: produto não tem campo custo no raw (amostra); o custo vive nas
  TABELAS DE PREÇO de custo ("Custo Smart /0,95" etc., fato_preco) , é o que
  a fiscal_margem_aproximada já usa, com ressalva. CMV contábil inexiste
  (contabilidade não operada: raw_contabil_lancamento = 0).
- **UF**: não está na nota; resolve via participante (padrão já usado por
  fiscal_faturamento_por_uf).
- **Pedido**: sem campo operação/natureza na amostra , "pedidos de operação
  de venda" precisa validar se o módulo de pedidos é só venda (provável) ou
  se há proxy (ehCompra em cotações).

## 3. Mapa pergunta → entrega

| # | Estado | Entrega |
|---|---|---|
| 1 | quase | `fiscal_faturamento_por_cliente` ganha o documento (CNPJ) por linha + agrupamento opcional por RAIZ de CNPJ (`agruparPor: "cnpj_raiz"`); resposta exibe CNPJ formatado |
| 2 | tool nova | `fiscal_demonstracoes` , recorte por natureza demonstração: total, nº de notas, POR UF (cruzamento), por empresa, série mensal; remessa vs retorno |
| 3 | pronto | nada (estoque_saldo_produto) |
| 4 | tool nova + ressalva | `fiscal_vendas_produto_por_empresa` (cruzamento produto×empresa: qtde, valor, nº notas) + CMV APROXIMADO opt-in (custo de tabela; ressalva honesta padrão margem); CMV contábil = resposta de fonte (não operado) |
| 5 | quase | validar `comercial_pedidos_por_uf` cobre "operação de venda"; ajustar descrição/trigger |
| 6 | fonte | NADA a construir de tool; resposta de fonte via camada §5 ("segmento não é cadastrado no sistema hoje; viria do módulo de prospecção/CRM, que não tem dados") |
| 7 | extensão | `estoque_valor_armazem` ganha `locais` (lista de nomes/termos) + `apenasFisicos` (subárvore Próprio); resposta nomeia os locais cobertos |
| 8 | extensão | mesma tool da 7: `local: "demonstração"` cobre (locais Demo existem); atalho semântico no trigger ("estoque em demonstração") |

## 4. Raio expandido (inteligência antecipatória)

Para cada tema, derivar perguntas-irmãs e garantir resposta (tool existente,
nova, ou honestidade de fonte). Materializa em: (a) capacidades nas tools
novas (parâmetros que cubram o drill-down), (b) ~30-40 casos novos no golden
com validação real, (c) triggers/embedding.

- **CNPJ/cliente**: por raiz vs filial; "top clientes por CNPJ"; faturamento
  de um CNPJ específico; cliente novo vs recorrente (data 1a compra , avaliar
  custo); inadimplência por CNPJ (já existe via títulos+topPorParticipante).
- **Demonstração**: equipamentos EM demonstração hoje (estoque, local Demo);
  demonstrações por cliente; remessas sem retorno (aging) , validar dado de
  retorno (CFOP de retorno 1912/2912?); conversão demo→venda (se rastreável
  por cliente+produto, senão honestidade).
- **Estoque**: valor por local específico; físico vs virtual vs terceiros;
  em poder de terceiros; por empresa dona; produto X em qual local; estoque
  parado em demonstração.
- **Vendas por produto**: por empresa, por UF, por mês, por marca (existe),
  por família (existe), ticket médio do produto; quantidade vs valor.
- **CMV/margem**: margem por produto/família/empresa (aproximada, ressalva);
  evolução de custo de tabela; honestidade sobre CMV contábil.
- **Pedidos**: por UF (existe), por etapa (existe), por vendedor (existe),
  por segmento (fonte), conversão orçamento→pedido (etapas do funil de
  PEDIDO existem , validar).
- **Prospecção/CRM**: TODA pergunta cai na resposta de fonte enquanto o
  módulo estiver vazio (status_dominio), com a frase honesta padrão.

## 5. Honestidade de fonte (camada transversal)

Taxonomia de resposta quando não dá para responder:
1. **Tool não existe** (gap nosso): registrar_lacuna + respostaSugerida (já é assim).
2. **Módulo existe e está VAZIO/não operado** (CRM, produção, RH, contábil,
   cheques, PIX...): resposta nomeia O SISTEMA: "o módulo de X existe no
   sistema, mas não há dados cadastrados nele até agora". Tools
   *_status_dominio já existem para crm/producao/rh; faltam: prospecção como
   TERMO (rotear "prospecção/oportunidade/funil/lead/segmento" para
   crm_status_dominio via vocabulário/trigger) e contábil (lançamentos).
3. **Campo não cadastrado** (segmento do cliente): resposta diz que o CAMPO
   não é preenchido no sistema hoje e ONDE entraria (CRM/cadastro), ex.:
   "o cadastro de clientes não tem campo de segmento preenchido; essa
   classificação viria do módulo de prospecção, que ainda não é usado".
4. **Período pré-corte**: já entregue (Limpa 2026+ T7).
Regra de prompt: NUNCA "não consigo te responder" seco em gaps de fonte ,
sempre apontar o dado/módulo, sem jargão técnico, sem culpar a plataforma.
AutoValidator: V9 "gap de fonte" (alegou indisponibilidade sem citar a
fonte/módulo => retry) , avaliar custo/benefício na review.

## 6. Critérios de aceite

1. As 8 perguntas LITERAIS do cliente respondidas pelo agente real (E2E) com
   números validados contra SQL ao vivo (kpiOuro nos casos com valor estável).
2. ≥30 perguntas derivadas no golden, todas verdes no benchmark (tool certa)
   ou com resposta de honestidade de fonte correta (classe falta_honesta).
3. Pergunta de segmento/prospecção responde com a frase de fonte (nunca
   parece bug); grep do transcript não contém "não consigo te responder" seco.
4. Benchmark full não regride (≥99% nos prosseguir; kpi-vivo 6/6).
5. tsc + jest verdes; E2E real por tool nova; rebuild mcp + validação bubble.

## 7. Fora de escopo

- Criar campo de segmento no Odoo (decisão do cliente com a Tauga; quando
  existir, a tool entra em horas).
- CMV contábil (fonte não operada).
- Operar o CRM/prospecção (dado do cliente).

## 8. Ondas de entrega

- **Onda A (dado rico, valor imediato)**: #2 demonstrações (tool nova) +
  #7/#8 estoque por local/físico (extensão) + E2E.
- **Onda B (cruzamentos)**: #4 vendas produto×empresa (+CMV aprox.) +
  #1 CNPJ no por_cliente + #5 validação pedidos por UF.
- **Onda C (honestidade de fonte + raio)**: camada §5 (vocabulário
  prospecção→status_dominio, frases de fonte, prompt, V9 se aprovado na
  review) + golden +30-40 derivadas + benchmark full final.
