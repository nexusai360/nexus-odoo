// mcp/index.ts
// Entrypoint do servidor MCP semântico do nexus-odoo.
// Inicialização: lê env, monta o servidor HTTP e começa a escutar.
import { createHttpServer } from "./server.js";

const PORT = process.env.MCP_PORT ? Number(process.env.MCP_PORT) : 3100;

const server = createHttpServer();

server.listen(PORT, () => {
  console.log(`[mcp] Servidor MCP semântico escutando em http://localhost:${PORT}`);
  console.log(`[mcp] MCP_DATABASE_URL: ${process.env.MCP_DATABASE_URL ? "configurado" : "usando DATABASE_URL (dev)"}`);
});

server.on("error", (err) => {
  console.error("[mcp] Erro fatal no servidor HTTP:", err);
  process.exit(1);
});
