# Review adversarial #1 do PLAN R2

> Alvo: `docs/superpowers/plans/2026-05-29-r2-discovery-enxuto.md` v1.
> Objetivo (CLAUDE.md §6 [6]): lacunas, ordem, premissas, bugs no código do plano.
> Aplicar achados gera o PLAN v2.

## Achados

### P1 (MAIOR de testabilidade), `agregar` deveria viver em `src/` e ser testado
A função `agregar(modelos, nao)` em `run.ts` (Task 8) é o coração da garantia da
review A7 (agregados sempre derivados do dict `modelos`, fonte única da verdade,
incl. no caminho `--only`). Por estar em `scripts/`, o jest não a cobre e a
garantia fica sem teste. **Correção:** extrair `agregar` para
`src/lib/discovery/baldes/aggregate.ts` com testes pareados (incl. caso de merge:
totais batem após sobrescrever um modelo). `run.ts` importa de `@/lib/...`. Vira
Task 8 nova (antes do run.ts) e o run.ts deixa de declarar `agregar`/`contZero`.

### P2 (MENOR de robustez), cálculo de `previsao_ativacao` no run.ts é frágil
Em Task 8, a Fase 2 remove "o count deste modelo" do array do prefixo via
`indexOf(count)` antes de chamar `previsaoAtivacao`. É desnecessariamente
engenhoso: como `count > 0` já curto-circuita para `em_uso` dentro de
`previsaoAtivacao`, e a remoção só importa quando `count === 0` (que nunca remove
um valor `> 0`), passar **a lista completa** de counts do prefixo como `outros`
produz o mesmo resultado, com menos risco. **Correção:** no run.ts, passar
`countsPorPrefixo.get(dom) ?? []` direto, sem `indexOf`. (Assinatura de
`previsaoAtivacao` não muda; a semântica "há algum modelo do prefixo com dado"
fica explícita.)

### P3 (MENOR de utilidade), seção de prioritários despeja Balde C junto
Em Task 7, `linhasModelos(r.modelos, e => e.dominio === dom)` lista TODOS os
modelos do domínio, incluindo dezenas de C-técnicos (sped tem 256 modelos). Na
seção "o que pode virar tool", o C é ruído. **Correção:** na seção dos
prioritários, listar só A e B (acionáveis) e exibir a contagem de C como nota
("+N técnicos descartados"). Ajustar o teste do report para refletir.

### P4 (NOTA, confirmado), tsconfig permite o código como está
Verificado: `strict` sem `noUncheckedIndexedAccess` (indexação devolve `T`, então
`items[i]`/`out[i]` em `comPool` não precisam de guard); `isolatedModules` aceita
`import { clientFromEnv, type OdooClient }`; `include: **/*.ts` faz o tsc checar
`scripts/run.ts`; `target ES2017` faz downlevel de `??=`/`?.` sem erro. Race em
`countsPorPrefixo.set([...get, count])` é segura: o bloco após o `await searchCount`
é síncrono, não há interleaving entre read e write. Sem mudança, só registro.

### P5 (MENOR operacional), E2E precisa confirmar a credencial de maior alcance
D5 da spec manda rodar sob `joaozanini` (uid 11). O `.env.local` pode apontar
outro usuário. **Correção:** Task 10 Step 2 deve conferir o `uid=` impresso e
registrar no relatório/commit qual uid rodou; se for um usuário restrito, muitos
`acesso_negado` falsos inflam o Balde C, então o passe definitivo roda sob o
quase-admin. (Operacional, não muda código.)

### P6 (NOTA), ordem das tasks após extrair `agregar`
Com P1, a numeração muda: inserir "Task: aggregate.ts (TDD)" como Task 8 e
empurrar run.ts/package/E2E para 9/10/11. O Self-Review do plano cita §, manter.

## Veredito
Plano sólido e executável; código correto (P4 confirma compilação). Achados são 1
maior de testabilidade (P1), e refinamentos (P2 robustez, P3 utilidade, P5
operacional). Aplicar P1-P3 + P5 e registrar P4/P6 gera o PLAN v2.
