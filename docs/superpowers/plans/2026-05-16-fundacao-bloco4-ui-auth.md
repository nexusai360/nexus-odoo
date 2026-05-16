# Bloco 4 — UI Base e Telas Auth

**Objetivo:** App Next.js renderizando com tema, login funcionando, todas as telas de auth criadas.
**Verificação final:** `npx tsc --noEmit` EXIT=0 + `npx next build` sem erro.
**Fonte:** nexus-insights em `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/nexus-insights/`

---

## Grupo 0 — Pré-condição: middleware

### T0 — Verificar PUBLIC_ROUTES no middleware

- Ler `src/middleware.ts`
- Confirmar que as seguintes rotas estão na lista de rotas públicas (sem proteção de auth):
  `/login`, `/forgot-password`, `/reset-password`, `/verify-email`
- Se ausentes: adicionar ao array de rotas públicas
- Verificação: `npx tsc --noEmit 2>&1 | grep middleware` — sem erro
- **Motivação:** sem isso, o middleware redireciona essas rotas para `/login` em loop — as telas de auth nunca renderizam

---

## Grupo A — Dependências CSS

### T1 — Verificar e instalar `shadcn`

- Checar: `grep -r '"shadcn"' package.json`
- globals.css linha 3 importa `@import "shadcn/tailwind.css"` — requer pacote instalado
- Se ausente: `npm install shadcn` (sem version pin — latest é ok para CSS utility)
- Após instalar: `ls node_modules/shadcn 2>/dev/null && echo PRESENT || echo MISSING`
- Verificação: `node -e "require.resolve('shadcn/tailwind.css')" && echo OK`
- Resultado esperado: `PRESENT` + `OK`
- Se `shadcn/tailwind.css` não existir após install: substituir linha 3 do globals.css por comentário explicativo e variáveis inline (as CSS vars já estão definidas no bloco `:root {}` do próprio arquivo — o import seria redundante)

### T2 — src/lib/utils.ts

- Arquivo: `src/lib/utils.ts`
- Conteúdo (copiar verbatim):
  ```ts
  import { clsx, type ClassValue } from "clsx"
  import { twMerge } from "tailwind-merge"

  export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
  }
  ```
- Verificação: `npx tsc --noEmit 2>&1 | grep utils` — sem erro

---

## Grupo B — Sistema de tema

### T3 — src/lib/theme.ts

- Arquivo: `src/lib/theme.ts`
- Conteúdo: copiar verbatim do nexus-insights `src/lib/theme.ts`
- Exports: `getResolvedThemeFromCookie`, `getThemePreferenceFromCookie`, `THEME_COOKIE`, `THEME_PREF_COOKIE`, `THEME_COOKIE_MAX_AGE`
- Sem adaptações

### T4 — src/components/providers/theme-provider.tsx

- Arquivo: `src/components/providers/theme-provider.tsx`
- Conteúdo: copiar verbatim do nexus-insights `src/components/providers/theme-provider.tsx`
- Exports: `Providers` (default + named), `useTheme`
- Sem adaptações

---

## Grupo C — Componentes UI

### T5 — src/components/ui/button.tsx

- Arquivo: `src/components/ui/button.tsx`
- Conteúdo: copiar verbatim do nexus-insights
- Deps: `@base-ui/react/button` ✅, `class-variance-authority` ✅, `@/lib/utils` (criado em T2)
- Sem adaptações

### T6 — src/components/ui/input.tsx

- Arquivo: `src/components/ui/input.tsx`
- Conteúdo: copiar verbatim do nexus-insights
- Deps: `@/lib/utils` ✅
- Sem adaptações

### T7 — src/components/ui/label.tsx

- Arquivo: `src/components/ui/label.tsx`
- Conteúdo: copiar verbatim do nexus-insights
- Deps: `@base-ui/react/label` ✅, `@/lib/utils` ✅
- Sem adaptações

### T8 — src/components/ui/sonner.tsx

