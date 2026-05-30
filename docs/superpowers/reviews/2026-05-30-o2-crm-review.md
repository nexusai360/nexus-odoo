# Review da SPEC O2 (CRM)

> Alvo: `docs/superpowers/specs/2026-05-30-o2-crm-spec.md` v1. Gera v2.

## Achados

### O2-R1 (CORRIGE §4), a honest-gap de CRM JÁ EXISTE e é testada
Verificado: `mcp/tools/dominios-vazios/crm-status-dominio.ts` (+ `.test.ts`) já
responde "domínio CRM existente mas não operado (0 registros)". Logo perguntas de
CRM ao Nex já caem numa resposta honesta hoje. **Não há gap a preencher.**

### O2-R2 (CORRIGE §4), registrar 2 raw vazias + migration é over-engineering
A §4 v1 propunha `RawCrmPipeline`/`RawCrmPipelineEtapa` + migration + entradas no
MODEL_CATALOG para 2 modelos de config com 0 registros e `sem_sinal` (o sinal MAIS
fraco de ativação). Isso adiciona schema especulativo e propenso a drift por valor
nulo. P8 ("construir Balde B antes da ativação") faz sentido para módulos com sinal
de ativação (ex.: `sped.mdfe`), não para config de CRM `sem_sinal` que pode nunca
ser usada. **Correção:** O2 NÃO cria raw/migration/catalog. Quando a Matrix ativar
o CRM, uma onda futura registra com dado real.

### O2-R3 (mantém), valor honesto de O2
O valor real de O2 é o **achado documentado** (CRM transacional não existe neste
Odoo; só 2 configs vazias) + a **confirmação** de que a honest-gap + o Router já
cobrem CRM. Isso fecha o item "O2 CRM" do roadmap com a verdade do dado, sem
fabricar tools de conversão sobre tabelas vazias (que seria trabalho fake).

## Veredito
O2 vira uma onda de **documentação + verificação**, sem mudança de schema. Aplicar
R1/R2 gera a SPEC v2. Entrega: (a) este achado documentado, (b) verificação de que
`crm_status_dominio` responde e o Router roteia CRM para ela (teste verde),
(c) registro no STATUS/roadmap de que "CRM real" é gated pela ativação do módulo.
