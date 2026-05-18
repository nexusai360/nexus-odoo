// src/lib/reports/queries/estoque.ts
//
// Núcleo de agregação de estoque, framework-neutro. Cada função recebe `prisma`
// + filtros e devolve dado de agregação cru — **sem `estado`, sem `freshness`,
// sem shaping de gráfico**. **Não captura exceção** (deixa propagar — quem
// trata é o wrapper). `estadoDoFato`/`reportFreshness` vivem no wrapper
// `report-data.ts`, não aqui.
//
// O módulo **importa** `limparNomeLocal` de `@/lib/reports/local-nome` e a usa
// nas agregações que precisam de rótulo de local — `limparNomeLocal` permanece
// em seu módulo atual, não é movida. O que **não vai** para o núcleo:
// `agruparTopN` (report-data.ts, função local) e as constantes `TOP_N`/
// `TOP_CONCENTRACAO` — são shaping de gráfico e permanecem no wrapper.

import type { PrismaClient } from "@/generated/prisma/client";
import { limparNomeLocal } from "@/lib/reports/local-nome";
