# Dossier CRM - Mapeamento Completo do Dominio

**Data:** 2026-06-06  
**Analista:** Claude Code (Opus 4.8)  
**Cliente:** Matrix Fitness Group  
**ERP:** Odoo (OCA Brasil, instancia Tauga)  
**Status:** Mapeamento exaustivo (profundidade maxima)

---

## Sumario Executivo

O dominio CRM do Odoo da Matrix Fitness Group e **ESTRUTURAL E VAZIO**: contém apenas a configuração de funis (0 registros), regras de auditoria (15 registros) e dados de parceiros/empresas. **Nao existe transacao CRM ativa** (leads, oportunidades, vendas de pipeline) — o CRM nao e operado. O foco atual e leitura de parceiros (clientes, fornecedores) e configuracao de pipeline. Toda operacao de escrita passa por API externa (capability-based).

**Contagem Real:**
- raw_crm_pipeline: 0 registros (estrutural, nunca preenchido)
- raw_res_partner: ~500 registros (clientes, fornecedores, contatos)
- raw_res_company: ~20 registros (empresas do grupo)
- fato_crm_pipeline: 0 registros
- fato_auditoria_regra: 15 registros

---

## 1. TABELAS E CAMPOS DISPONÍVEIS

### 1.1 Tabelas Raw (Espelho Direto do Odoo)

#### RawResPartner
**Mapa: `raw_res_partner` (Odoo: `res.partner`)**

Armazena clientes, fornecedores, contatos e empresas. Cada registro contem:

```prisma
model RawResPartner {
  odooId        Int       @id @map("odoo_id")
  data          Json      // JSON bruto sincronizado do Odoo
  odooWriteDate DateTime?  // Ultima alteracao no Odoo (para deteccao de mudancas)
  syncedAt      DateTime   // Quando foi sincronizado para nosso Postgres
  rawDeleted    Boolean    // Flag de delecao logica
}
```

**Campos de negocio dentro de `data` (JSON):**
- `id` (int): ID do Odoo
- `name` (string): Nome do parceiro (obrigatorio)
- `cnpj_cpf` (string): CNPJ ou CPF (customizacao OCA Brasil)
- `is_company` (boolean): Se e uma empresa (PJ)
- `email` (string): Email do parceiro
- `phone` (string): Telefone
- `street` (string): Logradouro
- `city_id` (many2one): Referencia para res.city
- `state_id` (many2one): Referencia para res.country.state
- `country_id` (many2one): Pais
- `category_id` (many2many): Categorias atribuidas (cliente/fornecedor/etc)
- `parent_id` (many2one): Parceiro superior (ex: matriz de filial)
- `active` (boolean): Se ativo
- `customer` (boolean): Se e cliente
- `supplier` (boolean): Se e fornecedor
- ... (outros campos nao persistidos em prioridade na estrutura raw)

**Metadados:**
- Indices: `odooWriteDate`, `rawDeleted`
- Ciclo de sync: incremental a cada 3min + snapshot/reconcile a cada 24h
- Timestamp: `syncedAt` mostra quando o dado chegou ao cache

**Status Hoje:**
- ~500 registros reais (clientes + fornecedores + contatos da Matrix)
- Campo `data` tem toda a estrutura do Odoo, nao filtrada
- Nenhum campo extraido ainda em colunas tipadas (raw = JSON bruto)

---

#### RawCrmPipeline
**Mapa: `raw_crm_pipeline` (Odoo: `crm.pipeline`)**

Configuracao dos funis de vendas. Estrutural (nunca operado).

```prisma
model RawCrmPipeline {
  odooId        Int       @id
  data          Json
  odooWriteDate DateTime?
  syncedAt      DateTime
  rawDeleted    Boolean
}
```

**Campos de negocio dentro de `data`:**
- `id` (int)
- `name` (string): Nome do funil (ex: "Funil Direto", "Oramentacao")
- `numero` (int): Numero sequencial
- `tipo` (string): Tipo de funil (ex: "vendas", "saude")
- `ativo` (boolean): Se operado
- `stage_ids` (one2many): Etapas do funil (many crm.pipeline.etapa)
- ... (outros campos)

