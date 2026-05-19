import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { MODEL_CATALOG } from "../src/worker/catalog/model-catalog";

if (!process.env.DATABASE_URL) {
  throw new Error("[seed] DATABASE_URL não definido no ambiente.");
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const APP_SETTINGS_DEFAULTS: Array<{
  key: string;
  value: unknown;
  category: string;
  description?: string;
}> = [
  {
    key: "audit.retention_days",
    value: 90,
    category: "audit",
    description: "Dias de retenção dos logs de auditoria.",
  },
  {
    key: "reports.max_period_days",
    value: 365,
    category: "reports",
    description: "Período máximo permitido em filtros de relatórios (dias).",
  },
  {
    key: "odoo.sync_interval_seconds",
    value: 300,
    category: "odoo",
    description: "Intervalo entre sincronizações do worker Odoo (segundos).",
  },
  {
    key: "odoo.last_full_sync",
    value: Prisma.JsonNull,
    category: "odoo",
    description: "Timestamp da última sincronização completa do Odoo.",
  },
];

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "Administrador";

  if (!email || !password) {
    throw new Error(
      "[seed] ADMIN_EMAIL e ADMIN_PASSWORD são obrigatórios para criar o owner.",
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const owner = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      isActive: true,
      isOwner: true,
      platformRole: "super_admin",
      mustChangePassword: false,
    },
    create: {
      email,
      password: passwordHash,
      name,
      platformRole: "super_admin",
      isOwner: true,
      isActive: true,
      mustChangePassword: false,
      passwordChangedAt: new Date(),
      emailVerifiedAt: new Date(),
      theme: "dark",
    },
  });

  for (const setting of APP_SETTINGS_DEFAULTS) {
    await prisma.appSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: {
        key: setting.key,
        value: setting.value as never,
        category: setting.category,
        description: setting.description,
      },
    });
  }

  // AgentSettings singleton
  await prisma.agentSettings.upsert({
    where: { id: "global" },
    create: {
      id: "global",
      personality: "",
      tone: "",
      guardrails: [],
      terminology: {},
      audioInputEnabled: false,
      kbEnabled: false,
      suggestionsEnabled: true,
    },
    update: {},
  });
  console.log("[seed] AgentSettings semeado");

  console.log(
    `[seed] owner=${owner.email}, settings=${APP_SETTINGS_DEFAULTS.length}`,
  );

  for (const { odooModel, mode } of MODEL_CATALOG) {
    await prisma.syncState.upsert({
      where: { model: odooModel },
      update: { mode },
      create: { model: odooModel, mode, lastStatus: "rodando" },
    });
  }
  console.log(`SyncState semeado: ${MODEL_CATALOG.length} modelos`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
