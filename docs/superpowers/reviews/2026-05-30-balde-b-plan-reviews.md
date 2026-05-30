# Reviews adversariais do plano Balde B pré-ativação

> Alvo: `docs/superpowers/plans/2026-05-30-balde-b-pre-ativacao.md` v1.
> Duas passadas genuínas (CLAUDE.md §6 [6]/[7]). Achados aplicados geram o v3.

## Review #1 (lacunas, premissas, ordem)

### BB-1 (BLOQUEADOR de premissa), "fields_get com 0 registros" garante estrutura, NÃO semântica
O v1 assume que dá para construir o fato certo só com a estrutura (`fields_get`). Falso
para a SEMÂNTICA: com 0 registros não dá para saber qual campo é débito vs crédito, como
`tipo`/`sinal` se comportam, se `vr_*` é valor com ou sem sinal, qual a FK real do pai.
No O1/O3/O4 a `searchRead(limit 3)` de AMOSTRA foi o que corrigiu premissas erradas
(O1 trocou a fonte inteira; O3 achou os 204 negativos; O4 cortou metade dos candidatos).
Sem amostra, há risco alto de mapear errado e ter retrabalho na ativação. **Correção:**
o v3 deixa explícito que o build Balde B é ESTRUTURAL e que os campos de semântica
incerta ficam marcados "confirmar contra os primeiros registros reais"; a tool nasce
defensiva (não inventa regra que não dá para verificar).

### BB-2 (MAIOR), filtrar transient/wizard/abstract ANTES de criar fato
Alguns Balde B com count 0 podem ser wizard/transient/abstract que passaram (ex.:
`contabil.executa.demonstracao` parece relatório/wizard, não fato). Construir fato sobre
eles é lixo. **Correção:** antes de cada fato, rodar `fields_get` + checar `transient`/
nome (`.wizard`/`.executa`/`.arvore`/`.modelo.impressao`) e descartar , reusar os
critérios do R2 (`classify.ts`).

### BB-3 (MAIOR de ordem/ROI), confirmar com o usuário QUAIS módulos vão ativar
`instalado_sem_uso` não garante ativação , a Matrix pode fazer contabilidade/CRM em
OUTRO sistema e nunca popular esses modelos no Odoo. Pré-construir 7 ondas que talvez
nunca recebam dado é investimento alto sem retorno garantido. **Correção:** o v3 marca a
priorização como PROPOSTA a confirmar com o usuário/contador: quais módulos a Matrix
realmente vai operar no Odoo. B1 (contábil) só vira #1 se confirmado que a contabilidade
será lançada no Odoo. Caso contrário, "pronto para construir rápido" (o padrão + R2
re-rodado já dão velocidade) pode valer mais que pré-construir no escuro.

## Review #2 (testabilidade, regra de raiz, profundidade)

### BB-4 (BLOQUEADOR, tensão P8 × §6[9]), tool Balde B não tem E2E contra dado real
A regra de raiz §6[9] é inegociável: "TS/lint/jest não bastam; toda onda exerce as tools
contra o cache real populado". Tool Balde B com 0 registros **não pode** cumprir isso ,
seria a PRIMEIRA tool do projeto entregue sem o E2E obrigatório. **Correção (resolução
explícita no v3):** pré-build Balde B é uma categoria à parte, "estrutural / não
validado contra dado real", e o E2E real vira um **gate de ATIVAÇÃO obrigatório** (não de
build): quando os primeiros registros reais chegarem, roda-se o E2E e a calibração ANTES
de a tool ser considerada confiável/visível em produção. Adicionar ao v3 um
**"checklist de ativação" por fato** (re-rodar R2, conferir campos contra amostra real,
E2E, calibrar, então liberar). Sem isso, a tool fica `sempreVisivel:false`/oculta até ativar.

### BB-5 (MAIOR), validação sintética via base de teste é incerta , não prometer
O v1 promete "criar 1-3 registros de teste" na base de escrita
(`grupojht.teste.tauga.online`). Essa é outra instância: pode não ter os módulos
custom configurados (plano de contas contábil, sequências) para criar um lançamento
válido. **Correção:** o v3 não promete isso como garantido. Validação = teste unitário do
builder/query com mock realista derivado do `fields_get` (obrigatório) + criação de
registro de teste APENAS se a base de teste permitir (oportunístico, não bloqueante).

### BB-6 (MÉDIO), tools que dependem de cruzamento podem nascer quebradas
Ex.: `contabil_balancete` precisa de saldo acumulado por conta , se o builder do fato
não materializar débito/crédito corretamente (BB-1), o balancete fica errado e
"validado" só por mock. **Correção:** marcar no v3 que tools de agregação contábil
(balancete/DRE) só passam do estado "estrutural" para "confiável" após o E2E de
ativação com dado real (BB-4).

### BB-7 (NOTA), escopo realista do CRM e do "Balde B" total
O v1 já registra que CRM transacional não existe (bom). Reforçar no v3: dos 268 Balde B,
a maioria é config/dimensão pequena (não merece fato/tool isolado); o build foca nos
modelos TRANSACIONAIS que vão crescer (lançamento, remessa, cotação, produção,
min/max), não em tabelas de domínio (dia.mes, forma.pagamento, etc., que entram como
dimensão desnormalizada nos fatos, como já se faz).

## Síntese para o v3
Aplicar: BB-1 (estrutural + semântica a confirmar na ativação), BB-2 (filtrar
transient/wizard antes do fato), BB-3 (priorização = PROPOSTA a confirmar quais módulos
ativam), BB-4 (categoria "não validado" + gate de ativação obrigatório + checklist por
fato + tool oculta até ativar), BB-5 (não prometer registro de teste; mock obrigatório),
BB-6 (agregações contábeis só "confiáveis" pós-ativação), BB-7 (focar transacional, não
dimensão). O v3 vira um plano honesto: constrói a ESTRUTURA pronta, mas deixa explícito
o que só fecha quando houver dado, e pede a confirmação do usuário sobre quais módulos
realmente vão ser operados no Odoo antes de investir nas 7 ondas.
