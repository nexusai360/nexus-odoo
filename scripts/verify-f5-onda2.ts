#!/usr/bin/env tsx
/**
 * Verificação e2e da Onda 2 da F5 — cadastro de WhatsApp no usuário.
 *
 * Pré-requisitos:
 * - .env.local com DATABASE_URL
 * - Banco com a tabela `user_whatsapp_numbers` (migration da Onda 1 aplicada)
 * - Ao menos 1 usuário cadastrado
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/verify-f5-onda2.ts
 *
 * Evidência obrigatória: `resolveWhatsappUser` retorna `ok` para um número
 * cadastrado, `unknown` para um desconhecido e `inactive` para um número de
 * usuário desativado — exercido contra o banco real.
 *
 * O script é idempotente: cria os dados que precisa, exerce e limpa tudo
 * (incluindo a restauração do `isActive` do usuário usado no teste inactive).
 */

import { normalizeE164, resolveWhatsappUser } from "../src/lib/whatsapp/resolve";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require("../src/lib/prisma") as typeof import("../src/lib/prisma");

const NUM_OK = "+5511980000001";
const NUM_INACTIVE = "+5511980000002";
const NUM_UNKNOWN = "+5511989999999";

let failures = 0;
function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
}

async function main() {
  console.log("\n=== verify-f5-onda2 ===\n");

  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL ausente. Use --env-file=.env.local");
    process.exit(1);
  }

  // 0. Normalização E.164 (função pura)
  console.log("Normalização E.164:");
  check(
    "normaliza nacional → E.164",
    normalizeE164("11 98000-0001") === NUM_OK,
    normalizeE164("11 98000-0001"),
  );
  check(
    "preserva número já em E.164",
    normalizeE164(NUM_OK) === NUM_OK,
  );
  let threw = false;
  try {
    normalizeE164("abc");
  } catch {
    threw = true;
  }
  check("lança para entrada inválida", threw);

  // 1. Localizar dois usuários distintos (um para ok, um para inactive)
  const users = await prisma.user.findMany({
    select: { id: true, name: true, isActive: true },
    orderBy: { createdAt: "asc" },
    take: 2,
  });
  if (users.length < 2) {
    console.error("❌ Necessários ao menos 2 usuários no banco.");
    process.exit(1);
  }
  const userOk = users[0];
  const userInactive = users[1];
  console.log(
    `\nUsuários de teste: ok=${userOk.name} inactive=${userInactive.name}`,
  );

  // Limpeza preventiva de execuções anteriores
  await prisma.userWhatsappNumber.deleteMany({
    where: { phoneE164: { in: [NUM_OK, NUM_INACTIVE, NUM_UNKNOWN] } },
  });
  const inactiveWasActive = userInactive.isActive;

  try {
    // 2. Criar números e desativar o usuário do caso inactive
    await prisma.userWhatsappNumber.create({
      data: { userId: userOk.id, phoneE164: NUM_OK, label: "e2e-ok" },
    });
    await prisma.userWhatsappNumber.create({
      data: {
        userId: userInactive.id,
        phoneE164: NUM_INACTIVE,
        label: "e2e-inactive",
      },
    });
    await prisma.user.update({
      where: { id: userInactive.id },
      data: { isActive: false },
    });

    // 3. Resolver os três estados contra o banco real
    console.log("\nResolução contra o banco real:");
    const rOk = await resolveWhatsappUser("11 98000-0001");
    check(
      "número de usuário ativo → ok",
      rOk.status === "ok" && rOk.status === "ok" && rOk.user.id === userOk.id,
      JSON.stringify(rOk),
    );

    const rInactive = await resolveWhatsappUser(NUM_INACTIVE);
    check(
      "número de usuário inativo → inactive",
      rInactive.status === "inactive",
      JSON.stringify(rInactive),
    );

    const rUnknown = await resolveWhatsappUser(NUM_UNKNOWN);
    check(
      "número não cadastrado → unknown",
      rUnknown.status === "unknown",
      JSON.stringify(rUnknown),
    );

    // 4. Conferir persistência
    const persisted = await prisma.userWhatsappNumber.findMany({
      where: { phoneE164: { in: [NUM_OK, NUM_INACTIVE] } },
    });
    check("2 números persistidos em user_whatsapp_numbers", persisted.length === 2);
  } finally {
    // 5. Limpeza — restaura estado original
    await prisma.userWhatsappNumber.deleteMany({
      where: { phoneE164: { in: [NUM_OK, NUM_INACTIVE, NUM_UNKNOWN] } },
    });
    await prisma.user.update({
      where: { id: userInactive.id },
      data: { isActive: inactiveWasActive },
    });
    await prisma.$disconnect();
  }

  console.log(
    failures === 0
      ? "\n✅ Onda 2 verificada — todos os checks passaram.\n"
      : `\n❌ ${failures} check(s) falharam.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
