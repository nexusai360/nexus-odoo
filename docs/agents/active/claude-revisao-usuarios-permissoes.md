# claude-revisao-usuarios-permissoes

- inicio: 2026-05-28 13:05
- branch: feat/router-catalogo-r1 (apenas leitura por enquanto; validacao do estado atual)
- objetivo: levantar com o usuario o estado atual da area de usuarios da plataforma (cadastro, perfis, RBAC, permissoes por tela, permissoes de uso do Agente Nex) para validar o que existe hoje e mapear ajustes.
- escopo desta sessao:
  - leitura: src/components/(usuarios|admin), src/app/(admin|usuarios), src/lib/auth, prisma/schema.prisma (Users, Profile, Permission etc.), middleware, rbac, agent permissions
  - producao de relatorio em chat (sem alterar codigo ate o usuario validar)
- arquivos compartilhados que VOU modificar nesta sessao: nenhum (modo investigacao)
- agentes em paralelo: nenhum active file alheio. Branch da sessao base do router-catalogo (R1 backend completo, UI pendente).
- observacoes:
  - sessao iniciada pelo usuario com pedido de auditoria/validacao da area de usuarios e permissoes (telas + Agente Nex).
  - usuario informou que ha outros agentes em paralelo; ficar atento, sem mexer em arquivos compartilhados sem checar git log -3 antes.
