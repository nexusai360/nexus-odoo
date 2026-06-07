// E2E do retrieval de tool da F3 contra o mini-oraculo, com embeddings REAIS.
//
// Runner: tsx (NAO jest; usa embed real via DB + OpenAI). Mede recall@K (a
// toolEsperada esta no catalogo enxuto que o retrieval ofereceria?) para varios
// K, e a taxa de falso-fora-de-escopo. Sai != 0 se o melhor recall@K < 0.98.
//
// Rodar:
//   set -a; . ./.env.local; set +a; npx tsx src/lib/agent/router/__tests__/e2e/retrieval.e2e.ts
import { readFileSync } from "node:fs";
import { catalogo } from "../../../../../../mcp/catalog/index";
import { isWriteToolEntry } from "../../../../../../mcp/catalog/types";
import { descriptionForRetrieval } from "../../../../../../mcp/catalog/embedding-text";
import { embedQuestion } from "../../embed-question";
import { getToolVectors } from "../../embed-tools";
import { pickTools } from "../../pick-tools";
import { pickDomains } from "../../pick-domains";

type Item = {
  pergunta: string;
  toolEsperada: string | null;
  dominioEsperado: string | null;
  classeEsperada: "prosseguir" | "fora_de_escopo" | "falta_honesta";
};

const ORACULO: Item[] = JSON.parse(
  readFileSync(new URL("./mini-oraculo.json", import.meta.url), "utf8"),
);

const K_VALUES = [5, 6, 7, 8];
const SETTINGS = { threshold: 0.3, topK: 3 };

async function main() {
  // Catalogo proprio (read-tools) com a description publicada (embeddingText capado).
  const tools = catalogo
    .filter((t) => !isWriteToolEntry(t))
    .map((t) => ({ name: t.id, description: descriptionForRetrieval(t) }));
  const toolVectors = await getToolVectors(tools);

  const prosseguir = ORACULO.filter((i) => i.classeEsperada === "prosseguir");

  // Pre-computa, por pergunta, o vetor + dominios + scores das tools (1x).
  type Pre = { item: Item; vector: number[]; pickedDomains: string[] };
  const pre: Pre[] = [];
  for (const item of prosseguir) {
    const { vector } = await embedQuestion(item.pergunta);
    const dec = await pickDomains(item.pergunta, SETTINGS);
    pre.push({ item, vector, pickedDomains: dec.pickedDomains });
  }

  console.log(`\n=== recall@K (mini-oraculo, ${prosseguir.length} perguntas prosseguir) ===`);
  let melhorRecall = 0;
  let melhorK = 0;
  for (const k of K_VALUES) {
    let hits = 0;
    const misses: string[] = [];
    for (const p of pre) {
      const r = pickTools({
        tools,
        toolVectors,
        questionVector: p.vector,
        pickedDomains: p.pickedDomains,
        k,
      });
      const ok = p.item.toolEsperada !== null && r.picked.includes(p.item.toolEsperada);
      if (ok) hits++;
      else misses.push(`${p.item.toolEsperada} <= "${p.item.pergunta.slice(0, 50)}"`);
    }
    const recall = hits / prosseguir.length;
    console.log(`  K=${k}: recall=${(recall * 100).toFixed(1)}% (${hits}/${prosseguir.length})`);
    if (k === K_VALUES[0]) for (const m of misses) console.log(`     MISS ${m}`);
    if (recall > melhorRecall) {
      melhorRecall = recall;
      melhorK = k;
    }
  }

  console.log(`\n=== melhor: K=${melhorK} recall=${(melhorRecall * 100).toFixed(1)}% ===`);
  if (melhorRecall < 0.98) {
    console.error(`FALHA: recall@K ${(melhorRecall * 100).toFixed(1)}% < 98%`);
    process.exit(1);
  }
  console.log("OK: recall@K >= 98%");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
