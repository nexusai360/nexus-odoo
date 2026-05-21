# Review crítica, Plano F4 Onda 2 Correções Rodada 3

> Duas revisões adversariais do plano `2026-05-21-f4-onda2-correcoes-r3.md` (CLAUDE.md §6[6][7]).

## Review #1, lacunas, ordem, premissas

| # | Achado | Severidade | Resolução |
|---|--------|-----------|-----------|
| 1 | A3 dizia "mostrar o result" mas reads podem não capturar result; o usuário pergunta "sucesso de quê". Faltava a fonte da explicação. | Material | A3 atualizada: usar a `descricao` do catálogo, cruzando pelo nome da tool, para uma frase humana do que a tool faz no topo do detalhe. |
| 2 | C1 (catálogo não carrega) sem hipótese de causa. | Material | C1 atualizada: causa provável é depender do container `mcp` (não roda em dev); fix é derivar o catálogo de fonte in-app. |
| 3 | D1 "resolver a URL de verdade" sem dizer como; `NEXT_PUBLIC_APP_URL` costuma estar vazio em dev. | Material | D1 atualizada: resolver pelos headers da request (host + proto), com fallback. |
| 4 | E1 reusava `servidorMcpTour` em todas as abas, mas seus passos ancoram em elementos da Visão Geral, que não existem nas outras abas. | Material | E1 atualizada: cada aba tem mini-tour próprio ancorado nos seus elementos. |

## Review #2, granularidade, integração, testabilidade

- A1/A2 (filtro de status): a investigação dos valores reais do banco é o primeiro passo, correto. O mapeamento rótulo pt-br para valor é lógica simples; teste unitário opcional, não bloqueia.
- B1 a B3 tocam o `chaves-lista.tsx`, arquivo único e coeso; commit único aceitável.
- F e G são redesenhos de tela inteira; cada um é uma unidade coesa. O padrão de referência são as telas de Integrações existentes (`api-keys-content`, `webhooks-content`) mais o cabeçalho com `TourTriggerButton`.
- Ordem A a H sem dependências cruzadas problemáticas. Task 0 (sidebar) é trivial e independente.
- Sem novos modelos Prisma nesta rodada.

**Conclusão:** achados materiais (1 a 4) aplicados. Plano promovido a v3, apto para execução.