- Arquivo: `src/components/ui/sonner.tsx`
- Conteúdo: copiar verbatim do nexus-insights
- Deps: `@/components/providers/theme-provider` (T4), `sonner` ✅, lucide icons ✅
- Exporta `Toaster` — usado em layout.tsx (T11)
- Sem adaptações

### T9 — src/components/ui/password-input.tsx

- Arquivo: `src/components/ui/password-input.tsx`
- Conteúdo: copiar verbatim do nexus-insights
- Deps: `@/components/ui/input` (T6), `@/lib/utils` (T2), lucide Eye/EyeOff ✅
- Sem adaptações

---

## Grupo D — App shell

### T10 — src/app/globals.css

- Arquivo: `src/app/globals.css`
- Conteúdo: copiar verbatim do nexus-insights (266 linhas)
- Inclui: `@import "tailwindcss"`, `@import "tw-animate-css"`, `@import "shadcn/tailwind.css"`, CSS vars de tema (light/dark), toast styles, tipografia
- Sem adaptações (paleta roxa é neutra — serve para nexus-odoo)

### T11 — src/app/layout.tsx

- Arquivo: `src/app/layout.tsx`
- Base: copiar estrutura do nexus-insights `src/app/layout.tsx`
- Adaptações:
  - `title: "Nexus Odoo | Dados do ERP"` (era `"Nexus | Roteador Webhook"`)
  - `description: "Dados do ERP Odoo da Matrix Fitness Group"` (era sobre webhooks)
- Manter inalterados: fonts Inter + Geist_Mono, import `./globals.css`, `Providers`, `Toaster`, `getResolvedThemeFromCookie`, html attrs
- Verificação: arquivo existe e tsc sem erro nele

### T12 — src/app/page.tsx

- Arquivo: `src/app/page.tsx`
- Conteúdo: copiar verbatim do nexus-insights
- Lógica: `auth()` → session? → `redirect('/dashboard')` : `redirect('/login')`
- Sem adaptações

---

## Grupo E — Auth layout e login

### T13 — src/app/(auth)/layout.tsx

- Arquivo: `src/app/(auth)/layout.tsx`
- Conteúdo: copiar verbatim — `export default function AuthLayout({ children }) { return <>{children}</> }`
- Sem adaptações

### T14 — src/app/(auth)/login/page.tsx

- Arquivo: `src/app/(auth)/login/page.tsx`
- Base: copiar do nexus-insights `src/app/(auth)/login/page.tsx`
- Adaptações (somente metadata):
  - `title: 'Login | Nexus Odoo'` (era `'Login | Nexus Insights'`)
  - `description: 'Acesse o painel do Nexus Odoo'` (era `'Acesse o painel do Nexus Insights'`)
- JSX: sem alterações (fundo gradient, Suspense, LoginContent, footer)

### T15 — src/app/(auth)/login/actions.ts

- Arquivo: `src/app/(auth)/login/actions.ts`
- Conteúdo: copiar verbatim do nexus-insights
- Deps: `@/auth` ✅, `@/lib/prisma` ✅, `@/lib/theme` (T3) — todos presentes
- Sem adaptações

### T16 — src/components/login/login-content.tsx

- Arquivo: `src/components/login/login-content.tsx`
- Base: copiar do nexus-insights `src/components/login/login-content.tsx`
- Adaptações:
  - h1 título: `"Nexus Insights"` → `"Nexus Odoo"`
  - p subtítulo: `"Relatórios Inteligentes"` → `"Dados do ERP"`
  - `<Image>` src: o arquivo-fonte usa algum path como `/logo-nexus-ai.png` ou similar — substituir por `/logo.png` (único arquivo que será criado em T27); fazer `grep -n 'Image' nexus-insights/.../login-content.tsx` para achar a linha exata antes de escrever
- Todo o resto (form, handlers, framer-motion, inputs): sem alterações

---

## Grupo F — Stubs de Server Actions

