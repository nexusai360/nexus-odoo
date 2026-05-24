# SPEC v3: Auditoria e refatoração da documentação do Servidor MCP + correções no wizard de chaves

**Data:** 2026-05-24
**Autor:** Claude (Opus 4.7), modo autônomo
**Status:** v3, pronta para plano
**Branch alvo:** `feat/f4-leitura-expansao`
**Escopo no roadmap:** F4 (servidor MCP), trilho de UX e documentação. Não cria tools novas, não muda contratos de auth.

> **Histórico de reviews críticos:** v1 fechou em 2026-05-24 03:55. Review #1 derrubou várias premissas erradas (a doc JÁ é data-driven, `getMcpCatalogSchema` JÁ existe via snapshot JSON, `deriveModuleWriteActions` JÁ deriva ações por módulo, `DialogContent` JÁ tem `max-h-[90vh]`). Review #2 expôs o bug real do placeholder visual (`"..."` em vez de valores tipados) e o motivo do wizard descartar `cadastros` (filtro `MCP_MODULES.includes(...)` em `deriveModuleWriteActions` rejeita módulos fora do canônico, e `ACTION_CODE_TO_WRITE` não mapeia `archive`). v3 substitui v1 inteira; v1 e v2 ficaram em memória/observation apenas.

---

## 1. Contexto real (validado contra o código)

A página `/integracoes/servidor-mcp/docs` é renderizada por:
- Server Component: `src/app/(protected)/integracoes/servidor-mcp/docs/page.tsx`
- Client Component: `src/components/integracoes/servidor-mcp/mcp-docs-content.tsx` (1231 linhas)

O Server Component já carrega o catálogo (`getMcpCatalogSchema()` em `src/lib/actions/mcp-catalog-schema.ts`) e o passa como prop `catalog: CatalogByModule[]`. O catálogo vive como snapshot JSON em `src/lib/mcp-catalog-snapshot.json`, gerado pelo script `scripts/gen-mcp-catalog-snapshot.ts` (`npm run gen:mcp-catalog`). O snapshot reflete o registry MCP em `mcp/catalog/registry.ts` em tempo de build.

O Client Component já renderiza as tools dinamicamente: `ToolCard` em `mcp-docs-content.tsx:471` itera sobre `catalog` e, para cada tool, decide entre exemplos do catálogo (`tool.examples`) e fallback gerado (`buildExamples()` em `:413`).

**Onde está o problema, então.** A doc não está estaticamente errada; ela tem três falhas distintas:

1. **Conteúdo mal escrito.** A seção "Como começar", "Conceitos", "Fluxo de chamada", o card de Autenticação e o card de rodapé foram escritos antes da decisão da separação dos modos de auth. O exemplo da seção de autenticação parece autenticar mas é uma chamada já autenticada, sem rótulo. O card "Idempotency-Key UUID v4" no rodapé não diz onde gerar nem por quê. O exemplo de write tool exibe `<SERVICE_TOKEN>` + `<USER_ID>` + `<API_KEY>` + `Idempotency-Key`, misturando modo externo e interno no mesmo bloco.

2. **Placeholder visual ruim.** `buildExamples()` recebe `sampleArgs[k] = "..."` (string de 3 pontos) para cada campo do schema. Quando serializado em JSON, vira `"apenasClientes": "..."`. O usuário leu como bug ("ficou parecendo quebrado"). É placeholder textual sem tipo, não bug. Solução: gerar placeholder por tipo do campo.

3. **`MCP_MODULES` desatualizado.** Tem 10 módulos, sem `cadastros`. `deriveModuleWriteActions` em `src/lib/mcp-capability-levels.ts:44` filtra `if (!modules.includes(mod.module)) continue;` e descarta `cadastros` inteiro do `ModuleWriteActionsMap`. Além disso, `ACTION_CODE_TO_WRITE` (linha 35) só mapeia `create / update / delete / transition`, não `archive`, então `cadastros.res_partner.archive` é silenciosamente descartado mesmo se cadastros entrar. Resultado prático: o card CRM mostra "Create" (1 write) corretamente, mas Cadastros não aparece, e Archive não é selecionável em lugar nenhum.

