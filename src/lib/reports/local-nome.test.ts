import { limparNomeLocal } from "./local-nome";

describe("limparNomeLocal", () => {
  it("identifica armazém próprio e extrai rótulo antes de ' » '", () => {
    const r = limparNomeLocal("Jds - Matriz DF » Próprio");
    expect(r.tipo).toBe("proprio");
    expect(r.rotulo).toBe("Jds - Matriz DF");
  });

  it("identifica armazém próprio com empresa composta", () => {
    const r = limparNomeLocal("Jht SP - Matriz DF » Próprio");
    expect(r.tipo).toBe("proprio");
    expect(r.rotulo).toBe("Jht SP - Matriz DF");
  });

  it("identifica demonstração em cliente", () => {
    const r = limparNomeLocal(
      "Jds Comércio - Matriz DF 18.282.961/0001-00 - Cliente XYZ  » Demonstração » Terceiros",
    );
    expect(r.tipo).toBe("demonstracao");
    expect(r.rotulo).toBe("Demonstração (em cliente)");
  });

  it("identifica Virtual exatamente", () => {
    const r = limparNomeLocal("Virtual");
    expect(r.tipo).toBe("virtual");
    expect(r.rotulo).toBe("Virtual");
  });

  it("trata outros casos truncando em 40 chars", () => {
    const raw = "Terceiros";
    const r = limparNomeLocal(raw);
    expect(r.tipo).toBe("outros");
    expect(r.rotulo).toBe("Terceiros");
  });

  it("trunca rótulo 'outros' longo em 40 chars com reticências", () => {
    const raw = "Um nome muito longo que claramente passa de quarenta caracteres aqui";
    const r = limparNomeLocal(raw);
    expect(r.tipo).toBe("outros");
    expect(r.rotulo).toBe("Um nome muito longo que claramente passa" + "…");
    expect(r.rotulo.replace("…", "").length).toBeLessThanOrEqual(40);
  });
});
