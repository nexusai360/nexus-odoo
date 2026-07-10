#!/usr/bin/env tsx
/**
 * TH.1 , E2E do ISOLAMENTO entre Conexões de WhatsApp, contra o dev REAL.
 *
 * Cria DUAS conexões (A e B) no banco de dev, cada uma com um destino próprio
 * servido por um servidor HTTP local de captura, e prova nos três cenários que
 * A recebe e B NÃO recebe:
 *
 *   1. Bloqueio (A1b): número desconhecido para a conexão A → o `blocked`
 *      (user_not_found) chega SÓ no destino de A.
 *   2. Resposta final (A1): mensagem de usuário cadastrado para a conexão A →
 *      o `final` (processado pelo worker + agente reais) chega SÓ no destino
 *      de A, no envelope aninhado da SPEC §3.10, sem tabela markdown no reply.
 *   3. Rota fixa legada → 410 Gone.
 *
 * Pré-requisitos:
 *   - app da BRANCH rodando (`npx next dev -p 3005` na worktree) , APP_URL;
 *   - worker rodando com a imagem da branch (docker compose, Onda I);
 *   - um usuário com número de WhatsApp cadastrado (cenário 2).
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/e2e-isolamento-conexao.ts
 *
 * O script LIMPA as conexões E2E que cria (e as mensagens processadas do teste).
 */

import { createServer, type Server } from "http";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";

const APP_URL = process.env.E2E_APP_URL ?? "http://localhost:3005";
const PORTA_A = 4801;
const PORTA_B = 4802;
const TOKEN_A = "e2e-token-recebimento-a-0123456789abcdef";
const TOKEN_B = "e2e-token-recebimento-b-0123456789abcdef";
const SLUG_A = "e2e-conexao-a";
const SLUG_B = "e2e-conexao-b";
const NUMERO_A = "5599911110001";
const NUMERO_B = "5599911110002";
const DESCONHECIDO = "5599000000000";

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`✅ ${label}`);
    passed++;
  } else {
    console.error(`❌ ${label}${detail ? ` , ${detail}` : ""}`);
    failed++;
  }
}

interface Captura {
  server: Server;
  hits: Array<{ body: Record<string, unknown>; headers: Record<string, string | string[] | undefined> }>;
}

function subirCaptura(porta: number): Promise<Captura> {
  const captura: Captura = { server: null as unknown as Server, hits: [] };
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        try {
          captura.hits.push({ body: JSON.parse(raw), headers: req.headers });
        } catch {
          captura.hits.push({ body: { raw }, headers: req.headers });
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
      });
    });
    captura.server = server;
    server.listen(porta, () => resolve(captura));
  });
}

async function criarConexaoE2E(
  nome: string,
  slug: string,
  numero: string,
  token: string,
  destino: string,
): Promise<string> {
  const connectionId = randomUUID();
  await prisma.whatsappWebhook.create({
    data: {
      direction: "inbound",
      name: nome,
      path: slug,
      methods: ["POST"],
      events: [],
      isWhatsappReceiver: true,
      businessId: numero,
      connectionId,
      responseMode: "n8n_webhook",
      secret: encrypt(token),
      enabled: true,
    },
  });
  await prisma.whatsappWebhook.create({
    data: {
      direction: "outbound",
      name: nome,
      targetUrl: destino,
      url: destino,
      methods: ["POST"],
      events: ["agent_reply"],
      isWhatsappReceiver: false,
      businessId: null,
      connectionId,
      responseMode: null,
      secret: encrypt(`assinatura-${token}`),
      enabled: true,
    },
  });
  return connectionId;
}

async function postInbound(
  slug: string,
  token: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${APP_URL}/api/webhooks/${slug}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const parsed = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body: parsed };
}

function esperar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function aguardarHit(captura: Captura, timeoutMs: number): Promise<boolean> {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    if (captura.hits.length > 0) return true;
    await esperar(1000);
  }
  return false;
}

