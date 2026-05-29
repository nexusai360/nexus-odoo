// scripts/seed-rbac-v2-test.ts
// RBAC v2 (Onda G): semeia 4 usuarios de teste para o E2E da SPEC §11.3.
// Idempotente (upsert por email). Rodar 2x nao duplica.
// Uso: tsx --env-file=.env.local scripts/seed-rbac-v2-test.ts
//
// Senha de todos: "Teste@2026!" (mustChangePassword=true, isActive=true).
// IMPORTANTE: dado de TESTE local; nunca rodar contra producao.

import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import type { PlatformRole, ReportDomain } from "../src/generated/prisma/client";

const SENHA = "Teste@2026!";

interface SeedUser {
  email: string;
  name: string;
  platformRole: PlatformRole;
  domains: ReportDomain[];
}

const USERS: SeedUser[] = [
  { email: "super_admin@matrix.local", name: "Super Admin (teste)", platformRole: "super_admin", domains: [] },
  { email: "admin@matrix.local", name: "Admin (teste)", platformRole: "admin", domains: [] },
  { email: "manager-est@matrix.local", name: "Manager Estoque (teste)", platformRole: "manager", domains: ["estoque"] },
  { email: "viewer-nada@matrix.local", name: "Viewer Sem Acesso (teste)", platformRole: "viewer", domains: [] },
];

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(SENHA, 10);

  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        platformRole: u.platformRole,
        isActive: true,
        mustChangePassword: true,
      },
      create: {
        email: u.email,
        name: u.name,
        password: passwordHash,
        platformRole: u.platformRole,
        isActive: true,
        mustChangePassword: true,
      },
      select: { id: true, email: true },
    });

    for (const domain of u.domains) {
      await prisma.userDomainAccess.upsert({
        where: { userId_domain: { userId: user.id, domain } },
        update: {},
        create: { userId: user.id, domain },
      });
    }

    const dom = u.domains.length > 0 ? u.domains.join(", ") : "(papel ve tudo / sem dominio)";
    console.info(`[seed-rbac-v2] ${u.platformRole.padEnd(12)} ${user.email} -> ${dom}`);
  }

  const total = await prisma.user.count({
    where: { email: { endsWith: "@matrix.local" } },
  });
  console.info(`[seed-rbac-v2] OK. ${total} usuarios @matrix.local no banco. Senha: ${SENHA}`);
}

main()
  .catch((err) => {
    console.error("[seed-rbac-v2] falhou:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
