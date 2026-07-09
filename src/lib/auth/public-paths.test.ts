import { isPublicPath } from "./public-paths";

// Um webhook de entrada e chamado por um sistema externo, server-to-server, sem
// cookie de sessao. Se o middleware exigir sessao, a chamada e redirecionada
// para /login e a mensagem NUNCA chega , foi o que aconteceu com /api/hooks.
describe("isPublicPath , rotas que dispensam sessao", () => {
  it("libera o receptor de webhook por slug (canonico e apelido)", () => {
    expect(isPublicPath("/api/webhooks/matrixgroup")).toBe(true);
    expect(isPublicPath("/api/webhooks/whatsapp/loja-matriz")).toBe(true);
    expect(isPublicPath("/api/hooks/matrixgroup")).toBe(true);
    expect(isPublicPath("/api/hooks/whatsapp/loja-matriz")).toBe(true);
  });

  it("libera a rota legada do WhatsApp (410 Gone precisa ser visível, não redirect) e as de auth/health", () => {
    expect(isPublicPath("/api/integrations/whatsapp/inbound")).toBe(true);
    expect(isPublicPath("/api/auth/session")).toBe(true);
    expect(isPublicPath("/api/health")).toBe(true);
  });

  it("libera as telas publicas de autenticacao", () => {
    for (const p of ["/login", "/forgot-password", "/reset-password", "/verify-email"]) {
      expect(isPublicPath(p)).toBe(true);
    }
  });

  it("NAO libera o resto da plataforma", () => {
    for (const p of [
      "/dashboard",
      "/integracoes",
      "/integracoes/webhooks",
      "/api/agent/stream",
      "/api/mcp",
    ]) {
      expect(isPublicPath(p)).toBe(false);
    }
  });

  it("nao confunde prefixo parecido com o do webhook", () => {
    // a tela de gestao dos webhooks continua exigindo sessao
    expect(isPublicPath("/integracoes/webhooks/novo")).toBe(false);
    // sem slug nao e endpoint de recebimento
    expect(isPublicPath("/api/webhooks")).toBe(false);
    expect(isPublicPath("/api/hooks")).toBe(false);
    // rota que apenas COMECA parecido nao vaza
    expect(isPublicPath("/api/webhooksecreto")).toBe(false);
    expect(isPublicPath("/api/hooksecreto")).toBe(false);
    // o middleware antigo usava startsWith("/api/health"), o que liberaria isto:
    expect(isPublicPath("/api/healthz-interno")).toBe(false);
    expect(isPublicPath("/api/health/detalhes")).toBe(true);
  });
});
