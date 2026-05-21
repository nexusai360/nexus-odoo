# Review crítica, Plano F4 Onda 2 Correções Rodada 2

> Duas revisões adversariais do plano `2026-05-21-f4-onda2-correcoes-r2.md` (CLAUDE.md §6[6][7]).

## Review #1, lacunas, ordem, premissas

| # | Achado | Severidade | Resolução |
|---|--------|-----------|-----------|
| 1 | A doc do nexus-nfe é uma página isolada com cores `zinc-*` cravadas (tema escuro fixo). No nexus-odoo a doc é uma **aba** dentro do painel Servidor MCP, sob `PageShell`/`PageHeader`/`ServidorMcpNav`. Clonar as cores cravadas geraria uma ilha escura que ignora o tema e destoa do painel. | Material | Design Contract e Task A2 atualizados: clonar estrutura e layout, mas usar os tokens de tema do nexus-odoo (`bg-card`, `text-foreground`, `border-border`, acento `violet`). `CodeBlock` pode manter superfície escura. |
| 2 | Apagar `ApiKey` (B1) pode esbarrar em FK de `McpIdempotencyRecord`/`McpAuditLog`. | Material | B1 atualizada: conferir FK e apagar dependentes antes, ou confirmar cascade. |
| 3 | B2 deixava aberto "criar um DateField" sem âncora; o usuário apontou o nexus-insights como referência de datas. | Menor | B2 atualizada: clonar o componente de data do nexus-insights se o nexus-odoo não tiver um reutilizável. |
| 4 | A6 não checava testes que referenciam os componentes de doc removidos, nem o destino de `src/content/mcp-docs`. | Menor | A6 atualizada: checar `__tests__` e decidir sobre os arquivos de conteúdo. |

## Review #2, granularidade, integração, testabilidade

| # | Achado | Severidade | Resolução |
|---|--------|-----------|-----------|
| 5 | Lógica testável sem teste: a conversão nível de acesso ↔ `McpCapabilities` (B6) e as actions de tour (G2). CLAUDE.md §6[8] pede TDD onde há lógica testável. | Material | B6: extrair `capabilitiesToLevels`/`levelsToCapabilities` puras com teste TDD. G2: teste unitário das actions de tour. |
| 6 | A doc terá duas navegações empilhadas (tabs do painel + sidebar de seções da doc). | Aceito | É hierarquia legítima (nav de painel vs nav interna da doc). Mantido, sem mudança. |
| 7 | B4 a B7 tocam só `chaves-lista.tsx` e comitam junto em B7. | Aceito | Um arquivo, rework coeso, commit único é atômico o suficiente. |
| 8 | Ordem das áreas A→H, cada uma independente; G2 usa migration. | OK | A migration segue o padrão sem reset já validado nesta branch. |

**Conclusão:** achados materiais (1, 2, 5) aplicados ao plano; menores (3, 4) aplicados;
6 e 7 avaliados e aceitos com justificativa. Plano promovido a **v3**, apto para execução.