## 2. Objetivos

Entregar:

1. Reescrita do conteúdo textual da doc, com sidebar reorganizado em três grupos (Visão geral, Integrar de fora, Operar por dentro), exemplos auditados, headers explicados em seção própria, e separação rígida entre modo externo e interno.

2. Correção do gerador de exemplos para usar valor tipado por campo, eliminando o `"..."` em todas as tools.

3. Inclusão de `cadastros` em `MCP_MODULES`, inclusão de `Archive` em `WRITE_ACTIONS`, mapeamento `archive → "Archive"` em `ACTION_CODE_TO_WRITE`, label de `Archive` em `WRITE_ACTION_LABELS`.

4. Validar empiricamente o comportamento do modal do wizard com 11 módulos. O DialogContent já tem `max-h-[90vh] overflow-hidden flex flex-col` e o body tem `overflow-y-auto`; se o cap estiver funcionando (esperado), nenhuma mudança extra. Se houver bug de overflow em algum caso, corrigir pontualmente.

5. Atualizar `servidorMcpDocsTour` se IDs de âncora mudarem.

Fora de escopo: criar tools novas, alterar middleware de auth, mexer no servidor MCP em si, traduzir a doc.

## 3. Decisões canônicas

D1. **Doc em uma página só, 3 grupos no sidebar.** Decidido 2026-05-24 com o usuário (não criar página separada em /agente/plugar-mcps). Estrutura final:

```
VISÃO GERAL
  Início
  Conceitos
  Códigos de erro
  Rate limits

INTEGRAR DE FORA (modo externo, Bearer mcp_live_*)
  Como começar
  Autenticação
  Headers obrigatórios
  Fluxo de chamada
  Tools de leitura
  Tools de escrita

OPERAR POR DENTRO (modo interno, MCP_SERVICE_TOKEN + X-Mcp-User-Id)
  Quando usar
  Service token e identidade
  Restrição de escrita
  Exemplo: Agente Nex
```

D2. **Modo interno some do exemplo público de escrita.** O exemplo cURL da seção Tools de escrita usa só `Authorization: Bearer mcp_live_*`, `Content-Type`, `Idempotency-Key`. O texto sobre modo interno (incluindo o que ele NÃO pode fazer) fica em "Operar por dentro".

D3. **`MCP_MODULES` ganha `"cadastros"`.** Posição: após `vendas`, antes de `estoque`. Tipo `McpModule` se atualiza por inferência. `capabilities` JSON existentes continuam válidas; nenhuma migration necessária (campo é JSON sem FK).

D4. **`WRITE_ACTIONS` ganha `"Archive"`.** `SENSITIVE_ACTIONS` permanece `["Delete", "Transition"]`. Archive é reversível, não exige confirmação dupla. Adicionar em `WRITE_ACTION_LABELS` (`chaves-lista.tsx:101`): `Archive: "Arquivar"`.

D5. **`ACTION_CODE_TO_WRITE` ganha `archive: "Archive"`** em `src/lib/mcp-capability-levels.ts:35`.

D6. **Segmento "Leitura e escrita" sempre visível, desabilitado quando módulo não tem write.** Confirmado com o usuário 2026-05-24: não esconder o segmento, manter no DOM, marcar `aria-disabled`, cursor `not-allowed`, sem `onPress`, tooltip "Sem tools de escrita publicadas neste módulo ainda".

D7. **Placeholder de exemplo passa a ser tipado.** O snapshot ganha `inputSchemaFields: Array<{name, type, optional}>` ao lado de `inputSchemaKeys` (mantido para retrocompat na transição). O gerador em `scripts/gen-mcp-catalog-snapshot.ts` extrai tipo do Zod schema. `buildExamples` em `mcp-docs-content.tsx` usa o tipo para gerar valor:
- `string` → `"<exemplo>"`
- `number` / `integer` → `1`
- `boolean` → `true`
- `date` / `datetime` → `"2026-05-24"` / `"2026-05-24T00:00:00Z"`
- `enum` → primeiro valor literal do enum
- `array` → `[]`
- `object` → `{}`
- desconhecido → `"<valor>"`

