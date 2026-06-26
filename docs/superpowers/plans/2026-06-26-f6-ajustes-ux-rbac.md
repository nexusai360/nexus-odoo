# F6 , Ajustes UX + RBAC do menu Relatórios 2.0 (lista de tasks)

> Feedback do usuário (2026-06-26, prints). Executar em ondas, 1 commit por bloco.
> Decisões: RBAC em campos do `AgentSettings`; label "Relatórios 2.0" num
> constant compartilhado (provisório). Migrations do F6 SEMPRE manuais. F6 só local.

## Onda 1 , UX global + quick wins , FEITA (commit a1a856f)
- [x] 1. Respiro de rolagem global (layout pb-24; construtor recalcula altura).
- [x] 2. ApiKeySelect abre pra cima (flipUp). Custom/Searchable já flipam (base-ui).
- [x] 3. Submenu "Construtor" (curto) via constant RELATORIOS2_* (fonte única).

## Onda 2 , Config do construtor (Agente > Configuração) , FEITA (commit d18ab86)
- [x] 4. Filtro = tool-capable (usaFerramentas); raciocínio é toggle separado.
- [x] 5. Cards Raciocínio(+esforço)/Áudio/Anexo, 2 estados (FeatureCheckpoint
      allowed). Campos no AgentSettings; run-builder usa reasoningEffort; gates
      audio/anexo do construtor dependem do toggle + modelo configurado.

## Onda 3 , Composer do construtor = igual à bubble do Nex , FEITA (commit ee40135)
- [x] 6. Reusa MessageInput + AttachMenu + AudioRecorder persistente + enviar
      arredondado. Áudio corrigido (instância única). Placeholder/ajuda Nex.
      Anexo gated por config de imagem (chips staged; envio ao agente = Onda 2).

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
