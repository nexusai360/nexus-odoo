---
agent: claude-agente-nex-config-recursos
started_at: 2026-05-22T16:45-03:00
branch: feat/f4-leitura-expansao
target_phase: F5 (reorganizacao Configuracao/Recursos do Agente Nex)
status: in_progress
---

## Topico
Reorganizar as telas do Agente Nex: mover a secao "Recursos" da tela de
Prompt para a tela de Configuracao; respiro entre "Chave de API" e "Consumo";
novo componente de toggle de raciocinio (3 status + seletor de nivel + custo
com tag de preco); botao "atualizar" no cabecalho Modelo + scripts de
atualizacao de modelos por provedor; review de quais modelos suportam
raciocinio. Spec/plano em docs/superpowers/.

## Coordenacao com claude-agente-nex-melhorias (REGRA DO USUARIO)
> Os dois escopos se sobrepoem. Regra: nos arquivos compartilhados eu SEMPRE
> espero o claude-agente-nex-melhorias terminar antes de tocar. Avanco antes
> apenas nos arquivos exclusivamente meus.

**Arquivos COMPARTILHADOS (espero o outro agente terminar):**
- src/components/agent/resources-toggles.tsx (ele toca na Task E3)
- src/lib/actions/agent-config.ts (ele toca em C/E3)
- prisma/schema.prisma (ele adiciona reasoningEffort; f4-leitura tambem declara)

**Arquivos provavelmente EXCLUSIVOS meus (a confirmar na exploracao):**
- src/app/(protected)/agente/prompt/page.tsx (remover Recursos de la)
- src/app/(protected)/agente/configuracao/page.tsx (receber Recursos + respiro)
- src/components/agent/ — novo componente de raciocinio (arquivo novo)
- src/components/agent/credentials-section.tsx (respiro Chave/Consumo)
- scripts/ — scripts novos de atualizacao de modelos por provedor
- catalogo/seed de modelos com suporte a raciocinio

## Bloqueios
- (nenhum por ora; planejamento nao toca codigo)
