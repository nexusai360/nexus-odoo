import { mapCrmPipelineRow } from "./fato-crm-pipeline";
import { mapAuditoriaRegraRow } from "./fato-auditoria-regra";

describe("B7 , builders CRM pipeline + auditoria regra", () => {
  it("crm pipeline mapeia numero/nome/tipo/ativo", () => {
    const r = mapCrmPipelineRow({ id: 1, numero: 3, nome: "Vendas", tipo: "kanban", ativo: true });
    expect(r).toMatchObject({ odooId: 1, numero: 3, nome: "Vendas", tipo: "kanban", ativo: true });
  });

  it("crm pipeline defensivo: ausentes → null/false", () => {
    const r = mapCrmPipelineRow({ id: 2 });
    expect(r).toMatchObject({ odooId: 2, numero: null, nome: null, ativo: false });
  });

  it("auditoria regra mapeia nome/ativa/dias", () => {
    const r = mapAuditoriaRegraRow({ id: 5, nome: "Retenção 90d", ativa: true, dias: 90 });
    expect(r).toMatchObject({ odooId: 5, nome: "Retenção 90d", ativa: true, dias: 90 });
  });

  it("auditoria regra defensivo: ausentes → null/false/0", () => {
    const r = mapAuditoriaRegraRow({ id: 6 });
    expect(r).toMatchObject({ odooId: 6, nome: null, ativa: false, dias: 0 });
  });
});
