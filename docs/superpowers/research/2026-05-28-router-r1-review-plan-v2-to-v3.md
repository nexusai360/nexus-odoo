# Review adversarial v2 → v3 do PLAN R1

Segunda passada critica. Foco: fechar pendencias P1-P7 do v2 + detalhes
que sobreviveram.

## Achados CRITICOS

**C1. P1 (topScore denormalizado) e' mudanca de SPEC.**
SPEC v3 nao tem coluna `topScore`. PLAN v2 A1 adicionou. Resolver:
adicionar **errata SPEC v3.1** documentada em §6.1 do SPEC com nota
explicita. Sem isso, o PLAN nao bate com o SPEC. v3 do PLAN aponta
para a errata.

**C2. P3 (queries Raw vs Prisma client) padrao misturado.**
D2a/c/d/e usam Prisma client. D2b (histograma) usa `$queryRaw`.
Inconsistente. v3 documenta padrao: **default Prisma client; usar
$queryRaw SOMENTE para queries que dependem de funcao Postgres nao
exposta no Prisma (width_bucket)**. Marcar D2b como exceção justificada.

**C3. P4 (comando bateria R-X) ainda nao investigado.**
v3 inclui task G0.2: investigar e documentar comando exato antes da
execucao. Sem isso, G3 fica caixa preta.

**C4. C2 modifica auto-validator.ts arquivo critico.**
auto-validator esta em producao com 95,5%. Modificacao precisa de:
- Feature flag explicita (`routerRetryEnabled` em AppSetting, default
  false na primeira versao do R1; ligar depois).
- Backward compat: parametro novo `routerContext` opcional.
- Codigo do retry isolado em funcao separada (sem misturar com loops
  existentes).

v3 atualiza C2.

**C5. Testes TDD podem rodar antes da implementacao.**
PLAN v2 lista testes (A6a-c, B6a-e) DEPOIS das implementacoes. TDD
diz: teste primeiro. Reordenar:
- Wave A: A6 antes de A1-A5 (teste falha primeiro, implementa, teste
  passa).
- Wave B: B6 antes de B1-B5.

Aceitavel para esta SPEC porque schema/types precisam existir antes
do teste compilar. v3 reconcilia: testes _depois_ de A1-A5 e B1-B5 mas
escritos antes da implementacao real (sketch RED → arquivo
implementacao GREEN).

## Achados ALTOS

**A1. P5 (PR contra main com hotfix pendente).**
v3 verifica: branch `hotfix/lint-travessao-identity-base` ainda esta
local? Se sim, aguardar merge antes de abrir PR do R1 para evitar
conflito em identity-base.ts (R1 nao toca esse arquivo, mas bom
coordenar).

**A2. P6 (chart lib).**
Investigar `package.json` antes de D4b/D4c. Se for recharts, usar
recharts. Documentar em D4b.

**A3. P7 (F2 benchmark subset).**
v3 define: subset de **100 perguntas aleatorias** das rodadas R8-R23,
seed fixo `42` para reproducibilidade.

**A4. D3 sem rate limit.**
Server action de toggle pode ser flood (admin clica varias vezes).
Adicionar rate limit basico: max 10 alteracoes/minuto/user. Usa
infra de rate limit existente do projeto.

**A5. G2 calibragem antes ou depois de D6?**
Calibragem nao depende de UI, depende de B3 (pickDomains). Pode rodar
em paralelo com Wave D. v3 reordena: G2 pode rodar logo apos Wave B
completa.

## Achados MEDIOS

**M1. P2 estrutura do warn.**
Formato canonico:
```
console.warn("[router:log] <operation> failed", {
  decisionId, error: err.message, context: {...}
});
```
Documentar em B5.

**M2. C2 nao especifica se retry counter incrementa.**
auto-validator existente tem retry counter. O retry expandido deve
contar contra o mesmo budget OU ter budget proprio? Decisao: **mesmo
budget**, cap=1 igual ao retry existente. Documentar.

**M3. F1d cenario mais simples.**
"Cenario sintetico dispara retry" vago. v3 detalha: mock validator
retorna `reason='sem_metrica'`, mock decision com `topScore=0.5 <
routerRetryExpandBelow=0.7`, valida que filterCatalog foi chamado
**de novo** com `routerEnabled=false` simulado.

**M4. Wave A6c testes vocabulario.**
v3 adiciona check: SAUDACOES_STOP_LIST contem itens basicos minimos
(oi, ola, bom dia, obrigado, ok).

## Achados BAIXOS

**B1. Tempo total novamente.**
v2 mostrou 54h soma direta vs 22-28h realista. v3 mantem. Sem
mudanca.

**B2. Templates de PR body.**
v3 mantem v2.

## Conclusao

PLAN v2 tem **5 achados criticos** + **5 altos** + **4 medios**.
Mudancas v3:
- Aviso de errata SPEC v3.1 (coluna `topScore` adicionada).
- D2 documenta padrao Prisma vs $queryRaw.
- G0.2 nova task: investigar bateria R-X.
- C2 com feature flag `routerRetryEnabled`, isolamento em funcao
  separada.
- TDD: testes Wave A6 e B6 escritos em RED antes da implementacao GREEN.
- A1 aguardar hotfix se ainda nao mergeado.
- D4 documenta recharts (se confirmado).
- F2 subset 100 perguntas seed 42.
- D3 rate limit 10/min.
- G2 pode rodar apos Wave B (paralelo com D).
- B5 formato canonico de warn.
- C2 reusa budget de retry (cap=1).
- F1d cenario detalhado.

Saida: PLAN v3 no mesmo arquivo. Header "v3 (definitiva para execucao)".
Open questions zeradas.
