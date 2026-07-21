"use client";

/**
 * Modo estendido (tela larga) das telas da Diretoria. Um toggle por usuário,
 * persistido em localStorage e compartilhado entre TODOS os submenus da
 * Diretoria (visão geral, vendas, pedidos, estoque, agenda). Quando ligado, o
 * contêiner perde o teto de largura (`max-w`) e a margem lateral cai para ~12px,
 * então gráficos e tabelas se esticam e mostram mais colunas (e ainda mais com o
 * sidebar recolhido). NÃO se aplica fora da Diretoria.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ChevronsLeftRight, ChevronsRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "diretoria:modo-estendido";

const ModoEstendidoContext = createContext<{ estendido: boolean; alternar: () => void }>({
  estendido: false,
  alternar: () => {},
});

export function ModoEstendidoProvider({ children }: { children: ReactNode }) {
  const [estendido, setEstendido] = useState(false);
  const [hidratado, setHidratado] = useState(false);

  useEffect(() => {
    try { setEstendido(window.localStorage.getItem(STORAGE_KEY) === "1"); } catch { /* ignore */ }
    setHidratado(true);
  }, []);
  useEffect(() => {
    if (!hidratado) return;
    try { window.localStorage.setItem(STORAGE_KEY, estendido ? "1" : "0"); } catch { /* ignore */ }
  }, [estendido, hidratado]);

  return (
    <ModoEstendidoContext.Provider value={{ estendido, alternar: () => setEstendido((v) => !v) }}>
      {children}
    </ModoEstendidoContext.Provider>
  );
}

export function useModoEstendido() {
  return useContext(ModoEstendidoContext);
}

/** Largura padrão das telas da Diretoria = PageShell `wide`. */
const LARGURA_NORMAL =
  "max-w-[clamp(1280px,calc(1280px+(100vw-1366px)*0.10),1400px)] px-4 sm:px-6 lg:px-8 xl:px-10";
/** Largura estendida: sem teto, margem lateral de 25px de cada lado. */
const LARGURA_ESTENDIDA = "max-w-none px-[25px]";

/** Contêiner das páginas da Diretoria (substitui PageShell wide). Reage ao modo
 * estendido, esticando o conteúdo até a borda. Sem transição de largura própria:
 * a mudança é instantânea e os dois lados acompanham juntos o reflow do layout
 * (o lado direito não ganha uma animação independente). */
export function DiretoriaShell({ children, className }: { children: ReactNode; className?: string }) {
  const { estendido } = useModoEstendido();
  return (
    <div className={cn("mx-auto", estendido ? LARGURA_ESTENDIDA : LARGURA_NORMAL, className)}>
      {children}
    </div>
  );
}

/** Botão do modo estendido, no padrão visual do "Editar layout" (ícone + rótulo,
 * contorno violeta). Ativo = preenchido. Ícone de setas que expandem/recolhem. */
export function BotaoModoEstendido({ className }: { className?: string }) {
  const { estendido, alternar } = useModoEstendido();
  const Icone = estendido ? ChevronsRightLeft : ChevronsLeftRight;
  return (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={estendido}
      title={estendido ? "Voltar à largura normal" : "Estender a tela para o lado"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        estendido
          ? "border-violet-500/60 bg-violet-600/20 text-violet-700 dark:text-violet-200 hover:bg-violet-600/25"
          : "border-violet-500/40 bg-violet-600/10 text-violet-700 dark:text-violet-200 hover:bg-violet-600/20",
        className,
      )}
    >
      <Icone className="h-3.5 w-3.5" aria-hidden />
      {estendido ? "Recolher" : "Estender tela"}
    </button>
  );
}
