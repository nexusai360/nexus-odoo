# Reviews adversariais , SPEC B1 Contábil

Duas reviews genuínas (Opus) sobre a SPEC, conforme metodologia §6[3-4]. Ambas acharam
material relevante (review fake = falha). A SPEC v3 incorpora todos os achados.

## Review #1 (sobre a v1) , achados B1R-*

- **B1R-1 (BLOQUEADOR):** o `RawContabilContaReferencial` e a entrada no `MODEL_CATALOG` do
  `contabil.conta.referencial` JÁ existem; a v1 mandava criar 3 raws. → raws novos são **2**.
- **B1R-2/B1R-3 (BLOQUEADOR):** o mecanismo "tool oculta até ativação" NÃO tem caminho limpo
  (`ToolEntry` não tem flag de visibilidade; `visibleTools` filtra só por domínio/role/
  sempreVisivel). `withFreshness` não protege fato-vazio (responde "vazio", não "preparando",
  pois `markFatoBuilt` roda com 0 linhas). → abandonar ocultação; usar padrão honesto visível.
- **B1R-4 (MATERIAL):** filtrar `lancamento.tipo` (encerramento zera o resultado). Denormalizar
  `lancamentoTipo` no item.
- **B1R-5 (MATERIAL):** a única tool visível seria quase decorativa , admitir honestamente.
- **B1R-6/B1R-8:** join item→natureza para o resultado precisa estar fixo; `natureza=resultado`
  é conta de transição.
- **B1R-7 (MENOR):** persistir `valor` E `valor_debito`/`valor_credito` (evita rebuild na ativação).

## Review #2 (sobre a v2) , achados B1R2-*

- **B1R2-1 (BLOQUEADOR):** as tools `contabil_saldo_conta`/`contabil_movimento_conta` que a v2
  dizia "já existir e retornar sem_dado" **NÃO EXISTEM**. O domínio contábil tem só 2 tools
  (`contabil_plano_de_contas`, `contabil_estrutura_conta`). → são **5 tools NOVAS**, zero upgrade.
- **B1R2-2 (BLOQUEADOR):** `estado:"sem_dado"` não existe no projeto e conflita com o envelope
  `withFreshness` (`preparando|ok|vazio`). → regra única: usar `withFreshness`; "vazio" + _RESPOSTA
  honesto; sem vocabulário novo.
- **B1R2-3 (MATERIAL):** contagens exatas: integration 74→79 visíveis, 83→88 bruto, CONTABIL_IDS
  2→7; texto cosmético "47 tools" na linha 542.
- **B1R2-4 (MATERIAL):** model-catalog 114→**116** (só 2 raws novos; referencial já está) + set
  `MODELOS_B1` no teste.
- **B1R2-5 (MATERIAL):** `fato_conta_contabil` JÁ tem `natureza` (confirmado ao vivo:
  `contabil.conta.natureza` usa `01..09`, igual à referencial). → o resultado agrupa pela
  natureza da própria conta; `FatoContabilContaReferencial` deixa de ser dependência da DRE
  (mantido pelo próprio valor + validação real).
- **B1R2-6 (MATERIAL):** "DRE por natureza" é simplista , renomear para
  `contabil_resultado_por_natureza`; DRE estruturada fica para a ativação.
- **B1R2-7 (MENOR):** `contabil_dominio` não existe , remover da tabela.
- **B1R2-8/9/10 (MENOR):** `FATO_FONTE` +3 explícito; não tocar `registry.test`/
  `schema-endpoint.test` (tools sintéticas); não há `.snap` (snapshot é `mcp-catalog-snapshot.json`
  via `gen:mcp-catalog`); domínio `contabil` do Router já existe (só enriquecer, length=9).

## Veredito
v2 reprovada (2 bloqueadores invalidavam a tese). **v3 reescrita do zero aterrada só em fatos
verificados ao vivo.** Pronta para virar PLAN.