Tools que já têm `examples: [...]` populado pelo registry permanecem usando isso (catalogExamples), o gerador só atua no fallback.

D8. **Catálogo continua via snapshot JSON.** `getMcpCatalogSchema()` permanece. O script `npm run gen:mcp-catalog` precisa ser rodado após qualquer mudança no registry ou no formato do snapshot. Adicionar nota no README do MCP.

D9. **Modal mantém o cap atual a menos que falhe na verificação.** `DialogContent` em `chaves-lista.tsx:783` já tem `sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col`. Body interno tem `flex-1 overflow-y-auto`. Verificação empírica vai dizer se com 11 módulos no passo 2 o scroll interno está funcionando. Se sim, sem mudança. Se não, hipóteses prováveis: (a) `min-h-[280px]` está empurrando o footer; (b) `sm:max-w-2xl` (672px) está estreito demais e força altura. Mitigação: aumentar largura para `sm:max-w-3xl` (768px), reduzir `min-h-[280px]` para `min-h-[200px]`.

D10. **Sem mudança no contrato de auth.** `mcp/dispatcher/check-mode.ts` já garante `write+internal → forbidden_via_internal_auth`. A doc apenas reflete isso, não muda.

## 4. Mudanças por arquivo

### 4.1 `src/lib/actions/mcp-api-keys-types.ts`
- `MCP_MODULES`: adicionar `"cadastros"` após `"vendas"`.
- `WRITE_ACTIONS`: adicionar `"Archive"`.

### 4.2 `src/lib/mcp-capability-levels.ts`
- `ACTION_CODE_TO_WRITE`: adicionar `archive: "Archive"`.

### 4.3 `src/components/integracoes/servidor-mcp/chaves-lista.tsx`
- `WRITE_ACTION_LABELS`: adicionar `Archive: "Arquivar"`.
- `LevelSegmented` (componente do segmento "Sem acesso / Leitura / Leitura e escrita"): aceitar prop `writeDisabled?: boolean`. Quando true, o segmento `"write"` recebe `aria-disabled="true"`, `onPress` no-op, classes Tailwind reduzidas (`opacity-50 cursor-not-allowed`), tooltip via `title` ou primitiva tooltip do design system.
- Renderizador do passo 2 (linha 530): passa `writeDisabled={(moduleWriteActions[mod] ?? []).length === 0}` para `LevelSegmented`.
- Quando `writeDisabled` e o `access.level !== "write"`, NÃO renderiza o card expandido inferior (linha 564) com microcopy "nenhuma ação". Em vez disso, o tooltip do segmento explica.
- Se `access.level === "write"` (legado, capability salva antes da mudança) E `writeActions.length === 0`, manter a microcopy atual como graceful fallback.

### 4.4 `scripts/gen-mcp-catalog-snapshot.ts`
- Estender o serializer para extrair, do Zod schema, um array `inputSchemaFields: { name: string; type: "string" | "number" | "integer" | "boolean" | "date" | "datetime" | "enum" | "array" | "object" | "unknown"; optional: boolean; enumValues?: string[] }[]`. Implementação: navegar `schema._def` recursivamente, casos comuns. Para tipos não cobertos, fallback `"unknown"`.
- Manter `inputSchemaKeys` (string[]) por compat enquanto a UI ainda consome.
- Após mudança, rodar `npm run gen:mcp-catalog` e commitar o snapshot regenerado.

### 4.5 `src/lib/actions/mcp-catalog-schema.ts`
- `McpEndpointToolItem` e `CatalogToolItem` recebem `inputSchemaFields?: ...` opcional (mesma forma).
- `groupCatalogTools` preserva o campo.

### 4.6 `src/components/integracoes/servidor-mcp/mcp-docs-content.tsx`

