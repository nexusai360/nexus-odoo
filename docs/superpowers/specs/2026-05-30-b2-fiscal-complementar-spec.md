# SPEC , B2 Fiscal complementar (MDF-e + REINF): pré-build estrutural

> **Onda:** B2 do plano Balde B (`docs/superpowers/plans/2026-05-30-balde-b-pre-ativacao.md`).
> **Versão:** v2 (2026-05-30). **v1 estava ERRADA** (dizia MDF-e/REINF inexistentes e
> `sped.consulta.dfe`=6288); corrigida com `search_count`/`fields_get` ao vivo confirmados
> contra produção. O usuário confirmou operar o fiscal complementar.

## 1. Achado de modelo (real, JSON-RPC ao vivo , CORRIGIDO)

| Modelo | Existe? | count | fields | Conclusão |
|---|---|---|---|---|
| `sped.consulta.dfe` | SIM | **35** | 14 (3 rel.) | Controle de NSU por empresa/modelo. **Marginal** (não é fato de negócio). |
| `sped.mdfe` | **SIM** | **0** | 118 (39 rel.) | MDF-e (manifesto de transporte). Módulo INSTALADO, **não operado**. Estrutural. |
| `reinf.evento` | **SIM** | **0** | 222 (40 rel.) | Eventos REINF (obrigação acessória). Instalado, não operado. Estrutural. |
| `reinf.evento.item` | **SIM** | **0** | 197 (32 rel.) | Itens do evento REINF. Estrutural. |
| `sped.mdfe.documento`, `mdfe.documento`, `sped.documento.mdfe`, `sped.reinf*` | NÃO | , | "Objeto desconhecido" , não existem (variantes erradas). |

**Correção vs v1:** `sped.mdfe` e `reinf.evento`/`.item` **EXISTEM** como modelo (0 reg) , são
Balde B estrutural legítimo (pré-build honesto, igual ao lançamento contábil do B1), NÃO
"inexistentes". O `sped.consulta.dfe` tem só 35 reg de controle de NSU (empresa, último NSU
consultado, modelo) , baixo valor de negócio.

### 1.1 Campos REAIS confirmados via `fields_get` ao vivo (nomes exatos , usar estes)
- `sped.consulta.dfe` (35): `empresa_id`→sped.empresa, `modelo`(sel 55=NF-e/57=CT-e/03=NFS-e),
  `ultimo_nsu`(char), `item_ids`→sped.consulta.dfe.item. (Já há o `.item` no O1 = `fato_dfe`.)
- **`sped.mdfe`** (0 reg): `chave`(char), `numero`(**float** → mapear String), `situacao_mdfe`(sel),
  `situacao_fiscal`(sel), `tipo_emissao_mdfe`(sel), `empresa_id`→sped.empresa,
  `empresa_cnpj_cpf`(char), `empresa_participante_id`→sped.participante,
  `data_emissao`/`data_autorizacao`/`data_encerramento`/`data_cancelamento`(date) (+ variantes
  `data_hora_*` datetime), `protocolo_autorizacao`/`protocolo_cancelamento`/
  `protocolo_encerramento`(char), `municipio_carregamento_id`/`municipio_descarregamento_id`→
  sped.municipio (+ `*_ids` m2m), `peso_bruto`(float), `peso_carga`(monetary), `vr_nf`(monetary).
  **NÃO existe `serie`/`uf_inicio`/`uf_fim`/`placa` como campo direto** (a v desta SPEC que os
  citava estava errada). Carga/UF de transporte ficam em modelos filhos não cobertos aqui.
- **`reinf.evento`** (0 reg): `chave`(char), `tipo`(sel `R-1000`/`R-1050`/`R-1070`/...),
  `tipo_federal`(sel `R-4010`/`R-4020`/...), `tipo_inss`(sel), `situacao`(sel `em_digitacao`/
  `a_enviar`/`enviado`/`rejeitado`), `protocolo_transmissao`(char), `empresa_id`→sped.empresa,
  `empresa_cnpj_cpf_raiz`(char), `data_evento`/`data_inicial`/`data_final`(date),
  `data_hora_evento`/`data_hora_autorizacao`(datetime).
- **`reinf.evento.item`** (0 reg): `evento_id`→reinf.evento, `documento_id`→sped.documento,
  `modelo`(sel RPA/ND/NC/FL/...), `tipo`(sel R-1000...), `tipo_retencao`(sel INSS/FEDERAL),
  `tipo_servico`(sel), `empresa_id`, `data_emissao`/`data_inicial`/`data_final`(date). (Item:
  avaliar se vira fato , decisão Task 0.)