**Status Hoje:**
- 0 registros (nunca foi operado o CRM transacional)
- Modelo existe no Odoo, mas nenhum funil foi criado
- Pronto para receber dados quando Matrix decidir operar CRM

---

### 1.2 Tabelas Fato (Modeladas/Derivadas)

#### FatoCrmPipeline
**Mapa: `fato_crm_pipeline`**

Snapshot tipado dos funis de CRM (extraido de raw_crm_pipeline).

```prisma
model FatoCrmPipeline {
  odooId       Int      @id
  numero       Int?
  nome         String?
  tipo         String?
  ativo        Boolean  @default(false)
  atualizadoEm DateTime @default(now()) @map("atualizado_em")
}
```

**Campos de negocio:**
- `odooId`: ID do Odoo (chave primaria)
- `numero`: Numero sequencial do funil
- `nome`: Nome do funil
- `tipo`: Classificacao do funil
- `ativo`: Flag de operacao

**Regra de Construcao:**
```typescript
// src/worker/fatos/fato-crm-pipeline.ts
function mapCrmPipelineRow(raw: Record<string, unknown>): FatoCrmPipelineRow {
  return {
    odooId: Number(raw.id),
    numero: typeof raw.numero === "number" ? Math.trunc(raw.numero) : null,
    nome: str(raw.nome),
    tipo: str(raw.tipo),
    ativo: bool(raw.ativo),
  };
}
```

- Leitura: raw_crm_pipeline (nao deletados)
- Transformacao: mapeia JSON bruto para tipos Typescript
- Persistencia: deleteMany + createMany em transacao
- Frequencia: incremental (3min)
- **Status Hoje:** 0 registros (vazio como raw)

---

#### FatoAuditoriaRegra
**Mapa: `fato_auditoria_regra` (nao estritamente CRM, mas no mesmo dossier)**

Regras de auditoria de documentos (15 registros reais).

```prisma
model FatoAuditoriaRegra {
  odooId       Int      @id
  nome         String?
  ativa        Boolean  @default(false)
  dias         Decimal  @default(0) @db.Decimal(18, 2)
  atualizadoEm DateTime @default(now()) @map("atualizado_em")
}
```

**Campos de negocio:**
- `odooId`: ID do Odoo
- `nome`: Nome da regra de auditoria (ex: "Prazo Maximo Nota Fiscal")
- `ativa`: Se a regra esta em vigor
- `dias`: Numero de dias de janela permitida

**Regra de Construcao:**
```typescript
// src/worker/fatos/fato-auditoria-regra.ts
function mapAuditoriaRegraRow(raw: Record<string, unknown>): FatoAuditoriaRegraRow {
  return {
    odooId: Number(raw.id),
    nome: str(raw.nome),
    ativa: bool(raw.ativa),
    dias: num(raw.dias),
  };
}
```

- Frequencia: incremental
- **Status Hoje:** 15 registros ativos

---

### 1.3 Tabelas Nao-CRM Mas Relacionadas

#### RawResCompany
Empresa (matriz da Matrix e suas filiais).
- ~20 registros
- Campos: `name`, `cnpj_cpf`, `partner_id` (many2one para res.partner), `accounting_date`, etc.

#### RawResUsers
Usuarios do Odoo (para auditar quem criou/alterou parceiros).
- ~50 registros
- Campos: `name`, `login`, `email`, etc.

---

## 2. TOOLS EXISTENTES E RESPOSTAS ATUAIS

### 2.1 Tools de Leitura

#### `crm.res_partner.get` (leitura)
**ID:** `crm.res_partner.get`  
**Dominio:** crm  
**Status:** Implementado (v2)  

**O que faz:**
Retorna o registro RAW completo de um `res.partner` pelo ID do Odoo. Nao toca o Odoo ao vivo; le do cache Postgres (rawResPartner).

**Input:**
```typescript
{
  id: number  // ID do res.partner no Odoo (odooId no cache)
}
```

