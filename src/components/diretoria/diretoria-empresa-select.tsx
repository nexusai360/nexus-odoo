"use client";

import { useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Building2, Loader2 } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { normalizarNomeEmpresa } from "@/lib/diretoria/nome-empresa";

export interface EmpresaOpcao {
  empresaId: number;
  /** Nome curto, como aparece na nota (ex.: "Jht SP Comércio"). */
  nome: string;
  /** Matriz/filial + UF, quando o cadastro traz (ex.: "Matriz SP"). */
  detalhe: string | null;
}

/** Valor da opção que representa o grupo inteiro (sem recorte por empresa). */
export const EMPRESA_TODAS = "todas";

/**
 * Recorte por empresa do grupo. Escreve `empresa` na URL preservando o período
 * (searchParams), então o filtro é compartilhável por link e sobrevive ao voltar do
 * navegador. Um select, e não pílulas: são 9 empresas, e pílula demais vira ruído.
 * O estado pendente fica no próprio gatilho enquanto o servidor recalcula a página.
 */
export function DiretoriaEmpresaSelect({ empresas }: { empresas: EmpresaOpcao[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pendente, startTransition] = useTransition();

  const atual = sp.get("empresa") ?? EMPRESA_TODAS;

  // `items` é o que faz o gatilho mostrar o RÓTULO da empresa (base-ui mapeia value→label);
  // sem ele o Select exibiria o valor cru ("8").
  // A sigla vem do Odoo capitalizada como palavra comum ("Jht DF Comércio"); aqui ela volta a
  // ser marca (JHT, JDS, IJHT...). Ver lib/diretoria/nome-empresa.ts.
  const items = [
    { value: EMPRESA_TODAS, label: "Todas as empresas" },
    ...empresas.map((e) => {
      const nome = normalizarNomeEmpresa(e.nome);
      return {
        value: String(e.empresaId),
        label: e.detalhe ? `${nome} · ${e.detalhe}` : nome,
      };
    }),
  ];

  function aplicar(valor: string) {
    const params = new URLSearchParams(sp.toString());
    if (valor === EMPRESA_TODAS) params.delete("empresa");
    else params.set("empresa", valor);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="diretoria-empresa"
        className="text-sm text-muted-foreground whitespace-nowrap"
      >
        Empresa
      </label>
      <Select items={items} value={atual} onValueChange={(v) => aplicar(String(v))}>
        <SelectTrigger
          id="diretoria-empresa"
          aria-label="Filtrar por empresa do grupo"
          className="h-9 w-[17rem] rounded-full"
        >
          <span className="flex min-w-0 items-center gap-2">
            {pendente ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <SelectValue placeholder="Todas as empresas" />
          </span>
        </SelectTrigger>
        {/* O menu abria PARA CIMA e cortado. Culpa do `alignItemWithTrigger` (padrão do
            base-ui): ele tenta alinhar o item JÁ SELECIONADO com o gatilho, então quanto mais
            embaixo da lista estivesse a empresa escolhida, mais a lista subia. Desligado, o
            menu se comporta como todo dropdown da plataforma: abre embaixo, ancorado à
            esquerda, e só sobe se não couber na tela. */}
        <SelectContent
          side="bottom"
          align="start"
          sideOffset={6}
          alignItemWithTrigger={false}
          className="max-h-[22rem] w-[var(--anchor-width)] min-w-[17rem]"
        >
          {items.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
