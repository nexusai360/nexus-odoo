// Cria/garante o usuário de teste de render (super_admin) usado para validar a
// UI da Diretoria por screenshot. Idempotente (upsert por email).
// Uso: npx tsx scripts/diretoria-render-user.ts [--delete]
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

const EMAIL = "render-check@local.test";
const SENHA = "Teste@12345";

async function main() {
  if (process.argv.includes("--delete")) {
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    console.info(`[render-user] removido ${EMAIL}`);
    return;
  }
  const password = await bcrypt.hash(SENHA, 10);
  const u = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { password, platformRole: "super_admin", name: "Render Check", mustChangePassword: false },
    create: { email: EMAIL, name: "Render Check", password, platformRole: "super_admin", mustChangePassword: false },
    select: { id: true, email: true, platformRole: true },
  });
  console.info(`[render-user] ${u.email} (${u.platformRole}) id=${u.id}`);
}

main().finally(() => prisma.$disconnect());