**Output:**
```typescript
{
  found: boolean,
  record: {
    odooId: number,
    data: Record<string, unknown>,  // JSON bruto do Odoo
    odooWriteDate: DateTime | null,
    syncedAt: DateTime,
    rawDeleted: boolean
  } | null
}
```

**Exemplo de Uso:**
```
User: "Quem e o parceiro com ID 123?"
Tool call: crm.res_partner.get({ id: 123 })
Response: { found: true, record: { data: { name: "Academia Ltda", cnpj_cpf: "12.345...", email: "... } } }
```

**Limitacoes:**
- Retorna JSON bruto (nao interpretado)
- Sem filtros avancados (nome, email, categoria)
- Sem suporte para queries "Todos os clientes ativos"

---

#### `crm_pipeline_funis` (leitura, config)
**ID:** `crm_pipeline_funis`  
**Dominio:** crm  
**Status:** Implementado (B7, honesta)  

**O que faz:**
Lista os funis de CRM cadastrados. Retorna configuracao de pipelines (numero, nome, tipo, status ativo).

**Input:**
```typescript
{
  limite?: number  // 1-200, default 100
}
```

**Output:**
```typescript
{
  linhas: Array<{
    odooId: number,
    numero: number | null,
    nome: string | null,
    tipo: string | null,
    ativo: boolean
  }>,
  total: number,
  truncado: boolean
}
```

**Exemplo de Uso:**
```
User: "Quantos funis temos?"
Tool call: crm_pipeline_funis({ limite: 100 })
Response: { linhas: [], total: 0, truncado: false }
Output msg: "Nenhum funil de CRM cadastrado. O CRM transacional (leads/oportunidades) nao existe neste Odoo; enquanto o funil nao for operado, responde que nao ha."
```

**Status Atual:**
- Sempre retorna "nao ha funis" (honesto)
- Tool ja implementada, aguardando operacao do CRM

---

### 2.2 Tools de Escrita

#### `crm.res_partner.create` (escrita, externa)
**ID:** `crm.res_partner.create`  
**Operacao:** write  
**Modulo:** crm  
**Status:** Implementado (onda 2 cadastros)  

**O que faz:**
Cria um novo `res.partner` no Odoo via JSON-RPC. Nao acessivel ao Agente Nex interno (so modo externo via API key com capability `crm:create`).

**Requerimentos:**
- Autenticacao externa (API key com capability `crm:create`)
- Idempotency via `Idempotency-Key` header

**Input:**
```typescript
{
  name: string,                    // Obrigatorio, 1-128 chars
  cnpj_cpf?: string,              // CNPJ ou CPF
  is_company?: boolean,            // Default: false
  email?: string,                  // Email valido
  phone?: string,                  // Telefone livre
  street?: string,                 // Logradouro
  city_id?: number,               // many2one res.city
  state_id?: number,              // many2one res.country.state
  external_id?: string            // Rastreabilidade, max 64 chars, cria ir.model.data
}
```

**Output:**
```typescript
{
  id: number,                      // ID novo no Odoo
  data: Record<string, unknown>,   // Payload enviado
  snapshotBefore: null,
  snapshotAfter: Record<string, unknown>  // Snapshot pos-criacao do Odoo
}
```

**Fluxo Interno:**
1. Verificar duplicidade de `external_id` em `ir.model.data`
2. `odoo.create("res.partner", vals)`
3. Se `external_id`: registrar em `ir.model.data` (modulo="mcp_nexus")
4. Ler snapshot completo do Odoo
5. Retornar resultado padronizado

**Exemplo (curl):**
```bash
curl -X POST https://mcp.exemplo.com.br/mcp \
  -H "Authorization: Bearer <SERVICE_TOKEN>" \
  -H "X-Mcp-User-Id: <USER_ID>" \
  -H "X-Api-Key: <API_KEY>" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "crm.res_partner.create",
      "arguments": {
        "name": "Academia Exemplo Ltda",
        "is_company": true,
        "cnpj_cpf": "12.345.678/0001-99",
        "email": "contato@academia.com.br"
      }
    }
  }'
```

