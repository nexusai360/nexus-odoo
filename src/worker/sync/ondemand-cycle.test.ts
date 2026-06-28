import {
  escoparCatalogo,
  modelsForArea,
  AREA_SYNC_MODELS,
} from "./ondemand-cycle";
import { JOB_ONDEMAND, ODOO_SYNC_QUEUE_NAME } from "@/worker/jobs";

describe("escoparCatalogo", () => {
  it("filtra o catálogo aos modelos pedidos", () => {
    const c = escoparCatalogo(["pedido.documento"]);
    expect(c.length).toBeGreaterThan(0);
    expect(c.every((e) => e.odooModel === "pedido.documento")).toBe(true);
  });

  it("modelo inexistente retorna catálogo vazio", () => {
    expect(escoparCatalogo(["modelo.que.nao.existe"])).toEqual([]);
  });
});

describe("modelsForArea", () => {
  it("vendas inclui pedido.documento e sped.documento", () => {
    const m = modelsForArea("vendas");
    expect(m).toContain("pedido.documento");
    expect(m).toContain("sped.documento");
  });

  it("agenda não dispara sync (dado nativo, não-Odoo)", () => {
    expect(modelsForArea("agenda")).toEqual([]);
  });

  it("área desconhecida retorna vazio", () => {
    expect(modelsForArea("xpto")).toEqual([]);
  });

  it("todos os modelos mapeados existem no catálogo", () => {
    for (const [area, models] of Object.entries(AREA_SYNC_MODELS)) {
      const escopo = escoparCatalogo(models);
      // cada modelo mapeado deve existir no catálogo (exceto agenda, vazia)
      if (models.length > 0) {
        expect(escopo.length).toBeGreaterThan(0);
      } else {
        expect(area).toBe("agenda");
      }
    }
  });
});

describe("constantes de fila", () => {
  it("JOB_ONDEMAND e a fila têm os valores esperados", () => {
    expect(JOB_ONDEMAND).toBe("ondemand");
    expect(ODOO_SYNC_QUEUE_NAME).toBe("odoo-sync");
  });
});
