import type { ReportDomain } from "@/generated/prisma/client";
import { WELCOME_SUGGESTIONS, pickWelcomeByDomains } from "./welcome-suggestions";

const ALL_DOMAINS: ReportDomain[] = [
  "cadastros",
  "comercial",
  "contabil",
  "crm",
  "estoque",
  "financeiro",
  "fiscal",
];

describe("pickWelcomeByDomains", () => {
  test("um dominio retorna so perguntas dele, capado em max", () => {
    const r = pickWelcomeByDomains(["estoque"], "viewer", 3);
    expect(r).toHaveLength(3);
    expect(r.every((q) => /estoque|produto|itens|armaz|movimento/i.test(q))).toBe(true);
  });

  test("so crm (sem tools) cai no fallback por role", () => {
    const r = pickWelcomeByDomains(["crm"], "viewer", 3);
    expect(r.length).toBeGreaterThan(0);
  });

  test("dominios vazios cai no fallback por role", () => {
    const r = pickWelcomeByDomains([], "manager", 3);
    expect(r.length).toBeGreaterThan(0);
  });

  test("todos os dominios (super_admin) inclui faturamento", () => {
    const r = pickWelcomeByDomains([...ALL_DOMAINS], "super_admin", 5);
    expect(r.some((q) => /faturamos/i.test(q))).toBe(true);
  });

  test("intercala multiplos dominios sem duplicar", () => {
    const r = pickWelcomeByDomains(["estoque", "fiscal"], "manager", 4);
    expect(new Set(r).size).toBe(r.length);
    expect(r.length).toBe(4);
  });

  test("respeita o cap de 1..5", () => {
    expect(pickWelcomeByDomains([...ALL_DOMAINS], "super_admin", 99)).toHaveLength(5);
    expect(pickWelcomeByDomains([...ALL_DOMAINS], "super_admin", 0).length).toBeGreaterThanOrEqual(1);
  });
});

describe("WELCOME_SUGGESTIONS", () => {
  test("contem exatamente 4 sugestoes", () => {
    expect(WELCOME_SUGGESTIONS).toHaveLength(4);
  });

  test("nenhuma sugestao contem travessao ou en-dash", () => {
    for (const s of WELCOME_SUGGESTIONS) {
      expect(s).not.toMatch(/[,,]/);
    }
  });

  test("toda sugestao termina com sinal de interrogacao", () => {
    for (const s of WELCOME_SUGGESTIONS) {
      expect(s.trim().endsWith("?")).toBe(true);
    }
  });
});