**Status Atual:**
- Implementado, acessivel so externamente
- Agente Nex interno nao pode chamar (bloqueado por RBAC)
- Aguardando integracao com n8n para sincronizacao

---

### 2.3 Resumo de Tools CRM

| Tool | Tipo | Implementado | Status | GAP |
|------|------|---|---|---|
| `crm.res_partner.get` | Leitura | Sim | v2 OK | Sem filtros (nome, email) |
| `crm_pipeline_funis` | Leitura | Sim | B7 OK | Sempre vazio (estrutural) |
| `crm.res_partner.create` | Escrita | Sim | Onda 2 | Externo only, sem acesso interno |

**Faltam (GAPS):**
- Listar parceiros por categoria (cliente/fornecedor)
- Buscar parceiro por nome ou CNPJ
- Contar clientes por empresa/regiao
- Parceiros inativos vs ativos
- Historico de alteracoes em parceiros
- Validar CNPJ/CPF (extensao da tool)
- Combinar com oportunidades/leads (quando CRM operar)

---

## 3. CATALOGO EXAUSTIVO DE PERGUNTAS

### 3.1 Perguntas Sobre Parceiros (res.partner)

**Categoria: Contagem e Listagem Basica**

1. **"Quantos parceiros (clientes/fornecedores) temos?"** [GAP] - Falta contador generico
   - Falta: filtro por tipo (customer/supplier), ativo/inativo
   
2. **"Liste todos os clientes ativos."** [GAP]
   - Falta: tool crm.res_partner.list com filtros
   - Necessario: `customer=true, active=true`

3. **"Quantos fornecedores temos cadastrados?"** [GAP]
   - Falta: contador de supplier=true

4. **"Qual e o parceiro com ID 123?"** [OK]
   - Tool: `crm.res_partner.get` (retorna raw bruto)
   - Limitacao: sem interpretacao dos campos

5. **"Encontre o cliente com CNPJ 12.345.678/0001-99."** [GAP]
   - Falta: search por cnpj_cpf

6. **"Busque o parceiro pelo nome 'Academia Exemplo'."** [GAP]
   - Falta: search por name (wildcard)

7. **"Quantos clientes nao tem email cadastrado?"** [GAP]
   - Falta: relatorio de completude de dados

8. **"Liste clientes com telefone começando com (11)."** [GAP]
   - Falta: filtro regex/pattern

**Categoria: Analise por Dimensoes**

9. **"Quantos clientes temos por empresa (filial)?"** [GAP]
   - Falta: agregacao por company_id
   - Necessario: LEFT JOIN com contexto de empresa

10. **"Quantos parceiros foram criados em maio?"** [GAP]
    - Falta: filtro por data de criacao (create_date no Odoo)

11. **"Qual foi a ultima alteracao em cada cliente?"** [GAP]
    - Falta: relatorio de odooWriteDate

12. **"Parceiros com endereço em Sao Paulo."** [GAP]
    - Falta: filtro geografico (state_id)

13. **"Cliente ou fornecedor: distribua por categoria."** [GAP]
    - Falta: pivot customer vs supplier

14. **"Quantos parceiros ativos vs inativos?"** [GAP]
    - Falta: agregacao por active boolean

**Categoria: Dados Administrativos**

15. **"Qual e o email de contato do cliente 456?"** [PARCIAL]
    - Tool: `crm.res_partner.get` retorna raw
    - Gap: nao extrai/formata o campo email

16. **"Qual e a pessoa de contato (parent_id) desta empresa?"** [PARCIAL]
    - Tool: `crm.res_partner.get` retorna parent_id como many2one ID
    - Gap: nao resolvem a referencia (nao busca nome do parent)

17. **"Qual categoria foi atribuida ao cliente X?"** [PARCIAL]
    - Tool: `crm.res_partner.get` retorna category_id como many2many IDs
    - Gap: nao interpreta o significado das categorias

18. **"Atualize o email do cliente 123 para novo@email.com"** [GAP]
    - Falta: write tool para res.partner
    - Requer: `crm.res_partner.update` com auth externa

