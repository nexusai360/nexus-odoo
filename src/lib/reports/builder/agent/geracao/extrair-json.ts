// src/lib/reports/builder/agent/geracao/extrair-json.ts
// Extrai um objeto JSON da resposta do modelo de forma TOLERANTE: o LLM costuma
// embrulhar o JSON em cercas ```json ... ``` ou cercar com prosa ("Aqui esta: {...}").
// JSON.parse cru quebra nesses casos (era a causa de travar na geracao). Aqui a
// gente limpa as cercas e, se preciso, recorta do primeiro "{" ao ultimo "}".
export function extrairJson(raw: unknown): unknown {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw !== "string") throw new Error("resposta_nao_textual");

  let texto = raw.trim();

  // Remove cercas de codigo ```json ... ``` ou ``` ... ```.
  const cerca = texto.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (cerca) texto = cerca[1].trim();

  // Tentativa direta.
  try {
    return JSON.parse(texto);
  } catch {
    // Recorta do primeiro "{" ao ultimo "}" (descarta prosa em volta).
    const ini = texto.indexOf("{");
    const fim = texto.lastIndexOf("}");
    if (ini >= 0 && fim > ini) {
      return JSON.parse(texto.slice(ini, fim + 1));
    }
    throw new Error("json_invalido_na_resposta");
  }
}
