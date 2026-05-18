-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReportDomain" ADD VALUE 'cadastros';
ALTER TYPE "ReportDomain" ADD VALUE 'contabil';
ALTER TYPE "ReportDomain" ADD VALUE 'rh';
ALTER TYPE "ReportDomain" ADD VALUE 'crm';
ALTER TYPE "ReportDomain" ADD VALUE 'producao';