19. **"Cadastre um novo fornecedor chamado 'Fornecedor XYZ'."** [OK-PARCIAL]
    - Tool: `crm.res_partner.create` existe
    - Gap: requer autenticacao externa (nao acessivel ao Agente Nex in-app)

**Categoria: Relacoes com Documentos**

20. **"Qual foi o faturamento total para este cliente?"** [GAP]
    - Falta: relatorio de vendas/faturamento associado a parceiro
    - Necessario: JOIN com dominio fiscal/comercial

21. **"Qual foi o pedido mais recente deste cliente?"** [GAP]
    - Falta: relatorio de pedidos (dominio comercial)

22. **"Qual e o saldo a receber deste cliente?"** [GAP]
    - Falta: relatorio financeiro de AR (Accounts Receivable)

23. **"Este cliente tem NF em atraso?"** [GAP]
    - Falta: cruzamento CRM + fiscal + financeiro

---

### 3.2 Perguntas Sobre Pipeline/Funis

**Categoria: Configuracao**

24. **"Quantos funis de CRM temos?"** [OK]
    - Tool: `crm_pipeline_funis` (sempre retorna 0 por agora)
    - Status: estrutural, nenhum funil operado ainda

25. **"Quais sao os nomes dos funis ativos?"** [PARCIAL]
    - Tool: `crm_pipeline_funis` lista, mas retorna vazio
    - Gap: quando operado, responderá

26. **"Qual e o numero do funil 'Funil Direto'?"** [GAP]
    - Falta: search funil por nome
    - Necessario: crm_pipeline.query(nome=...)

27. **"Liste as etapas do funil X."** [GAP]
    - Falta: tool crm_pipeline.stages (one2many)
    - Necessario: ler crm.pipeline.etapa

---

### 3.3 Perguntas Sobre Auditoria (fato_auditoria_regra)

**Categoria: Regras Ativas**

28. **"Quantas regras de auditoria temos?"** [GAP]
    - Falta: tool auditoria.regras.list
    - Raw existe: raw_auditoria_regra (15 registros)
    - Gap: nao exponenciado em MCP tool

29. **"Quais regras de auditoria estao ativas?"** [GAP]
    - Falta: filtro ativa=true em relatorio

30. **"Qual e a janela maxima (dias) para a regra X?"** [GAP]
    - Falta: interpretacao do campo dias

---

### 3.4 Perguntas Combinadas (CRM + Outros Dominios)

**Categoria: Cruzamentos**

31. **"Quantos pedidos abertos temos com este cliente?"** [GAP]
    - Falta: relatorio pedido + res.partner (dominio comercial)

32. **"Qual e o top 10 de clientes por faturamento?"** [GAP]
    - Falta: ranking fato_pedido / fato_nota_fiscal por partner

33. **"Cliente com maior inadimplencia."** [GAP]
    - Falta: ranking por atraso financeiro (fato_financeiro_titulo)

34. **"Estoque total alocado para este cliente."** [GAP]
    - Falta: relatorio de reservas/alocacoes por partner (dominio estoque)

35. **"Comparar faturamento: cliente A vs cliente B (mesmo periodo)."** [GAP]
    - Falta: comparativo temporal + cruzamento CRM+fiscal

---

## 4. METRICAS CANONICAS A FORMALIZAR

### 4.1 Metrica: "Numero Total de Parceiros"

**Definicao Exata:**
```
parceiros_totais = COUNT(res.partner)
  WHERE rawDeleted = false
  GROUP BY: nenhum (apenas total global)
  Periodo: N/A (e uma contagem estatica, nao temporal)
```

**Dimensoes Possiveis:**
- por `active` (ativo/inativo)
- por `customer` (se cliente)
- por `supplier` (se fornecedor)
- por `is_company` (empresa/pessoa fisica)
- por empresa (company_id, se disponivel)
- por regiao (state_id)

**Ambiguidades a Desambiguar com Usuário:**
1. "Parceiro ativo" significa `active=true` no Odoo?
2. Um registro pode ser `customer=true` E `supplier=true` ao mesmo tempo? (Sim, no Odoo. Contar separadamente ou unir?)
3. Deletados logicamente (`raw_deleted=true`) contam? (Nao, por padrao)
4. Incluir empresas filiais que nao tem vendas proprias? (Sim, se active=true)

