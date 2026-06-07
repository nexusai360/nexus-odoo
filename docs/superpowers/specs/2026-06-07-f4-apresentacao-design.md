# F4 , Apresentacao (resultados que nao mentem) , spec v1

> Reconstrucao do Nex, Fase 4. Fonte: `docs/superpowers/research/2026-06-06-dossie-MASTER.md` (secoes 5 e 6). Fases 1 (metricas), 2 (entidades), 3 (cerebro) ja em producao.
>
> Modo autonomo: esta spec passa por 2 reviews adversariais antes do plano.

---

## 1. Objetivo

Aplicar a politica de resultados (dossie secao 5) de forma **uniforme e humanizada** em todas as tools MCP. Hoje a camada de apresentacao esta fragmentada: 3 fontes de envelope divergentes (`envelope.ts` nao usado, `FreshnessEnvelope`, `EnvelopeExtras`), so ~44% das tools tem `_RESPOSTA`/`_DESTAQUE`, paginacao 10/50 (nao 50/50), sem Title Case, sem aviso de freshness>6h, e dezenas de tools caem no formatador generico fraco. A F4 elimina essa divergencia: **um envelope canonico, paginacao 50/50 real, ranking com criterio explicito, e humanizacao consistente**. Regra de ouro: **numero sempre vem de codigo; o LLM so redige o texto ao redor do numero.**

## 2. Decisoes canonicas (fixadas com o dono)

1. **Paginacao 50/50:** `PAGINACAO_LIMIT_DEFAULT` passa de 10 para **50**; teto mantem 50. Primeira pagina ja traz ate 50 + `total` real do conjunto + `temMais`/`proximoOffset`. (Otimizacao fina de token e a F6.)
2. **Envelope canonico unico + migrar todas:** definir UM `z.object` de envelope canonico (consolidando as 3 fontes), derivar o tipo TS dele, e migrar as ~107 tools para retorna-lo. As ~60 sem `_RESPOSTA`/`_DESTAQUE` passam a te-los. Habilita o verificador da F3 (V2/V6) a operar em todas.
3. **Humanizacao , os 4 itens entram:** (a) Title Case de nomes; (b) escopo-empresa cross-dominio (generalizar o "considerei o grupo todo" hoje so fiscal); (c) avisos de dado incompleto ("ROI parcial: 40% dos produtos sem custo"); (d) formatador `_RESPOSTA` real para as tools que hoje caem no `fmtGenerico` fraco.
4. **Freshness>6h:** `withFreshness` marca staleness>6h como **sinal interno** no envelope (campo/log), para o agente decidir; **NAO imprime no corpo** (regra vigente do `freshness-stripper`).

## 3. Arquitetura e fluxo

Tudo no servidor MCP (`mcp/lib/` + `mcp/tools/`), sem tocar o motor do agente. O fluxo de uma tool permanece `withFreshness([fatos], query) -> enriquecerEnvelope(...)`, mas:
- o **shape de saida** passa a ser o envelope canonico unico (Zod), retornado por TODAS as tools;
- `enriquecerEnvelope`/`calcularExtras` viram o unico ponto de montagem dos KPIs;
- helpers novos (`titleCase`, `escopo` generico, `cobertura`/aviso-incompleto) sao chamados dentro do formatador/builder.

**Princípio de raiz:** mudanca de contrato (envelope) e ampla; cada onda valida com `tsc` + `jest` (o `integration.test` e a rede) e, onde a tool calcula numero, E2E contra o cache real (regra do projeto). Nenhuma tool pode regredir o numero que ja entrega.

## 4. Envelope canonico unico

### 4.1 Shape (Zod + tipo derivado)
Definir em `mcp/lib/envelope.ts` (substituindo o `ToolEnvelope` morto) um `z.object` canonico , a uniao discriminada por `estado` (preserva o contrato de `withFreshness` que o agente ja consome):

