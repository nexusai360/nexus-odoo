# SPEC , B5 Produção (pré-build estrutural)

> Onda B5. SPEC v1 → review #1 → v2 → review #2 → v3. Aterrada no discovery
> (`scripts/discovery/b4b7.ts`).

## Discovery (fato real)
| Modelo | Reg | Situação |
|---|---|---|
| `producao.processo` | 1 | operado marginalmente (1 registro) |
| `producao.centro.trabalho` | 0 | não operado |
| `producao.parametro.qualidade` | 0 | não operado |
| `producao.alteracao.materia.prima` (+.item) | 0 | não operado |

Já existe `producao_status_dominio` (tool de domínio-vazio) dizendo "produção não
operada". B5 acrescenta o fato/tool real de **processo de produção**.

## v1
FatoProducaoProcesso + FatoCentroTrabalho + FatoParametroQualidade +
FatoAlteracaoMateriaPrima + 4 tools.

## Review #1
- 3 dos 4 modelos têm 0 reg e ~170 colunas não validáveis → over-modeling.
  CORTAR centro.trabalho, parametro.qualidade, alteracao.materia.prima(.item).
- Só `producao.processo` (1 reg) tem dado para aterrar. Entregar 1 fato + 1 tool.
- Campos reais (sem mixin `sistema_*`/`currency_*`): `ordem`(int), `nome`(char),
  `descricao`(text), `tempo`(monetary). Simples e suficiente.

## v2
FatoProducaoProcesso (1 fato) + tool `producao_processos`. Demais cortados.

## Review #2
- `tempo` é `monetary` no Odoo (provavelmente tempo padrão do processo em alguma
  unidade) → guardar como Decimal sem inventar unidade; expor cru.
- A tool deve ser honesta como as outras (count==0 → "não operado"), mas aqui
  count==1, então responde normalmente com o processo existente. Auto-ativa para
  N processos quando a produção escalar.
- Wiring idêntico ao B4 (registry/FATO_FONTE/FATO_CATALOG/MODEL_CATALOG/BI_REF/
  integration/model-catalog). Domínio do FATO_CATALOG: "Produção".
- `producao_status_dominio` continua (não conflita; é status macro do domínio).

## v3 (FINAL)
### Fato
`FatoProducaoProcesso` (← `producao.processo`, raw novo `raw_producao_processo`):
`odooId, ordem, nome, descricao, tempo`. Índice: ordem.

### Tool (domínio `comercial`? NÃO , novo domínio)
`producao_processos`: lista processos de produção (ordem, nome, descrição, tempo).
Filtro `limite`. Honesta (count==0 → "não operado"). **Domínio:** verificar se
`producao` é um ReportDomain válido; se não, usar o domínio existente das tools de
produção (`producao_status_dominio` usa `sempreVisivel`/domínio-vazio). Decisão na
T0 do plano: checar enum ReportDomain.

### Cortado (não modelado até operar)
centro.trabalho, parametro.qualidade, alteracao.materia.prima(.item).

### Verificação
tsc/eslint/jest verdes. E2E: builder popula 1 linha (o processo real) + build_state.
Frontend: nenhum.