> Stubs permitem que os formulários compilem agora. Implementação real (SMTP, tokens) vem em fase posterior.

### T17 — src/lib/actions/password-reset.ts

- Arquivo: `src/lib/actions/password-reset.ts`
- Conteúdo:
  ```ts
  'use server';

  export async function requestPasswordReset(
    _email: string
  ): Promise<{ success?: boolean; error?: string }> {
    // TODO: implementar envio de email — fase F2/F3
    return { success: true };
  }

  export async function verifyResetToken(
    _token: string
  ): Promise<{ valid: boolean; error?: string }> {
    return { valid: false, error: 'Funcionalidade não implementada' };
  }

  export async function resetPassword(
    _token: string,
    _newPassword: string
  ): Promise<{ success?: boolean; error?: string }> {
    return { error: 'Funcionalidade não implementada' };
  }
  ```
- Exporta todas as funções que reset-password-form.tsx e forgot-password-form.tsx podem importar
- Verificação: tsc sem erro no arquivo

### T18 — src/lib/actions/profile.ts

- Arquivo: `src/lib/actions/profile.ts`
- Conteúdo:
  ```ts
  'use server';

  export async function confirmEmailChange(
    _token: string
  ): Promise<{ success?: boolean; error?: string }> {
    // TODO: implementar confirmação de troca de email — fase futura
    return { error: 'Funcionalidade não implementada' };
  }
  ```
- Verificação: tsc sem erro no arquivo

**Verificação de checkpoint F:** `npx tsc --noEmit 2>&1 | grep -E 'error|src/lib/actions'` — zero erros nos stubs

---

## Grupo G — Forgot password

### T19 — src/app/(auth)/forgot-password/forgot-password-form.tsx

- Arquivo: `src/app/(auth)/forgot-password/forgot-password-form.tsx`
- Conteúdo: copiar verbatim do nexus-insights
- Importa `requestPasswordReset` de `@/lib/actions/password-reset` (T17 ✅)
- Sem adaptações de branding (texto é genérico em PT-BR)

### T20 — src/app/(auth)/forgot-password/page.tsx

- Arquivo: `src/app/(auth)/forgot-password/page.tsx`
- Base: copiar do nexus-insights
- Adaptação: `title: 'Esqueci minha senha | Nexus Odoo'` (era `'| Nexus Insights'`)
- JSX: sem alterações

---

## Grupo H — Reset password

### T21a — Inspecionar imports de reset-password-form.tsx

- Comando: `head -20 nexus-insights/src/app/(auth)/reset-password/reset-password-form.tsx`
- Listar todos os imports `@/lib/actions/*`
- Se importar algo além de `password-reset`: criar stub adicional em `src/lib/actions/` antes de T21b
- Resultado esperado: imports cobertos por T17 (requestPasswordReset, verifyResetToken, resetPassword)

### T21b — src/app/(auth)/reset-password/reset-password-form.tsx

- Arquivo: `src/app/(auth)/reset-password/reset-password-form.tsx`
- Conteúdo: copiar verbatim do nexus-insights (após confirmar imports em T21a)
- Sem adaptações de branding

### T22 — src/app/(auth)/reset-password/page.tsx

- Arquivo: `src/app/(auth)/reset-password/page.tsx`
- Base: copiar do nexus-insights
- Adaptação: title para `'Redefinir senha | Nexus Odoo'`
- JSX: sem alterações

---

## Grupo I — Verify email

### T23 — src/app/(auth)/verify-email/verify-email-content.tsx

- Arquivo: `src/app/(auth)/verify-email/verify-email-content.tsx`
- Base: copiar do nexus-insights `verify-email-content.tsx`
- Adaptações:
  - Substituir import `Webhook` de lucide por `Database` (ícone semanticamente correto para ERP)
  - Trocar uso de `<Webhook>` por `<Database>` no JSX
  - Importa `confirmEmailChange` de `@/lib/actions/profile` (T18 ✅)
- Resto: sem alterações

