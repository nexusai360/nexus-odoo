import { TOOL_TO_QUESTION, TOOL_DOMAIN } from "./templates";

describe("TOOL_DOMAIN", () => {
  test("toda tool com pergunta tem dominio mapeado", () => {
    for (const toolId of Object.keys(TOOL_TO_QUESTION)) {
      expect(TOOL_DOMAIN[toolId]).toBeDefined();
    }
  });

  test("nao mapeia tool inexistente em TOOL_TO_QUESTION", () => {
    for (const toolId of Object.keys(TOOL_DOMAIN)) {
      expect(TOOL_TO_QUESTION[toolId]).toBeDefined();
    }
  });
});
