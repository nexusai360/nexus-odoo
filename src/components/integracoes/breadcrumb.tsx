import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface BreadcrumbItem {
  label: string;
  href?: string;
  /** Quando presente, o item vira um botão que reseta o estado da tela
   *  (ex.: voltar ao passo 1 do wizard) em vez de só navegar pela rota. */
  onClick?: () => void;
}

interface Props {
  items: BreadcrumbItem[];
}

/**
 * Breadcrumb de navegação para sub-rotas do menu Integrações.
 */
export function Breadcrumb({ items }: Props) {
  return (
    <nav aria-label="Caminho de navegação" className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={index} className="flex items-center gap-1.5">
            {index > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
            {item.onClick && !isLast ? (
              <button
                type="button"
                onClick={item.onClick}
                className="cursor-pointer transition-colors duration-150 hover:text-foreground"
              >
                {item.label}
              </button>
            ) : item.href && !isLast ? (
              <Link
                href={item.href}
                className="hover:text-foreground transition-colors duration-150"
              >
                {item.label}
              </Link>
            ) : (
              <span className={cn(isLast && "text-foreground font-medium")}>
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
