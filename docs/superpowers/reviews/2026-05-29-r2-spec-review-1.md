# Review adversarial #1 da SPEC R2 (Discovery enxuto)

> Alvo: `docs/superpowers/specs/2026-05-29-r2-discovery-enxuto-spec.md` v1.
> Objetivo (CLAUDE.md §6 [3]): caçar erro, inconsistência, premissa frágil,
> requisito ambíguo, o que falta. Aplicar achados gera a SPEC v2.

## Achados materiais

### A1 (BLOQUEADOR), contradição entre §4.1 e §4.4 sobre `ir.*`
§4.4 afirma "`ir.*` classificados C-técnico **por prefixo**", mas a lista de
prefixos de UI/infra da regra §4.1.3 **não inclui `ir`**. Logo, pela regra
escrita, os 70 modelos `ir.*` cairiam no RPC e seriam classificados por volume
(muitos `ir.*` têm volume alto: `ir.attachment`, `ir.model.data` com 106k xml_ids,
`ir.translation`), indo parar no Balde A indevidamente. **Correção:** incluir `ir`
na lista de prefixos técnicos da §4.1.3 e remover a regra-exceção solta do
`ir.attachment` (ver A2).

### A2 (MAIOR), exceção `ir.attachment -> Balde B` é incoerente
`ir.attachment` costuma ter milhares de registros (todo binário/PDF do ERP). Marcá-lo
"Balde B" (vazio/baixo) é factualmente errado e não agrega: anexo não é domínio de
negócio consultável pelo Nex. **Correção:** remover a exceção; `ir.*` inteiro vai
para C-técnico por prefixo. Se algum dia anexos virarem valor, é decisão de onda
específica, não do R2.

### A3 (MAIOR), `rh`/`res`/`reinf` na lista de negócio jogam modelos mortos no Balde B
§4.3 lista `rh` como prefixo de negócio. O roadmap (e o STATUS) registram que **RH
tem 0 registros e não é operado** pela Matrix. Pela regra atual, os 19 `rh.*`
virariam Balde B (a construir antes de ativar), gastando esforço futuro num módulo
sem sinal de ativação, o que contraria o espírito "não consome esforço" do roadmap.
**Correção:** o Balde B precisa de um qualificador de `previsao_ativacao` com
heurística concreta (ver A4); modelos de negócio vazios SEM sinal de ativação ficam
em B mas marcados `previsao_ativacao: "sem sinal"`, e o relatório os separa
visualmente dos B "com sinal" (ex.: `sped.mdfe`). Assim a onda decide com dado, e
o R2 não descarta nem promete à toa.

### A4 (MAIOR), `previsao_ativacao` é citada mas nunca definida
§4.3, §5.1 mencionam `previsao_ativacao` sem critério. Vira campo subjetivo.
**Correção:** definir heurística determinística e barata com o que já temos:
- `"em uso"`: count > 0 (tem algum registro, mesmo abaixo de 50).
- `"instalado, sem uso"`: count == 0 mas o prefixo do módulo tem OUTROS modelos
  com count > 0 (módulo presente e parcialmente populado).
- `"sem sinal"`: count == 0 e nenhum modelo do mesmo prefixo tem dado.
Tudo computável a partir do próprio passe de contagem, sem RPC extra.

### A5 (MENOR), a §9 confia errado no throttle do client para limitar taxa
O `throttleMs` (150ms) do `OdooClient` é um `sleep` por chamada DENTRO de um
client; com concorrência 6 sobre uma instância, ele só adiciona latência, não
serializa as 6 chamadas em voo. A spec dá a entender que "concorrência 6 +
throttle" protege a Tauga, o que é impreciso. **Correção:** definir explicitamente
o controle: pool de concorrência fixo (ex.: 6) com um único client; aceitar que são
até 6 COUNT simultâneos (operação barata); não atribuir ao throttle um papel de
rate-limit que ele não cumpre. Documentar o custo: ~652 COUNT, lote de 6, ~2-4 min.

### A6 (MENOR), critério de saída do E2E (§8.4) é mole
"amostragem de ~10 faz sentido" não é gate. **Correção:** gate duro:
`A + B + C + nao_classificados == 652` (partição exata) **E**
`nao_classificados == 0` após eventual re-rodada com `--only`. Mais: pelo menos os
5 domínios prioritários com 100% dos seus modelos classificados (0 não-classificados
nesses prefixos).

### A7 (MENOR), `--only` não especifica recomputo de agregados
§6: ao reclassificar parte dos modelos, `totais` e `por_dominio` ficam stale.
**Correção:** após o merge dos modelos do `--only`, recomputar `totais` e
`por_dominio` a partir do dict `modelos` completo (fonte única da verdade).

### A8 (MENOR), mapeamento prefixo -> "domínio prioritário" não pinado
A §5.2 promete destaque dos 5 prioritários sem fixar o mapa.
**Correção:** pinar: SPED Fiscal=`sped`, CRM=`crm`, Pedido=`pedido`,
Financeiro=`finan`, Contábil=`contabil`. Demais prefixos = "secundário/outros".

### A9 (NOTA), confirmar fonte canônica do universo de modelos
Verificado nesta review: `Models (ir.model).xlsx` traz só
`Model, Description, Type, Transient` (Type sempre "Base Object", sem coluna
abstract), idêntico ao `schema.json`. Conclusão: `schema.json` É a fonte canônica
correta para o script TS (JSON nativo, traz `transient`, cobre os 652). Os 11 xlsx
não acrescentam sinal útil ao R2. D1/§3 confirmados, sem mudança. Registrar na v2
para não reabrir o assunto.

## Veredito
SPEC v1 tem 1 bloqueador (A1), 3 maiores (A2-A4) e achados menores. A premissa
central (offline filtra C, RPC separa A/B, precedência determinística) é sólida.
Aplicar A1-A8 e registrar A9 produz a SPEC v2.