```
EnvelopePreparando = { estado: "preparando" }
EnvelopePronto = {
  estado: "ok" | "vazio",
  dados: {
    _RESPOSTA: string,                  // texto humano, gerado por codigo (cap 500)
    _DESTAQUE?: Record<string, string|number>,
    _agregado?: Record<string, number|undefined>,
    topPorParticipante?: {...}[],
    linhas?: unknown[],
    _PAGINACAO?: { total, mostrando, temMais, proximoOffset },
    _listaTruncada?: boolean,
    _AVISO_TRUNCAMENTO?: string,
    _AVISO_ESCOPO?: string,             // "considerei o grupo todo" (NOVO, cross-dominio)
    _AVISO_INCOMPLETO?: string,         // "ROI parcial: 40% sem custo" (NOVO)
    ambiguidade?: {...},
    redirecionar?: {...},
    [k:string]: unknown,
  },
  atualizadoEm: string,
  atualizadoHa: string,
  fonteStatus: { status, ultimaSyncEm },
  _staleness?: { horas: number, defasado: boolean },  // NOVO, interno (>6h)
}
```

- **Fonte unica:** `buildEnvelope`/`enriquecerEnvelope` passam a produzir exatamente esse shape; `envelope.ts` exporta o `z.ZodType` para as tools reusarem no `outputSchema` (em vez de cada uma redefinir).
- **Compat:** o shape e superset do atual (`FreshnessEnvelope` + `EnvelopeExtras`), entao tools ja conformes nao quebram; as novas chaves sao opcionais.

### 4.2 Migracao das ~60 tools sem envelope canonico
- Cada uma passa a chamar `enriquecerEnvelope` com `_RESPOSTA` (formatador real) + `_DESTAQUE`/`_agregado` quando aplicavel. Lista da auditoria: `cadastros/*` (varias), `financeiro/{saldo-contas,caixa-periodo,resultado-por-conta,liquidez,cobranca-bancaria}`, `estoque/{minimo-maximo,concentracao}`, `comercial/{produtos-por-margem,produtos-por-familia,pedidos-por-uf,tempo-medio-fechamento}`, varios `fiscal/*-por-*` + `dfe-*`/`mdfe`/`certificados`.
- Paralelizavel por dominio (workflow Opus, 1 agente por dominio; o orquestrador integra barrels/índice).

## 5. Paginacao 50/50 real

- `mcp/lib/paginacao.ts`: `PAGINACAO_LIMIT_DEFAULT` 10 -> 50 (teto 50). `montarPaginacaoMeta` ja calcula `total`/`mostrando`/`temMais`/`proximoOffset` , reusar.
- **Fim do truncamento silencioso:** toda tool que lista passa a (a) usar `resolverPaginacao` + `montarPaginacaoMeta`, e (b) expor `_PAGINACAO` via `enriquecerEnvelope`. Tool que corta lista sem reportar `total` e bug a corrigir.
- KPIs (`_RESPOSTA`/`_DESTAQUE`/`_agregado`/topMaiores) calculados sobre o **conjunto inteiro**, nao sobre a pagina (ja e assim nas tools que paginam; garantir nas migradas).

## 6. Ranking com criterio explicito

- Tool de ranking exige `orderBy` no input (criterio semantico) e ordena com **desempate estavel** por `odooId` (molde: `comercial/pedidos-listar-top-valor.ts`).
- "Top N" retorna exatamente N; ranking sem criterio definido e erro (a tool exige o criterio). Alinha com a classificacao de intencao da F3 (ranking).
- Auditar as tools de ranking/top e padroniza-las ao molde.

## 7. Humanizacao

