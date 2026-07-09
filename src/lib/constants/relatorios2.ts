// src/lib/constants/relatorios2.ts
// Fonte ÚNICA do nome e das rotas do menu "Relatórios 2.0" (F6). Nav, tela de
// configuração de acesso e gating puxam daqui , renomear o menu é trocar AQUI e
// reflete em todos os lugares. Nome provisório (decisão do usuário 2026-06-26).
export const RELATORIOS2_MENU = {
  /** Label provisório do menu , trocar aqui propaga para sidebar + config. */
  label: "Relatórios 2.0",
  href: "/relatorios-2",
} as const;

/** Submenus, na ordem de exibição. `key` é estável (usado no RBAC/persistência). */
export const RELATORIOS2_SUBMENUS = [
  { key: "paineis", label: "Painéis", href: "/relatorios-2/paineis" },
  { key: "meus", label: "Meus relatórios", href: "/relatorios-2/meus" },
  { key: "construtor", label: "Construtor", href: "/relatorios-2/construtor" },
] as const;

export type Relatorios2SubmenuKey = (typeof RELATORIOS2_SUBMENUS)[number]["key"];
