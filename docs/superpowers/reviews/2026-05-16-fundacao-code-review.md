---
fase: F1-fundacao
revisado: 2026-05-16T05:22:00-03:00
profundidade: deep
arquivos_revisados: 31
achados:
  critico: 3
  alerta: 7
  info: 6
  total: 16
status: issues_found
---

# Fase 1 (Fundação) — Code Review

**Revisado:** 2026-05-16
**Profundidade:** deep (análise cross-file de auth, RBAC e server actions)
**Status:** issues_found

## Resumo

A fundação está bem estruturada — split-config de auth correto, audit em todas as
mutações, validação Zod presente. Porém há **um furo real de RBAC**: a server action
`createUser` não verifica se o chamador tem direito de gerenciar usuários, apenas se o
papel-alvo cabe na hierarquia. Um `manager` autenticado (que nem vê a tela `/usuarios`)
consegue criar usuários chamando a action diretamente. Outros dois achados críticos:
a rota `/api/user/theme` aceita `body` sem try/catch (500 não tratado) e o callback `jwt`
engole exceções de banco de forma que pode manter sessão de usuário desativado. Detalhes
abaixo.

## Críticos

### CR-01: `createUser` permite que `manager` crie usuários — RBAC incompleto

**Arquivo:** `src/lib/actions/users.ts:71-88` + `src/lib/permissions.ts:28-37`

**Problema:** `createUser` faz apenas `canCreateRole(me, input.platformRole)`. Essa função
(`permissions.ts:28`) só rejeita `viewer` explicitamente; para qualquer outro papel ela
compara hierarquias: `PLATFORM_ROLE_HIERARCHY[role] <= PLATFORM_ROLE_HIERARCHY[creator]`.
Com a hierarquia de `roles.ts` (`manager`=2, `viewer`=1), um usuário `manager` autenticado
satisfaz `canCreateRole(manager, "manager")` (2 ≤ 2) e `canCreateRole(manager, "viewer")`
(1 ≤ 2) → **`true`**. A página `/usuarios/page.tsx:14` redireciona `manager`/`viewer`
para `/dashboard`, e `listUsers` bloqueia os dois — mas `createUser` é o endpoint real e
**não** repete essa checagem. Um `manager` pode chamar `createUser` diretamente (fetch para
a server action) e criar contas. Escalada de privilégio.

**Correção:** Adicionar gate de papel no início de `createUser`, idêntico ao de `listUsers`:
```ts
if (me.platformRole === "viewer" || me.platformRole === "manager") {
  return { success: false, error: "Acesso negado" };
}
```
Idealmente extrair um helper `assertCanManageUsers(me)` e usá-lo em `listUsers`,
`createUser`, `updateUser`, `setUserActive`, `deleteUser` — hoje `updateUser`/`deleteUser`
estão protegidos só de forma indireta via `canEditUser` (que bloqueia `manager` com
`managerNoAccess`), mas `createUser` não tem equivalente. Centralizar evita o furo se
funções de permissão divergirem.

### CR-02: `/api/user/theme` — `request.json()` sem try/catch derruba a rota com 500

**Arquivo:** `src/app/api/user/theme/route.ts:19`

**Problema:** `const body = await request.json();` não está em try/catch. Um POST com corpo
ausente ou JSON malformado faz `request.json()` lançar, e a rota responde 500 com stack
em vez de um 400 limpo. Além disso, `prisma.user.update` na linha 26 também não tem
tratamento — se o usuário foi excluído entre a sessão e o request, o `update` lança
`P2025` e vira 500. O endpoint inteiro roda sem nenhum `catch`.

**Correção:** Envolver em try/catch e validar o corpo defensivamente:
```ts
let body: unknown;
try {
  body = await request.json();
} catch {
  return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
}
const theme = (body as { theme?: unknown })?.theme;
// ... validação de theme ...
try {
  await prisma.user.update({ where: { id: session.user.id }, data: { theme } });
} catch {
  return NextResponse.json({ error: "Erro ao salvar" }, { status: 500 });
}
```

### CR-03: callback `jwt` engole erro de banco e mantém sessão de usuário desativado

**Arquivo:** `src/auth.ts:31-58`

**Problema:** O callback `jwt` consulta o banco a cada request para revalidar `isActive`.
Se a query lançar (banco fora, timeout), o `catch {}` (linha 55) silencia o erro e
**mantém o token anterior**. Consequência: um usuário desativado (`isActive=false`)
continua com sessão válida durante qualquer indisponibilidade do Postgres, porque a
revalidação que o derrubaria nunca roda. O comentário "não derrubar auth" é uma decisão
deliberada, mas o trade-off não está documentado como risco e não há limite — a sessão
fica viva até 7 dias (`maxAge`). Para uma plataforma com dado fiscal/financeiro isso é um
buraco de revogação. Há também um problema secundário: `return null as any` (linha 53)
para invalidar a sessão depende de comportamento do NextAuth que não está testado.

