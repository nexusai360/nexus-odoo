# Fluxo de Git — nexus-odoo

> Documento canônico do fluxo de branches. Claude coordena a criação das branches,
> sugere os nomes e controla todo o ciclo. O desenvolvedor decide apenas o merge.

## Princípios

1. **Nunca commitar direto na `main`.** Toda mudança passa por feature branch + Pull Request.
2. **Produção só atualiza no merge da `main`.** O merge é uma decisão humana — você não "sobe produção toda hora", sobe quando aprova um PR.
3. **Teste local antes do PR.** Rodar `docker-compose` localmente, verificar, e só então abrir o PR.
4. **Uma branch por frente de trabalho.** Não misturar dashboard e MCP na mesma branch.

## Modelo: GitHub Flow

```
main  ──●─────────────────●──────────────────●──▶  protegida = PRODUÇÃO
         \               / \                /
          ●──●──●───────●   ●──●──●────────●
       feat/discovery-odoo   feat/dashboard-faturamento
       (desenvolve + testa    (desenvolve + testa
        local)                 local)
```

- **`main`** — branch protegida. Não aceita push direto. Representa o que está (ou irá) em produção.
- **Feature branches** — criadas a partir da `main`, mergeadas de volta via PR.

## Convenção de nomes de branch

| Prefixo | Uso | Exemplo |
|---|---|---|
| `feat/` | Nova funcionalidade | `feat/discovery-odoo`, `feat/mcp-faturamento` |
| `fix/` | Correção de bug | `fix/polling-cursor-orfao` |
| `chore/` | Infra, config, dependências | `chore/setup-ci` |
| `docs/` | Apenas documentação | `docs/atualiza-runbook` |
| `refactor/` | Refatoração sem mudança de comportamento | `refactor/extrai-odoo-client` |

Nome em kebab-case, curto, descritivo. Claude sugere o nome ao iniciar cada frente.

## Branches por sub-projeto (roadmap)

| Sub-projeto | Branch sugerida |
|---|---|
| F0 — Discovery do Odoo | `feat/discovery-odoo` |
| F1 — Fundação | `feat/fundacao` |
| F2 — Ingestão / cache | `feat/ingestao` |
| F3 — Dashboard de relatórios | `feat/dashboard-*` (uma por relatório/bloco) |
| F4 — MCP semântico | `feat/mcp-*` (uma por grupo de tools) |
| F5 — Integração WhatsApp | `feat/whatsapp-*` |

A partir de F3, dashboard e MCP evoluem em **branches independentes** — uma frente não trava a outra.

## Ciclo de uma mudança

```
1. Claude cria a branch        → git checkout -b feat/<nome>
2. Desenvolve a feature        → commits atômicos, mensagens claras
3. Testa local                 → docker-compose up, verificação
4. Claude abre o PR            → gh pr create, descrição completa
5. Review                      → code review + UI review (ver CLAUDE.md §workflow)
6. Você decide o merge         → merge na main
7. CI/CD deploya produção      → automático no merge
```

## Mensagens de commit

- Imperativo, em português: `adiciona`, `corrige`, `atualiza`, `remove`.
- `adiciona` = funcionalidade nova; `atualiza` = melhora existente; `corrige` = bug fix.
- Commits atômicos — um commit, uma mudança coerente.
- Co-autoria do Claude incluída automaticamente.

## Proteção da `main`

Configurada no setup inicial:
- Push direto bloqueado.
- Merge exige Pull Request.

## O que Claude controla

- Criação e nomeação de todas as branches.
- Abertura de PRs com descrição completa (resumo + plano de teste).
- Garantir que nada vá direto pra `main`.
- Avisar antes de qualquer operação destrutiva (force-push, reset, branch -D).

## O que exige decisão humana

- Aprovar e executar o merge na `main` (= autorizar deploy).
- Disparar `/ultrareview` (manual, billing separado).
- Validação final pós-deploy.
