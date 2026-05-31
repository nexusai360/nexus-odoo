# SPEC , B7 CRM (limitado) + Auditoria (pré-build)

> Última onda do Balde B. SPEC v1 → review #1 → v2 → review #2 → v3.

## Discovery
| Modelo | Reg | Situação |
|---|---|---|
| `crm.pipeline` | 0 | config, não operado |
| `crm.pipeline.etapa` | 0 | config, não operado |
| `auditoria.regra` | 15 | **operado** (regras de auditoria) |
| `auditoria.log` | 313.434 | operado, **volume alto** |
| `auditoria.log.item` | 14.004.719 | operado, **14 MI , volume enorme** |

## v1
FatoCrmPipeline + FatoCrmEtapa + FatoAuditoriaRegra + FatoAuditoriaLog +
FatoAuditoriaLogItem. 5 fatos + tools.

## Review #1 (achados materiais)
1. **auditoria.log.item (14 MI) e auditoria.log (313 mil) NÃO entram no cache**
   nesta passada estrutural: 14 milhões de linhas estouram o modelo de
   sincronização incremental (e o valor analítico exige design próprio:
   particionamento, retenção, agregação). CORTAR do cache; documentar como
   "trilha de auditoria de alto volume , fora de escopo do pré-build; consultar
   ao vivo/agregado em onda dedicada se necessário".
2. `crm.pipeline.etapa` (0 reg) → over-modeling; o funil real (lead/oportunidade)
   nem existe neste Odoo (achado O2). Modelar só `crm.pipeline` (config do funil).
3. Sobra: `FatoCrmPipeline` (estrutural, 0 reg) + `FatoAuditoriaRegra` (15 reais).

## v2 / Review #2
- `crm` É ReportDomain → tool de pipeline gated em `crm` (sem sempreVisivel).
  Já existe `crm_status_dominio` (sempreVisivel) e `crm.res_partner.get`.
- `auditoria` NÃO é ReportDomain → tool de regras é `sempreVisivel` (padrão
  producao/dominios-vazios). Campos da regra: `ativa`(bool), `nome`(char),
  `dias`(monetary , janela/retenção). Simples e reais (15 reg) , E2E valida.
- Honestidade: crm_pipeline count==0 → "funil não operado"; auditoria_regras
  count==15 → responde normalmente.

## v3 (FINAL)
### Fatos (2)
- `FatoCrmPipeline` (← `crm.pipeline`, raw novo): `odooId, numero, nome, tipo,
  ativo`. Índice: ativo. (0 reg hoje; auto-ativa.)
- `FatoAuditoriaRegra` (← `auditoria.regra`, raw novo): `odooId, nome, ativa,
  dias`. 15 reg reais.

### Tools (2)
- `crm_pipeline_funis` (dominio `crm`): lista funis cadastrados. Honesta.
- `auditoria_regras` (sempreVisivel): lista regras de auditoria (nome, ativa,
  janela em dias). Responde com as 15 regras reais.

### Fora de escopo (documentado)
`auditoria.log` (313k) e `auditoria.log.item` (14 MI): trilha de alto volume; não
cacheada no pré-build. Onda futura dedicada se houver demanda (com retenção/
agregação). `crm.pipeline.etapa`, e o CRM transacional (inexistente, ver O2).

### Verificação
tsc/eslint/jest. E2E: crm_pipeline 0 + build; auditoria_regra 15 reais + build.
Frontend: nenhum.