async function limpar(idsMensagens: string[]) {
  await prisma.whatsappWebhook.deleteMany({
    where: { path: { in: [SLUG_A, SLUG_B] } },
  });
  await prisma.whatsappWebhook.deleteMany({
    where: { name: { in: ["E2E Conexão A", "E2E Conexão B"] } },
  });
  if (idsMensagens.length > 0) {
    await prisma.processedWhatsappMessage
      .deleteMany({ where: { messageId: { in: idsMensagens } } })
      .catch(() => {});
  }
}

async function main() {
  console.log("\n=== TH.1 , E2E do isolamento entre Conexões ===");
  console.log(`APP_URL: ${APP_URL}`);

  const saude = await fetch(`${APP_URL}/api/health`).catch(() => null);
  if (!saude || !saude.ok) {
    console.error(`❌ App não acessível em ${APP_URL}. Suba com: npx next dev -p 3005`);
    process.exit(1);
  }

  const mensagensDoTeste: string[] = [];
  await limpar([]); // restos de execuções anteriores

  const capturaA = await subirCaptura(PORTA_A);
  const capturaB = await subirCaptura(PORTA_B);

  try {
    await criarConexaoE2E("E2E Conexão A", SLUG_A, NUMERO_A, TOKEN_A, `http://localhost:${PORTA_A}/hook`);
    await criarConexaoE2E("E2E Conexão B", SLUG_B, NUMERO_B, TOKEN_B, `http://localhost:${PORTA_B}/hook`);
    console.log("Conexões E2E criadas (A e B), cada uma com destino próprio.\n");

    // ── Cenário 1: bloqueio (A1b) ────────────────────────────────────────────
    console.log("--- Cenário 1: user_not_found na conexão A → SÓ o destino de A ---");
    const msg1 = `wamid.e2e-iso-blocked-${Date.now()}`;
    mensagensDoTeste.push(msg1);
    const r1 = await postInbound(SLUG_A, TOKEN_A, {
      wa_id: DESCONHECIDO,
      user_id: DESCONHECIDO,
      type: "text",
      text: "teste de isolamento (bloqueio)",
      message_id: msg1,
      timestamp: Date.now(),
    });
    check("POST na conexão A retorna 200 rejected", r1.status === 200 && r1.body.rejected === true, JSON.stringify(r1));

    const chegouA = await aguardarHit(capturaA, 10_000);
    check("Destino de A recebeu o blocked", chegouA, "timeout de 10s");
    if (chegouA) {
      const hit = capturaA.hits[0].body as {
        kind?: string;
        connection?: { name?: string };
        message?: { inboundMessageId?: string };
        result?: { reason?: string; reply?: string };
        diagnostics?: { model?: string | null };
      };
      check("kind é blocked", hit.kind === "blocked");
      check("result.reason é user_not_found", hit.result?.reason === "user_not_found");
      check("envelope identifica a conexão A", hit.connection?.name === "E2E Conexão A");
      check("dedup: message.inboundMessageId presente", hit.message?.inboundMessageId === msg1);
      check("model é null em blocked", hit.diagnostics?.model === null);
      check(
        "headers assinados (X-Signature/X-Timestamp)",
        typeof capturaA.hits[0].headers["x-signature"] === "string" &&
          typeof capturaA.hits[0].headers["x-timestamp"] === "string",
      );
    }
    check("Destino de B NÃO recebeu NADA (o vazamento morreu)", capturaB.hits.length === 0, `hits=${capturaB.hits.length}`);

    // ── Cenário 2: resposta final via worker + agente reais (A1) ───────────
    console.log("\n--- Cenário 2: usuário cadastrado na conexão A → final SÓ no destino de A ---");
    const usuario = await prisma.userWhatsappNumber.findFirst({ select: { phoneE164: true } });
    if (!usuario) {
      console.log("⚠️  Nenhum usuário com WhatsApp cadastrado; cenário 2 pulado.");
    } else {
      // O bloqueio dispara do APP (host → localhost funciona); a resposta final
      // dispara do WORKER (container → precisa de host.docker.internal). Os
      // targets são resolvidos no enqueue lendo o banco, então trocamos o
      // destino antes de enfileirar.
      await prisma.whatsappWebhook.updateMany({
        where: { name: { in: ["E2E Conexão A", "E2E Conexão B"] }, direction: "outbound" },
        data: {},
      });
      await prisma.whatsappWebhook.updateMany({
        where: { name: "E2E Conexão A", direction: "outbound" },
        data: {
          targetUrl: `http://host.docker.internal:${PORTA_A}/hook`,
          url: `http://host.docker.internal:${PORTA_A}/hook`,
        },
      });
      await prisma.whatsappWebhook.updateMany({
        where: { name: "E2E Conexão B", direction: "outbound" },
        data: {
          targetUrl: `http://host.docker.internal:${PORTA_B}/hook`,
          url: `http://host.docker.internal:${PORTA_B}/hook`,
        },
      });
      capturaA.hits.length = 0;
      capturaB.hits.length = 0;
      const msg2 = `wamid.e2e-iso-final-${Date.now()}`;
      mensagensDoTeste.push(msg2);
      const r2 = await postInbound(SLUG_A, TOKEN_A, {
        wa_id: usuario.phoneE164.replace("+", ""),
        user_id: usuario.phoneE164.replace("+", ""),
        type: "text",
        text: "Liste o saldo de estoque por produto em uma tabela (5 itens).",
        message_id: msg2,
        timestamp: Date.now(),
      });
      check("POST retorna 202 queued", r2.status === 202 && r2.body.queued === true, JSON.stringify(r2));

      if (r2.status === 202) {
        console.log("Aguardando o worker processar (agente real, até 120s)…");
        const chegouFinal = await aguardarHit(capturaA, 120_000);
        check("Destino de A recebeu a resposta final", chegouFinal, "timeout de 120s");
        if (chegouFinal) {
          const hit = capturaA.hits[0].body as {
            kind?: string;
            connection?: { name?: string; businessId?: string };
            message?: { inboundMessageId?: string };
            result?: { ok?: boolean; reply?: string };
            diagnostics?: { model?: string | null };
          };
          check("kind é final", hit.kind === "final");
          check("result.ok é true", hit.result?.ok === true);
          check("envelope identifica a conexão A", hit.connection?.name === "E2E Conexão A");
          check("connection.businessId é o número de A", hit.connection?.businessId === NUMERO_A);
          check(
            "diagnostics.model preenchido no final",
            typeof hit.diagnostics?.model === "string" && hit.diagnostics.model.length > 0,
          );
          const reply = hit.result?.reply ?? "";
          check(
            "TE.3: reply sem tabela markdown (formatação compacta aplicada)",
            !/\n\s*\|.*\|/.test(reply),
            reply.slice(0, 200),
          );
          console.log(`\n   reply (primeiros 300 chars):\n   ${reply.slice(0, 300).replace(/\n/g, "\n   ")}\n`);
        }
        check("Destino de B NÃO recebeu NADA", capturaB.hits.length === 0, `hits=${capturaB.hits.length}`);
      }
    }

    // ── Cenário 3: rota legada 410 ───────────────────────────────────────────
    console.log("\n--- Cenário 3: rota fixa legada responde 410 Gone ---");
    const r3 = await fetch(`${APP_URL}/api/integrations/whatsapp/inbound`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      redirect: "manual",
    });
    check("Rota legada → 410 (não 302, não 404)", r3.status === 410, `status=${r3.status}`);
  } finally {
    await limpar(mensagensDoTeste);
    capturaA.server.close();
    capturaB.server.close();
    await prisma.$disconnect();
  }

  console.log(`\n=== Resultado: ${passed} ✅  |  ${failed} ❌ ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error("\n[e2e-isolamento-conexao] Erro inesperado:", err);
  await prisma.$disconnect();
  process.exit(1);
});