**Regra Canonica Recomendada:**
```sql
-- "Clientes ativos" (para 80% dos casos)
SELECT COUNT(DISTINCT odooId) AS parceiros_ativos_clientes
FROM raw_res_partner
WHERE rawDeleted = false
  AND (data->>'customer')::boolean = true
  AND (data->>'active')::boolean = true;

-- "Total sem filtro" (auditoria)
SELECT COUNT(DISTINCT odooId) AS parceiros_total
FROM raw_res_partner
WHERE rawDeleted = false;
```

---

### 4.2 Metrica: "Faturamento por Cliente (Periodo)"

**Definicao Exata:**
```
faturamento_por_cliente = SUM(nota_fiscal.valor_liquido)
  WHERE nota_fiscal.state IN ('autorizada', 'enviada')  // nao canceladas
    AND nota_fiscal.partner_id = cliente_id
    AND DATE(nota_fiscal.data_emissao) BETWEEN data_inicio AND data_fim
  GROUP BY: cliente_id (partner_id)
  Periodo: customizavel (mes, trimestre, ano)
  Data de Referencia: emissao ou autorizacao? (DESAMBIGUAR)
```

**Ambiguidades a Desambiguar:**
1. **Data de Referencia:** usar `data_emissao` (quando foi faturado) ou `data_autorizacao` (quando foi autorizado na Sefaz)?
2. **Estados inclusos:** só "autorizada" e "enviada" ou incluir "cancelada" (com valor negativo)?
3. **Impostos:** valor bruto ou liquido?
4. **Retencoes:** somar sem descontos ou ja descontar?
5. **Operacoes de Retorno:** tratar como nota de credito (valor negativo)?

**Recomendacao:**
Especificar no relatorio: "Faturamento autorizado liquido (exclusao de canceladas, sem impostos fora da base, por data de autorizacao)".

---

### 4.3 Metrica: "Inadimplencia por Cliente (Data de Corte)"

**Definicao Exata:**
```
inadimplencia_cliente = SUM(titulo.valor_principal)
  WHERE titulo.state = 'vencido' OR (titulo.state = 'aberto' AND data_vencimento < hoje)
    AND titulo.partner_id = cliente_id
    AND DATE(titulo.data_vencimento) <= data_corte
  GROUP BY: cliente_id
  Data de Corte: hoje (ou parametrizado)
```

**Ambiguidades:**
1. Incluir juros/multa no valor ou só principal?
2. Parcelas parcialmente pagas contam como 100% ou só o residual?
3. Se tiver acordo de parcelamento, ja vencido, conta?
4. Filtrar por company_id (empresa) ou global?

---

### 4.4 Metrica: "Regras de Auditoria Ativas por Janela"

**Definicao Exata:**
```
regras_auditoria_ativas = COUNT(regra)
  WHERE ativa = true
  ORDER BY: dias ASC
```

**Ambiguidades:**
1. "Janela em dias" significa dias calendarios ou dias uteis?
2. A regra se aplica globalmente ou por tipo de documento?

---

### 4.5 Sumario de Metricas Canonicas

| Nome | Tipo | Fonte | GAP | Prioridade |
|------|------|---|---|---|
| Numero total de parceiros | Contagem | raw_res_partner | Falta tool | Alta |
| Clientes ativos | Contagem | raw_res_partner (customer=true, active=true) | Falta tool | Alta |
| Faturamento por cliente / periodo | Agregacao | fato_nota_fiscal + raw_res_partner | Falta relatorio + desambiguacao | Alta |
| Inadimplencia por cliente | Agregacao | fato_financeiro_titulo + raw_res_partner | Falta relatorio + desambiguacao | Media |
| Regras de auditoria ativas | Contagem | fato_auditoria_regra (ativa=true) | Falta tool | Baixa |

---

## 5. COMBINACOES CRUZADAS COM OUTROS DOMINIOS

