// src/lib/fiscal/grupo/__tests__/participantes-grupo.test.ts
import { carregarParticipantesGrupo, ehNotaIntragrupo } from "../participantes-grupo";
import type { PrismaClient } from "../../../../generated/prisma/client";

describe("carregarParticipantesGrupo", () => {
  it("devolve Set de odooId cujos parceiros tem raiz CNPJ do grupo", async () => {
    const findMany = jest.fn().mockResolvedValue([
      { odooId: 11, documentoDigits: "34161829000430" }, // grupo
      { odooId: 22, documentoDigits: "99999999000199" }, // externo
      { odooId: 33, documentoDigits: null }, // sem doc
      { odooId: 44, documentoDigits: "34161829000" }, // 11 dig (CPF) , nao e raiz
    ]);
    const prisma = { fatoParceiro: { findMany } } as unknown as PrismaClient;
    const set = await carregarParticipantesGrupo(prisma);
    expect(set.has(11)).toBe(true);
    expect(set.has(22)).toBe(false);
    expect(set.has(33)).toBe(false);
    expect(set.has(44)).toBe(false);
  });
});

describe("ehNotaIntragrupo", () => {
  const grupo = new Set<number>([11]);
  it("true quando participante esta no Set (via documento)", () => {
    expect(ehNotaIntragrupo({ participanteId: 11, participanteNome: "X" }, grupo)).toBe(true);
  });
  it("true via fallback do CNPJ no nome quando participante nao esta no Set", () => {
    const nota = { participanteId: 77, participanteNome: "Jds - 18.282.961/0001-00 [18.282.961/0001-00]" };
    expect(ehNotaIntragrupo(nota, grupo)).toBe(true);
  });
  it("true via fallback mesmo com CNPJ Unicode no nome (B1)", () => {
    const nota = { participanteId: 88, participanteNome: "Matrix 26‍.308‍.789/0001‑36" };
    // 26308789 nao esta nas raizes; usa uma raiz real do grupo com unicode:
    const nota2 = { participanteId: 88, participanteNome: "Jht 34‍.161‍.829/0001‑98" };
    expect(ehNotaIntragrupo(nota, grupo)).toBe(false);
    expect(ehNotaIntragrupo(nota2, grupo)).toBe(true);
  });
  it("false para participante externo sem CNPJ do grupo no nome", () => {
    expect(ehNotaIntragrupo({ participanteId: 77, participanteNome: "Cliente Externo" }, grupo)).toBe(false);
  });

  // Fase 2.5: whitelist como 1a camada (whitelist -> cadastro -> nome).
  it("true pela whitelist mesmo sem CNPJ no nome e fora do Set de cadastro (pid 9)", () => {
    // pid 9 esta na whitelist; nome sem CNPJ legivel; Set de cadastro vazio.
    expect(ehNotaIntragrupo({ participanteId: 9, participanteNome: "Jht DF Matriz" }, new Set())).toBe(true);
  });
  it("true pela whitelist para o pid 24 (Ijht Premium Car) sem CNPJ no nome", () => {
    expect(ehNotaIntragrupo({ participanteId: 24, participanteNome: "Ijht Premium Car" }, new Set())).toBe(true);
  });
  it("false para reciclado mesmo que id parecido, quando nada casa (pid 8723 sem CNPJ no nome)", () => {
    expect(ehNotaIntragrupo({ participanteId: 8723, participanteNome: "Vilmar Luiz Borges" }, new Set())).toBe(false);
  });
  it("ainda marca pelo nome quando o id nao esta em lugar nenhum (fallback ultima defesa)", () => {
    expect(ehNotaIntragrupo({ participanteId: 77777, participanteNome: "Fulano 10.557.556/0001-00" }, new Set())).toBe(true);
  });
});
