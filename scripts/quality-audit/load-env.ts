/**
 * Side-effect: carrega .env.local ANTES de qualquer modulo que leia
 * process.env no import (notadamente src/lib/prisma.ts, que instancia o
 * PrismaClient lendo process.env.DATABASE_URL no momento do import).
 *
 * POR QUE ISTO EXISTE: sob ESM (e o loader do tsx), TODOS os `import` de um
 * arquivo sao icados e executados ANTES do corpo do modulo. Chamar
 * `loadDotenv(".env.local")` no corpo do script roda TARDE DEMAIS: o
 * `import { prisma } from "@/lib/prisma"` ja executou e o PrismaClient ja leu
 * (ou nao leu) a DATABASE_URL. Quando a env nao estava exportada no shell, o
 * Prisma caia no banco default (= usuario do SO, ex.: "joaovitorzanini"), que
 * nao existe, e o script morria com P1003 DatabaseDoesNotExist.
 *
 * A solucao e isolar a carga da env num modulo separado e importa-lo PRIMEIRO.
 * Como ele aparece antes do import do prisma, o side-effect roda antes.
 *
 * Uso (DEVE ser o primeiro import do arquivo):
 *   import "./load-env";
 *   import { prisma } from "@/lib/prisma";
 *
 * Espelha scripts/router/load-env.ts.
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "path";

loadDotenv({ path: resolve(process.cwd(), ".env.local"), override: true });
