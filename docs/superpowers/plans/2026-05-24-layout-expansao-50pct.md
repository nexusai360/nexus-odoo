# Layout: expansão sutil 50% nas larguras (plano)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduzir o último alargamento aplicado no `PageShell` para metade (50%), proporcionalmente, e garantir que TODAS as telas autenticadas (`(protected)/**`) sigam essa regra — sem cap interno escondido em componente que sobreponha a variant.

**Architecture:** Mudança concentrada em `src/components/layout/page-shell.tsx` (única fonte de verdade das larguras canônicas) + remoção de caps internos que sobrepõem a regra (auditoria detectou `max-w-5xl` em `logs-timeline.tsx`). Nenhuma rota muda de variant — a regra é aplicada na própria variant.

**Tech Stack:** Tailwind CSS, React 19, Next.js 16, TypeScript.

---

## Regra de cálculo

Pegar 50% do crescimento adicionado no commit `8e7b7ef` (último ajuste).

| Variant | Antes (cap fixo) | Cap atual | Crescimento adicionado | Cap proposto (50%) | K growth |
|---|---|---|---|---|---|
| `narrow` | 1280 | 1480 | +200 | **1380** | 0.025 |
| `wide` | 1600 | 1840 | +240 | **1720** | 0.025 |
| `compact` | 1280 | 1536 | +256 | **1408** | 0.025 |
| `form` | 1280 | 1536 | +256 | **1408** | 0.025 |
| `agent` | 1280 | 1536 | +256 | **1408** | 0.025 |
| `full` | sem cap | sem cap | n/a | sem cap | n/a |

Fórmula final por variant: `clamp(piso, calc(piso + (100vw - 1366px) * 0.025), teto)`.

Crescimento muito sutil:
- 1366: piso (igual ao tamanho original anterior)
- 1920: +14px (compact/form/agent: 1294; narrow: 1294; wide: 1614)
- 2560: +30px
- 4080+: cap

---

## File Structure

| Arquivo | Modificação |
|---|---|
| `src/components/layout/page-shell.tsx` | Atualizar a tabela `MAX` com as 5 fórmulas |
| `src/components/integracoes/servidor-mcp/logs-timeline.tsx` | Remover `max-w-5xl` interno (sobrepõe a `narrow`) |
| `tests/__not_required__` | sem testes novos: mudança puramente CSS, validação visual |

---

## Cobertura de menus / rotas

Auditoria via `grep -rn "PageShell variant" src/app/(protected)/` confirma:

- **Dashboard**: `dashboard/page.tsx` (PageShell default = `wide`)
- **Relatórios**: lista (`wide`), detalhe (`full`), loading (`narrow`)
- **Agente Nex**: configuração, chaves, prompt, consumo, playground, plugar-mcps (todos `form`)
- **Usuários**: `usuarios/page.tsx` (`narrow`)
- **Integrações** + sub-rotas: api, bi, canais, canais/whatsapp, servidor-mcp + 3 subs, webhooks (todos `narrow`)
- **Configuração**: `configuracao/page.tsx` (`narrow`)
- **Perfil**: `perfil/page.tsx`, `perfil/trocar-senha/page.tsx` (`narrow`)

Total: 6 menus × 19 rotas. Todas cobertas pelas 5 variants editadas em `page-shell.tsx`.

---

## Task 1: Atualizar `page-shell.tsx` com cap 50%

**Files:**
- Modify: `src/components/layout/page-shell.tsx:23-39`

- [ ] **Step 1: Substituir bloco `MAX`**

Trocar o objeto `MAX` por:

```ts
const MAX: Record<Variant, string> = {
  // Cap reduzido pela metade do ajuste anterior (8e7b7ef), com K=0.025
  // (metade do crescimento anterior). Piso = tamanho original; teto =
  // meio caminho entre o original e o cap anterior.
  compact: "max-w-[clamp(1280px,calc(1280px+(100vw-1366px)*0.025),1408px)]",
  form: "max-w-[clamp(1280px,calc(1280px+(100vw-1366px)*0.025),1408px)]",
  agent: "max-w-[clamp(1280px,calc(1280px+(100vw-1366px)*0.025),1408px)]",
  narrow: "max-w-[clamp(1280px,calc(1280px+(100vw-1366px)*0.025),1380px)]",
  wide: "max-w-[clamp(1600px,calc(1600px+(100vw-1366px)*0.025),1720px)]",
  full: "max-w-none",
};
```

- [ ] **Step 2: tsc + eslint**

Run: `npx tsc --noEmit && npx eslint src/components/layout/page-shell.tsx`
Expected: limpo

- [ ] **Step 3: Commit**

```
git add src/components/layout/page-shell.tsx
git commit -m "fix(layout): cap 50% do ajuste anterior em todas as variants"
```

---

## Task 2: Remover cap `max-w-5xl` interno em logs-timeline

**Files:**
- Modify: `src/components/integracoes/servidor-mcp/logs-timeline.tsx:533`

- [ ] **Step 1: Trocar `space-y-4 max-w-5xl` por `space-y-4`**

O componente é renderizado dentro de `<PageShell variant="narrow">`; o `max-w-5xl` interno (1024px) sobrescreve e força tela mais estreita do que a variant. Remover deixa o PageShell controlar.

- [ ] **Step 2: Verificar visualmente que a rota `/integracoes/servidor-mcp/logs` continua usando o cap da variant**

(verificação manual pós-deploy local)

- [ ] **Step 3: Commit**

```
git add src/components/integracoes/servidor-mcp/logs-timeline.tsx
git commit -m "fix(integracoes): logs-timeline sem cap interno (segue PageShell)"
```

---

## Task 3: Auditoria final de caps internos

**Files:**
- Inspect: tudo dentro de `src/app/(protected)/**` e `src/components/**`

- [ ] **Step 1: Procurar caps internos > 0 não justificados**

```
grep -rn "max-w-7xl\|max-w-6xl\|max-w-5xl\|max-w-\[1[4-9]\|max-w-\[2" \
  src/app/\(protected\)/ src/components/ --include="*.tsx" \
  | grep -v "page-shell"
```

Resultado esperado: só `max-w-[200px]`, `max-w-[260px]`, `max-w-[180px]`, `max-w-[280px]`, `max-w-[18rem]` (todas em truncates/badges de pixels específicos — OK manter, são limites visuais de células, não de container).

- [ ] **Step 2: Nada novo a corrigir → commit consolidado (se houver)**

---

## Task 4: Push + restart

- [ ] **Step 1: `git push origin feat/f4-leitura-expansao`**
- [ ] **Step 2: Matar dev server, apagar `.next`, reiniciar**

```
lsof -ti:3000 2>/dev/null | xargs -I{} kill -9 {} 2>/dev/null
pkill -9 -f "next dev" 2>/dev/null
rm -rf .next node_modules/.cache
pnpm dev > /tmp/nexus-dev.log 2>&1 &
sleep 8 && grep -E "Local|Ready" /tmp/nexus-dev.log
```

- [ ] **Step 3: Confirmar no log o `Ready` + porta `3000`**

---

## Self-review

- Cobertura: ✓ 19 rotas mapeadas explicitamente; todas usam alguma das 5 variants.
- Placeholders: nenhum — código completo nos steps.
- Tipos: o `MAX: Record<Variant, string>` mantém os mesmos 6 keys; nada quebra.
- Caps externos: `logs-timeline.tsx` é o único `max-w-5xl`/`6xl`/`7xl` rogue na pasta tocada — incluído.
- Custo total: 1 arquivo de layout + 1 componente + audit + restart. ~5 min de execução.