### T24 — src/app/(auth)/verify-email/page.tsx

- Arquivo: `src/app/(auth)/verify-email/page.tsx`
- Base: copiar do nexus-insights
- Adaptação: `title: 'Confirmar e-mail | Nexus Odoo'` (era `'| Nexus Insights'`)
- JSX: sem alterações

---

## Grupo J — APIs

### T25 — src/app/api/user/theme/route.ts

- Arquivo: `src/app/api/user/theme/route.ts`
- Conteúdo: copiar verbatim do nexus-insights
- Deps: `@/auth` ✅, `@/lib/prisma` ✅
- Sem adaptações (lógica idêntica: POST → validar tema → prisma.user.update)

### T26 — src/app/api/health/route.ts

- Arquivo: `src/app/api/health/route.ts`
- Não copiar do nexus-insights (versão tem deps próprias: nexusChatConnection, etc.)
- Criar do zero:
  ```ts
  import { NextResponse } from 'next/server';

  export const runtime = 'nodejs';

  export async function GET() {
    return NextResponse.json({ ok: true });
  }
  ```
- Verificação: tsc sem erro

---

## Grupo K — Public assets

### T27 — public/logo.png

- Verificar nexus-insights: `ls /Users/joaovitorzanini/Developer/Claude\ Code/Nexus\ AI/Projetos\ Internos/nexus-insights/public/`
- Se existir arquivo PNG/SVG de logo: `cp <path> public/logo.png`
- Se não existir PNG adequado: criar SVG placeholder inline e converter — ou criar arquivo PNG mínimo válido com:
  ```sh
  # Cria PNG 88x88 placeholder roxo (sem imagemagick — via Node)
  node -e "
  const {createCanvas} = require('canvas');
  // Se canvas não disponível, criar arquivo binário PNG mínimo 1x1
  " 2>/dev/null || python3 -c "
  import struct, zlib
  def png(w,h,r,g,b):
      raw=struct.pack('>BBBBB',0,r,g,b,255)*w
      raw=zlib.compress(raw*h)
      def chunk(t,d):
          c=struct.pack('>I',len(d))+t+d
          return c+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
      return b'\\x89PNG\\r\\n\\x1a\\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',raw)+chunk(b'IEND',b'')
  open('public/logo.png','wb').write(png(88,88,109,40,217))
  print('OK')
  "
- Verificação: `file public/logo.png` — deve reportar PNG ou imagem válida

---

## Verificação Final

### T28 — TypeScript check

- Comando: `npx tsc --noEmit`
- Resultado esperado: EXIT=0, zero erros ou warnings
- Se falhar: diagnosticar e corrigir antes de prosseguir para T29

### T29 — Next.js build

- Comando: `npx next build`
- Resultado esperado: build completo sem erro de compilação
- Acceptable: warnings de imagens, ESLint (não bloqueiam build)
- Não acceptable: erros de module not found, type errors, import errors

---

## Arquivos que este bloco cria

```
src/lib/utils.ts
src/lib/theme.ts
src/lib/actions/password-reset.ts
src/lib/actions/profile.ts
src/components/providers/theme-provider.tsx
src/components/ui/button.tsx
src/components/ui/input.tsx
src/components/ui/label.tsx
src/components/ui/sonner.tsx
src/components/ui/password-input.tsx
src/components/login/login-content.tsx
src/app/globals.css
src/app/layout.tsx
src/app/page.tsx
src/app/(auth)/layout.tsx
src/app/(auth)/login/page.tsx
src/app/(auth)/login/actions.ts
src/app/(auth)/forgot-password/page.tsx
src/app/(auth)/forgot-password/forgot-password-form.tsx
src/app/(auth)/reset-password/page.tsx
src/app/(auth)/reset-password/reset-password-form.tsx
src/app/(auth)/verify-email/page.tsx
src/app/(auth)/verify-email/verify-email-content.tsx
src/app/api/user/theme/route.ts
src/app/api/health/route.ts
public/logo.png
```
