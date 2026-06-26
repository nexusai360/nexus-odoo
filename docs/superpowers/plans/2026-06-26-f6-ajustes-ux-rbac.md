# F6 , Ajustes UX + RBAC do menu Relatórios 2.0 (lista de tasks)

> Feedback do usuário (2026-06-26, prints). Executar em ondas, 1 commit por bloco.
> Decisões: RBAC em campos do `AgentSettings`; label "Relatórios 2.0" num
> constant compartilhado (provisório). Migrations do F6 SEMPRE manuais. F6 só local.

## Onda 1 , UX global + quick wins
- [ ] 1. Respiro de rolagem global: padding inferior extra no conteúdo (layout
      protegido) para a bubble não atrapalhar. Ajustar a altura do construtor
      (full-height) para continuar cabendo.
- [ ] 2. Dropdowns (CustomSelect/SearchableSelect/ApiKeySelect) abrem pra cima
      quando perto do rodapé (auto-flip do popover base-ui).
- [ ] 3. Renomear submenu "Construtor de relatórios" -> "Construtor" no sidebar.

## Onda 2 , Config do construtor (Agente > Configuração)
- [ ] 4. Revisar filtro de modelos: só modelos com raciocínio + ferramentas.
- [ ] 5. Cards Raciocínio + Áudio + Anexo no bloco do construtor, padrão Nex,
      mas 2 estados (Desativado/Produção). Campos novos no AgentSettings +
      ligar no run-builder/transcribe/visão.

## Onda 3 , Composer do construtor = igual à bubble do Nex
- [ ] 6. Reescrever composer: anexo (menu imagem/arquivo) + input sutil 1 linha
      + mic gravando de verdade (animação) + enviar circular; placeholder
      "Construa com o agente Nex…"; ajuda só "Enter envia · Shift+Enter quebra
      linha". Copiar componentes da bubble.

## Onda 4 , Controle de acesso do menu Relatórios 2.0 (tela Configuração)
- [ ] 7. Fonte única do nome "Relatórios 2.0" (constant compartilhado nav+config).
- [ ] 8. Bloco "Relatórios 2.0" abaixo de "Intervalos de sincronização": seletor
      à direita (Desativado/Superadmin/Admin/Gerente/Visualizador) + descrição
      mutável; um nível para o menu + um por submenu (Painéis/Meus/Construtor).
- [ ] 9. Travas: Construtor puxa Painéis/Meus para no mínimo o mesmo nível;
      menu off some pra todos menos super_admin dono; submenus cinza quando off.
- [ ] 10. Gating dinâmico: sidebar + layouts das rotas respeitam os níveis;
      botão "Novo relatório" só p/ quem acessa o Construtor (some se off).

## Estado
- Onda 1: em andamento.
