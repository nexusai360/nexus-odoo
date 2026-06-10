// E2E manual: exerce o caminho STREAMING da Responses API contra a OpenAI real
// e confere que o `usage` (tokens/custo, base do menu de Consumo) vem preenchido.
// Roda: npx tsx --env-file=.env.local scripts/e2e-openai-stream.ts
import { OpenAIClient } from "../src/lib/agent/llm/providers/openai";

async function main() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY ausente");
  const client = new OpenAIClient(key, "gpt-5.4-mini");

  const t0 = Date.now();
  const r = await client.chat({
    messages: [
      { role: "system", content: "Responda em uma frase curta, em portugues." },
      { role: "user", content: "Diga 'ok streaming' e nada mais." },
    ],
    reasoningEffort: "low",
  });
  const ms = Date.now() - t0;

  console.log("mensagem:", JSON.stringify(r.message));
  console.log("streamed:", r.streamed);
  console.log("usage:", JSON.stringify(r.usage));
  console.log("reasoningTokens:", r.reasoningTokens);
  console.log("tempo:", ms + "ms");

  const ok =
    r.message.trim().length > 0 &&
    r.streamed === true &&
    r.usage.tokensInput > 0 &&
    r.usage.tokensOutput > 0 &&
    Number.isFinite(r.usage.costUsd);
  console.log(ok ? "\nPASS , streaming + usage OK" : "\nFAIL , algo nao veio");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
