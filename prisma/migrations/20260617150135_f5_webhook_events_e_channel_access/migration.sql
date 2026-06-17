-- CreateEnum
CREATE TYPE "WebhookEvent" AS ENUM ('agent_reply');

-- CreateEnum
CREATE TYPE "ChannelAccessLevel" AS ENUM ('off', 'viewer', 'manager', 'admin', 'super_admin');

-- AlterTable
ALTER TABLE "whatsapp_webhooks" ADD COLUMN     "events" "WebhookEvent"[] DEFAULT ARRAY[]::"WebhookEvent"[];

-- AlterTable
ALTER TABLE "agent_settings" ADD COLUMN     "bubble_access_level" "ChannelAccessLevel" NOT NULL DEFAULT 'viewer',
ADD COLUMN     "whatsapp_access_level" "ChannelAccessLevel" NOT NULL DEFAULT 'viewer';

-- Backfill (F5): outbound existentes passam a emitir agent.reply.
UPDATE "whatsapp_webhooks"
  SET "events" = ARRAY['agent_reply']::"WebhookEvent"[]
  WHERE "direction" = 'outbound';

-- Backfill (F5): preserva o comportamento atual de disponibilidade.
-- bubble/whatsapp habilitado (true) => viewer (todos veem); desabilitado => off.
-- agent_settings e singleton: se NAO houver linha, este UPDATE afeta 0 linhas
-- (correto, o DEFAULT viewer das colunas novas preserva o comportamento quando
-- a primeira linha for criada). Nao ha INSERT de seed aqui.
UPDATE "agent_settings"
  SET "bubble_access_level"   = CASE WHEN "bubble_enabled"   THEN 'viewer'::"ChannelAccessLevel" ELSE 'off'::"ChannelAccessLevel" END,
      "whatsapp_access_level" = CASE WHEN "whatsapp_enabled" THEN 'viewer'::"ChannelAccessLevel" ELSE 'off'::"ChannelAccessLevel" END;
