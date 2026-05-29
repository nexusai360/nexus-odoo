// R1 router de catalogo: normalize de pergunta antes de embed + cache lookup.
//
// Spec: docs/superpowers/specs/2026-05-28-router-catalogo-design.md §8 regra 2.5.
// Funcoes puras, sem efeito colateral. Compativel com import em qualquer ponto
// do agente Nex.

import { createHash } from "node:crypto";

/** Zero-width characters comuns colados via copy/paste (LSP, browser, etc.). */
const ZERO_WIDTH_CHARS = /[​‌‍﻿]/g;

/** Normaliza a pergunta do usuario antes de ser usada como chave de cache OU
 *  como input para embedding. Operacoes em ordem:
 *  1. trim
 *  2. lowercase (case insensitive)
 *  3. remove zero-width chars
 *  4. troca quebras de linha por espaco
 *  5. collapse multiplos espacos em um
 *
 *  Idempotente: `normalize(normalize(q)) === normalize(q)`. */
export function normalize(q: string): string {
  return q
    .trim()
    .toLowerCase()
    .replace(ZERO_WIDTH_CHARS, "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Chave de cache LRU para a pergunta. Pequena (16 hex chars) e estavel.
 *  Sensivel a normalize (chamadores devem passar `normalize(q)`, nao `q` cru). */
export function hashKey(normalizedQuestion: string): string {
  return createHash("sha1")
    .update(normalizedQuestion)
    .digest("hex")
    .slice(0, 16);
}
