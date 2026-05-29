# Review adversarial #2 da SPEC R2 (mais profunda)

> Alvo: `docs/superpowers/specs/2026-05-29-r2-discovery-enxuto-spec.md` v2.
> Objetivo (CLAUDE.md §6 [4]): caçar o que a review #1 não pegou. Foco em
> testabilidade, integração com a infra real, robustez do dado, e utilidade do
> output. Aplicar achados gera a SPEC v3 (a que vai para o plano).

## Achados materiais

### B1 (BLOQUEADOR de testabilidade), jest não enxerga `scripts/`
`jest.config.ts` tem `roots: ["<rootDir>/src", "<rootDir>/mcp"]`. Logo os testes
pareados previstos pela SPEC v2 §7 em `scripts/discovery/baldes/*.test.ts`
**nunca rodariam**, quebrando o requisito de TDD (CLAUDE.md §6 [8]) e a verificação
§8.3. **Correção (decisiva):** mover a lógica de verdade (módulos puros
testáveis) para `src/lib/discovery/baldes/`, exatamente como o R1 fez
(`src/lib/agent/router/calibrate.ts` testado + `scripts/router/...ts` wrapper
fino). Só o orquestrador de I/O (`run.ts`) e o wrapper de RPC ficam em `scripts/`
(não testados por jest; validados no E2E). Reescrever §7 com este layout.

### B2 (MAIOR), detecção de abstract por string de erro é frágil em pt-BR
SPEC v2 §4.5 mapeia abstract via "OdooRpcFault com 'does not exist'/'abstract'".
A Tauga responde em **português** (ex.: "O modelo ... não existe"), então o match
por substring inglês falharia e o modelo cairia em `nao_classificados` para
sempre. **Correção:** classificar por TIPO de erro, não por texto:
- `OdooAccessError` → C-técnico `acesso_negado`.
- Qualquer outro `OdooRpcFault`/`OdooError` que sobreviva aos 3 retries num
  modelo que JÁ passou o filtro offline → C-técnico `abstract_ou_inexistente`
  (um modelo real responderia ao COUNT; se erra de forma persistente e não é
  acesso, é abstract/inexistente/defeituoso).
- Apenas falha de rede/timeout (`AbortError`/`HttpClientError`/erro de fetch após
  retries) → `nao_classificados` (transitório, re-rodável). O `OdooClient` já
  separa esses tipos; usar o tipo, não a mensagem.

### B3 (MAIOR), entrada de Balde C não define o campo `count`
A SPEC v2 §5.1 só exemplifica A e B. Modelos C classificados offline nunca
chamam RPC, então não têm count. **Correção:** padronizar `count: null` para
C-offline (motivo de classificação registra a regra), e `count: <int>` ou
`count: null` conforme o caminho para C-via-erro (acesso_negado/abstract têm
`count: null`; baixo_volume_nao_negocio tem o count medido). Documentar no schema.

### B4 (MAIOR de utilidade), output sem a descrição humana do modelo é pouco útil
`sped.mdfe`, `finan.cheque` etc. são crípticos. O `schema.json` já traz `name`
(descrição: "Alçada", "Base para chaves PIX"...). Sem ela, o relatório obriga
quem for planejar a onda a cruzar à mão com o schema. **Correção:** cada entrada
do `baldes.json` e cada linha do relatório carrega `descricao` (o `name` do
schema). Custo zero (já está no insumo).

### B5 (MAIOR de integração), estratégia de env estava superdimensionada
A SPEC v2 §7 herdou o `import "./load-env"` do padrão do R1. Verificado: o
`OdooClient` (`src/worker/odoo/client.ts`) importa só `./errors` e NÃO arrasta o
PrismaClient, que era a única razão do `load-env` (prisma lê env no import). O R2
não toca Prisma. **Correção:** dispensar `load-env`; o npm script usa
`tsx --env-file=.env.local scripts/discovery/baldes/run.ts` (mesmo padrão dos
scripts `worker` e `mcp` no `package.json`). Mais simples e sem dependência
indireta de prisma.

### B6 (MENOR), determinismo do `--limit`
"primeiros N modelos" depende da ordem de iteração. **Correção:** explicitar
"primeiros N na ordem de chaves do `schema.json`" (ordem de inserção preservada
em JS). Para smoke reproduzível, suficiente.

### B7 (MENOR), `por_dominio` deve listar TODOS os baldes mais não-classificados
SPEC v2 §5.1 mostra `por_dominio` só com A/B/C. **Correção:** incluir
`nao_classificados` por domínio também, senão a soma por domínio não fecha com o
total do domínio. Coerência com o gate de partição (§8.4).

### B8 (NOTA), confirmar alias e local importável
Verificado: `tsconfig` mapeia `@/* -> ./src/*`. Logo os módulos puros em
`src/lib/discovery/baldes/` são importáveis como `@/lib/discovery/baldes/...`
tanto pelos testes (jest `moduleNameMapper`) quanto pelo `run.ts` em `scripts/`
(tsx resolve o alias do tsconfig). Sem mudança, só registro.

## Veredito
SPEC v2 tinha 1 bloqueador de testabilidade (B1, mata o TDD), 3 maiores
(B2 robustez de erro, B3 schema incompleto, B4/B5 utilidade e integração) e
menores. A arquitetura conceitual segue sólida; os ajustes são de aterrissagem na
infra real (jest roots, tipos de erro, alias, env). Aplicar B1-B7 e registrar B8
produz a SPEC v3, pronta para o plano.
