import { randomInt } from "node:crypto";

// Charset sem caracteres ambíguos (0/O, 1/l/I) para senhas temporárias
// que serão lidas e digitadas manualmente pelo usuário.
export const TEMP_PASSWORD_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

export function generateTempPassword(length = 12): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += TEMP_PASSWORD_CHARS[randomInt(TEMP_PASSWORD_CHARS.length)];
  }
  return out;
}
