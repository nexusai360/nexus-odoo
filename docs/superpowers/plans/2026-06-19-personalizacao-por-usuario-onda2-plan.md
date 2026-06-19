# Personalização adaptativa por usuário , Onda 2 , Plano de Implementação (v1)

> **For agentic workers:** execução **INLINE**. TDD por task, commit atômico. Steps `- [ ]`.
> SPEC: `docs/superpowers/specs/2026-06-19-agente-personalizacao-por-usuario-design.md` (§4 camada
> destilada, §6 guardrails, §7 circuit-breaker, §13 Onda 2). Onda 1 já EM PROD.
> **v1 , a endurecer por 2 reviews adversariais antes da execução.**

**Goal:** Camada DESTILADA por LLM (host-side, cloud/Claude, NUNCA OpenAI runtime): a partir das
conversas + avaliações de cada usuário, destilar um `interactionPrompt` curto (acordos/nuances tipo
o caso Mariane) + preferências de apresentação sutis, com guardrails fortes (anti-ocultação,
anti-PII/verbatim, tamanho), injetá-lo no runtime, e proteger o "sem gate" com um circuit-breaker
(baseline + quarentena automática). Determinístico da Onda 1 intocado.

**Architecture:** Runner host-side espelha `claude-judge-runner.ts` (spawn `claude -p`, protocolo
dump→processa→apply, gate `isLocalRuntime`). O parse valida e BLOQUEIA conteúdo perigoso. O
`interactionPrompt` entra no bloco já existente do `formatUserProfileBlock`. O circuit-breaker
mede o sinal de qualidade (juiz/feedback) antes×depois e auto-reseta se piorar.

**Tech Stack:** Next.js/TS, Prisma v7, Postgres, Jest, Claude Code headless (host-side).

## Global Constraints
- pt-BR; PROIBIDO travessão (`—`). Modelo SEMPRE Opus. UI (se houver) inline + ui-ux-pro-max.
- **Destilação NUNCA via OpenAI em runtime.** É host-side (Claude), como o juiz , **não roda sozinha no container de prod**; é disparada na manutenção. Declarar honestamente.
- **NUNCA ocultar dado.** `interactionPrompt` é preferência de apresentação/assunto; o parse REJEITA verbos de ocultação e qualquer instrução que altere dado/definição/RBAC.
- **Privacidade:** parse REJEITA PII/verbatim (dígitos longos, nomes fora de allowlist, alta similaridade n-gram com mensagens originais). Teste com a conversa real da Mariane.
- **Tamanho:** `interactionPrompt` ≤ 900 chars. **Sem gate de aprovação**, mas COM circuit-breaker.
- Migration: nada novo (campos `interaction_prompt`/`quality_baseline`/`profile_applied_at`/`quarantined_at` já criados na Onda 1).

## File Structure
| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `src/lib/agent/user-profile/distill-parse.ts` (+test) | Zod + guardrails (anti-ocultação, anti-PII, tamanho) , PURO, crítico | Create |
| `src/lib/agent/user-profile/distill-prompt.ts` (+test) | monta o dump por usuário + o playbook do headless Claude | Create |
| `src/lib/agent/user-profile/pii-guard.ts` (+test) | detecção de verbatim/PII (dígitos longos, n-gram vs original) , PURO | Create |
| `src/lib/agent/user-profile/guard.ts` (+test) | circuit-breaker: baseline + evaluateProfileHealth + quarentena | Create |
| `src/lib/agent/user-profile/format.ts` (+test) | incluir `interactionPrompt` no bloco | Modify |
| `src/lib/agent/user-profile/store.ts` (+test) | `applyDistilled(userId, {interactionPrompt, prefs})` + baseline | Modify |
| `src/lib/agent/quality/distill-runner.ts` | host-side: spawn claude, dump→apply (espelha claude-judge-runner) | Create |
| `scripts/distill-user-profiles.ts` | dump/apply IO p/ o headless (espelha quality-audit/pendentes-io) | Create |
| `docs/user-profile-distill-playbook.md` | playbook que o headless Claude segue | Create |
| `scripts/e2e-user-profile-distill.ts` | E2E: distila usuario real/sintetico + guardrails + injecao + breaker | Create |

