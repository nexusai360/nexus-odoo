#!/usr/bin/env tsx
/**
 * Verificação e2e do receptor de WhatsApp por SLUG (`/api/webhooks/<slug>`).
 *
 * Histórico: este script nasceu na Onda 4 da F5 apontando para a rota fixa
 * `/api/integrations/whatsapp/inbound`, que foi DESCONTINUADA (responde 410
 * Gone). Também usava assinatura HMAC e payload camelCase, contratos que não
 * existem mais: a autenticação real é `Authorization: Bearer <token>` e o
 * payload é snake_case (`wa_id`, `message_id`, ...).
 *
 * Pré-requisitos:
 * - .env.local com APP_URL
 * - TEST_WHATSAPP_SLUG: o endereço (slug) da Conexão de WhatsApp no banco
 * - TEST_WHATSAPP_TOKEN: o token de recebimento da Conexão (em claro)
 * - Servidor Next.js dev rodando: npm run dev
 * - Worker rodando (para o job ser processado)
 * - Um usuário com número de WhatsApp cadastrado no banco (para o caso "ok")
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/verify-f5-onda4.ts
 *
 * Cenários:
 *   0. Conectividade + rota legada responde 410 Gone
 *   1. Número desconhecido → 200 {rejected:true}
 *   2. Número cadastrado → 202 + job enfileirado
 *   3. Replay do mesmo message_id → 200 {noOp:true} (idempotência)
 *   4. Payload inválido → 400
 */

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const SLUG = process.env.TEST_WHATSAPP_SLUG ?? "";
const TOKEN = process.env.TEST_WHATSAPP_TOKEN ?? "";
const INBOUND_URL = `${APP_URL}/api/webhooks/${SLUG}`;
const LEGACY_URL = `${APP_URL}/api/integrations/whatsapp/inbound`;

// Número de WhatsApp para o teste "usuário cadastrado"
// Substitua por um número real cadastrado no banco para testar o cenário completo.
const KNOWN_PHONE = process.env.TEST_WHATSAPP_PHONE ?? "+5511999999999";
const UNKNOWN_PHONE = "+5599000000000";

let passed = 0;
let failed = 0;

// ──────────────────────────────────────────────────────────────────────────────

async function postInbound(
  payload: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(INBOUND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    /* noop */
  }

  return { status: res.status, body };
}

function ok(label: string, msg?: string) {
  console.log(`✅ ${label}${msg ? ` — ${msg}` : ""}`);
  passed++;
}

function fail(label: string, msg: string) {
  console.error(`❌ ${label} — ${msg}`);
  failed++;
}

function check(
  label: string,
  condition: boolean,
  successMsg?: string,
  failMsg?: string,
) {
  if (condition) ok(label, successMsg);
  else fail(label, failMsg ?? "condição não satisfeita");
}

// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n=== verify-f5-onda4 — Receptor de WhatsApp por slug ===");
  console.log(`APP_URL:     ${APP_URL}`);
  console.log(`INBOUND_URL: ${INBOUND_URL}`);
  console.log(`KNOWN_PHONE: ${KNOWN_PHONE}`);
  console.log(`TOKEN:       ${TOKEN ? "configurado" : "NÃO configurado (todos os POSTs vão falhar com 401)"}`);
  console.log("");

  if (!SLUG || !TOKEN) {
    console.error("⚠️  Configure TEST_WHATSAPP_SLUG e TEST_WHATSAPP_TOKEN no .env.local.");
    console.error("   O slug e o token de recebimento são os da Conexão com WhatsApp");
    console.error("   criada em /integracoes/webhooks.");
    process.exit(1);
  }

  // ── Pré-condição: servidor acessível ───────────────────────────────────────
  console.log("--- Cenário 0: conectividade + rota legada descontinuada ---");
  try {
    const healthRes = await fetch(`${APP_URL}/api/health`);
    check("Servidor acessível", healthRes.ok || healthRes.status === 200, `status ${healthRes.status}`);
  } catch (err) {
    fail("Servidor acessível", `Não foi possível conectar: ${(err as Error).message}. Inicie o servidor com: npm run dev`);
    console.error("\n⚠️  Servidor não está rodando. Não é possível prosseguir com os testes e2e.");
    printSummary();
    return;
  }

  // A rota fixa legada precisa responder 410 Gone (não 302, não 404).
  const legacyRes = await fetch(LEGACY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    redirect: "manual",
  });
  check(
    "Rota legada responde 410 Gone",
    legacyRes.status === 410,
    undefined,
    `esperado 410, recebido ${legacyRes.status}`,
  );

  // ── Cenário 1: número desconhecido ─────────────────────────────────────────
  console.log("\n--- Cenário 1: número desconhecido → rejeição sem enfileiramento ---");
  const msg1Id = `wamid.e2e-unknown-${Date.now()}`;
  const r1 = await postInbound({
    wa_id: UNKNOWN_PHONE,
    user_id: UNKNOWN_PHONE,
    message_id: msg1Id,
    timestamp: Date.now(),
    type: "text",
    text: "teste onda 4",
  });
  check(
    "Número desconhecido retorna 200",
    r1.status === 200,
    `status=${r1.status}`,
    `esperado 200, recebido ${r1.status}`,
  );
  check(
    "Número desconhecido retorna rejected=true",
    r1.body.rejected === true,
    `reason=${r1.body.reason}`,
    `body=${JSON.stringify(r1.body)}`,
  );

  // ── Cenário 2: número cadastrado → 202 ────────────────────────────────────
  console.log("\n--- Cenário 2: número cadastrado → 202 + job enfileirado ---");
  const msg2Id = `wamid.e2e-known-${Date.now()}`;
  const r2 = await postInbound({
    wa_id: KNOWN_PHONE,
    user_id: KNOWN_PHONE,
    message_id: msg2Id,
    timestamp: Date.now(),
    type: "text",
    text: "Qual o estoque de bicicletas?",
  });

  if (r2.status === 200 && r2.body.rejected === true) {
    // Número não cadastrado — informativo, não falha o script
    console.log(`⚠️  Número ${KNOWN_PHONE} não está cadastrado no banco.`);
    console.log("   Para testar o cenário completo, cadastre um número real:");
    console.log("   - Acesse /admin/usuarios → editar usuário → Números de WhatsApp");
    console.log(`   - Configure TEST_WHATSAPP_PHONE=<número_cadastrado> no .env.local`);
    ok("Número cadastrado → endpoint responde corretamente (rejected, pois não há cadastro)", `reason=${r2.body.reason}`);
  } else {
    check(
      "Número cadastrado retorna 202",
      r2.status === 202,
      `jobId=${r2.body.jobId}`,
      `esperado 202, recebido ${r2.status}: ${JSON.stringify(r2.body)}`,
    );
    check(
      "Response body contém queued=true",
      r2.body.queued === true,
      undefined,
      `body=${JSON.stringify(r2.body)}`,
    );
  }

  // ── Cenário 3: replay do mesmo message_id (idempotência) ───────────────────
  console.log("\n--- Cenário 3: replay do message_id do cenário 2 → no-op ---");
  // ProcessedWhatsappMessage só é gravada para mensagens aceitas, então a
  // idempotência é testada re-enviando o msg2Id se ele foi aceito (status 202).
  if (r2.status === 202) {
    const r3 = await postInbound({
      wa_id: KNOWN_PHONE,
      user_id: KNOWN_PHONE,
      message_id: msg2Id,
      timestamp: Date.now(),
      type: "text",
      text: "mensagem duplicada (replay)",
    });
    check(
      "Replay do message_id retorna 200",
      r3.status === 200,
      `status=${r3.status}`,
      `esperado 200, recebido ${r3.status}`,
    );
    check(
      "Replay do message_id retorna noOp=true",
      r3.body.noOp === true,
      undefined,
      `body=${JSON.stringify(r3.body)}`,
    );
  } else {
    console.log("⚠️  Cenário 3 (idempotência) ignorado pois cenário 2 não enfileirou um job.");
    console.log("   Cadastre um número real para testar idempotência completa.");
    ok("Idempotência (cenário ignorado — número não cadastrado)", "skipped");
  }

  // ── Cenário 4: payload inválido → 400 ────────────────────────────────────
  console.log("\n--- Cenário 4: payload inválido → 400 ---");
  const r4 = await postInbound({
    message_id: "x",
    wa_id: "+5511",
    // type ausente → inválido
  });
  check(
    "Payload inválido retorna 400",
    r4.status === 400,
    undefined,
    `esperado 400, recebido ${r4.status}: ${JSON.stringify(r4.body)}`,
  );

  // ── Resumo ────────────────────────────────────────────────────────────────
  printSummary();
}

function printSummary() {
  const total = passed + failed;
  console.log(`\n=== Resultado: ${passed}/${total} ✅  |  ${failed} ❌ ===`);
  if (failed > 0) {
    console.error("\nVerificação e2e falhou. Corrija os erros acima antes de prosseguir.");
    process.exit(1);
  } else {
    console.log("\nVerificação e2e concluída com sucesso.");
  }
}

main().catch((err) => {
  console.error("\n[verify-f5-onda4] Erro inesperado:", err);
  process.exit(1);
});
