// mcp/__tests__/mocks/odoo-client.ts
//
// Factory que retorna um jest.Mocked<OdooClient> cobrindo:
//   - Métodos existentes (authenticate, version, executeKw, searchRead*, searchIds)
//   - Métodos a serem adicionados em Bloco C (create, write, unlink, read,
//     searchRead, fieldsGet, searchIrModelData)
//
// O cast "as unknown as jest.Mocked<OdooClient>" é intencional: os métodos de
// Bloco C ainda não existem na classe — o mock os declara com antecedência para
// que os testes de Blocos D/E/F/H/J compilem antes de Bloco C completar a
// extensão da classe.

import type { OdooClient } from "@/worker/odoo/client";

export function mockOdooClient(): jest.Mocked<OdooClient> {
  return {
    // Métodos existentes
    authenticate: jest.fn(),
    version: jest.fn(),
    executeKw: jest.fn(),
    searchReadPaged: jest.fn(),
    searchReadPage: jest.fn(),
    searchIds: jest.fn(),

    // Métodos a serem adicionados em Bloco C (preparados com antecedência)
    create: jest.fn(),
    write: jest.fn(),
    unlink: jest.fn(),
    read: jest.fn(),
    searchRead: jest.fn(),
    fieldsGet: jest.fn(),
    searchIrModelData: jest.fn(),
  } as unknown as jest.Mocked<OdooClient>;
}