---

### Task 1: `pii-guard` , detecção de verbatim/PII (puro, TDD, crítico)
**Files:** Create `src/lib/agent/user-profile/pii-guard.ts` + `.test.ts`.
**Interfaces:**
```ts
export function temDigitosLongos(s: string): boolean // >=4 digitos seguidos (CNPJ/CPF/valor/telefone)
export function compartilhaTrigramaCom(texto: string, originais: string[]): boolean // alta similaridade
export function violaPrivacidade(texto: string, mensagensOriginais: string[]): boolean // OR das checagens + nomes proprios fora de allowlist de negocio
export const ALLOWLIST_NEGOCIO: readonly string[] // termos de negocio que NAO sao PII (faturamento, empresa, estoque...)
```
- [ ] **Step 1:** Testes: texto com "11.222.333" → viola; texto com trigram de uma mensagem original com nome próprio → viola; texto só com termos de negócio do allowlist → não viola; teste com mensagens reais da Mariane (`d08c6323`) provando bloqueio de qualquer literal dela.
- [ ] **Step 2:** `npx jest pii-guard`. Expected: FAIL.
- [ ] **Step 3:** Implementar (regex dígitos; n-gram tri; heurística de nome próprio = palavra capitalizada não no allowlist).
- [ ] **Step 4:** PASS. **Step 5:** Commit.

### Task 2: `distill-parse` , Zod + guardrails (puro, TDD, crítico)
**Files:** Create `src/lib/agent/user-profile/distill-parse.ts` + `.test.ts`.
**Interfaces:**
```ts
export const VERBOS_OCULTACAO: readonly string[] // ignore, nao mostre, esconda, oculte, filtre, so considere, remova
export interface DistilledProfile { interactionPrompt: string; presentationPrefs: PresentationPrefs }
export interface ParseResult { ok: true; value: DistilledProfile } | { ok: false; motivo: string }
export function parseDistilled(rawJson: string, mensagensOriginais: string[]): ParseResult
// rejeita: JSON invalido; interactionPrompt > 900 chars; contem VERBOS_OCULTACAO; viola privacidade (pii-guard);
// presentationPrefs com chave de filtro de dado (so breakdownPreferido permitido).
```
- [ ] **Step 1:** Testes: JSON válido limpo → ok; com "ignore os cancelados" → rejeitado (ocultação); com CNPJ → rejeitado (PII); 1200 chars → rejeitado (tamanho); pref com `situacao` → rejeitado (filtro). 
- [ ] **Step 2:** `npx jest distill-parse`. Expected: FAIL.
- [ ] **Step 3:** Implementar (Zod + checagens; usa pii-guard).
- [ ] **Step 4:** PASS. **Step 5:** Commit.

### Task 3: `distill-prompt` , dump por usuário + playbook (puro, TDD)
**Files:** Create `src/lib/agent/user-profile/distill-prompt.ts` + `.test.ts`; `docs/user-profile-distill-playbook.md`.
**Interfaces:**
```ts
export interface UserDistillInput { userId: string; conversas: {pergunta:string; resposta:string}[]; avaliacoes: {status:string; razoes:string}[] }
export function buildDistillInstrucoes(): string // playbook curto p/ o headless (regras: derivado, sem PII, sem ocultacao, <=900, JSON)
export function montarDumpUsuario(input: UserDistillInput): object // shape que vai p/ /tmp
```
- [ ] **Step 1:** Teste: instruções contêm as regras-chave (sem PII, sem ocultação, JSON, <=900); dump tem o shape esperado.
- [ ] **Step 2-5:** TDD + commit.

