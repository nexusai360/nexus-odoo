// Helper de escopo de empresa, reusado pelas tools fiscais com empresaRef.
// Resolve a referencia textual (id, CNPJ ou nome) para empresaId + um descritor de
// escopo com aviso humanizado. Sem empresaRef: ramo grupo (considera o grupo todo).
import type { PrismaClient } from "@/generated/prisma/client.js";
import { resolverEmpresa } from "@/lib/metrics/_shared/empresa.js";

export interface EscopoEmpresa {
  tipo: "grupo" | "empresa" | "ambigua" | "nenhuma";
  empresaId?: number;
  empresaNome?: string;
  cnpj?: string | null;
  candidatas?: Array<{ odooId: number; nome: string; cnpj: string | null }>;
  aviso: string;
}

export interface EscopoResolvido {
  empresaId?: number;
  desambiguar: boolean;
  escopo: EscopoEmpresa;
}

export async function montarEscopoEmpresa(
  prisma: PrismaClient,
  empresaRef?: string,
): Promise<EscopoResolvido> {
  if (!empresaRef) {
    return {
      empresaId: undefined,
      desambiguar: false,
      escopo: { tipo: "grupo", aviso: "Considerei o grupo todo (todas as empresas)." },
    };
  }
  const r = await resolverEmpresa(prisma, empresaRef);
  if (r.status === "unica") {
    return {
      empresaId: r.empresa.odooId,
      desambiguar: false,
      escopo: {
        tipo: "empresa",
        empresaId: r.empresa.odooId,
        empresaNome: r.empresa.nome,
        cnpj: r.empresa.cnpj,
        aviso: `Considerei apenas a empresa ${r.empresa.nome}.`,
      },
    };
  }
  if (r.status === "ambigua") {
    return {
      empresaId: undefined,
      desambiguar: true,
      escopo: {
        tipo: "ambigua",
        candidatas: r.candidatas.map((c) => ({ odooId: c.odooId, nome: c.nome, cnpj: c.cnpj })),
        aviso: `Encontrei mais de uma empresa para "${empresaRef}". Qual delas?`,
      },
    };
  }
  return {
    empresaId: undefined,
    desambiguar: false,
    escopo: { tipo: "nenhuma", aviso: `Nao encontrei a empresa "${empresaRef}". Considerei o grupo todo.` },
  };
}
