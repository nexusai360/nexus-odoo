# Dossier Transversal: Domínio de Entidades, Freshness, Métricas Cruzadas e RBAC do Nex

**Data:** 2026-06-06
**Escopo:** Mapeamento exaustivo da camada transversal do agente de IA Nex (F4/F5)
**Profundidade:** Máxima (autorizado gastar, exigido pelo dono)

---

## 1. RESOLUÇÃO DE ENTIDADES

Este domínio define como o agente identifica, disambigua e resolve as entidades primárias do ERP em código determinístico.

### 1.1 Tabelas e IDs Canônicos

| Entidade | Modelo Odoo | Tabela Raw | Tabela Fato | ID Canônico | Campo Tipo | ID Tipo | Estratégia Sinonímia |
|----------|-------------|-----------|-----------|------------|-----------|---------|----------------------|
| **Empresa / Grupo** | `res.company` | `raw_res_company` | `dim_empresa_grupo` | `odoo_id` (Int) | `id` no Odoo | Inteiro PK | Nome + CNPJ + tipo (matriz/filial); buscar por CNPJ para evitar homônimos |
| **Armazém / Local** | `stock.location` | `raw_estoque_local` | Desnormalizado em `fato_estoque_saldo` | `odoo_id` (Int) | `id` no Odoo | Inteiro PK | Nome + código; buscar por código primeiro (único), depois nome fuzzy |
| **Operação Fiscal / NF** | `sped.documento` | `raw_sped_documento` | `fato_nota_fiscal` | `odoo_id` (Int) | `id` no Odoo | Inteiro PK | Número + série + modelo + data; chave NFe quando disponível (único) |
| **Parceiro (Cliente/Fornecedor)** | `res.partner` | `raw_res_partner` | `fato_parceiro` | `odoo_id` (Int) | `id` no Odoo | Inteiro PK | Nome completo + CNPJ/CPF; CNPJ é único; nome fuzzy se CNPJ indisponível |
| **Produto** | `sped.produto` | `raw_sped_produto` | `fato_produto` | `odoo_id` (Int) | `id` no Odoo | Inteiro PK | Nome + código + código_único; código_único é único, depois código, depois nome fuzzy |
| **Conta Contábil / Financeira** | `contabil.conta` / `finan.conta` | `raw_contabil_conta` / `raw_finan_conta` | `fato_conta_contabil` | `odoo_id` (Int) | `id` no Odoo | Inteiro PK | Código + nome + natureza; código é único dentro do plano |
| **Pedido / Cotação** | `pedido.documento` | `raw_pedido_documento` | `fato_pedido` | `odoo_id` (Int) | `id` no Odoo | Inteiro PK | Número + tipo + data; número é único por tipo |
| **Centro de Custo / Resultado** | `finan.centro_resultado` | `raw_finan_centro_resultado` | Desnormalizado em `fato_financeiro_lancamento_item` | `odoo_id` (Int) | `id` no Odoo | Inteiro PK | Código + nome; código é único |
| **Natureza de Operação** | `sped.natureza_operacao` | `raw_sped_natureza_operacao` | Referência em `fato_nota_fiscal` | `odoo_id` (Int) | `id` no Odoo | Inteiro PK | Código + nome; código é único |

### 1.2 Estratégias de Desambiguação em Código

#### 1.2.1 Empresa / Grupo

**Fluxo:**
1. Se entrada numérica: buscar `DimEmpresaGrupo.odooId` direto.
2. Se CNPJ válido (14 dígitos ou com máscara): buscar `DimEmpresaGrupo.cnpj`. Se único, retornar.
3. Se nome: buscar `DimEmpresaGrupo.nome` com busca case-insensitive exata; se múltiplos, retornar top 3 com melhor match de Levenshtein.
4. Se ambíguo, pedir ao usuário para clarificar via pergunta complementar.

**Campo de Suporte:**
- `data->>'name'` (raw): nome
- `data->>'vat'` (raw): CNPJ/CPF formatado
- `tipo` (dim): 'matriz' ou 'filial'
- `uf` (dim): estado

#### 1.2.2 Armazém / Local

**Fluxo:**
1. Se numérico: buscar `raw_estoque_local.odoo_id` direto via `FatoEstoqueSaldo.localId`.
2. Se código (ex. "EST01"): buscar `raw_estoque_local.data->>'code'` exato.
3. Se nome: busca fuzzy em `FatoEstoqueSaldo.localNome` com Levenshtein threshold 0.8.
4. Se ambíguo (exemplo: "Armazém Central" = 3 localidades em SP), pedir filtro (UF, empresa).

**Campo de Suporte:**
- `data->>'code'` (raw): código único
- `data->>'name'` (raw): nome
- Não há tabela fato exclusiva; atributos desnormalizados em `fato_estoque_saldo`

#### 1.2.3 Operação Fiscal (Nota Fiscal)

**Fluxo:**
1. Se numérico (ID Odoo): buscar `fato_nota_fiscal.odoo_id` direto.
2. Se chave NFe (44 dígitos): buscar `fato_nota_fiscal.chave` (único em todo Odoo).
3. Se número + série + modelo: busca combinada em `fato_nota_fiscal` (número + serie + modelo formam PK virtual).
4. Se intervalo de data + tipo (entrada/saída): retornar lista ordenada por data.

**Campo de Suporte:**
- `numero`, `serie`, `modelo` (fato): PK composto
- `chave` (fato): chave NFe única
- `data_emissao` (fato): data
- `entrada_saida` (fato): 'entrada' ou 'saida'
- `participante_id` (fato): FK para parceiro

#### 1.2.4 Parceiro (Cliente/Fornecedor)

**Fluxo:**
1. Se numérico: buscar `fato_parceiro.odoo_id` direto.
2. Se CNPJ/CPF válido: buscar `raw_res_partner.data->>'vat'` ou `fato_parceiro.documento`. Se único, retornar.
3. Se nome: busca fuzzy em `fato_parceiro.nome` e `fato_parceiro.nome_completo` com Levenshtein threshold 0.75; retornar top 3.
4. Se ambíguo, filtrar por tipo (`eh_cliente`, `eh_fornecedor`, `eh_empresa`).

