-- CreateTable
-- `updated_at` fica SEM DEFAULT: o schema declara @updatedAt, e o Prisma escreve
-- o valor em toda gravacao. Um DEFAULT aqui gera drift contra o schema.prisma.
CREATE TABLE IF NOT EXISTS "menu_access" (
    "menu_key" TEXT NOT NULL,
    "access_level" "ChannelAccessLevel" NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_access_pkey" PRIMARY KEY ("menu_key")
);

-- Reconcilia bancos onde a tabela ja tinha sido criada a mao, com o DEFAULT.
ALTER TABLE "menu_access" ALTER COLUMN "updated_at" DROP DEFAULT;