### Task 4: `guard` , circuit-breaker (puro + store, TDD)
**Files:** Create `src/lib/agent/user-profile/guard.ts` + `.test.ts`.
**Interfaces:**
```ts
export interface QualitySignal { acertoRate: number; negFeedbackRate: number; amostra: number }
export function piorou(baseline: QualitySignal, atual: QualitySignal, minAmostra: number): boolean // regressao significativa
export async function capturarBaseline(userId: string): Promise<QualitySignal> // dos ultimos K turnos SEM perfil
export async function avaliarSaudePerfil(userId: string): Promise<{ quarentenar: boolean; baseline; atual }>
```
- [ ] **Step 1:** Teste de `piorou`: queda de acerto além do limiar com amostra suficiente → true; amostra pequena → false (não quarentena no escuro).
- [ ] **Step 2-5:** TDD + commit (parte pura; integração com store/queries coberta no E2E).

### Task 5: `format` inclui `interactionPrompt` (TDD)
**Files:** Modify `src/lib/agent/user-profile/format.ts` + test.
- [ ] **Step 1:** Teste: perfil com `interactionPrompt` → bloco inclui o texto destilado (antes da cláusula); sem ele, comportamento da Onda 1.
- [ ] **Step 2:** Estender `UserProfileData`/format para carregar `interactionPrompt` (vem do store).
- [ ] **Step 3-5:** PASS + commit.

### Task 6: `store.applyDistilled` + baseline (TDD)
**Files:** Modify `src/lib/agent/user-profile/store.ts` + test.
- [ ] **Step 1:** Teste: `applyDistilled(userId, {interactionPrompt, prefs})` grava `interaction_prompt` + `profile_applied_at` + `quality_baseline` (preservando os campos determinísticos) e invalida caches.
- [ ] **Step 2-5:** Implementar + PASS + commit. (getUserAgentProfile passa a ler `interaction_prompt`.)

### Task 7: `distill-runner` host-side + IO script
**Files:** Create `src/lib/agent/quality/distill-runner.ts`; `scripts/distill-user-profiles.ts`.
- [ ] **Step 1:** Runner espelha `claude-judge-runner.ts` (resolveClaudeBin, spawn `claude -p <prompt>`, lock, `isLocalRuntime` gate). Prompt aponta p/ o playbook + o IO script (dump→apply).
- [ ] **Step 2:** `scripts/distill-user-profiles.ts --dump` (grava /tmp com candidatos elegíveis + dumps) e `--apply` (lê o JSON destilado, `parseDistilled` cada um, `applyDistilled` os que passam; loga rejeitados).
- [ ] **Step 3:** tsc + lint. Commit. (Execução real do headless é manual/manutenção , host-side.)

### Task 8: E2E + verificação final
**Files:** Create `scripts/e2e-user-profile-distill.ts`.
- [ ] **Step 1:** Semear/escolher usuário; simular um JSON destilado (válido + um malicioso com PII/ocultação); asserir parse aceita o bom e rejeita o ruim; `applyDistilled` grava; `formatUserProfileBlock` inclui o interactionPrompt; circuit-breaker quarentena sob regressão simulada.
- [ ] **Step 2:** tsc raiz+mcp + eslint + jest cheios. 
- [ ] **Step 3:** Commit. Atualizar STATUS/HISTORY. PR. (Deploy: host-side não roda em prod sozinho; declarar.)

## Correções v3 (2 reviews adversariais , aplicar na execução)

- **Decisão de escopo (opção A do usuário):** construir a INFRA (parser, guardrails, breaker, UI,
  read-path) agora; **destilação rotineira de prod DESLIGADA** até haver volume , validar
  manualmente na Mariane. Declarar honestamente: sem execução host-side manual, `interaction_prompt`
  em prod fica NULL e o runtime degrada para o global (ok).