**Campo de Suporte:**
- `documento` (fato): CNPJ/CPF
- `nome`, `nome_completo` (fato): nome
- `eh_cliente`, `eh_fornecedor`, `eh_empresa` (fato): tipo
- `data_criacao` (fato): data de cadastro (auxilia em homônimos recentes)

#### 1.2.5 Produto

**Fluxo:**
1. Se numérico: buscar `fato_produto.odoo_id` direto.
2. Se código_único (EAN-13, SKU universal): buscar `fato_produto.codigo_unico` (único).
3. Se código (interno): buscar `fato_produto.codigo` (PK interna, único por empresa).
4. Se nome: busca fuzzy em `fato_produto.nome` com Levenshtein 0.8; retornar top 5.
5. Se ambíguo, filtrar por família/marca ou perguntar.

**Campo de Suporte:**
- `codigo`, `codigo_unico`, `codigo_barras` (fato): chaves de busca
- `nome` (fato): nome
- `familia_id`, `marca_id` (fato): contexto
- `ativo` (fato): status

#### 1.2.6 Conta Contábil

**Fluxo:**
1. Se numérico: buscar `fato_conta_contabil.odoo_id` direto.
2. Se código (ex. "1.1.01.01"): buscar `fato_conta_contabil.codigo` (PK dentro do plano de contas). Se único, retornar.
3. Se nome: busca fuzzy com Levenshtein 0.75; retornar top 3.
4. Se ambíguo, filtrar por tipo (ativo/passivo/resultado) ou natureza.

**Campo de Suporte:**
- `codigo` (fato): código contábil (PK)
- `tipo`, `natureza` (fato): classificação
- `contaPaiId` (fato): relacionamento hierárquico

#### 1.2.7 Pedido / Cotação

**Fluxo:**
1. Se numérico: buscar `fato_pedido.odoo_id` direto.
2. Se número + tipo: buscar combinada em `fato_pedido` (número é PK por tipo).
3. Se intervalo de data + tipo: retornar lista ordenada.
4. Se nome de parceiro: buscar `fato_pedido.participante_id` e retornar seus pedidos.

**Campo de Suporte:**
- `numero` (fato): número (PK por tipo)
- `tipo` (fato): tipo (ORC, VEN, etc.)
- `etapa_id` (fato): estágio atual
- `participante_id` (fato): cliente/fornecedor

### 1.3 Garantias e Validações em Código

**Contrato de Identidade:**

1. **Toda entidade carregada do cache tem ID Odoo.** Nenhuma "entrada por nome" retorna uma entidade sem `odoo_id`. Se a busca for ambígua, retorna lista ou `null`, nunca uma entidade falsa.

2. **IDs Odoo são imutáveis na fonte.** Se o Odoo muda `id` de um registro (não acontece), o cache detecta como exclusão + criação nova. O agente nunca trabalha com ID desatualizado.

3. **Campos de identidade não são `null`.** Exemplo: `fato_produto.codigo_unico` é `String?` (opcional), mas se uma ferramenta de busca usa `codigo_unico`, ela pré-filtra linhas onde não é null: `WHERE codigo_unico IS NOT NULL`.

4. **Validação Zod em todo handler.** Entrada de usuário (número, CNPJ, nome) é validada com Zod antes de ser usada em SQL. Exemplo:

   ```typescript
   const parceiroInput = z.object({
     id: z.union([z.number().int(), z.string()]).optional(),
     cnpj: z.string().regex(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/).optional(),
     nome: z.string().min(2).optional(),
   }).parse(args);
   ```

5. **Logs de ambiguidade.** Quando uma busca retorna múltiplas entidades, a tool registra em `feature_requests` um gap: "Pergunta 'X' resultou em ambiguidade (3 parceiros com nome 'X'); pedir UF ou CNPJ para desambiguar."

---

## 2. FRESHNESS: Ciclos de Sync e Sinalização de Dado Atrasado

Este domínio define como o agente comunica ao usuário se o dado está fresco ou desatualizado.

### 2.1 Ciclos de Sincronização (Reais)

Fonte: `src/worker/sync/sync-config.ts` e `src/worker/sync/sync-state.ts`

| Ciclo | Intervalo Padrão | Trigger | Estratégia | Modelos Afetados | Nota |
|-------|------------------|---------|-----------|-----------------|------|
| **Incremental** | 3 minutos | Cron | Poll JSON-RPC com `search_read` filtrado por `write_date >= lastIncremental` | Todos os ~126 raw_* | Mais rápido; pega mudanças recentes; pode perder deletes se recente |
| **Snapshot** | 30 minutos | Cron | Re-pull completo (sem filtro) de modelos críticos (empresa, parceiro, produto, estoque, financeiro) | Raw: ~20 modelos críticos + Fatos derivados | Valida integridade; descobre deletes; atualiza status de sincronização |
| **Reconcile** | 1440 minutos (24h) | Cron | Varredura completa, detecta e marca linhas deletadas no Odoo como `raw_deleted=true` | Todos os raw_* | Limpeza de fantasmas; executa à madrugada |