**Conteúdo (texto/estrutura):**
- Reescrever a constante `SECTIONS` (ou equivalente) para refletir os 3 grupos do sidebar (D1). Cada item ganha um `group: "visao-geral" | "externo" | "interno"`.
- Reescrever blocos de texto:
  - "Início": 4 frases enxutas (D1 do contexto).
  - "Conceitos": 4 cards (stateless, JSON-RPC 2.0, modos de auth, RBAC).
  - "Como começar" (externo): 4 passos em linguagem clara, sem ambiguidade.
  - "Autenticação" (externo): texto curto + exemplo rotulado "Primeira chamada de leitura autenticada".
  - "Headers obrigatórios" (externo): tabela `Authorization / Content-Type / Idempotency-Key` + card "Como gerar o Idempotency-Key" (curl/JS/Python).
  - "Fluxo de chamada" (externo): diagrama em texto monoespaçado.
  - "Tools de leitura" (externo): renderiza `catalog.flatMap(...readTools)`, agrupado por módulo. Conteúdo atual (`ToolCard`) reaproveitado.
  - "Tools de escrita" (externo): renderiza writes. Header do exemplo cURL passa a mostrar só `Authorization`, `Content-Type`, `Idempotency-Key`. Texto do callout reescrito (sai a frase "O Agente Nex (modo interno) não consegue chamar tools de escrita" — vai para a seção "Restrição de escrita" do modo interno; aqui fica só "Esta tool exige a capability `<x>` na chave de API.").
  - "Códigos de erro": tabela auditada com os 7 erros confirmados (§5.3 do contexto do plano).
  - "Rate limits": "Padrão 60 req/min por chave (mín 1, máx 600). Janela de 60s deslizantes. 429 com Retry-After quando excede."
  - "Quando usar" (interno): só código nosso server-side.
  - "Service token e identidade" (interno): 2 headers obrigatórios, sem sessão.
  - "Restrição de escrita" (interno): regra dura, defesa por rota, link para o código (`mcp/dispatcher/check-mode.ts`).
  - "Exemplo: Agente Nex" (interno): snippet TypeScript.

**Sidebar visual:**
- O componente atual de navegação (provavelmente uma lista interna em `mcp-docs-content.tsx`, não o `servidor-mcp-nav.tsx` topo) ganha cabeçalhos de grupo: pequenos, em caixa alta, `text-[10px] tracking-[0.08em] text-muted-foreground/70`, separador horizontal opcional. Sem ícones. Os itens individuais mantêm o estilo atual.

**Gerador de exemplos:**
- `buildExamples` aceita `args: Record<string, unknown>` (continua) mas o caller (`ToolCard`) passa a montar `sampleArgs` baseado em `tool.inputSchemaFields` (D7), não em `inputSchemaKeys + "..."`.
- Para tools de escrita, `sampleArgs` automaticamente inclui um `IDEM=$(uuidgen)` no curl (modo de escrita), e o snippet curl ganha o header `-H "Idempotency-Key: $IDEM"`. Modo de leitura mantém os 3 headers (Authorization + Content-Type, sem Idempotency).

### 4.7 `src/lib/tours/servidor-mcp-tour.ts`
- Auditar `servidorMcpDocsTour`. Selectors atuais: `data-tour="mcp-docs-passos"`, `data-tour="mcp-docs-tools-head"`, `data-tour="mcp-docs-tool"`. Confirmar que esses elementos permanecem no DOM após a reorganização. Atualizar passos que referenciam IDs renomeados.

### 4.8 Testes
- `src/lib/__tests__/mcp-capability-levels.test.ts`: adicionar caso para `archive → "Archive"` e para `cadastros` aparecendo no map.
- Novo `src/lib/__tests__/mcp-docs-build-examples.test.ts`: cobre o gerador novo (tipo → valor placeholder).
- `mcp-api-keys.test.ts`: adicionar caso de capability `archive` válida.
- Sem novo teste E2E (a doc é texto; UI test cobriria pouco).

## 5. Critérios de aceitação