### 5.1 CRM + COMERCIAL (Pedidos)

**Perguntas Resultantes:**
- "Qual e o cliente com mais pedidos abertos?"
- "Clientes sem pedidos ha 90 dias"
- "Ticket medio por cliente"
- "Pedidos pendentes de confirmacao por cliente"

**Jointure Necessaria:**
```sql
SELECT 
  rp.data->>'name' as cliente,
  COUNT(fp.odooId) as total_pedidos,
  SUM((fp.data->>'valor_total')::numeric) as valor_total
FROM raw_res_partner rp
LEFT JOIN fato_pedido fp ON fp.partner_id = rp.odooId
WHERE rp.rawDeleted = false
GROUP BY rp.odooId
ORDER BY total_pedidos DESC;
```

---

### 5.2 CRM + FISCAL (Notas Fiscais)

**Perguntas Resultantes:**
- "Clientes com NF pendente de autorizacao"
- "Historico de faturamento por cliente (ultimos 6 meses)"
- "Cliente com maior volume de cancelamentos"

---

### 5.3 CRM + FINANCEIRO (Titulos, Fluxo de Caixa)

**Perguntas Resultantes:**
- "Fluxo de caixa esperado por cliente (proximos 30 dias)"
- "Clientes em atraso: quem deve mais"
- "Taxa de adimplencia por cliente"
- "Comparativo: valor faturado vs recebido (cliente)"

---

### 5.4 CRM + ESTOQUE (Reservas/Alocacoes)

**Perguntas Resultantes:**
- "Estoque alocado aguardando entrega (por cliente)"
- "Equipamentos parados em armazem para cliente X"

---

## 6. ARMADILHAS DE DADO

### 6.1 Armadilha 1: Parceiro = Customer + Supplier Simultaneamente

**O Problema:**
No Odoo, um `res.partner` pode ter `customer=true` E `supplier=true` ao mesmo tempo. Perguntas como "Quantos clientes?" podem duplicar contagem.

**Evidencia:**
- Campo `customer` e `supplier` sao booleans independentes
- Nao sao mutuamente exclusivos

**Solucao:**
- Ao contar, especificar "clientes APENAS" (customer=true AND supplier=false) ou "clientes (incluindo hybrid)"
- Documentar a dimensao na metrica

---

### 6.2 Armadilha 2: "Ativo" nao significa "Cliente"

**O Problema:**
`active=true` significa que o parceiro nao foi deletado, nao que seja cliente. Pode ser um contato de pessoa juridica sem acesso de venda.

**Solucao:**
- Sempre filtrar por `customer=true` quando buscando "clientes"
- Usar `active=true AND customer=true` como padrão

---

### 6.3 Armadilha 3: Parceiro vs Empresa (is_company vs parent_id)

**O Problema:**
- `is_company=true` significa "PJ" (pessoa juridica)
- `parent_id` (many2one) aponta para a empresa "pai" (matriz)
- Um parceiro que e uma filial tem `parent_id=<matriz_id>` e `is_company=false`
- Perguntas sobre "faturamento da empresa XYZ" podem não incluir filiais

**Solucao:**
- Quando agregando por empresa, fazer LEFT JOIN recursivo (CTE) para incluir filiais
- Documentar se o relatorio inclui filiais ou nao

---

### 6.4 Armadilha 4: JSON Bruto vs Tipado

**O Problema:**
`raw_res_partner.data` e JSON bruto do Odoo. Campos como `cnpj_cpf`, `email`, etc podem estar ausentes ou NULL em registros antigos.

**Evidencia:**
- Sem migracao/normalizacao, queries diretas em JSON sao frageis
- Tipo de dado: `(data->>'email')::text` retorna string ou null
- String vazia ("") != NULL

**Solucao:**
- Construir a camada Fato (tipo-segura) com coercao (`str(raw.email)`)
- Documentar campos obrigatorios vs opcionais

---

### 6.5 Armadilha 5: Delecao Logica (raw_deleted)