- **B1 (read-path , o destilado precisa CHEGAR ao runtime):** Task NOVA antes da Task 5:
  estender `UserProfileData.interactionPrompt?: string` (`types.ts`), `getUserAgentProfile.select` +
  `rowToProfile` (`store.ts`) p/ ler `interaction_prompt`, e **bump da cache key `:v1`→`:v2`**
  (perfis cacheados no shape antigo). Ajustar `isEmptyProfile` (perfil só com interactionPrompt NÃO é vazio).
- **B2 (corrida com o job determinístico):** Onda 2 grava **só `interaction_prompt`** (via
  `applyDistilled`), **nunca `presentationPrefs`** (o `JOB_PROFILE_AGGREGATE` é dono e sobrescreve
  presentationPrefs a cada 1h). Teste de regressão: rodar `upsertUserAgentProfile` (job) depois de
  `applyDistilled` e asserir que `interaction_prompt` SOBREVIVE (não está no `fields` do upsert).
- **B3 (breaker inerte em prod):** em prod o juiz é host-side e `feedbackCheckpoint=OFF` → sinal≈0
  → breaker **não dispara sozinho**. Declarar: defesa primária hoje = **UI de auditoria + reset
  manual** (`resetUserAgentProfile` já existe); o breaker é backstop p/ quando o volume crescer.
  `piorou()` exige `minAmostra` (não quarentena no escuro).
- **B4 (n-gram sem material = no-op):** o `--apply` DEVE recarregar do banco as mensagens
  `role='user'` de cada usuário (mesmo SQL de `queryUserRows`) e passá-las ao `parseDistilled`;
  com originais ausentes, **falhar fechado** (rejeitar). `pii-guard`: normalizar
  (`s.replace(/\D/g,'')`, run de dígitos ≥7) , o exemplo `11.222.333` só é pego assim; adicionar
  regex de e-mail; n-gram **default-deny** (qualquer trigrama compartilhado ⇒ viola).
- **G2/G3 (filtro disfarçado de breakdown):** `presentationPrefs[familia].breakdownPreferido` só
  aceita valor de um **`ALLOWLIST_BREAKDOWNS`** fechado (empresa/cfop/operacao/cliente/etapa/
  vendedor/marca/uf/...); fora disso, rejeita. (E lembrar: na opção A, Onda 2 nem grava prefs , o
  allowlist protege caso isso mude.)
- **G4 (cláusula de precedência):** `formatUserProfileBlock` mantém `CLAUSULA_PRECEDENCIA` como
  ÚLTIMO elemento literal mesmo com `interactionPrompt` de 900 chars; teste de comportamento
  (turno contraria a preferência) no E2E.
- **Reuso (não recriar):** a "seleção de candidatos" da Task 7 usa `selectEligible`/`candidates.ts`
  da Onda 1 , não reimplementar piso/critério.
- **UI (Task NOVA):** a tela de auditoria (`personalizacao-content.tsx` + `getUserProfilesForAudit`
  + `UserProfileAuditRow`) passa a mostrar o `interactionPrompt` destilado + `qualityBaseline` +
  `profileAppliedAt` (é o artefato de texto-livre sem-gate que MAIS precisa de olho humano).
- **Lock host-side:** o `distill-runner` compartilha o lock in-process do juiz (um `claude -p` por
  vez no processo do Next) e usa arquivos `/tmp/nex-distill*.json` distintos dos do juiz.
- **E2E (Task 8):** o JSON destilado é simulado no jest (headless é não-determinístico/custoso),
  MAS adicionar um **smoke host-side manual** sobre a Mariane (`d08c6323`) , rodar o runner real e
  conferir o JSON contra `parseDistilled` , antes de declarar pronto.

## Self-Review (cobertura)
- §4 camada destilada → Tasks 1-7. §6 guardrails (ocultação/PII/tamanho) → Tasks 1-2. §7 circuit-breaker → Task 4. Injeção do interactionPrompt → Tasks 5-6. Host-side honesto → Task 7 + declaração.
- Determinístico (Onda 1) intocado. Sem migration nova. Privacidade testada com Mariane real (Task 1).