**Correção:** No mínimo, registrar o erro (`console.error`) em vez de `catch` mudo, para
que a falha apareça nos logs. Considerar invalidar o token se a query falhar
repetidamente, ou gravar timestamp da última revalidação bem-sucedida no token e forçar
logout se ultrapassar um limite curto (ex.: 5 min) sem revalidação. Documentar a decisão
de fail-open explicitamente no comentário.

## Alertas

### AL-01: `changePassword` não valida input com Zod e aceita senha sem limite superior

**Arquivo:** `src/lib/actions/profile.ts:57-74`

**Problema:** Diferente das outras actions, `changePassword` recebe `input` tipado mas
**sem `safeParse`**. Se o client enviar `currentPassword`/`newPassword`/`confirmPassword`
ausentes ou não-string, `input.newPassword.length` lança `TypeError` → cai no catch
genérico "Erro ao alterar senha", escondendo a causa. Também não há limite máximo de
comprimento — bcrypt trunca silenciosamente em 72 bytes, então uma "senha" de 200
caracteres é aceita mas só os primeiros 72 contam (problema de segurança sutil: o usuário
acha que tem senha longa).

**Correção:** Adicionar schema Zod: `z.object({ currentPassword: z.string().min(1),
newPassword: z.string().min(8).max(72), confirmPassword: z.string().min(1) })` e
`safeParse` no início, como nas demais actions.

### AL-02: `loginAction` revela existência de conta via cookie e diferencia mensagens

**Arquivo:** `src/app/(auth)/login/actions.ts:21-45`

**Problema:** Antes do `signIn`, a action faz `prisma.user.findUnique({ where: { email } })`
e (a) retorna mensagem específica "Sua conta está inativa" e (b) só grava cookies de tema
se o usuário existe. Isso permite **enumeração de usuários**: um atacante distingue
e-mail cadastrado de não-cadastrado pela mensagem e pela presença dos cookies
`Set-Cookie` na resposta. O `authorizeCredentials` em `auth-helpers.ts` já trata
inativo/inexistente de forma uniforme (retorna `null` → "E-mail ou senha incorretos") —
essa pré-checagem desfaz essa proteção.

**Correção:** Remover a pré-checagem de `isActive` (deixar `authorizeCredentials` cuidar
de tudo, ele já retorna `null` para inativo). Para o tema, sincronizar cookies só após
o `signIn` bem-sucedido, ou aceitar o flash de tema no primeiro login como custo menor
que a enumeração.

### AL-03: `email` do `formData` usado como `string` sem validação na `loginAction`

**Arquivo:** `src/app/(auth)/login/actions.ts:18,49`

**Problema:** `formData.get('email') as string` e `formData.get('password') as string` —
se o campo estiver ausente, `get` retorna `null`, o cast mente para o TypeScript, e
`prisma.user.findUnique({ where: { email: null } })` lança. O `loginSchema` em `auth.ts`
valida dentro do `authorize`, mas a query em `actions.ts:21` roda **antes** disso, sem
rede de proteção.

**Correção:** Validar com Zod antes de qualquer query: `const parsed =
loginSchema.safeParse({ email: formData.get('email'), password: formData.get('password') });
if (!parsed.success) return { error: 'E-mail ou senha incorretos.' };`

### AL-04: `updateUser` com `name`/`platformRole` ambos ausentes faz update vazio

**Arquivo:** `src/lib/actions/users.ts:128-167`

**Problema:** `UpdateUserInput` marca `name` e `platformRole` como `.optional()`. Se ambos
vierem ausentes, `parsed.success` é `true`, os spreads nas linhas 164-165 produzem `data: {}`,
e `prisma.user.update` roda com objeto vazio — sem erro, mas grava audit `user_updated`
com `details: { name: undefined, platformRole: undefined }`. Audit ruidoso e update inútil.

**Correção:** `.refine()` no schema exigindo ao menos um campo: `.refine(d => d.name !==
undefined || d.platformRole !== undefined, "Nada a atualizar")`, ou retornar cedo se
`data` estiver vazio.

### AL-05: `avatarUrl` aceita data URL de 256 KB sem validar que é imagem

**Arquivo:** `src/lib/actions/profile.ts:16` + `src/components/profile/personal-info-card.tsx:102`

**Problema:** `UpdateProfileInput.avatarUrl` é `z.string().max(262144)` — aceita qualquer
string de até 256 KB. O client envia um data URL produzido pelo canvas, mas a action é o
endpoint real e não verifica que a string começa com `data:image/`. Um chamador direto
pode gravar 256 KB de texto arbitrário no campo `avatarUrl`, que depois é renderizado em
`<img src={avatarUrl}>` no sidebar e no perfil. Não é XSS (atributo `src` de `img` não
executa script), mas é um vetor de armazenamento abusivo e o `<img src>` pode disparar
requisição a URL externa (`data:` não, mas se a validação cair, `http(s):` dispararia).

**Correção:** `z.string().regex(/^data:image\/(png|jpe?g|webp);base64,/)` no schema, ou
validar o prefixo na action antes do `update`.

### AL-06: `logAudit` é fire-and-forget — chamadas sem `await` perdem ordem e erros

