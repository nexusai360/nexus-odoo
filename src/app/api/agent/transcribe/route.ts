/**
 * POST /api/agent/transcribe
 *
 * Transcrição de áudio via Whisper (Task 3.3c).
 * Portado de nexus-insights/src/app/api/nex/transcribe/route.ts.
 * Adaptações:
 * - Usa getCurrentUser() (não auth() diretamente).
 * - Usa logUsage de @/lib/agent/llm/usage-logger.
 * - Rota: /api/agent/transcribe.
 */

import { getCurrentUser } from "@/lib/auth";
import { transcribeAudio } from "@/lib/agent/transcribe";
import { logUsage } from "@/lib/agent/llm/usage-logger";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  let audio: Blob | null = null;
  let language = "pt";

  try {
    const fd = await req.formData();
    const f = fd.get("audio");
    if (f instanceof Blob) audio = f;
    const lang = fd.get("language");
    if (typeof lang === "string" && lang.length > 0) language = lang;
  } catch {
    return Response.json(
      { ok: false, error: "Payload multipart inválido" },
      { status: 400 },
    );
  }

  if (!audio) {
    return Response.json(
      { ok: false, error: "Campo 'audio' ausente" },
      { status: 400 },
    );
  }

  try {
    const start = Date.now();
    const r = await transcribeAudio(audio, language);

    void logUsage({
      provider: "openai",
      model: r.modelUsed,
      tokensInput: r.inputTokens,
      tokensOutput: r.outputTokens,
      promptChars: 0,
      responseChars: r.text.length,
      userId: user.id,
      durationMs: Date.now() - start,
    });

    return Response.json(
      { ok: true, text: r.text, durationSeconds: r.durationSeconds },
      { status: 200 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
