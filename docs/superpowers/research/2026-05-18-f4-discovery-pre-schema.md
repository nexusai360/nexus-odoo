# Discovery onda 0 — pré-schema F4 completo

> **Fonte única de verdade** para a onda A (schema) e os builders da onda B
> (comercial) e onda E (contábil). A onda A e os builders consultam **só** este
> arquivo — não o `…-completo-dominios.md`. Criado pela task O.1; complementado
> pelas tasks O.2 e O.3.

---

## Discovery onda 0 — Comercial

> Task O.1 — executado em 2026-05-18 contra o cache real (container `db`).

### Flag de etapa final (`raw_pedido_etapa`)

```
CAMPO_ETAPA_FINAL = "finaliza_pedido_confirmando"
```

- Campo booleano confirmado por inspeção de `raw_pedido_etapa` (LIMIT 10) e
  por análise de todas as chaves booleanas do JSON.
- O campo `finaliza_pedido_confirmando` é **booleano puro** (não array, não
  objeto). Cobertura:
  - `false` → 180 etapas (88,7 %)
  - `true`  →  23 etapas (11,3 %)
  - Total: 203 etapas ativas (`raw_deleted=false`)

- O candidato `finaliza_pedido` **não existe** como campo autônomo — o nome
  real e definitivo é `finaliza_pedido_confirmando`.

### Campo `selection` de tipo de pedido (`raw_pedido_documento`)

```
CAMPO_TIPO_PEDIDO = "tipo"
```

- O campo `tipo_documento` **não existe** no JSON de `raw_pedido_documento`
  (coluna retornou null para todos os registros).
- O campo real é **`tipo`**. Valores literais e distribuição:

| Valor                      | Quantidade |
|----------------------------|------------|
| `venda`                    | 69         |
| `inventario`               | 1          |
| `transferencia_solicitacao`| 1          |
| **Total**                  | **71**     |

- Os 3 valores acima são **a lista completa** de valores presentes no cache.
  O builder B.1 usa `String(raw.tipo ?? "")` — sem enum Prisma (fail-safe SPED).

---

## Contábil — `raw_contabil_conta`

> Task O.2 — executado em 2026-05-18 contra o cache real (container `db`).

### Cobertura geral

- Total de registros ativos (`raw_deleted=false`): **934**
- Campos `codigo`, `nome`, `nivel`, `parent_path` presentes em **100 %** dos
  registros (934/934).
- Campo `active` **ausente** do JSON (não retornado pela API do Odoo Tauga para
  este modelo) — não usar no fato.

### Campos efetivamente preenchidos e nomes reais

| Campo real (raw)       | Nome no fato (`FatoContaContabil`) | Tipo Prisma  | Cobertura |
|------------------------|------------------------------------|--------------|-----------|
| `id`                   | `odooId`                           | `Int @id`    | 100 %     |
| `codigo`               | `codigo`                           | `String`     | 100 %     |
| `nome`                 | `nome`                             | `String`     | 100 %     |
| `tipo`                 | `tipo`                             | `String`     | 100 %     |
| `nivel`                | `nivel`                            | `Int?`       | 100 %     |
| `natureza`             | `natureza`                         | `String?`    | 100 % *   |
| `conta_superior_id[0]` | `contaPaiId`                       | `Int?`       | 99,5 %    |
| `conta_superior_id[1]` | `contaPaiNome`                     | `String?`    | 99,5 %    |
| `parent_path`          | `parentPath`                       | `String?`    | 100 %     |
| `caracteristica_saldo` | `caracteristicaSaldo`              | `String?`    | 100 %     |
| `eh_redutora`          | `ehRedutora`                       | `Boolean`    | 100 %     |

> `*` `natureza` sempre preenchido, mas apenas 3 valores literais (ver abaixo).

### Valores `selection` do campo `tipo`

| Valor  | Significado        | Quantidade |
|--------|--------------------|------------|
| `A`    | Analítica (folha)  | 597        |
| `S`    | Sintética (grupo)  | 337        |
| **Total** |                 | **934**    |

O builder usa `String(raw.tipo ?? "")` — sem enum Prisma.

### Valores `selection` do campo `natureza`

| Valor  | Quantidade |
|--------|------------|
| `04`   | 386        |
| `01`   | 300        |
| `02`   | 248        |
| **Total** | **934** |

> Significados (plano de contas brasileiro): `01` = Ativo, `02` = Passivo,
> `04` = Resultado (Receita/Despesa). O builder usa `String(raw.natureza ?? "")`.

