# F2 , PROGRESSO DE EXECUCAO (ponto de retomada)

> Apos compactacao: LER este arquivo + o plano `2026-06-06-f2-entidades-desambiguacao-plan.md` + a spec. Continuar do proximo bloco.

**Branch:** feat/nex-reconstrucao. **Modo:** autonomo, execucao INLINE, commit atomico por bloco. Fase 1 ja em producao.
**DB:** `docker exec nexus-odoo-db-1 psql -U nexus -d nexus_odoo_l1 -c "..."`. Env: `set -a; . ./.env.local; set +a`.
**Reusar:** padrao `resolverEmpresa` de `src/lib/metrics/_shared/empresa.ts`.

## Blocos (ordem do plano v3)
- [x] **Bloco A** , COMPLETO. Helpers em src/lib/entities/: types, _fuzzy, _documento, _classificar-ref (id/documento/codigo_numerico_longo[\d{10,18}]/chave_nfe[\d{44}]/texto), sinonimias (A8 confirmado: pedido 9 tipos, situacao 7, natureza {01,02,04}), _lacuna, index.ts (barrel + adaptador resolverEmpresaGenerica). 5 suites, 49 testes verdes, tsc limpo. Commitado.
  - **B0 FEITO** , fixtures-chave-forte.md commitado (1 registro real por entidade).
  - PROXIMO: Bloco B (8 resolvedores). ANTES de implementar, LER o plano BLOCO B (linha ~194-400) para a logica EXATA de cada ramo (id/chave forte/codigo longo/nome fuzzy com folga); a regra de promover a `unica` vs `ambigua` (limiar + margem de folga sobre o 2o, e o caso de contains retornar 1) precisa vir do plano, nao inventar. Sugestao: criar helper `_ranking.ts` (rankearPorNome) reusavel pelos 9. SEMPRE where no banco; export ao barrel ao fim de cada.
  - CAMPOS DOS MODELS (ja levantados):
    - FatoContaContabil: odooId, codigo (hierarquico com pontos, ex "1.1.01.01"), nome, tipo, nivel, natureza, contaPaiId. Chave: id > codigo(sem pontos, igualdade de digits, anti-falso-positivo "110101"!="1101011") > nome fuzzy.
    - FatoProduto: odooId, nome, codigo, codigoUnico, codigoBarras, ativo, marcaId/Nome, familiaId/Nome, ncmCodigo. Chave: id > codigoUnico/codigoBarras > codigo > nome fuzzy.
    - FatoPedido: odooId, numero (ex "DV-0001/26","TRANSF-0014/26" regex ^[A-Z]+-\d+/\d{2}$), tipo, etapaFinaliza, participanteId/Nome, empresaId. Chave: id > numero(+tipo) > data+tipo/participante (lista).
    - FatoReferencia (natureza): id(autoinc, NAO usar como odooId), tabela, codigo (string "001"), descricao. where tabela='natureza_operacao'. Chave: codigo string (namespace proprio) > descricao fuzzy.
    - Armazem: raw_estoque_local.data JSON (nome_unico lowercase, nome_completo com acento). Sem fato; findMany raw + parse (cardinalidade baixa, excecao documentada).
    - Centro: desnorm em fato_financeiro_lancamento_item (centro_resultado_id, centro_resultado_nome); DISTINCT.
    - Conta Referencial: fato_contabil_conta_referencial (odooId, codigo, nome, nome_completo).
    - NotaFiscal: odooId > chave ^\d{44}$ > intervalo data+entradaSaida (lista). `numero` 100% null, NAO usar.
- [x] **Bloco B** , COMPLETO, commit e4aaaf7. 8 resolvedores + _ranking + barrel. 157 testes verdes, tsc limpo. (Workflow wvp9pu9id implementou os 8 em Opus+TDD; integrei o barrel e validei inline.)
  - DECISOES dos agentes (relevantes p/ C/D): nota-fiscal usa findFirst no ramo chave (chave NAO e @unique; o Bloco C cria @@index([chave]), nao unique). produto CS4: codigo longo sem match = nenhuma. armazem fuzzy por ultimo segmento do parent_path.
