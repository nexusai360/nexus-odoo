/**
 * Side-effect: carrega .env.local ANTES de qualquer modulo que leia
 * process.env no import.
 *
 * Necessario porque src/lib/prisma.ts inicializa o PrismaClient no momento do
 * import (le process.env.DATABASE_URL). Sob o loader ESM do tsx os imports sao
 * avaliados em ordem de origem, entao um loadDotenv no corpo do script roda
 * tarde demais. Importar este modulo PRIMEIRO garante a ordem correta.
 *
 * Uso:
 *   import "./load-env";
 *   import { algo } from "@/lib/...";
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "path";

loadDotenv({ path: resolve(process.cwd(), ".env.local"), override: true });
