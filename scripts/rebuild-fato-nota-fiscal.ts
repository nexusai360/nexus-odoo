// scripts/rebuild-fato-nota-fiscal.ts
// Reconstrói fato_nota_fiscal, fato_nota_fiscal_item e a classificação derivada
// (fato_pedido.categoria_operacao/bucket_demanda e fato_nota_fiscal.is_venda_externa),
// usando os MESMOS builders do worker. Usado no backfill da operação fiscal
// (operacao_id/operacao_nome), o campo que separa venda de venda interna.
// Uso: DATABASE_URL="postgresql://..." npx tsx scripts/rebuild-fato-nota-fiscal.ts
import { prisma } from "../src/worker/prisma";
import { rebuildFatoNotaFiscal } from "../src/worker/fatos/fato-nota-fiscal";
import { rebuildFatoNotaFiscalItem } from "../src/worker/fatos/fato-nota-fiscal-item";
import { rebuildFatoPedidoClassificacao } from "../src/worker/fatos/fato-pedido-classificacao";

async function main(): Promise<void> {
  const inicio = Date.now();
  const notas = await rebuildFatoNotaFiscal(prisma);
  console.log(`[fato_nota_fiscal] ${notas} linhas`);
  const itens = await rebuildFatoNotaFiscalItem(prisma);
  console.log(`[fato_nota_fiscal_item] ${itens} linhas`);
  const pedidos = await rebuildFatoPedidoClassificacao(prisma);
  console.log(`[classificacao] ${pedidos} pedidos + is_venda_externa das notas`);
  console.log(`[rebuild] concluido em ${((Date.now() - inicio) / 1000).toFixed(0)}s`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[rebuild] FALHA:", err);
  process.exit(1);
});
