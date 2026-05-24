/**
 * Transcrição de áudio para o agente nexus-odoo.
 *
 * Portado de nexus-insights/src/lib/nex/transcribe.ts.
 * Adaptação: ler credencial OpenAI via getActiveLlmConfig() local
 * (não via nexus-insights). Gating: só OpenAI suporta transcrição.
 *
 * Estratégia:
 * 1. Tenta gpt-4o-mini-transcribe (token-based, retorna usage).
 * 2. Em qualquer erro (4xx/5xx/exception), cai para whisper-1 (cobrado por minuto).
 * 3. Se whisper-1 também falhar, lança Error com mensagem clara em português.
 */

import { getActiveLlmConfig } from "./llm/get-active-config";

/** Cap defensivo igual Whisper API (25 MB). */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/**
 * Lançado quando não há credencial OpenAI disponível para transcrição.
 * Análogo a EmbeddingUnavailable do RAG , permite tratamento tipado pelo caller.
 */
export class TranscriptionUnavailable extends Error {
  constructor(message = "Credencial OpenAI não configurada para transcrição de áudio.") {
    super(message);
    this.name = "TranscriptionUnavailable";
  }
}

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";

interface TranscribeUsage {
  input_tokens?: number;
  input_token_details?: { text_tokens?: number; audio_tokens?: number };
  output_tokens?: number;
}

interface GptTranscribeJsonResponse {
  text?: string;
  usage?: TranscribeUsage;
}

interface WhisperVerboseJsonResponse {
  text?: string;
  duration?: number;
}

export interface TranscribeResult {
  text: string;
  durationSeconds: number;
  inputTokens: number;
  outputTokens: number;
  modelUsed: "gpt-4o-mini-transcribe" | "whisper-1";
}

/**
 * Transcreve um áudio usando primeiro `gpt-4o-mini-transcribe` (token-based)
 * e faz fallback para `whisper-1` em qualquer 4xx/5xx ou exception.
 *
 * Requer config LLM ativa do provider `openai`.
 * Lança erro com mensagem clara quando a credencial não está disponível.
 */
export async function transcribeAudio(
  audio: Blob,
  language: string = "pt",
): Promise<TranscribeResult> {
  if (audio.size > MAX_AUDIO_BYTES) {
    throw new Error(
      `Áudio acima do limite de 25 MB (recebido ${(audio.size / (1024 * 1024)).toFixed(1)} MB).`,
    );
  }

  const config = await getActiveLlmConfig();
  if (!config || config.provider !== "openai") {
    throw new TranscriptionUnavailable(
      "Transcrição de áudio requer uma credencial OpenAI ativa. Configure um modelo OpenAI em Integrações → Agente.",
    );
  }

  const start = Date.now();

  // Tentativa 1: gpt-4o-mini-transcribe
  try {
    const form = new FormData();
    form.append("file", audio, "audio.webm");
    form.append("model", "gpt-4o-mini-transcribe");
    form.append("response_format", "json");
    form.append("language", language);

    const response = await fetch(WHISPER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
    });

    if (response.ok) {
      const data = (await response.json()) as GptTranscribeJsonResponse;
      const usage = data.usage;
      const audioTokens = usage?.input_token_details?.audio_tokens ?? 0;
      const textTokens = usage?.input_token_details?.text_tokens ?? 0;
      const detailSum = audioTokens + textTokens;
      const inputTokens = detailSum > 0 ? detailSum : usage?.input_tokens ?? 0;

      return {
        text: data.text ?? "",
        durationSeconds: (Date.now() - start) / 1000,
        inputTokens,
        outputTokens: usage?.output_tokens ?? 0,
        modelUsed: "gpt-4o-mini-transcribe",
      };
    }

    let errorBody = "";
    try { errorBody = await response.text(); } catch { /* noop */ }
    console.warn(
      `[transcribe] gpt-4o-mini-transcribe ${response.status} , ${errorBody.slice(0, 200)} , fallback whisper-1`,
    );
  } catch (err) {
    console.warn("[transcribe] gpt-4o-mini-transcribe falhou , fallback whisper-1:", err);
  }

  // Fallback: whisper-1
  const formW = new FormData();
  formW.append("file", audio, "audio.webm");
  formW.append("model", "whisper-1");
  formW.append("response_format", "verbose_json");
  formW.append("language", language);

  const responseW = await fetch(WHISPER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: formW,
  });

  if (!responseW.ok) {
    let errorBody = "";
    try { errorBody = await responseW.text(); } catch { /* noop */ }
    throw new Error(
      `Whisper ${responseW.status}: ${errorBody || responseW.statusText}`,
    );
  }

  const dataW = (await responseW.json()) as WhisperVerboseJsonResponse;
  return {
    text: dataW.text ?? "",
    durationSeconds:
      typeof dataW.duration === "number"
        ? dataW.duration
        : (Date.now() - start) / 1000,
    inputTokens: 0,
    outputTokens: 0,
    modelUsed: "whisper-1",
  };
}
