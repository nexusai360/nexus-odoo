# UI/UX Review — Fase 1 (Fundação) / Bloco 5

**Data:** 2026-05-16
**Escopo:** sidebar, page-shell, page-header, layout protegido, dashboard, usuários (tabela + dialog), perfil + cards.
**Baseline:** padrões abstratos (não há UI-SPEC.md) + tokens do design system em `globals.css`.
**Screenshots:** não capturados (sem dev server) — auditoria de código.

> Contexto: cards de perfil e sidebar são porte de projeto-irmão com design validado em
> produção. Inconsistências nesses componentes foram classificadas com severidade
> proporcionalmente menor — porém apontadas.

---

## Resumo por severidade

| Severidade | Quantidade |
|------------|-----------|
| Crítico    | 2 |
| Alerta     | 6 |
| Info       | 5 |

---

## Crítico

### C1 — Sidebar mobile não recebe foco nem trava o foco (focus trap ausente)
**Arquivo:** `src/components/layout/sidebar.tsx` (linhas 203-225)
**Problema:** o drawer mobile é um `motion.aside` sem `role="dialog"`, sem
`aria-modal`, sem mover foco para dentro ao abrir e sem trap. Usuário de teclado
abre o menu pelo botão hambúrguer e o foco permanece no `body`/atrás do overlay;
`Tab` navega o conteúdo da página por baixo do overlay. Não há fechamento por
`Esc`. Para leitor de tela o overlay é invisível (nenhum texto/aria).
**Correção:** envolver o drawer em um componente Dialog/Sheet acessível (o projeto
já tem `@base-ui` Dialog) ou adicionar `role="dialog"`, `aria-modal="true"`,
`aria-label="Menu de navegação"`, mover foco para o primeiro link ao abrir,
implementar focus trap e handler de `Esc`. O botão hambúrguer precisa de
`aria-expanded` e `aria-controls`.

### C2 — Botão hambúrguer sem rótulo acessível
**Arquivo:** `src/components/layout/sidebar.tsx` (linhas 193-200)
**Problema:** `Button size="icon"` contém apenas o ícone `Menu`/`X` (com
`aria-hidden` implícito via lucide). Não há `aria-label`. Leitor de tela anuncia
"botão" sem função. É o único controle de navegação no mobile — bloqueia o uso.
**Correção:** adicionar `aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}`
e `aria-expanded={mobileOpen}`.

---

## Alerta

### A1 — Cabeçalho de `/perfil` inconsistente com as demais telas
**Arquivo:** `src/components/profile/profile-content.tsx` (linhas 48-55)
**Problema:** `/dashboard`, `/usuarios` e `/perfil/trocar-senha` usam o componente
`PageHeader` (ícone em quadro violeta, `h1` `text-xl`, probe de altura). `/perfil`
renderiza um `<h1 className="text-2xl font-bold">` próprio, sem ícone e sem o
`PageHeaderHeightProbe`. Resultado: tamanho/peso de título divergente entre telas
e a variável CSS `--page-header-h` não é atualizada nesta rota (pode quebrar
qualquer layout que dependa dela, ex.: thead sticky).
**Correção:** usar `PageHeader` com `icon={UserIcon}` em `/perfil`, ou justificar
a exceção. Padronizar o tamanho do título (`text-xl` vs `text-2xl`).

### A2 — Tabela de usuários transborda no mobile sem alternativa de leitura
**Arquivo:** `src/components/users/users-content.tsx` (linhas 127, 146-237)
**Problema:** a tabela tem 6 colunas e o container só faz `overflow-x-auto`. Em
viewport ~375px o usuário tem scroll horizontal de uma `<table>` densa — funciona,
mas é uma experiência pobre e não há card-layout responsivo. Soma-se a isso o
botão hambúrguer fixo em `top-4 left-4` que sobrepõe o canto superior esquerdo do
conteúdo (a página adiciona `pt-16` no mobile para compensar, mas a tabela ainda
encosta nas bordas).
**Correção:** aceitável manter scroll horizontal como mínimo, mas avaliar layout
em cards para `< sm`. No mínimo garantir padding lateral suficiente e largura
mínima de colunas para o conteúdo não comprimir.

### A3 — `setUserActive` e `deleteUser` compartilham um único `isPending`
**Arquivo:** `src/components/users/users-content.tsx` (linhas 74, 204-230)
**Problema:** todos os botões de ação de todas as linhas usam o mesmo
`isPending` de um único `useTransition`. Ao desativar o usuário da linha 1,
**todos** os botões de ativar/desativar de todas as linhas ficam `disabled` e
sem feedback de qual linha está processando. Não há spinner na ação em curso.
**Correção:** rastrear o id da linha em processamento (`pendingId`) e desabilitar/
mostrar spinner apenas naquela linha.