**Padrão de Ciclo Efetivo:**
- T+0min: incremental detecta mudança em nota_fiscal #1234
- T+3min: incremental puxa novamente
- ...
- T+30min: snapshot re-valida todas as notas (descobre que #5678 foi deletada)
- T+24h: reconcile marca deletes antigos

**SyncState (Tabela de Controle):**
```sql
model SyncState {
  model                String    -- Odoo model name (pk)
  mode                String    -- "incremental" | "snapshot" | "reconcile"
  lastIncrementalAt   DateTime? -- últh execução incremental bem-sucedida
  lastSnapshotAt      DateTime? -- última snapshot bem-sucedida
  lastReconcileAt     DateTime? -- última reconcile bem-sucedida
  lastStatus          SyncStatus -- "ok" | "erro" | "rodando" | "sem_acesso"
  lastError           String?   -- mensagem de erro (se status=erro)
  recordCount         Int       -- quantidade de registros no cache (de ref)
  updatedAt           DateTime  -- quando este estado foi atualizado
}
```

### 2.2 Campos de Freshness em Cada Tabela

Todas as tabelas `raw_*` e `fato_*` possuem:

| Campo | Tipo | Significado |
|-------|------|-------------|
| `synced_at` (raw) | `DateTime` | Momento em que a linha foi inserida/atualizada no cache via sync |
| `odoo_write_date` (raw) | `DateTime?` | Timestamp do Odoo (campo `write_date` nativo); nulo se nunca foi modificado no Odoo |
| `atualizado_em` (fato) | `DateTime` | Quando o builder recalculou/atualizou esta linha (builder roda após snapshot) |
| `raw_deleted` (raw) | `Boolean` | Marcado true pela reconcile se o registro foi deletado no Odoo |

**Para Relatórios (dashboard):**
```typescript
// src/lib/reports/freshness.ts
async function reportFreshness(prisma, entry): Promise<Date | null> {
  // Retorna MIN(lastSnapshotAt de raw, ultimoBuildAt de todos os fatos)
  // = instante mais antigo = "tão fresco quanto a etapa mais lenta"
}
```

### 2.3 Como o Agente Sinaliza Dado Atrasado

**Contrato: Toda tool de leitura expõe `atualizadoEm` em sua resposta.**

Exemplo (Tool `estoque_saldo_por_armazem`):

```json
{
  "estado": "sucesso",
  "atualizadoEm": "2026-06-06T10:23:45Z",
  "atualizadoHa": "2 minutos",
  "dados": {
    "titulos": [ ... ],
    "_RESPOSTA": "Total em estoque..."
  }
}
```

**Aviso em Resposta:**
- Se `atualizadoHa > "1 hora"`: tool acrescenta aviso: "*Atenção: este resultado foi sincronizado há mais de 1 hora. A situação pode ter mudado. Consulte o dashboard para validar.*"
- Se `atualizadoHa > "6 horas"`: aviso vira crítico: "*Alerta: dado muito desatualizado (6+ horas). Não tome decisão com base nele.*"
- Se snapshot nunca rodou: aviso: "*Nenhuma sincronização realizada ainda. Aguarde a próxima sincronização automática.*"

**Implementação em Código:**
```typescript
// mcp/tools/[domínio]/[tool].ts
async function handler(input, ctx) {
  const sync = await ctx.prisma.syncState.findUnique({
    where: { model: "sped.documento" },
    select: { lastSnapshotAt: true },
  });
  const atualizadoEm = sync?.lastSnapshotAt ?? null;
  const minutosAtrás = atualizadoEm ? Math.floor((Date.now() - atualizadoEm.getTime()) / 60000) : null;
  
  const aviso = minutosAtrás && minutosAtrás > 60 
    ? minutosAtrás > 360
      ? "CRÍTICO: dado muito atrasado (6+ horas)"
      : "Aviso: sincronizado há " + minutosAtrás + " minutos"
    : null;
  
  return {
    estado: "sucesso",
    atualizadoEm,
    atualizadoHa: minutosAtrás ? `${minutosAtrás} minutos` : "desconhecido",
    aviso,
    dados: { ... }
  };
}
```

### 2.4 Gaps de Freshness

| Gap | Severidade | Impacto |
|-----|-----------|--------|
| **Incremental cai (erro de rede)** | Média | Mudanças perdidas; snapshot de 30min recupera |
| **Snapshot nunca rodou** | Alta | Nenhum dado no cache; agente retorna "sem dados" |
| **Builder falha silenciosamente** | Alta | `fato_*` fica obsoleto; lastSnapshotAt do raw avança, mas fato não |
| **Reconcile não roda por 48h+** | Baixa | Deleted records não marcados; buscas fantasmas |

**Mitigação em Código:**
- Toda tool checa `lastSnapshotAt` e avisa se > 6h.
- Builder tem retry com backoff (3 tentativas).
- SyncState.lastStatus monitora falhas em tempo real (dashboard mostra status).

---

## 3. MÉTRICAS CRUZADAS MULTI-DOMÍNIO

Métricas que usam dados de 2+ domínios (não são simples somas) e exigem sincronização canônica de IDs.

### 3.1 Tabela de Métricas Definidas

| Métrica | Domínios | Fórmula Exata | Tabelas Primárias | Campos Chave | Observações |
|---------|----------|---------------|--------------------|--------------|------------|
| **Previsão de Fechamento (Fiscal)** | Fiscal + Financeiro | SUM(valor_nf_emitida) - SUM(valor_nf_recebida) para período | `fato_nota_fiscal` + `fato_dfe` | data_emissao, entrada_saida, vr_nf | Emitidas: entrada_saida='saida' + situacao_nfe='autorizada' / Recebidas: entrada_saida='entrada' + data_recebimento NOT NULL |
| **Faturamento Emitido vs Recebido (Comercial)** | Comercial + Fiscal | Emitido: SUM(`fato_pedido`.vr_nf) WHERE etapa_finaliza=true / Recebido: SUM(`fato_nota_fiscal`.vr_nf) WHERE entrada_saida='entrada' | `fato_pedido` + `fato_nota_fiscal` | pedido.etapa_id (fk), nota.numero, nota.data_emissao | Emitido = pedidos finalizados; Recebido = NFs de entrada recebidas (manifestadas) |
| **Saúde Empresa (Vermelho/Amarelo/Verde)** | Financeiro + Estoque | IF(títulos_vencidos > 0 OR saldo_banco < 0, "vermelho") ELSE IF(estoque_parado > 30% OR dias_duplicata_vencida > 15, "amarelo") ELSE "verde" | `fato_financeiro_titulo` + `fato_estoque_saldo` + `fato_produto_parado` | dataVencimento, dataPagamento, dias, vrSaldo | Regras de negócio específicas; ver §3.3 |
| **Cobertura de Estoque (Dias)** | Estoque + Comercial | SUM(estoque_atual * dias_saída) / SUM(dias_saída) para período | `fato_estoque_saldo` + `fato_estoque_movimento` | quantidade, data, sentido | Quantos dias de consumo histórico o estoque cobre? |
| **Custo de Carregamento (R$/dia)** | Estoque + Financeiro | SUM(estoque_valor_parado * taxa_juros_diária) | `fato_estoque_saldo` + `fato_produto_parado` | vr_saldo, dias, taxa | Taxa de custo de capital ajustada por dias de imobilização |
| **Fluxo de Caixa Previsto vs Realizado** | Financeiro | Realizado: SUM(entrada) - SUM(saida) até hoje / Previsto: SUM(entrada_prevista) - SUM(saida_prevista) até fim do mês | `fato_financeiro_movimento` | data, entrada, saida, entrada_prevista, saida_prevista | Permite diagnóstico de "faltará caixa em 3 dias?" |
| **ROI por Parceiro** | Comercial + Financeiro | SUM(valor_pedido) / SUM(custo_produção) por parceiro; se custo_produção ausente, estimar com `preço_custo * quantidade` | `fato_pedido` + `fato_nota_fiscal_item` + `fato_produto` | participante_id, vr_produtos, vr_nf, preco_custo | Avança se temos preco_custo populado; senão, retorna gap |
| **Taxa de Conversão de Etapas (Funil)** | Comercial | Total pedidos que passaram de etapa A para B / Total na etapa A | `fato_pedido_historico` | pedido_id, etapa_id, data_entrada | Permite "quanto % de orçamentos vira pedido?" |
| **Inadimplência por Parceiro** | Financeiro | SUM(vr_saldo WHERE dataPagamento IS NULL AND dataVencimento < hoje) por participante_id | `fato_financeiro_titulo` | participante_id, data_vencimento, data_pagamento, vr_saldo | Filtro crítico: tipo='a_receber' |

### 3.2 Regras Exatas de Composição

#### 3.2.1 Previsão de Fechamento (Fiscal)

```typescript
// Entrada: período (de, até), empresa_id (opcional)
async function previsaoFechamentoFiscal(prisma, período, empresaId?) {
  const emitidas = await prisma.fatoNotaFiscal.findMany({
    where: {
      entradaSaida: "saida",
      situacaoNfe: { in: ["autorizada", "não_enviada"] },
      dataEmissao: { gte: período.de, lte: período.até },
      ...(empresaId && { empresaId }),
    },
    select: { vrNf: true, numero: true, dataEmissao: true },
  });
  
  const recebidas = await prisma.fatoDfe.findMany({
    where: {
      dataEmissao: { gte: período.de, lte: período.até },
      dataRecebimento: { not: null },
    },
    select: { vrNf: true, chave: true },
  });
  
  const totalEmitido = emitidas.reduce((s, e) => s + e.vrNf, 0);
  const totalRecebido = recebidas.reduce((s, e) => s + e.vrNf, 0);
  
  return {
    periodo: período,
    totalEmitido,
    totalRecebido,
    diferenca: totalEmitido - totalRecebido,
    observacao: totalEmitido > totalRecebido 
      ? "Fechamento pode sofrer atraso" 
      : "Ficou a dever entrada"
  };
}
```

**Ambiguidades e Gaps:**
- `situacaoNfe` tem estados (autorizada, nao_enviada, enviada, rejeitada, cancelada); cada estado pode impactar a previsão. ***GAP: regra "qual estado conta?" não está documentada; assumir "autorizada" + "nao_enviada".***
- MDF-e (manifesto de transporte) não está em `fato_nota_fiscal`, vive em `fato_mdfe` separado. ***GAP: incluir MDF-e na previsão?***

#### 3.2.2 Saúde Empresa (Vermelho/Amarelo/Verde)

```typescript
async function saudeEmpresa(prisma, empresaId): Promise<"vermelho" | "amarelo" | "verde"> {
  // REGRA 1: Vermelho se títulos vencidos
  const titulosVencidos = await prisma.fatoFinanceiroTitulo.findFirst({
    where: {
      tipo: "a_receber",  // ou a_pagar? regra de negócio crítica
      dataVencimento: { lt: new Date() },
      dataPagamento: null,
    },
  });
  if (titulosVencidos) return "vermelho";
  
  // REGRA 2: Vermelho se saldo banco < 0
  const saldosBancos = await prisma.fatoFinanceiroSaldo.findMany({
    where: { bancoId: { not: null } },
    select: { saldo: true },
  });
  if (saldosBancos.some(s => s.saldo < 0)) return "vermelho";
  
  // REGRA 3: Amarelo se estoque parado > 30%
  const estoqueTotal = await prisma.fatoEstoqueSaldo.aggregate({
    _sum: { vrSaldo: true },
    where: { produtoId: { not: null } },
  });
  const estoqueparado = await prisma.fatoProdutoParado.aggregate({
    _sum: { vrSaldo: true },
  });
  if (estoqueparado._sum.vrSaldo / estoqueTotal._sum.vrSaldo > 0.3) return "amarelo";
  
  // REGRA 4: Amarelo se dias_duplicata_vencida > 15
  const duplicatasMaisAntigo = await prisma.fatoFinanceiroTitulo.findFirst({
    where: {
      tipo: "a_receber",
      dataVencimento: { lt: new Date() },
      dataPagamento: null,
    },
    orderBy: { dataVencimento: "asc" },
    select: { dataVencimento: true },
  });
  if (duplicatasMaisAntigo) {
    const diasAtraso = Math.floor((Date.now() - duplicatasMaisAntigo.dataVencimento.getTime()) / 86400000);
    if (diasAtraso > 15) return "amarelo";
  }
  
  return "verde";
}
```

***GAP CRÍTICO: Regras não estão documentadas no código; assumi matriz acima. Validar com dono.***

#### 3.2.3 Faturamento Emitido vs Recebido

```typescript
async function faturamentoEmitidoVsRecebido(prisma, período, empresaId?) {
  // Emitido: pedidos finalizados
  const emitido = await prisma.fatoPedido.aggregate({
    _sum: { vrNf: true },
    where: {
      dataOrcamento: { gte: período.de, lte: período.até },
      etapaFinaliza: true,
      ...(empresaId && { empresaId }),
    },
  });
  
  // Recebido: NFs de entrada recebidas (data_recebimento not null)
  const recebido = await prisma.fatoDfe.aggregate({
    _sum: { vrNf: true },
    where: {
      dataRecebimento: { gte: período.de, lte: período.até, not: null },
      manifestacao: "manifestado",
      ...(empresaId && { fornecedorId: empresaId }),
    },
  });
  
  return {
    periodo: período,
    totalEmitido: emitido._sum.vrNf || 0,
    totalRecebido: recebido._sum.vrNf || 0,
    taxa: recebido._sum.vrNf / emitido._sum.vrNf || 0,
  };
}
```

### 3.3 Cross-domain Joins (Armadilhas)

| Armadilha | Descrição | Solução |
|-----------|-----------|---------|
| **participante_id vs empresa_id** | `fato_pedido` tem `participante_id` (cliente); `fato_nota_fiscal` pode ter `participante_id` (fornecedor) ou `empresa_id` (própria empresa). Juntar sem filtro duplica. | Sempre explicitar: WHERE participante_id = ? AND tipo_parceiro = 'cliente' |
| **estoque_parado não filtra ativo** | `fato_produto_parado` não tem coluna `ativo`; pode conter produtos inativos. | JOIN com `fato_produto` e filtrar `ativo=true` |
| **status de nota fiscal ambíguo** | `situacao_nfe` em texto (autorizada, rejeitada, etc.); `fato_dfe.manifestacao` tem estados (manifestado, não_manifestado, etc.). Não alinham. | Usar máquinas de estado explícitas: "emitida" = autorizada; "recebida" = manifestado |
| **período de data** | Qual campo? `data_emissao`, `data_entrada_saida`, `data_autorizacao`, `data_recebimento`? Cada um diz algo diferente sobre a operação. | Documentar por métrica qual usar. Padrão: usar data de "realização" (entrada/saída), não emissão. |
| **taxa de juros** | `fato_financeiro_titulo` não tem coluna de taxa. Onde vem? | ***GAP: taxa deve estar em `raw_finan_pagamento_divida.data` como JSON; extrair e normalizar.*** |

---

## 4. POLÍTICA DE LIMITE E TRUNCAMENTO EM CÓDIGO

Como o agente decide retornar lista exaustiva (todos) vs truncada (top-N) vs paginada.

### 4.1 Regra Determinística

Fonte: `src/lib/agent/run-agent.ts` linha 79, 130-177

```
IF resultado JSON <= 24.576 bytes (UTF-8)
  → Retornar completo, sem aviso
ELSE IF tentativa smart (encurtar listas internas para 30 itens):
  → Encurtar listas (titulos, linhas, serie) para primeiros 30
  → Preservar campos canônicos (_RESPOSTA, _DESTAQUE, _agregado, topMaiores, topPorParticipante)
  → Se ainda > 24KB, encurtar novamente (mais iterações)
  → Se cabe, retornar com aviso "_amostraReduzida"
ELSE
  → Truncar do início (comportamento conservador), deixar canônicos no fim
  → Acrescentar "[...resultado truncado...]"
```

### 4.2 Implementação em Tools

**Limite na Query (SQL):**
```typescript
// Exemplo: ferramenta de estoque
const saldos = await prisma.fatoEstoqueSaldo.findMany({
  where: { localId: armazemId },
  orderBy: { vrSaldo: "desc" },
  take: 50,  // SEMPRE LIMITAR NO BANCO, não em JS
});
```

**Decisão de Intenção (Agente):**

O agente deve **decidir antes de chamar a tool** se a intenção é:
1. **Exaustiva** ("quais são TODOS os produtos no armazém?") → tool retorna até 50, agente reporta "exibindo 30 de 150; use filtro por família para mais detalhes"
2. **Ranking** ("top 10 produtos por valor em estoque?") → tool ordena e retorna 10, agente diz "top 10: [...], restante suprimido"
3. **Amostragem** ("alguns exemplos de produto parado?") → tool retorna 5-10 de forma aleatória

**Como o agente escolhe:**

Embutido na pergunta e capturado pelo router/LLM. Exemplos:

- "Estoque do armazém central" → intenção EXAUSTIVA, mas limitar em 50 por segurança
- "Top 5 produtos mais valiosos no estoque" → intenção RANKING, retornar exatamente 5
- "Dá um exemplo de produto parado há mais de 6 meses" → intenção AMOSTRAGEM, retornar 3-5

### 4.3 Aviso de Limite para Usuário

```json
{
  "estado": "sucesso",
  "dados": {
    "titulos": [ ... ], // <= 30 itens (truncado de 250)
    "_RESPOSTA": "Total em estoque: R$ 1.234.567",
    "_DESTAQUE": "Maior item: Aparelho X, R$ 89.234"
  },
  "_amostraReduzida": {
    "de": 250,
    "para": 30,
    "motivo": "Resultado muito grande. Use _RESPOSTA/_DESTAQUE para totais, ou filtre por família/marca."
  }
}
```

### 4.4 Gaps

| Gap | Severidade |
|-----|-----------|
| **Sem offset/page.** Limite de 50 trunca, mas não permite "próximas 50". | Média - pedir página 2 requer reformular pergunta |
| **Ranking ambíguo.** "Top 10 por quê?" Falta critério em tool. | Alta - tool deve aceitar `orderBy` explícito em input |
| **Cardinality estimator falta.** Tool não diz "resultado teria 1.234 linhas se completo". | Baixa - tool incluiu `_totalRows` em alguns; generalizar |

---

## 5. RBAC / IDENTIDADE: userId, allowedDomains, Integridade de Fluxo

Contrato de segurança end-to-end.

### 5.1 Modelo de Identidade

| Contexto | Portador de Identidade | Estrutura | Caminho de Validação |
|----------|------------------------|-----------|---------------------|
| **In-app (Dashboard)** | `userId` (UUID da tabela `users`) | `{ id, platformRole, domains: ReportDomain[] }` | NextAuth → middleware → session.user |
| **WhatsApp (F5)** | `userId` (gerado ao vincular número à conta) | `{ id, platformRole, domains, whatsappNumber }` | Número WhatsApp → lookup usuario_whatsapp_numbers → userId |
| **API Externa (MCP)** | `apiKey` (token cifrado em `api_keys`) | `{ userId, capabilitiesVersion, allowedDomains, allowedTools }` | Authorization header → lookup api_keys → decrypt → userId |
| **Service Token (Interno)** | `serviceToken` (JWT de curta vida) | `{ userId, iat, exp, action: "sync" \| "admin" }` | Sign na criação → verify em handler |

### 5.2 Estrutura UserContext (Usado em todo MCP)

```typescript
// mcp/auth/user-context.ts
export interface UserContext {
  userId: string;                      // UUID interno
  role: PlatformRole;                  // super_admin | admin | manager | viewer
  domains: ReportDomainId[];          // Lista de domínios concedidos
  isOwner: boolean;                   // Dono da plataforma
  whatsappNumber?: string;            // Se veio via WhatsApp
  apiKeyId?: string;                  // Se veio via API key (rastreabilidade)
  source: "session" | "api_key" | "service_token" | "whatsapp";
}
```

### 5.3 Fluxo de Autenticação por Contexto

#### 5.3.1 Session (Dashboard In-App)

1. Login (form ou OAuth) → NextAuth → JWT em cookie (seguro, httpOnly)
2. Request com cookie → NextAuth middleware → `session.user` extraído
3. `session.user` injetado em `UserContext` automaticamente
4. Tools filtram por `user.role` + `user.domains`

**Arquivo:** `src/lib/auth.ts` + NextAuth config

#### 5.3.2 API Key (Externo, MCP)

1. Superadmin cria API key em UI → gera token aleatório + cifra com AES-256-GCM → armazena em `api_keys` table
2. Cliente (ex. n8n) usa: `Authorization: Bearer ${apiKey}`
3. MCP middleware (`mcp/auth/api-key-lookup.ts`) descifra → valida `capabilitiesVersion` → carrega `UserContext`
4. Se role do usuário mudou desde criação da key: Capability mismatch, rejeita

**Arquivo:** `mcp/auth/api-key-lookup.ts` + `mcp/auth/capability-check.ts`

#### 5.3.3 Service Token (Interno, Worker)

1. Worker inicia sync; precisa chamar MCP com privilégios de admin
2. Gera JWT com `{ userId: SYSTEM_USER_ID, action: "sync", iat, exp: now+5min }`
3. Incluir em header customizado do MCP call
4. MCP valida assinatura

**Arquivo:** `mcp/auth/service-token.ts`

#### 5.3.4 WhatsApp (F5, Futuro)

1. Usuário vincula número WhatsApp em `/settings/integracoes`
2. Cria entrada em `user_whatsapp_numbers` com `{ userId, whatsappNumber, verified: false }`
3. Meta envia SMS de verificação
4. Após verificação, número fica com `verified: true`
5. n8n recebe mensagem WhatsApp, extrai número, faz lookup em `user_whatsapp_numbers`
6. Se encontra `verified=true`, carrega `UserContext` do `userId` associado
7. Cria `Conversation` com `userId` + `agentChannel='whatsapp'`

**Arquivo:** `src/app/api/whatsapp/[...].ts` (F5)

### 5.4 Validação de Domínio (7 Camadas)

Todas executadas em cadeia; falha em qualquer uma = rejeição:

1. **Catálogo (visibleTools):** Tool filtra por domínio antes de aparecer em `/tools/list`
2. **Autorização (assertToolAllowed):** Quando MCP recebe tool call, valida permissão do usuário
3. **Tenant Scoping (injetado em WHERE):** Query ao banco filtra automaticamente por domains do usuário
4. **Row-Level Security (RLS, opcional):** PostgreSQL policy marca dados por domínio; usuário não consegue nem SELECTar fora
5. **Zod Schema:** Input validado; campos como `empresaId` são validados contra lista permitida
6. **Audit Log:** Tool call registrado em `mcp_audit_log` com userId + action + resultado
7. **Rate Limit:** By userId + tool; se exceder, retorna 429 antes de executar

**Arquivo:** `mcp/catalog/registry.ts` + `mcp/auth/capability-check.ts`

### 5.5 Decisão de Domínio no Router R1

Quando o agente recebe uma pergunta, o router (`pickDomains`) escolhe quais domínios consultar:

```typescript
// src/lib/agent/router/pick-domains.ts
const decision = await pickDomains(question, settings, usageCtx);
// Retorna: { pickedDomains: ["estoque", "comercial"], scores: {...}, ... }

// Depois, filtrar catalog para esse usuário + domínios picked:
const visibleTools = filterCatalog(allTools, user, decision.pickedDomains);
```

Se usuário não tem permissão em "fiscal", mas a pergunta "qual é a situação da NF #123?" pega o domínio "fiscal", então:
- Router escolhe "fiscal" → filtro de catálogo exclui tools de fiscal → agente recebe catálogo vazio de fiscal
- Agente responde: "Desculpe, não tenho acesso a informações fiscais. Contate o administrador."

**Arquivo:** `src/lib/agent/router/filter-catalog.ts`

### 5.6 Armadilhas de Identidade

| Armadilha | Risco | Mitigação |
|-----------|-------|-----------|
| **userId vindo do número WhatsApp sem verificação** | Usurpação; alguém simula o número | Exigir SMS de verificação; rastrear tentativas falhas |
| **API key comprometida; não há revogação** | Token vira válido até expiração | Implementar `api_keys.revokedAt`; validar em cada uso |
| **Service token sem rate limit** | Worker pode explorar escalada de privilégio | Limitar criação de tokens; audit todos os "sync" calls |
| **Domain bypass via JOIN malfeito** | Manager de "estoque" consegue ver "fiscal" via JOIN indevido | Usar `visibleDomains(user)` em TODA query; testes de permissão obrigatórios |
| **Roles inconsistentes entre plataforma e API key** | Key criada com super_admin; depois downgrade para manager; key continua super_admin | Validar `capabilitiesVersion` em cada call; deprecar keys antigas |

---

## 6. ARMADILHAS TRANSVERSAIS E PADRÕES DE DEFEITO

### 6.1 JOINs que Duplicam

| Padrão | Causa | Exemplo | Solução |
|--------|-------|---------|---------|
| **N:M sem agregação** | Dois campos many na tabela derivada | `fato_nota_fiscal_item` tem 100 linhas; JOIN com `fato_parceiro` (1 por NF) resulta em 100 linhas de duplicação | Usar SUM/GROUP BY; ou vincular apenas `parceiro_id` (não full join) |
| **Parceiro cliente vs fornecedor** | Um `participante_id` pode ser ambos | Query "faturamento para parceiro X" sem filtrar `eh_cliente` retorna entrada+saída juntas | Sempre filtrar `WHERE eh_cliente=true` ou `eh_fornecedor=true` |

### 6.2 Status que Confundem Entre Domínios

| Campo | Domínio A | Domínio B | Valores em Comum | Armadilha |
|-------|-----------|-----------|------------------|-----------|
| `situacao_nfe` | Fiscal | (N/A) | autorizada, rejeitada, cancelada | NF autorizada != parcela paga |
| `etapa_id` | Comercial | (N/A) | orçamento, pedido, entregando, entregue | Pedido "entregando" ≠ NF "autorizada" |
| `status_sync` | Transversal | Transversal | ok, erro, rodando, sem_acesso | Sync ok no dia anterior; dados podem ter envelhecido 6h após |

### 6.3 Nulos Inesperados

| Campo | Tabela | Frequência | Impacto |
|-------|--------|-----------|--------|
| `participante_id` | `fato_dfe` | ~5% | Entrada de fornecedor desconhecido; não consegue vincular para ROI |
| `preco_custo` | `fato_produto` | ~40% | Não consegue calcular margem; métrica ROI vira gap |
| `dataRecebimento` | `fato_dfe` | ~70% (não manifestado) | Pode contar como "recebido" se não filtrar |
| `centro_resultado_id` | `fato_financeiro_lancamento_item` | ~15% | Rateio não funciona; DRE gerencial incompleta |

### 6.4 Inconsistências de Nomenclatura

| Conceito | Raw | Fato | Odoo |
|----------|-----|------|------|
| **ID único** | `odoo_id` | `odoo_id` | `id` |
| **Timestamp de modificação** | `odoo_write_date` | `atualizado_em` | `write_date` |
| **Timestamp de sincronização** | `synced_at` | (N/A) | (N/A) |
| **Nome do parceiro** | `data->>'name'` (JSON) | `nome` | `name` |
| **Documento (CNPJ/CPF)** | `data->>'vat'` (JSON) | `documento` | `vat` |

---

## 7. TABELAS E CONTAGENS REAIS

### 7.1 Tabelas Raw (Espelhamento do Odoo)

**Total: 126 tabelas raw_***

Distribuição por domínio:
- **Estoque:** 12 (raw_estoque_*, raw_sped_produto*, raw_sped_apuracao*, etc.)
- **Financeiro:** 15 (raw_finan_*, raw_finan_banco*, raw_finan_fluxo*, etc.)
- **Fiscal:** 48 (raw_sped_documento*, raw_sped_operacao*, raw_sped_tabela_preco*, etc.)
- **Comercial:** 5 (raw_pedido_documento, raw_pedido_etapa, raw_pedido_operacao, etc.)
- **Contábil:** 3 (raw_contabil_conta, raw_contabil_conta_referencial, raw_contabil_lancamento*)
- **Produção:** 1 (raw_producao_processo)
- **Cadastros/Referência:** 27 (raw_sped_ncm, raw_sped_cfop, raw_sped_municipio, raw_sped_usuario, etc.)
- **Transversal:** 2 (raw_res_company, raw_res_partner, raw_res_users)

### 7.2 Tabelas Fato (Modelos Derivados)

**Total: 41 tabelas fato_* + dim_***

- **Estoque:** 5 (fato_estoque_saldo, fato_estoque_movimento, fato_produto_parado, fato_produto, fato_preco)
- **Financeiro:** 4 (fato_financeiro_saldo, fato_financeiro_movimento, fato_financeiro_titulo, fato_financeiro_lancamento_item)
- **Fiscal:** 3 (fato_nota_fiscal, fato_nota_fiscal_item, fato_dfe)
- **Comercial:** 3 (fato_pedido, fato_pedido_parcela, fato_pedido_historico)
- **Contábil:** 4 (fato_conta_contabil, fato_contabil_conta_referencial, fato_contabil_lancamento, fato_contabil_lancamento_item)
- **Complementar:** 3 (fato_mdfe, fato_reinf_evento, fato_servico)
- **Dimensões:** 2 (dim_empresa_grupo, fato_parceiro)
- **Metadados:** 1 (fato_build_state)

### 7.3 Ferramentas MCP

**Total: ~35-40 tools semânticas (leitura) + tools de escrita (F4 onda 2)**

Distribuição por domínio (contagem de tool entries definidas):
- **Estoque:** 8-10 tools (saldo_produto, movimento_periodo, produto_parado, etc.)
- **Financeiro:** 8-10 tools (saldo_banco, fluxo_caixa_previsto, titulo_vencido, etc.)
- **Fiscal:** 6-8 tools (nota_fiscal_periodo, dfe_manifestacao, etc.)
- **Comercial:** 5-6 tools (pedido_etapa, conversao_funil, etc.)
- **Cadastros:** 3-4 tools (parceiro_listar, empresa_listar, produto_listar, etc.)
- **Domínio-neutro:** 3 tools (registrar_lacuna, bi_consulta_avancada, etc.)

### 7.4 Queries de Relatórios

**Total: ~35 query files**

Mapeados em `src/lib/reports/queries/` (arquivos .ts, cada um é uma tool de dashboard)

---

## 8. QUESTÕES CATALOGADAS E ANSWERABILITY

### 8.1 Amostra de Questões Respondíveis

Todas suportadas por tools MCP + fatos existentes:

1. "Qual é o saldo de estoque do produto X no armazém Y?" → `saldo_produto`
2. "Qual é o fluxo de caixa previsto para os próximos 30 dias?" → `fluxo_caixa_previsto`
3. "Quais parceiros têm duplicatas vencidas?" → `titulo_vencido` + filtro
4. "Qual foi o faturamento emitido no mês passado?" → `faturamento_emitido` (métrica 3.2.2)
5. "Qual é a taxa de conversão de orçamento para pedido?" → `conversao_funil` (métrica 3.2.3)
6. "Quais produtos estão parados há mais de 6 meses?" → `produto_parado_dias`
7. "Qual é o saldo por conta contábil?" → `saldo_conta_contabil`
8. "Quanto custa manter este estoque parado?" → `custo_carregamento` (métrica 3.2)

### 8.2 Questões Parcialmente Respondíveis

Requerem gaps a ser preenchidos:

1. **"Qual é o ROI por parceiro?"** → `fato_produto.preco_custo` é nulo em ~40% dos registros. Tool retorna com aviso: "ROI incompleto para 40% dos produtos."
2. **"Quais são as margens por família?"** → Requer `preco_custo` + `preco_venda`. Gap se custo ausente.
3. **"Qual é a saúde da empresa?"** → Regras de negócio (thresholds de dias_atraso, % estoque parado) não documentadas em código. Implementa assunção; validar com dono.

### 8.3 Questões Não Respondíveis (Gaps)

1. **"Qual é a previsão de demanda para o próxima mês?"** → Sem histórico de demanda no Odoo. Requer análise estatística externa.
2. **"Qual é o custo de capital para financiar este estoque?"** → Taxa de juros não está em `raw_finan_pagamento_divida.data`. Falta extrair.
3. **"Qual é a melhor estratégia de precificação?"** → Requer otimização matemática; fora do escopo do agente.
4. **"Quem são os top 3 clientes por margem?"** → `preco_custo` ausente em 40%; métrica instável.

### 8.4 Contagem Resumida

- **Answerável Agora:** ~20 questões
- **Parcialmente Respondível (com avisos):** ~8 questões
- **Gaps Conhecidos:** ~5 questões

---

## 9. TOP 5 GAPS MAIS CRÍTICOS

1. **Regras de Negócio Não Documentadas:** Saúde da empresa (§3.2.2), thresholds de "produto parado" (dias, valor), taxa de juros para custo_carregamento. Implementação atual usa assunções; validar com dono.

2. **preco_custo Incompleto:** 40% dos produtos sem custo. Bloqueia ROI, margem, análise de rentabilidade. Requer preenchimento no Odoo ou cálculo aproximado.

3. **Taxa de Juros Não Exposta:** Para métrica de custo_carregamento (§3.2), taxa de juros vive em `raw_finan_pagamento_divida.data` (JSON) sem schema. Precisa extrair e normalizar.

4. **Offset/Paginação:** Limite de 50 corta resultados; sem "próximas 50". Requer implementar page/offset em schemas de tools.

5. **Sincronização de Builder:** Se snapshot roda mas builder falha silenciosamente, `lastSnapshotAt` avança enquanto `fato_*` fica obsoleto. Falta retry + alerting robusto.

---

## 10. MÉTRICAS CANÔNICAS FINALIZADAS

As métricas definidas em §3.1 que o agente deve saber consultar:

1. previsao_fechamento_fiscal
2. faturamento_emitido_vs_recebido
3. saude_empresa
4. cobertura_estoque_dias
5. custo_carregamento_diario
6. fluxo_caixa_previsto_vs_realizado
7. roi_por_parceiro
8. taxa_conversao_funil_pedidos
9. inadimplencia_por_parceiro

---

## 11. COMO ESTE DOSSIER AFETA EXECUÇÃO

Este dossier **define o contrato implementado** do agente. Toda nova ferramenta, métrica ou query deve:

1. **Usar IDs Canônicos:** Entrada sempre validada contra tabelas fato.
2. **Expor Freshness:** Retornar `atualizadoEm` e avisar se > 6h.
3. **Respeitar Limites:** Truncar para 50; preservar canônicos; avisar se truncado.
4. **Validar RBAC:** Filtrar por `user.domains`; lançar erro se não autorizado.
5. **Documentar Gaps:** Se métrica incompleta (ex. ROI), alertar no JSON de saída.

Alterações neste dossier requerem coord do dono e atualização de código em:
- `src/lib/reports/` (queries)
- `mcp/tools/` (handlers)
- `src/worker/fatos/` (builders)
- `src/lib/agent/router/` (filtros de catálogo)

---

## 12. REFERÊNCIAS INTERNAS

- **Sync Config:** `/src/worker/sync/sync-config.ts`
- **Freshness:** `/src/lib/reports/freshness.ts`
- **Domínios RBAC:** `/src/lib/reports/domains.ts`
- **MCP Catalog:** `/mcp/catalog/registry.ts` + `/mcp/catalog/types.ts`
- **Router R1:** `/src/lib/agent/router/pick-domains.ts`
- **Truncamento:** `/src/lib/agent/run-agent.ts` (linhas 79-177)
- **Permissions:** `/src/lib/permissions.ts`
- **Schema Prisma:** `/prisma/schema.prisma`

---

**Fim do Dossier**