> Schema dos fatos B2 (a recriar na execução, com ESTES nomes): `FatoMdfe`(odooId, chave,
> numero String, situacaoMdfe, situacaoFiscal, tipoEmissao, empresaId, empresaCnpj, dataEmissao,
> dataAutorizacao, dataEncerramento, dataCancelamento, protocoloAutorizacao,
> municipioCarregamento via relNome, municipioDescarregamento via relNome, pesoBruto Decimal,
> pesoCarga Decimal, vrNf Decimal); `FatoReinfEvento`(odooId, chave, tipo, situacao,
> protocoloTransmissao, empresaId, empresaCnpjRaiz, dataEvento, dataInicial, dataFinal).

## 2. Escopo da onda (estrutural, honesto)

### 2.1 Fatos
- `FatoMdfe` (de `sped.mdfe`, estrutural) , 1 linha por manifesto. Honesto "não operado" até popular.
- `FatoReinfEvento` (de `reinf.evento`, estrutural) , cabeçalho. (Itens: avaliar `FatoReinfEventoItem`
  na Task 0; se o item não agregar além do cabeçalho com 0 dados, adiar como no rateio do B1.)
- **`sped.consulta.dfe` (35): NÃO vira fato nesta onda.** É controle de NSU (sem valor de gestão);
  documentar. Se um dia for útil cruzar lote→empresa, reabrir.

### 2.2 Tools (domínio `fiscal`), padrão honesto data-driven do B1
- `fiscal_mdfe_manifestos` , manifestos de transporte por período (chave, número, UF, valor da
  carga, status). Fato vazio → `withFreshness` "vazio" + `_RESPOSTA` "MDF-e não operado ainda".
- `fiscal_reinf_eventos` , eventos REINF por período/tipo/status. Mesmo padrão honesto.
- Reusa exatamente o padrão das tools contábeis de gestão do B1 (`count()===0` → mensagem honesta;
  auto-ativa quando popular). SEM mecanismo de ocultação (decisão do B1 §0, mesma aqui).

### 2.3 Raws novos no `MODEL_CATALOG`
`sped.mdfe`, `reinf.evento` (e `reinf.evento.item` se virar fato). Modo `incremental`. Entram no
painel "Estado da ingestão". (`sped.consulta.dfe.item` já está; o header marginal pode entrar só
se virar fato , não vai.)

## 3. Não-objetivos / fora de escopo
- `sped.mdfe.documento` etc. (não existem). MDF-e/REINF geração (é emissão fiscal).
- `sped.consulta.dfe` como fato (marginal). CT-e completo (não há modelo dedicado encontrado).

## 4. Campos de semântica incerta (BB-1) , marcar `// CONFIRMAR na ativação`
Como há 0 registros em MDF-e/REINF, valor/base/retenção e selects de status confirmam-se na
amostra real quando popular (igual ao lançamento contábil do B1). Builder defensivo + anotações.

## 5. Checklist de ativação (quando MDF-e/REINF forem operados)
1. `npm run discovery:baldes -- --only sped.mdfe,reinf.evento,reinf.evento.item` → Balde A.
2. `searchRead(limit 3)` real → conferir campos marcados `// CONFIRMAR`.
3. Build + E2E (números coerentes); calibrar Router + bateria R-X; liberar confiança nas tools.

## 6. Padrão de implementação
Idêntico a B1 (estrutural): Task 0 inspeciona `sped.mdfe`/`reinf.evento`(.item) reais e fixa os
mappers → migration aditiva (2-3 raw + 2-3 fato) → `MODEL_CATALOG` + builders + testes →
`FATO_BUILDERS`/`FATO_FONTE` → query layer + testes → 2-3 tools honestas → índice `fiscal` +
bumps → `BI_SCHEMA_REFERENCE` + vocab → `gen:mcp-catalog` → rebuild pasta principal. E2E real
não é possível agora (0 reg) → o gate é a ativação (§5), igual ao lançamento contábil do B1.

## 7. PLAN
PLAN curto sobre esta SPEC, com Task 0 de inspeção real de `sped.mdfe` e `reinf.evento`(.item)
ANTES de fixar schema/builder. A migration toca o Postgres dev compartilhado , AVISAR e usar o
workaround de drift (db execute + migrate resolve, como no B1). Não iniciar a migration com
contexto curto.
