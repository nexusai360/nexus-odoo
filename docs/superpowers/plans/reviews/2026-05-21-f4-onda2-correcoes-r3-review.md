# Review crítica, Plano F4 Onda 2 Correções Rodada 3

> Revisão crítica dupla do plano `2026-05-21-f4-onda2-correcoes-r3.md` (CLAUDE.md §6[6][7]).
> Cobre o plano completo: Task 0 e Áreas A a H, incluindo as adições C3 (navegação funcional,
> ícone) feitas após a primeira passada.

## Review #1, lacunas, ordem, premissas

| # | Achado | Severidade | Resolução |
|---|--------|-----------|-----------|
| 1 | A3 dizia "mostrar o result" mas reads podem não capturar result; faltava a fonte da explicação do que a tool faz. | Material | A3: usar a `descricao` do catálogo cruzando pelo nome da tool, frase humana no topo do detalhe. |
| 2 | C1 (catálogo não carrega) sem hipótese de causa. | Material | C1: causa provável é depender do container `mcp`; fix é derivar o catálogo de fonte in-app. |
| 3 | D1 "resolver a URL" sem dizer como; `NEXT_PUBLIC_APP_URL` costuma estar vazio em dev. | Material | D1: helper `resolveMcpPublicUrl()` via headers da request, com fallback. |
| 4 | E1 reusava `servidorMcpTour` em todas as abas, mas seus passos ancoram em elementos da Visão Geral. | Material | E1: cada aba com mini-tour próprio ancorado nos seus elementos. |
| 5 | C3 (scrollspy) corrige `scrollToSection`, mas o scroll real ocorre no `<main>` do layout, não na window. | Material | C3: usar `scrollIntoView` + `scroll-margin-top`, não `window.scrollTo`. Já no plano. |

## Review #2, granularidade, integração, testabilidade

- **Hero da doc:** C2 (remover atalhos do hero) e C3 (remover título/ícone duplicado do hero)
  tocam o mesmo bloco de `mcp-docs-content.tsx`. Executar C2 e C3 de forma coordenada, mesmo
  arquivo, sem retrabalho.
- **URL compartilhada:** C (doc) e D (visão geral) precisam da mesma URL real do MCP. Resolvido
  com o helper único `resolveMcpPublicUrl()` (D1 atualizada).
- **Ordem das áreas:** B (modal de chaves) antes de F (Plugar) e G (Webhooks) é correto, pois F
  e G reusam o padrão de modal e de cabeçalho definido em B.
- **F (Plugar):** já passou por um redesenho na rodada 1; a rodada 3 o alinha ao padrão das
  telas de Integrações (cabeçalho com tour, cards, modal). É refinamento, não recriação do zero.
- **Tour por aba (E1):** exige âncoras `data-tour` nos conteúdos de Chaves, Logs e Docs; cada
  mini-tour aponta para elementos da própria aba. Coberto.
- **Decomposição:** B1 a B3, C1 a C3 tocam arquivos únicos e coesos; commits por task aceitáveis.
  Os redesenhos de tela (B, F, G) são unidades coesas, uma tela cada.
- **Testabilidade:** o fix do filtro de status (A1/A2) é wiring verificável contra o banco real
  (passo explícito em A1). Sem lógica nova que exija teste unitário dedicado.

**Conclusão:** achados materiais (1 a 5) aplicados ao plano. Nenhum achado material restante.
Plano da rodada 3 promovido a **versão final**, apto para execução de ponta a ponta.
