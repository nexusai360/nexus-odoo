# Review adversarial #2 do PLAN R2 (granularidade, integração, cobertura)

> Alvo: PLAN v2. Objetivo (CLAUDE.md §6 [7]): cobertura da spec, granularidade,
> integração, testabilidade. Aplicar achados gera o PLAN v3 (vai para execução).

## Achados

### Q1 (MAIOR, cobertura de spec), falta a seção "Balde C por motivo"
A SPEC v3 §5.2 lista como requisito do relatório: "Lista do Balde C com motivo
agregado (quantos por motivo)". O `report.ts` da Task 7 produz sumário, por
domínio e prioritários, mas **não** agrega o Balde C por motivo. Sem isso, não dá
para auditar quantos modelos caíram em C por `transient` vs `prefixo_ui_infra` vs
`abstract_ou_inexistente` vs `acesso_negado` etc., que é justamente o que valida
se o filtro está sadio (ex.: muitos `acesso_negado` => credencial errada, D5).
**Correção:** adicionar seção "## Balde C por motivo" no `report.ts` (contagem por
`motivo`) e um teste que confirme a contagem. É a peça que fecha a auditabilidade.

### Q2 (MEDIO, integração/compilação), import header incremental de classify.ts
`classify.ts` é construído em 3 tasks (2, 3, 4), cada uma mandando "adicionar
import de ./types/./constants" com nota de "juntar". Risco real de o executor
deixar dois `import ... from "./types"` no arquivo (erro de duplicado) ou esquecer
`PrevisaoAtivacao`. **Correção:** fixar no PLAN v3, no fim da Task 4, o estado
final canônico do topo de `classify.ts`:
```ts
import { BALDE_A_MIN, PREFIXOS_NEGOCIO, PREFIXOS_UI_INFRA, SUFIXOS_TECNICOS } from "./constants";
import type { Balde, Motivo, ModeloSchema, PrevisaoAtivacao } from "./types";
```
Uma linha de import por origem, sem duplicar. Remove a ambiguidade.

### Q3 (MENOR, integração), confirmar que o eslint cobre `scripts/`
A verificação roda `eslint src/lib/discovery/ scripts/discovery/`. Se a config do
eslint só inclui `src/`, lintar `scripts/discovery/` pode dar "no files" ou erro.
**Correção/registro:** os scripts do R1 vivem em `scripts/router/` e passam no
fluxo, então o eslint cobre `scripts/`; manter o comando. Se reclamar, lintar só
`src/lib/discovery/` (o run.ts é glue de I/O coberto pelo E2E). Sem mudança de
código.

### Q4 (NOTA, testabilidade), fake client em count-client.test é válido
Verificado: um `{ executeKw: <T>(model: string) => ... }` é atribuível a
`ContadorRpc` (função com menos parâmetros é atribuível à que espera mais, em TS).
O `as unknown as Promise<T>` no fake é aceitável em teste. A chamada real
`executeKw<number>(model, "search_count", [[]])` envia `args=[[]]` = `search_count([])`
(domínio vazio), que é a chamada Odoo correta. Sem mudança.

### Q5 (NOTA, granularidade aceitável), Task 9 (run.ts) é um bloco grande sem teste
A decomposição máxima do método pede tasks pequenas, mas `run.ts` é I/O glue puro:
toda a LÓGICA (classificação, erro, agregação, relatório) já está em módulos `src/`
testados (Tasks 1-8). O `run.ts` só lê schema, chama RPC com pool, monta o objeto e
escreve arquivos, validado no E2E (Task 11), espelhando o `calibrate-against-batteries.ts`
do R1. Mantido como uma unidade. Sem mudança.

## Veredito
Plano executável e bem decomposto. 1 achado maior de cobertura (Q1, requisito da
spec não implementado) e 1 médio de robustez de compilação (Q2). Aplicar Q1 e Q2,
registrar Q3-Q5, gera o PLAN v3 pronto para execução.
