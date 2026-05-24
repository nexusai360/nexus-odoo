# PLAN — Segmento A do Renascimento do Agente Nex (Higiene de Prompt)

> Versão: v3 (após review crítica #1 e #2, integradas inline)
> Spec base: `docs/superpowers/specs/2026-05-24-agente-nex-renaissance-master.md` (v3)
> Branch alvo: `feat/nex-renaissance-A` (criar a partir de `feat/f4-leitura-expansao`)
> Princípio de decomposição: 1 task = 1 unidade verificável isoladamente.

## Critério de saída do segmento
1. `grep -rn '—' src/ mcp/ docs/superpowers/specs/2026-05-24-*.md` retorna zero matches.
2. `pnpm tsc --noEmit && pnpm jest src/lib/agent/prompt && pnpm lint` verde.
3. Migration de dados existentes rodou sem erro e zerou travessões nas configs.
4. 4 welcome suggestions visíveis no `chat-panel` executam direto sem clarificação.
5. Tentativa de salvar texto com `—` via Server Action: travessão some no banco.

## Sequenciamento
A1 → A2 → A3 são pré-requisitos (ESLint pega regressão); A4 (sanitizer) é a base do runtime; A5–A9 são substituições texto; A10–A14 são integrações de Server Action; A15 migra DB existente; A16 polish UX; A17–A19 verificação e commit.

---

### A1. Criar plugin ESLint local `no-travessao`
**Arquivo:** `eslint-plugins/no-travessao/index.js` (novo).
**Conteúdo:**
```js
module.exports = {
  rules: {
    "no-travessao": {
      meta: {
        type: "problem",
        docs: { description: "Proíbe travessão e en-dash em literais e templates." },
        messages: { found: "Travessão (—) ou en-dash (–) proibidos. Use vírgula ou ponto." },
        schema: [],
      },
      create(context) {
        const check = (node, text) => {
          if (/[—–]/.test(text)) context.report({ node, messageId: "found" });
        };
        return {
          Literal(node) {
            if (typeof node.value === "string") check(node, node.value);
          },
          TemplateElement(node) {
            check(node, node.value.raw);
          },
        };
      },
    },
  },
};
```
**Verificação:** `node -e "console.log(require('./eslint-plugins/no-travessao').rules['no-travessao'].meta.type)"` imprime `problem`.

---

### A2. Registrar plugin em `eslint.config.mjs`
**Arquivo:** `eslint.config.mjs` (existente — Read antes de editar).
**Edit:** importar como local plugin e ativar a regra com severity `error` para `src/**/*.{ts,tsx}`, `mcp/**/*.ts`.
**Snippet a inserir** (adaptar à estrutura existente):
```js
import noTravessao from "./eslint-plugins/no-travessao/index.js";
// ... dentro do array de config:
{
  plugins: { "no-travessao": noTravessao },
  rules: { "no-travessao/no-travessao": "error" },
  files: ["src/**/*.{ts,tsx,js}", "mcp/**/*.ts"],
}
```
**Verificação:** `pnpm lint 2>&1 | head -3` mostra erros `no-travessao/no-travessao` (esperado — falha vira sucesso depois das substituições).

---

### A3. Smoke test: ESLint detecta `—` em string canária
**Arquivo:** `eslint-plugins/no-travessao/__tests__/smoke.test.js` (novo).
**Conteúdo:** mini teste que carrega RuleTester do ESLint e valida com `valid: ["const x = 'olá mundo';"]` e `invalid: [{ code: "const x = 'olá — mundo';", errors: 1 }, { code: "const x = `olá – mundo`;", errors: 1 }]`.
**Verificação:** `pnpm jest eslint-plugins/no-travessao` passa.

---

### A4. Módulo `sanitize.ts` + teste
**Arquivos:**
- `src/lib/agent/prompt/sanitize.ts` (novo) com função `sanitizePromptText(input: string): string` conforme spec §4.3.
- `src/lib/agent/prompt/sanitize.test.ts` (novo) com 8 casos:
  1. em-dash → vírgula
  2. en-dash → vírgula
  3. reticências unicode → `...`
  4. aspas francesas → `"`
  5. non-breaking space → espaço comum
  6. idempotência (rodar duas vezes igual rodar uma)
  7. preserva acentos `áéíóúçãõ`
  8. preserva `\n\n` (parágrafo) mas reduz `\n\n\n+` para `\n\n`
**Verificação:** `pnpm jest src/lib/agent/prompt/sanitize.test.ts` 8/8 verde.

---

### A5. Reescrita de `identity-base.ts` sem travessão
**Arquivo:** `src/lib/agent/prompt/identity-base.ts` (existente).
**Edit:** percorrer linha por linha; substituir cada `—` por vírgula ou ponto conforme a frase. Exemplo do início:
- Antes: `Você é o assistente de operação da Matrix Fitness Group — agente especializado em...`
- Depois: `Você é o assistente de operação da Matrix Fitness Group, agente especializado em...`

Aplicar em todos os 41 trechos. Preservar formatação markdown (headers, code blocks). Não tocar conteúdo semântico além da substituição.
**Verificação:** `grep -c '—' src/lib/agent/prompt/identity-base.ts` retorna `0`.

---

### A6. Reescrita de `defaults.ts` sem travessão
**Arquivo:** `src/lib/agent/prompt/defaults.ts` (existente).
**Edit:** substituir cada `—` em `DEFAULT_PERSONALITY`, `DEFAULT_TONE`, e nos 8 itens de `DEFAULT_GUARDRAILS`.

Exemplos:
- `DEFAULT_PERSONALITY`: `Você é direto e prático, com mentalidade de analista de operações. Vai ao ponto: prioriza...`
- Guardrail 1: `"Nunca invente números, datas ou nomes. Use sempre as ferramentas de consulta. Se o dado não existir, diga isso com franqueza."`
- Guardrail 3: `"Não revele nomes técnicos internos (ferramentas, queries, campos, cache, MCP). Fale como analista de operações."`
- Guardrail 4: `"Não simule nem descreva ações destrutivas no ERP (excluir, cancelar, alterar registros). O agente é somente leitura."`

Aplicar consistente em todos os 8.
**Verificação:** `grep -c '—' src/lib/agent/prompt/defaults.ts` retorna `0`.

---

### A7. Reescrita de `compose.ts` sem travessão
**Arquivo:** `src/lib/agent/prompt/compose.ts` (existente).
**Edit:** substituir `—` nos comentários docstring e em qualquer string instrucional. Cuidado especial: o arquivo já usa `—` em vários comentários TS.
**Verificação:** `grep -c '—' src/lib/agent/prompt/compose.ts` retorna `0`.

---

### A8. Módulo `welcome-suggestions.ts` + teste
**Arquivos:**
- `src/lib/agent/welcome-suggestions.ts` (novo):
```ts
export const WELCOME_SUGGESTIONS: readonly string[] = [
  "Quantos itens diferentes temos em estoque agora?",
  "Quanto faturamos no mês corrente?",
  "Quais pedidos de venda estão atrasados?",
  "Qual o valor total do estoque em armazém?",
] as const;
```
- `src/lib/agent/welcome-suggestions.test.ts` (novo) com 3 asserções:
  1. Array tem exatamente 4 items.
  2. Nenhum item contém `—` ou `–`.
  3. Cada item termina com `?` (são perguntas).
**Verificação:** `pnpm jest src/lib/agent/welcome-suggestions.test.ts` 3/3 verde.

---

### A9. `chat-panel.tsx` consome `WELCOME_SUGGESTIONS` do módulo
**Arquivo:** `src/components/agent/chat-panel.tsx` (existente).
**Edit:**
1. Remover constante hardcoded linhas 71-75.
2. Adicionar import: `import { WELCOME_SUGGESTIONS } from "@/lib/agent/welcome-suggestions";`
3. Substituir todos os usos da constante local pela importada (mesmo nome, sem refactor de chamadas).
**Verificação:**
- `grep -n 'Saldo atual de estoque' src/components/agent/chat-panel.tsx` retorna zero matches.
- `grep -n 'WELCOME_SUGGESTIONS' src/components/agent/chat-panel.tsx` mostra import e uso.

---

### A10. Localizar Server Actions de prompt
**Arquivo:** (audit only).
**Comando:** `grep -rn 'updateAgentIdentityBase\|updateAgentBehavior\|updateAgentAdvancedOverride\|updateAgentTerminology\|addGuardrail\|updateGuardrail' src/lib/actions src/components` para listar os arquivos e as assinaturas exatas. Resultado é input para A11-A14.
**Verificação:** comando lista ao menos 6 ocorrências em arquivos `src/lib/actions/*.ts`.

---

### A11. Aplicar sanitizer em `updateAgentIdentityBaseAction`
**Arquivo:** identificado no A10 (provavelmente `src/lib/actions/agent-config.ts` ou `src/lib/actions/agent-prompt.ts`).
**Edit:**
1. Importar `sanitizePromptText` de `@/lib/agent/prompt/sanitize`.
2. No schema zod do input, trocar `z.string()` por `z.string().max(MAX).transform(sanitizePromptText)` no campo `identityBase`.
**Verificação:** teste manual conceitual — passar string com `—` retorna string sem `—`.

---

### A12. Aplicar sanitizer em `updateAgentBehaviorAction` (personality/tone/guardrails)
**Arquivo:** mesmo de A10.
**Edit:** mesmo padrão de A11 para os 3 campos. `guardrails: z.array(z.string().max(MAX_GUARDRAIL_LEN).transform(sanitizePromptText))`.
**Verificação:** chamada com guardrail `"foo — bar"` salva como `"foo, bar"`.

---

### A13. Aplicar sanitizer em `updateAgentAdvancedOverrideAction`
**Arquivo:** mesmo de A10.
**Edit:** mesmo padrão.

---

### A14. Aplicar sanitizer em `updateAgentTerminologyAction` (record key + value)
**Arquivo:** mesmo de A10.
**Edit:** mais cuidado — `terminology` é `Record<string, string>`. Sanitizar antes de persistir:
```ts
const sanitizedTerm = Object.fromEntries(
  Object.entries(input.terminology).map(([k, v]) => [sanitizePromptText(k), sanitizePromptText(v)])
);
```

---

### A15. Migration SQL: sanitizar `AgentSettings` existentes
**Arquivo:** `prisma/migrations/20260524170000_sanitize_agent_settings/migration.sql` (novo).
**Conteúdo:** versão final da migration descrita no spec §4.6 (4 UPDATEs com guardas).
**Verificação manual antes de aplicar:**
1. `psql -c "SELECT count(*) FROM \"AgentSettings\" WHERE personality ~ '[—–]' OR tone ~ '[—–]' OR \"identityBase\" ~ '[—–]' OR \"advancedOverride\" ~ '[—–]' OR guardrails::text ~ '[—–]';"` retorna N (esperado > 0).
**Aplicação:** `pnpm prisma migrate dev --name sanitize_agent_settings`.
**Verificação pós:** mesma query retorna `0`.

---

### A16. Toast pós-migração no `/agente/comportamento`
**Arquivo:** `src/components/agent/behavior-form.tsx` (ou equivalente; localizar).
**Edit:** adicionar `useEffect` que, no primeiro mount após login do super_admin, verifica `localStorage.getItem("nex:travessao-migration-seen") === null`. Se null: mostra toast informativo "Atualizamos a redação dos guardrails para remover travessões. Reveja se quiser ajustar a nova versão." e seta a flag.
**Verificação manual:** abrir tela em browser limpo, ver toast 1x; recarregar, não ver mais.

---

### A17. Audit grep final
**Comando:**
```bash
grep -rn '—\|–' src/ mcp/ docs/superpowers/specs/2026-05-24-*.md eslint-plugins/
```
**Critério:** zero matches.
Se houver matches em comentários TS antigos, aplicar substituição manual mesma forma.

---

### A18. CI verde (tsc + jest + lint + build)
**Comandos sequenciais:**
```bash
pnpm tsc --noEmit
pnpm jest src/lib/agent/prompt src/lib/agent/welcome-suggestions eslint-plugins/no-travessao
pnpm lint
pnpm build
```
**Critério:** todos retornam exit 0.

---

### A19. Commit atômico + push
**Comandos:**
```bash
git checkout -b feat/nex-renaissance-A
git add eslint-plugins/ src/lib/agent/prompt/ src/lib/agent/welcome-suggestions.ts src/lib/agent/welcome-suggestions.test.ts src/components/agent/chat-panel.tsx src/lib/actions/<arquivos-actions>/ prisma/migrations/20260524170000_sanitize_agent_settings/ src/components/agent/<behavior-form>
git commit -m "feat(nex): renascimento onda A — higiene de prompt (travessões, sanitizer, welcome)" 
git push -u origin feat/nex-renaissance-A
```
**Critério:** branch publicada; commit único contendo todas as mudanças do segmento.

---

## Sub-tarefas que podem aparecer na execução

Estas não são tasks numeradas mas são esperadas:
- Se `lint` falhar fora dos arquivos da onda (regressão pré-existente), abrir nota e seguir; não corrigir aqui.
- Se a migration falhar em dev por dado inesperado, ajustar o `WHERE` e re-rodar.
- Se algum `agentSettings` payload do front lavar input sem trim, fazer trim antes de enviar para Server Action (defesa em profundidade).

## Riscos identificados pelo PLAN
1. **A5/A6/A7 são manuais e arriscam typo.** Mitigação: depois de cada arquivo, ler o diff completo antes de commit local. Roda `pnpm tsc` após cada.
2. **A11-A14 dependem dos arquivos de action serem encontrados em A10.** Se a estrutura for diferente do esperado, A11 vira sub-tasks por action real.
3. **A15 modifica dados em prod no deploy.** Mitigação: testar primeiro em dev, validar contagem antes/depois.
4. **A2 (ESLint) pode quebrar pipeline para arquivos não cobertos pelas substituições.** Mitigação: rodar lint após A5–A7 ANTES do commit; se ainda há `—`, listar os arquivos e fazer pass adicional.

## Time-box
~3-4 horas de execução focada. Se exceder, parar, gravar handoff em `docs/handoffs/`, retomar próxima sessão.
