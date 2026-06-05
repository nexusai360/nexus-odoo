/**
 * REGRAS TEMPORÁRIAS , flags que o usuário pede pra ligar/desligar pontualmente.
 *
 * Para REVERTER qualquer regra ao comportamento normal, basta trocar o valor da
 * flag aqui (um lugar só). Nada mais precisa mudar.
 */

/**
 * 2026-06-05 (a pedido do usuário): oculta o menu "Usuários" e bloqueia a rota
 * `/usuarios` para TODOS exceto `super_admin`. Normalmente o item aparece para
 * `admin` também.
 *
 * REVERTER (admin volta a ver "Usuários" e acessar a rota): trocar para `false`.
 */
export const USUARIOS_SUPER_ADMIN_ONLY = true;
