import { tipoErroRpc } from "./error-kind";
import type { TipoErroRpc } from "./types";

/** Interface mínima do client que searchCount precisa (facilita teste com fake). */
export interface ContadorRpc {
  executeKw<T>(model: string, method: string, args: unknown[], kwargs?: object): Promise<T>;
}

export type CountResult =
  | { ok: true; count: number }
  | { ok: false; tipo: TipoErroRpc; mensagem: string };

/** Conta registros de um modelo via search_count, classificando o erro por tipo. */
export async function searchCount(
  client: ContadorRpc,
  model: string,
): Promise<CountResult> {
  try {
    const count = await client.executeKw<number>(model, "search_count", [[]]);
    return { ok: true, count };
  } catch (e) {
    return {
      ok: false,
      tipo: tipoErroRpc(e),
      mensagem: e instanceof Error ? e.message : String(e),
    };
  }
}