### A4 — Toggle ativar/desativar é destrutivo-adjacente e não tem confirmação
**Arquivo:** `src/components/users/users-content.tsx` (linhas 91-101, 204-219)
**Problema:** excluir usuário tem `AlertDialog` de confirmação (correto), mas
desativar um usuário — que corta o acesso de alguém à plataforma — é executado
em um clique único, sem confirmação e sem desfazer. Inconsistente com o
tratamento dado ao delete.
**Correção:** adicionar confirmação leve para desativação (ou ao menos toast com
ação "Desfazer"). Decisão de produto, mas a assimetria atual deve ser revista.

### A5 — Estado de erro de carregamento da tabela só existe como toast efêmero
**Arquivo:** `src/components/users/users-content.tsx` (linhas 76-85, 127-145)
**Problema:** se `listUsers()` falhar, dispara `toast.error` e `setLoading(false)`
— a UI cai no ramo `users.length === 0` e mostra "Nenhum usuário encontrado",
mensagem **incorreta** para um erro de fetch. Não há estado de erro com retry.
**Correção:** adicionar estado `error` e um ramo dedicado com mensagem de falha
+ botão "Tentar novamente" chamando `load()`.

### A6 — Cores hardcoded fora dos tokens do design system
**Arquivos:** `src/components/layout/sidebar.tsx` (68-77, 169), `users-content.tsx`
(58-63, 281), `personal-info-card.tsx` (189), `appearance-card.tsx` (98-113).
**Problema:** uso extenso de `violet-*`, `emerald-*`, `zinc-*`, `red-*`,
`bg-black/60` direto no markup em vez de tokens semânticos (`primary`, `accent`,
`destructive`, `muted`). O `globals.css` inclusive precisou de um bloco inteiro de
overrides (`:root:not(.dark) .text-violet-400 {...}`) para corrigir contraste no
light mode — sintoma de que a paleta crua foi usada onde tokens resolveriam. Ex.:
`bg-violet-600 hover:bg-violet-700` (botão Salvar do perfil) vs `bg-destructive`
(botão Excluir) — dois padrões para o mesmo conceito de botão primário.
**Correção:** migrar para tokens (`bg-primary`, `text-primary`,
`border-destructive` etc.). Onde a paleta crua for inevitável, centralizar em
constantes. Severidade reduzida por ser porte de design já validado, mas a dívida
deve ser registrada.

---

## Info

### I1 — `PageHeaderHeightProbe` escreve em `document.documentElement` global
**Arquivo:** `src/components/page-header-height-probe.tsx`
A variável `--page-header-h` é global; se duas telas montarem o probe (não ocorre
hoje, rotas são exclusivas) haveria corrida. Funciona, mas é frágil — documentar
a premissa de "um probe por vez" ou usar escopo local.

### I2 — Avatar do usuário usa `<img>` cru com `eslint-disable`
**Arquivos:** `sidebar.tsx` (137), `personal-info-card.tsx` (141)
`<img>` sem `next/image` é tolerável para data-URLs/avatares, mas falta `loading`
e dimensões podem causar leve CLS. Aceitável; registrar como dívida menor.

### I3 — Sidebar fixa em `w-60` sem `<nav aria-label>`
**Arquivo:** `sidebar.tsx` (105)
O `<nav>` não tem `aria-label`. Com múltiplas landmarks de navegação no futuro,
um leitor de tela não distingue. Adicionar `aria-label="Navegação principal"`.

### I4 — `EmailChangeCard` usa `text-emerald-400` em fundo claro de sucesso
**Arquivo:** `email-change-card.tsx` (91)
O bloco de sucesso depende do override de `globals.css` para contraste no light
mode. Funciona via CSS global, mas o componente fica acoplado a esse override —
preferir token ou cor explícita por tema.

### I5 — Animação de entrada da sidebar com delay por item pode atrasar interação
**Arquivo:** `sidebar.tsx` (111-116)
`delay: index * 0.04` por item de nav: com ~10 itens, o último aparece ~400ms
após a montagem. Para navegação primária, considerar reduzir o stagger ou
respeitar `prefers-reduced-motion` (não tratado em nenhuma animação do bloco).

---

## Pontos positivos verificados

- Tabela de usuários **tem** skeleton de loading e empty state com `role="status"`.
- Botões de ação da tabela têm `aria-label` individualizado e `title`.
- Delete tem `AlertDialog` de confirmação com texto "não pode ser desfeita".
- `PasswordChangeCard` tem validação inline com `role="alert"`, `aria-invalid`,
  `aria-describedby` — acessibilidade de formulário bem feita.
- `AppearanceCard` usa `role="radiogroup"`/`role="radio"`/`aria-checked` corretos.
- Botões de submit mostram `Loader2` em estado pending de forma consistente.
- Inputs têm `<Label htmlFor>` em todos os formulários auditados.
- Toggle de senha visível tem `aria-label` dinâmico.