### Valores `selection` do campo `caracteristica_saldo`

| Valor | Significado    | Quantidade |
|-------|----------------|------------|
| `C`   | Credora        | 929        |
| `D`   | Devedora       | 5          |
| **Total** | | **934** |

### Cobertura de `conta_superior_id` (pai)

- Com pai (`conta_superior_id != false`): **929** (99,5 %)
- Sem pai (raízes do plano): **5** (0,5 %)

### Lista final cravada de colunas — `FatoContaContabil`

A seguir a lista **verbatim** a ser usada pela task A.3 (schema Prisma) e pela
task E.1 (builder). Colunas ordenadas como no schema:

```prisma
model FatoContaContabil {
  odooId               Int      @id @map("odoo_id")
  codigo               String
  nome                 String
  tipo                 String                          // "A" | "S"
  nivel                Int?
  natureza             String?                         // "01" | "02" | "04"
  contaPaiId           Int?     @map("conta_pai_id")
  contaPaiNome         String?  @map("conta_pai_nome")
  parentPath           String?  @map("parent_path")
  caracteristicaSaldo  String?  @map("caracteristica_saldo")  // "D" | "C"
  ehRedutora           Boolean  @default(false) @map("eh_redutora")
  atualizadoEm         DateTime @default(now()) @map("atualizado_em")
  @@index([tipo])
  @@index([natureza])
  @@index([contaPaiId])
  @@map("fato_conta_contabil")
}
```

### Mapeamento `raw → fato` campo a campo

| Campo raw               | Campo fato              | Extração no builder                                                  |
|-------------------------|-------------------------|----------------------------------------------------------------------|
| `raw.id`                | `odooId`                | `raw.id` (Int)                                                       |
| `raw.codigo`            | `codigo`                | `String(raw.codigo ?? "")`                                           |
| `raw.nome`              | `nome`                  | `String(raw.nome ?? "")`                                             |
| `raw.tipo`              | `tipo`                  | `String(raw.tipo ?? "")`                                             |
| `raw.nivel`             | `nivel`                 | `typeof raw.nivel === "number" ? raw.nivel : null`                   |
| `raw.natureza`          | `natureza`              | `raw.natureza ?? null`                                               |
| `raw.conta_superior_id` | `contaPaiId`            | `Array.isArray(raw.conta_superior_id) ? raw.conta_superior_id[0] : null` |
| `raw.conta_superior_id` | `contaPaiNome`          | `Array.isArray(raw.conta_superior_id) ? String(raw.conta_superior_id[1]) : null` |
| `raw.parent_path`       | `parentPath`            | `raw.parent_path ?? null`                                            |
| `raw.caracteristica_saldo` | `caracteristicaSaldo` | `raw.caracteristica_saldo ?? null`                                  |
| `raw.eh_redutora`       | `ehRedutora`            | `raw.eh_redutora === true`                                           |

> `active` não é mapeado — campo ausente da API Odoo Tauga para este modelo.
> O filtro de linhas ativas é feito via `rawDeleted = false` (padrão de todos
> os builders).

---

## Conferência onda O.3

> Task O.3 — conferência e consolidação em 2026-05-18.

### Checklist de presença (conferido contra a SPEC v3 §3.1 e §3.4)

**Comercial (§3.1):**
- [x] `CAMPO_ETAPA_FINAL` cravada: `"finaliza_pedido_confirmando"`
- [x] `CAMPO_TIPO_PEDIDO` cravado: `"tipo"`
- [x] Lista literal de valores de `tipo`: `["venda", "inventario", "transferencia_solicitacao"]`
- [x] Cobertura de `finaliza_pedido_confirmando=true`: 23/203 etapas

**Contábil (§3.4):**
- [x] Colunas-base propostas pela SPEC confirmadas contra dado real
- [x] `active` ausente da API → removida do fato (sem impacto — filtro é `rawDeleted`)
- [x] `tipo` (`"A"`/`"S"`) confirmado
- [x] `natureza` (`"01"`/`"02"`/`"04"`) confirmado
- [x] `caracteristica_saldo` (`"D"`/`"C"`) confirmado
- [x] `conta_superior_id` é array `[Int, String]` → extração `[0]`/`[1]`
- [x] Lista final de colunas cravada (verbatim acima)
- [x] Mapeamento `raw → fato` campo a campo cravado (tabela acima)

### Achados bloqueantes

**Nenhum.** Toda coluna prevista na SPEC v3 tem fonte real identificada. A
onda A pode prosseguir com o schema definitivo.
