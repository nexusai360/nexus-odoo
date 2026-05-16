// Mock de `server-only` para o ambiente de teste do Jest.
// O pacote real lança erro se importado fora de um Server Component;
// nos testes (ambiente node/jsdom) ele é substituído por este no-op.
export {};
