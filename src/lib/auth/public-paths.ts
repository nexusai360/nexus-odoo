/**
 * Rotas que dispensam sessão. Função PURA, para ser testável sem o middleware.
 *
 * Por que existe: os endpoints de recebimento de webhook são chamados por um
 * sistema externo, server-to-server, sem cookie de sessão. Eles se autenticam
 * sozinhos (`Authorization: Bearer <token do webhook>`, comparação timing-safe,
 * fail-closed). Se o middleware exigir sessão, a chamada é redirecionada para
 * `/login` com 302 e a mensagem nunca chega , foi exatamente o que acontecia com
 * `/api/hooks/<slug>`, que ficou fora desta lista quando a rota nasceu.
 *
 * Os prefixos são casados de forma ESTRITA (`/api/health` ou `/api/health/...`,
 * nunca `/api/healthz-interno`), para que um caminho parecido não vaze.
 */

/** Telas públicas de autenticação. */
const PAGINAS_PUBLICAS = new Set([
  "/login",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
]);

/**
 * Prefixos públicos. Recebimento de webhook por slug: `/api/webhooks/<slug>` é o
 * caminho canônico (é o que a tela de criação mostra) e `/api/hooks/<slug>` é um
 * apelido mantido por compatibilidade.
 */
const PREFIXOS_PUBLICOS = [
  "/api/auth",
  "/api/health",
  "/api/webhooks",
  "/api/hooks",
  // Rota legada do receptor de WhatsApp (resolve o primeiro webhook habilitado).
  "/api/integrations/whatsapp/inbound",
];

/** `true` quando `pathname` é exatamente o prefixo ou um filho dele. */
function casaPrefixo(pathname: string, prefixo: string): boolean {
  return pathname === prefixo || pathname.startsWith(`${prefixo}/`);
}

export function isPublicPath(pathname: string): boolean {
  if (PAGINAS_PUBLICAS.has(pathname)) return true;

  for (const prefixo of PREFIXOS_PUBLICOS) {
    if (!casaPrefixo(pathname, prefixo)) continue;
    // `/api/webhooks` e `/api/hooks` sem slug não são endpoints de recebimento:
    // não há nada para autenticar, então não precisam ser públicos.
    if (
      (prefixo === "/api/webhooks" || prefixo === "/api/hooks") &&
      pathname === prefixo
    ) {
      return false;
    }
    return true;
  }
  return false;
}