1. `/integracoes/servidor-mcp/docs` carrega com sidebar de 3 grupos visualmente distintos, ancoragem por hash funcionando.
2. Nenhum exemplo de tool exibe `"..."` como valor de campo. Booleans aparecem como `true`, ids como `1`, strings como `"<...>"`, datas como `"2026-05-24"`.
3. Nenhum exemplo da seção "Tools de escrita" exibe `<SERVICE_TOKEN>`, `<USER_ID>`, `<API_KEY>` ou `X-Mcp-User-Id`.
4. Wizard "Nova chave de acesso" mostra Cadastros como módulo. "Leitura e escrita" em Cadastros expõe Create / Update / Delete / Archive / Transition.
5. Wizard mostra "Leitura e escrita" desabilitado (com tooltip) em Vendas / Compras / Financeiro / Fiscal / Contábil / Produção / RH / Projeto. Click no segmento desabilitado não muda o estado.
6. Modal não estoura a viewport com 11 módulos no passo 2; scroll interno funcional; footer sempre visível.
7. `tsc --noEmit`, `eslint`, `jest` verdes.
8. `npm run gen:mcp-catalog` roda sem erro e regenera snapshot consistente.
9. Tour da documentação não está quebrado (selectors válidos).
10. `/gsd-code-review` e `/gsd-ui-review` voltam sem nota crítica.

## 6. Não-objetivos (YAGNI)

- Não criar segunda página de doc em `/agente/plugar-mcps`.
- Não traduzir a doc.
- Não criar versão "diff" ou histórico de mudanças exposto na UI.
- Não persistir aba (cURL/JS/Python) escolhida no localStorage.
- Não acrescentar tools, capabilities ou módulos que não existem no registry.
- Não unificar formato de id de tools (`cadastros.res_partner.update` vs. `cadastro_contar_parceiros`); fica para outra refatoração.

## 7. Riscos com mitigação

R1. **Mudança no snapshot quebra outras leituras do JSON.** `getMcpCatalogSchema`, `groupCatalogTools` e `deriveModuleWriteActions` precisam tolerar `inputSchemaFields` ausente (campo opcional). Mitigação: testes existentes rodam contra snapshot atual e novo.

R2. **Adicionar `Archive` a `WRITE_ACTIONS` pode quebrar validação de capabilities salvas.** Mitigação: auditar `mcp-api-keys.ts` para confirmar que o Zod schema usa o WRITE_ACTIONS atualizado e que JSONs salvos sem `archive` continuam válidos (o esquema é "subset", não "all-of").

R3. **Tour pode quebrar selectors após reorganização.** Mitigação: manter `data-tour` IDs intactos; só renomeia se necessário, e atualiza o tour junto.

R4. **`MCP_MODULES` em outras telas (relatórios, dashboards) pode assumir 10 módulos.** Mitigação: `grep -rn MCP_MODULES src/` antes da execução, atualizar leitores que iteram com hard-coded length.

R5. **`buildExamples` é usado em vários lugares.** Verificar `authExample` em `:816` e outros callers; nenhum recebe `inputSchemaFields`, então o fallback antigo precisa continuar funcionando (refatoração: caller passa `args` pronto; só o ToolCard novo lê inputSchemaFields).

## 8. Cronograma (estimativa por bloco, para o plano)

| Bloco | Tasks aproximadas |
|---|---|
| A. Backend de tipos e catálogo | 3 (modules, write actions, action map) |
| B. Snapshot generator + regeneração | 2 |
| C. Wizard data-driven com archive | 3 (label, segment disabled, fallback) |
| D. Doc content rewrite (texto + estrutura sidebar) | 6 (1 por bloco grande) |
| E. Doc generator de exemplos tipado | 2 |
| F. Tour + selectors | 1 |
| G. Testes | 3 |
| H. Verificação + reviews | 2 |

Total estimado: ~22 tasks atômicas.

## 9. Próximo passo

Plano detalhado pela skill `writing-plans`. Cada task com arquivo específico, mudança específica, teste específico. Sem placeholders.