- [x] **Bloco C** , COMPLETO. schema.prisma: FatoParceiro.documentoDigits + @@index, FatoNotaFiscal @@index([chave]), comentario codigo nao-indexado em FatoContaContabil. prisma generate OK. Builder fato-parceiro.ts preenche documentoDigits via soDigitos (reuso @/lib/entities/_documento), string vazia => null. Migration MANUAL 20260606211740_f2_entidades_documento_digits aplicada via `migrate deploy`. Backfill bate (6616=6616), BR- limpo, ambos indices presentes. `agente schema-changed` disparado. 12 testes builder verdes, tsc raiz limpo.
- [x] **Bloco C-bis** , COMPLETO. resolverParceiro (src/lib/entities/parceiro.ts): ramo id (classificarRef), ramo documento (classificarDocumento tolera BR-/mascara, busca documentoDigits indexado, 3 formatos => mesmo digits CS5; mesmo doc em 2 cadastros => ambigua; dado real: digits 07390039000101 tem 2 parceiros odooId 1 e 13766), ramo nome fuzzy (OR nome/nomeCompleto + rankearPorNome). DEFAULTS topN3/0.75/0.1. Candidata expoe odooId/nome/nomeCompleto/documento/ehCliente/ehFornecedor/uf/cidade/dataCriacao. Filtros ehCliente/ehFornecedor/ehEmpresa. export ./parceiro no barrel. 12 testes parceiro + 169 entities verdes, tsc/eslint limpos.
- [x] **Bloco D** , COMPLETO (workflow wsnxzjyls, 4 agentes Opus TDD). cadastro_detalhar_produto (cadastros), comercial_detalhar_pedido (comercial), contabil_detalhar_conta (contabil, gatedRoles admin/super_admin, gate testado com assertToolAllowed real), fiscal_detalhar_nota (fiscal, SEM campo numero). Molde detalhar-parceiro; withFreshness real (syncState models: product.product, pedido.documento, contabil.conta, sped.documento). D0 schema-truth: todos os campos confirmados. 19 testes verdes, tsc mcp limpo. (barrel/integration.test integrados no Bloco E inline).
- [x] **Bloco E** , COMPLETO. 4 tools registradas nos barrels (cadastros/comercial/contabil/fiscal). integration.test: 4 IDs nos *_IDS; catalogo 107->111; visivel admin/super_admin 98->102; titulos atualizados (9 cadastros... na vdd 13, 8 contabil, 21 comercial); novo describe de gate contabil_detalhar_conta (viewer/manager negados COM dominio contabil, admin/super_admin permitidos). 53 testes integration verdes. BONUS: corrigi 6 testes herdados/quebrados da F1 em src/lib/reports/queries/fiscal.test.ts (idsNaoVenda desloca calls[0] => usar ultima chamada; borda de periodo agora exclusiva gte/lt, era .lte). Suite inteira: 2618 verdes, 0 falhas, tsc raiz+mcp limpos, eslint 0 erros.
- [x] **Bloco F** , COMPLETO. `docker compose --env-file .env.local build app` (imagem nexus-odoo:local 02:41) + `up -d --force-recreate worker` (app nao sobe na worktree: porta 3000 ocupada pela main, esperado, irrelevante p/ F2) + `up -d --build mcp`. Worker roda .ts via tsx: fato-parceiro.ts e client gerado tem documentoDigits. mcp Up, 4 tools detalhe presentes, servidor na 3100 sem crash. F4 gate: rebuildFatoParceiro real no container => 7069 linhas, 6616 digits (bate backfill); invariante COM_digits_mas_coluna_nula=0; os 304 "doc sem digits" (ex "BR-") corretamente nulos por design. CAUSA do digits=0 transitorio: o worker PRE-rebuild (imagem antiga sem documentoDigits) rodou o cron incremental apos o backfill e zerou os digits; resolvido ao recriar o worker com a imagem nova (agora cada cron MANTEM digits). So existe 1 worker (projeto nexus-odoo); se alguem subir a stack da main com codigo antigo no mesmo DB, voltaria a zerar ate o F2 mergear. `agente schema-changed` ja disparado no Bloco C.
- [ ] **Bloco G** , E2E contra cache real, 1 task por entidade.
- [ ] **Bloco H** , code review + PR.

## Lembretes de raiz
- migrate deploy (nunca migrate dev). Rebuild SEMPRE da worktree + `--env-file .env.local` (senao crash loop). Worker via `build app`.
- tsc raiz + `tsc -p mcp/tsconfig.json` + jest por bloco. Sem travessao.
- Imports: src/ sem `.js`; mcp/tools com `.js`.
- Heartbeat ScheduleWakeup ativo. Avisar usuario quando a F2 fechar; merge = decisao dele (mas ja autorizou seguir).