**Arquivo:** `src/lib/actions/users.ts:110,169,208,243` + `src/lib/actions/profile.ts:40,95`

**Problema:** `logAudit(...)` retorna `Promise<void>` mas é chamado sem `await` em todas as
server actions. O `logAudit` já tem catch interno, então não derruba a action — mas: (1)
em ambiente serverless a function pode encerrar antes do INSERT completar, perdendo o log
de auditoria silenciosamente; (2) o `revalidatePath`/`return` roda antes do log persistir.
Para uma plataforma que exige "auditoria de acessos" (CLAUDE.md §8), perder logs de
`user_deleted` é grave.

**Correção:** `await logAudit(...)` antes do `return` em cada action. O catch interno do
`logAudit` garante que um erro de audit não quebra a operação, mas o `await` garante que
o INSERT ao menos foi tentado de forma síncrona.

### AL-07: `updateProfile` permite trocar `theme` mas não sincroniza cookies do SSR

**Arquivo:** `src/lib/actions/profile.ts:20-48` vs `src/app/api/user/theme/route.ts`

**Problema:** Existem dois caminhos para gravar `theme`: a rota `/api/user/theme` e a
action `updateProfile`. O `AppearanceCard` usa `updateProfile` (linha 57). A rota tem um
comentário dizendo que cookies são "fonte de verdade para o SSR", mas `updateProfile` grava
só no banco e **não** atualiza os cookies `THEME_COOKIE`/`THEME_PREF_COOKIE`. Resultado:
trocar tema pelo perfil persiste no banco mas o SSR no próximo load ainda lê o cookie
antigo → flash de tema errado até o client corrigir. Dois caminhos divergentes para a
mesma escrita é uma fonte de bug.

**Correção:** Unificar — fazer `updateProfile` também gravar os cookies quando `theme`
mudar (importar `cookies()` de `next/headers`), ou remover o branch de `theme` de
`updateProfile` e deixar o `AppearanceCard` usar exclusivamente a rota `/api/user/theme`.

## Info

### IN-01: `viewer` consegue abrir o dialog "Novo usuário" na UI (defeito cosmético de RBAC)

**Arquivo:** `src/components/users/users-content.tsx:121`

O botão "Novo usuário" sempre aparece. Para `manager`/`viewer` a página inteira já
redireciona, então na prática não chega aqui — mas se a regra de página mudar, o botão
fica órfão. Considerar gate por papel também no botão por consistência.

### IN-02: `requestEmailChange` retorna `{ error }` mas o client trata `result.success`

**Arquivo:** `src/lib/actions/profile.ts:111-119` + `src/components/profile/email-change-card.tsx:52`

`requestEmailChange` é stub e sempre retorna `{ error: "..." }`. O `EmailChangeCard`
checa `if (result.success)` — como `success` é `undefined`, sempre cai no `else` e mostra
o erro. Funciona por acidente; quando o stub for implementado, o contrato de tipo
(`ProfileResult` com ambos opcionais) não obriga a setar `success`. Tornar
`ProfileResult` uma união discriminada como `ActionResult` em `users.ts`.

### IN-03: `getCurrentUser` usa `Required<typeof session.user>` mascarando campos possivelmente ausentes

**Arquivo:** `src/lib/auth.ts:7`

`Required<...>` força o TypeScript a tratar todos os campos como presentes, mas o token
pode não ter `platformRole`/`isOwner`/`theme` se o callback `jwt` falhou no primeiro
request. Os `?? ""`/`?? null` cobrem `email`/`name`/`avatarUrl`, mas `platformRole`,
`isOwner`, `mustChangePassword` e `theme` ficam sem fallback — se `undefined`, propagam
silenciosamente. Considerar validar o shape do token ou dar fallbacks explícitos.

### IN-04: charset de senha temporária tem viés de módulo desprezível mas presente

**Arquivo:** `src/lib/temp-password.ts:8-13`

`randomInt(56)` sobre um charset de 56 caracteres — `randomInt` do `node:crypto` é
uniforme e sem viés (rejeição interna), então **não há bug aqui**. Registrado só para
constar que foi verificado. OK.

### IN-05: `worker/index.ts` não trata rejeição não capturada no `shutdown`

**Arquivo:** `src/worker/index.ts:42-51`

`shutdown` faz `await worker.close()` etc. sem try/catch — se `close()` lançar (Redis já
caído), o `shutdown` rejeita e o processo pode não chamar `process.exit(0)`, ficando
pendurado. Envolver em try/finally com `process.exit`.

### IN-06: `pg-pool.ts` não registra handler de `error` no Pool

**Arquivo:** `src/lib/pg-pool.ts:7-14`

O `Pool` do `pg` emite evento `error` em clientes ociosos que perdem conexão; sem
listener, isso vira `unhandledException` e pode derrubar o processo. Adicionar
`pgPool.on("error", (e) => console.error("[pg-pool]", e))`, como já é feito no
`redis.ts`.

---

_Revisado por: gsd-code-reviewer (Claude)_
_Profundidade: deep_
