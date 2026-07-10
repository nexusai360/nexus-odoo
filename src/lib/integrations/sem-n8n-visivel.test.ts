/**
 * TH.2 , Nenhuma string visível ao usuário contém "n8n" (SPEC critério 10).
 *
 * Decisão do usuário: nenhum texto de PRODUTO cita n8n. O teste varre os
 * fontes da superfície de UI (componentes e páginas) e as mensagens de
 * bloqueio, ignorando:
 *  - comentários de código (cabeçalhos técnicos podem citar a ferramenta);
 *  - o token `n8n_webhook`, valor de enum do banco que nunca é renderizado
 *    como texto ao usuário.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const RAIZES_DE_UI = ["src/components", "src/app"];

function listarArquivos(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    const st = statSync(caminho);
    if (st.isDirectory()) out.push(...listarArquivos(caminho));
    else if (/\.(tsx|ts)$/.test(nome) && !/\.test\.tsx?$/.test(nome)) out.push(caminho);
  }
  return out;
}

/** Remove comentários de linha e de bloco (onde citar a ferramenta é aceitável). */
function semComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/([^:"'])\/\/[^\n"']*$/gm, "$1");
}

describe("nenhum 'n8n' visível ao usuário", () => {
  const arquivos = RAIZES_DE_UI.flatMap((raiz) => listarArquivos(join(process.cwd(), raiz)));

  it("a superfície de UI não contém 'n8n' fora de comentários e do enum n8n_webhook", () => {
    expect(arquivos.length).toBeGreaterThan(50); // sanidade: a varredura achou a UI

    const ofensas: string[] = [];
    for (const arq of arquivos) {
      const codigo = semComentarios(readFileSync(arq, "utf8"))
        // O valor de enum (response_mode) é código, não texto de produto.
        .replaceAll("n8n_webhook", "");
      if (/n8n/i.test(codigo)) {
        const linha = codigo.split("\n").findIndex((l) => /n8n/i.test(l)) + 1;
        ofensas.push(`${arq.replace(process.cwd() + "/", "")}:${linha}`);
      }
    }

    expect(ofensas).toEqual([]);
  });

  it("as mensagens de bloqueio (entregues ao usuário final) não citam n8n", async () => {
    const { blockedMessageFor } = await import("@/lib/whatsapp/blocked-messages");
    const reasons = [
      "user_not_found",
      "user_inactive",
      "channel_disabled",
      "role_not_allowed",
      "daily_limit_exceeded",
      "permission_denied",
      "technical_error",
    ] as const;
    for (const r of reasons) {
      expect(blockedMessageFor(r).toLowerCase()).not.toContain("n8n");
    }
  });
});
