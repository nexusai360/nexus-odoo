import { describe, expect, test } from "@jest/globals";
import { isAllowedByWhitelist } from "./sync-whitelist";

describe("isAllowedByWhitelist", () => {
  test("aceita gpt-5.4-nano e gpt-4o-mini na OpenAI", () => {
    expect(isAllowedByWhitelist("openai", "gpt-5.4-nano")).toBe(true);
    expect(isAllowedByWhitelist("openai", "gpt-4o-mini")).toBe(true);
    expect(isAllowedByWhitelist("openai", "gpt-4o")).toBe(true);
  });

  test("aceita whisper-1, tts-1, embeddings 3", () => {
    expect(isAllowedByWhitelist("openai", "whisper-1")).toBe(true);
    expect(isAllowedByWhitelist("openai", "tts-1")).toBe(true);
    expect(isAllowedByWhitelist("openai", "text-embedding-3-small")).toBe(true);
  });

  test("rejeita modelos legados e experimentais", () => {
    expect(isAllowedByWhitelist("openai", "gpt-3.5-turbo")).toBe(false);
    expect(isAllowedByWhitelist("openai", "babbage-002")).toBe(false);
    expect(isAllowedByWhitelist("openai", "dall-e-3")).toBe(false);
    expect(isAllowedByWhitelist("openai", "o1-preview")).toBe(false);
  });

  test("aceita Claude 4 e Claude 3.5/3.7 na Anthropic", () => {
    expect(isAllowedByWhitelist("anthropic", "claude-opus-4-7")).toBe(true);
    expect(isAllowedByWhitelist("anthropic", "claude-sonnet-4-6")).toBe(true);
    expect(isAllowedByWhitelist("anthropic", "claude-haiku-4-5-20251001")).toBe(true);
    expect(isAllowedByWhitelist("anthropic", "claude-3-5-sonnet")).toBe(true);
    expect(isAllowedByWhitelist("anthropic", "claude-3-7-sonnet-latest")).toBe(true);
  });

  test("rejeita modelos Claude legados (claude-2, claude-instant)", () => {
    expect(isAllowedByWhitelist("anthropic", "claude-2")).toBe(false);
    expect(isAllowedByWhitelist("anthropic", "claude-instant-1.2")).toBe(false);
  });

  test("aceita Gemini 1.5/2.0/2.5", () => {
    expect(isAllowedByWhitelist("gemini", "gemini-2.5-pro")).toBe(true);
    expect(isAllowedByWhitelist("gemini", "gemini-2.0-flash")).toBe(true);
    expect(isAllowedByWhitelist("gemini", "gemini-1.5-flash")).toBe(true);
  });

  test("rejeita Gemini 1.0", () => {
    expect(isAllowedByWhitelist("gemini", "gemini-1.0-pro")).toBe(false);
  });

  test("aceita OpenRouter aliasing dos providers conhecidos", () => {
    expect(isAllowedByWhitelist("openrouter", "openai/gpt-4o-mini")).toBe(true);
    expect(isAllowedByWhitelist("openrouter", "anthropic/claude-opus-4")).toBe(true);
    expect(isAllowedByWhitelist("openrouter", "google/gemini-2.5-pro")).toBe(true);
  });

  test("rejeita combinacoes nao listadas no OpenRouter", () => {
    expect(isAllowedByWhitelist("openrouter", "meta-llama/llama-3.1-70b")).toBe(false);
  });
});
