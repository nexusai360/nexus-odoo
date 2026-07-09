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

## Onda 4 , Controle de acesso do menu Relatórios 2.0 , FEITA (commit a8772c5)
- [x] 7. Constant RELATORIOS2_* (nav + config + sidebar puxam daqui).
- [x] 8. Relatorios2AccessCard (tela Configuração, abaixo do sync): seletor à
      direita + descrição mutável; menu + 3 submenus.
- [x] 9. Travas no servidor (normalizarComTravas: Construtor puxa Painéis/Meus);
      off = só super_admin dono; submenus cinza quando menu off.
- [x] 10. Gating dinâmico: layout+páginas /relatorios-2 checam nível; sidebar
      via relatorios2Visible (server); botão Novo relatório só com acesso ao Construtor.

## Estado
- TODAS as ondas (1-4) concluídas e commitadas. 4 migrations manuais aplicadas
  (builder_model_credential, builder_recursos, relatorios2_acesso + a anterior).
- Dev reiniciado a cada mudança de schema para recarregar o Prisma Client.