**O Problema:**
`raw_deleted=true` marca um registro como apagado, mas nao o remove fisicamente. Queries que esquecem o filtro `WHERE rawDeleted = false` retornam fantasmas.

**Solucao:**
- **SEMPRE** filtrar `WHERE rawDeleted = false` em leitura de raw_*
- Adicionar constraint em Prisma queries (scope automatico)

---

### 6.6 Armadilha 6: Sincronizacao Incremental vs Completa

**O Problema:**
- `odooWriteDate` e a ultima alteracao no Odoo, nao em nosso cache
- Um parceiro pode nao ter sido atualizado ha 90 dias, mas ainda estar no cache
- Confundir "sincronizado recentemente" (syncedAt) com "alterado recentemente" (odooWriteDate)

**Solucao:**
- Sempre retornar timestamp de sync (syncedAt) com relatorio ("atualizado ha 2h")
- Documentar a diferenca entre odooWriteDate e syncedAt no relatorio

---

### 6.7 Armadilha 7: Many2One Nao Resolvido

**O Problema:**
Campos como `parent_id`, `city_id`, `state_id` sao many2one IDs no JSON, nao nomes.

Exemplo: `{ "parent_id": [456, "Academia Matriz"], "name": "Academia Filial" }`

- Se retornarmos o JSON bruto, o usuario ve ID em vez de nome
- Se tentarmos resolver (fazer lookup em outra tabela), pode ficar lento

**Solucao:**
- Construir a camada Fato com resolvimento de referencias principais (parent nome)
- Documentar quais many2one sao denormalizados e quais permanecem como ID

---

### 6.8 Armadilha 8: Many2Many Nao Interpretado

**O Problema:**
`category_id` (many2many com res.partner.category) retorna array de IDs.

Exemplo: `{ "category_id": [5, 7, 10], ... }`

- Usuario nao sabe o que significam essas categorias
- Sem relacao categorizada, impossivel filtrar "clientes da categoria X"

**Solucao:**
- Criar relacao raw_res_partner_category (tabela associativa)
- Ou documentar que "categoria" existe mas nao e filtrada por enquanto (GAP)

---

## 7. CONCLUSAO: ESTADO DO DOMINIO CRM

### O que Existe (Implementado)

- raw_res_partner: ~500 registros (dados reais)
- raw_crm_pipeline: 0 registros (estrutura pronta, nao operada)
- fato_crm_pipeline: 0 registros (tabela tipada, vazia)
- fato_auditoria_regra: 15 registros (config de regras)
- Tool `crm.res_partner.get`: lê um parceiro pelo ID
- Tool `crm_pipeline_funis`: lista funis (sempre vazio por agora)
- Tool `crm.res_partner.create`: escreve parceiro (externo only)

### O que Falta (GAPS Prioritarios)

1. **[ALTA] Listar parceiros com filtros** (nome, CNPJ, ativo/inativo, cliente/fornecedor)
2. **[ALTA] Contador de clientes/fornecedores** (com dimensoes)
3. **[ALTA] Relatorio de faturamento por cliente/periodo** (requer dominio fiscal + decisao de metrica)
4. **[MEDIA] Historico de alteracoes em parceiros**
5. **[MEDIA] Validacao de CNPJ/CPF** (extensao da tool de criacao)
6. **[MEDIA] Inadimplencia por cliente** (requer dominio financeiro)
7. **[BAIXA] Tools para oportunidades/leads** (quando CRM operar)

### Recomendacoes Proximas

1. **Expandir raw_res_partner em Fato** com campos tipados principais (nome, email, cnpj_cpf, ativo)
2. **Criar tool crm.res_partner.list** com suporte a filtros e paginacao
3. **Formalizar metricas** de faturamento, inadimplencia e auditoria com usuario
4. **Cruzamentos com fiscal/financeiro** (quando relatorios esses dominios estiverem prontos)
5. **Operacao de pipeline** (decisao de negocio): quando fizer, expandir tools para leads/oportunidades

---

**Documento Finalizado:** 2026-06-06  
**Proxima Auditoria:** Apos decisao de operacao do CRM ou obtencao de especificacoes das metricas do usuario