- **Title Case** (`mcp/lib/humanize.ts`, novo): `titleCase(nome)` para nomes crus do banco, com excecoes (siglas UF, "LTDA"/"S.A." preservados, preposicoes minusculas "de/da/do"). Aplicado nas candidatas/linhas/`_DESTAQUE` , nunca em codigo/CNPJ.
- **Escopo-empresa cross-dominio** (`mcp/lib/escopo.ts`, generaliza `fiscal/_escopo-empresa.ts`): `montarEscopoEmpresa(empresaRef, resolvido)` retorna `_AVISO_ESCOPO` ("Considerei o grupo todo (todas as empresas)." / "Considerei apenas a empresa X." / "Nao encontrei a empresa X; considerei o grupo todo."). Reusado por comercial/financeiro/estoque/fiscal.
- **Aviso de dado incompleto** (`_AVISO_INCOMPLETO`): metrica reporta cobertura (`{ considedados, total, campo }`); helper formata "ROI parcial: 40% dos produtos sem custo". So quando a cobertura < 100%.
- **Formatadores reais:** escrever `_RESPOSTA` para as tools hoje no `fmtGenerico` (e completar `TOOLS_QUE_PRECISAM_FORMATADOR` ausentes no registry `FORMATADORES`: ex. `financeiro_saldo_contas`, `fiscal_produtos_faturados`, `estoque_concentracao`).

## 8. Freshness > 6h

- `withFreshness` calcula `_staleness = { horas, defasado: horas > 6 }` a partir do `fonteStatus` (pior fonte). Campo **interno** no envelope; o `freshness-stripper` do agente continua removendo freshness do TEXTO. Util para o agente sinalizar internamente / telemetria. Sem corte de comportamento.

## 9. Reuso vs construcao

| Reusar | Construir/estender |
|---|---|
| `with-responder.ts::enriquecerEnvelope`/`calcularExtras` | `envelope.ts`: z.object canonico unico (substitui o morto) |
| `paginacao.ts` (engine completa) | default 10->50; migrar ~70 tools a paginar |
| `responder.ts` (registry de formatadores + calcs) | formatadores reais p/ tools no fmtGenerico |
| `agrupador.ts::topPorParticipante` | `humanize.ts` (Title Case) |
| `fiscal/_escopo-empresa.ts` | `escopo.ts` (escopo-empresa cross-dominio) |
| `freshness.ts::withFreshness` | `_staleness` (>6h interno) |
| `auto-validator.ts` V2/V6 (enforcement numero) | aviso de dado incompleto (`_AVISO_INCOMPLETO`) |

## 10. Testes e verificacao

- **TDD por helper:** `titleCase`, `escopo`, `_staleness`, builder do envelope canonico (unit com fixtures).
- **Migracao por tool:** cada tool migrada mantem `outputSchema` valido contra o z.object canonico; `integration.test` verde (catalogo intacto).
- **E2E contra cache real** (regra de raiz): para tools que calculam numero, conferir que o numero NAO mudou com a migracao (so ganhou envelope/humanizacao). Subconjunto via tsx contra `nexus_odoo_l1`.
- **tsc raiz + `mcp/tsconfig.json` + jest** verdes por onda; rebuild do `mcp` da worktree `--env-file .env.local`; provar envelope no `tools/list` do container.

## 11. Fora de escopo (YAGNI)

- Golden dataset / evals formais -> F5.
- Custo/latencia (token do 50/50) -> F6.
- Telas/dashboard (Frente A) -> fora da reconstrucao do agente.
- Reescrever o motor do agente; trocar provider de LLM.
- Exibir freshness no corpo da resposta (regra vigente: stripper remove).

## 12. Criterios de sucesso

- Um unico envelope canonico (Zod) retornado por TODAS as tools; 0 tools no shape divergente; `envelope.ts` deixa de ser "de papel".
- Paginacao 50/50 real em toda tool que lista; `total`/`temMais` sempre presentes; fim do truncamento silencioso.
- Ranking exige criterio explicito + desempate estavel.
- Humanizacao: nomes em Title Case; "considerei o grupo todo" em todos os dominios; avisos de dado incompleto onde a cobertura < 100%; nenhum `_RESPOSTA` cair no generico fraco.
- Freshness>6h sinalizado internamente, sem vazar no texto.
- Numero identico ao atual (so apresentacao muda): E2E contra dado real prova que nenhuma metrica regrediu.
