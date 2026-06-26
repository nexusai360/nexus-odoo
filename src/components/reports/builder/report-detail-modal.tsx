"use client";

// src/components/reports/builder/report-detail-modal.tsx
// F6 (P3) , Painel de detalhe de um relatorio salvo: editar nome, ver o criador
// e definir a visibilidade de consumo (Privado / por nivel / lista de usuarios).
// Abre a partir do card em "Meus relatorios".
import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ExternalLink, Loader2, Lock, Pencil, Search, Users, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PLATFORM_ROLE_LABELS } from "@/lib/constants/roles";
import type { PlatformRole } from "@/generated/prisma/client";
import {
  obterDetalheRelatorio,
  renomearRelatorio,
  definirVisibilidadeRelatorio,
  listarUsuariosParaCompartilhar,
  type DetalheRelatorio,
} from "@/lib/actions/saved-report";
import {
  usuariosDoNivel,
  filtrarUsuarios,
  type UsuarioCompartilhavel,
} from "@/lib/reports/builder/compartilhamento";

interface ReportDetailModalProps {
  reportId: string;
  onClose: () => void;
  /** Atualiza o card da lista quando o nome/visibilidade mudam. */
  onChanged?: (patch: { titulo?: string; compartilhado?: boolean }) => void;
}

const NIVEIS: PlatformRole[] = ["admin", "manager", "viewer"];

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className="h-8 w-8 rounded-full object-cover" />;
  }
  const ini = name.trim().split(/\s+/).filter(Boolean);
  const txt = ini.length ? (ini.length === 1 ? ini[0].slice(0, 2) : ini[0][0] + ini[ini.length - 1][0]) : "?";
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600/15 text-xs font-semibold text-violet-600 dark:text-violet-300">
      {txt.toUpperCase()}
    </div>
  );
}

function RoleTag({ role }: { role: PlatformRole }) {
  return (
    <span className="shrink-0 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">
      {PLATFORM_ROLE_LABELS[role]}
    </span>
  );
}

export function ReportDetailModal({ reportId, onClose, onChanged }: ReportDetailModalProps) {
  const reduce = useReducedMotion();
  const [loading, setLoading] = React.useState(true);
  const [detalhe, setDetalhe] = React.useState<DetalheRelatorio | null>(null);
  const [usuarios, setUsuarios] = React.useState<UsuarioCompartilhavel[]>([]);

  const [nome, setNome] = React.useState("");
  const [salvandoNome, setSalvandoNome] = React.useState(false);

  const [compartilhar, setCompartilhar] = React.useState(false);
  const [selecionados, setSelecionados] = React.useState<Set<string>>(new Set());
  const [busca, setBusca] = React.useState("");
  const [salvandoPerm, setSalvandoPerm] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const [det, lista] = await Promise.all([
        obterDetalheRelatorio(reportId),
        listarUsuariosParaCompartilhar(),
      ]);
      if (cancelled) return;
      if (!det.ok) {
        toast.error(det.error);
        onClose();
        return;
      }
      setDetalhe(det.detalhe);
      setNome(det.detalhe.titulo);
      setCompartilhar(det.detalhe.compartilhado);
      setSelecionados(new Set(det.detalhe.visibilidadeConsumo));
      if (lista.ok) setUsuarios(lista.usuarios);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reportId, onClose]);

  // Lista de compartilhaveis (exclui o proprio criador , ele ve sempre).
  const compartilhaveis = React.useMemo(
    () => usuarios.filter((u) => u.id !== detalhe?.criadoPor),
    [usuarios, detalhe?.criadoPor],
  );
  const visiveis = React.useMemo(
    () => filtrarUsuarios(compartilhaveis, busca),
    [compartilhaveis, busca],
  );

  function toggleUser(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function marcarNivel(nivel: PlatformRole) {
    const ids = usuariosDoNivel(compartilhaveis, nivel);
    setSelecionados((prev) => {
      const next = new Set(prev);
      const todosMarcados = ids.length > 0 && ids.every((id) => next.has(id));
      // Toggle do nivel: se ja estao todos marcados, desmarca; senao marca todos.
      for (const id of ids) {
        if (todosMarcados) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  async function salvarNome() {
    const t = nome.trim();
    if (!t || !detalhe) return;
    if (t === detalhe.titulo) return;
    setSalvandoNome(true);
    const r = await renomearRelatorio(detalhe.id, t);
    setSalvandoNome(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setDetalhe({ ...detalhe, titulo: r.titulo });
    onChanged?.({ titulo: r.titulo });
    toast.success("Nome atualizado.");
  }

  async function salvarPermissoes() {
    if (!detalhe) return;
    setSalvandoPerm(true);
    const r = await definirVisibilidadeRelatorio(detalhe.id, {
      compartilhar,
      userIds: Array.from(selecionados),
    });
    setSalvandoPerm(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    onChanged?.({ compartilhado: r.compartilhado });
    toast.success(
      r.compartilhado
        ? `Compartilhado com ${r.total} ${r.total === 1 ? "pessoa" : "pessoas"}.`
        : "Relatorio agora e privado.",
    );
  }

  const nomeMudou = detalhe ? nome.trim() !== detalhe.titulo && nome.trim().length > 0 : false;

  return (
    <AnimatePresence>
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16 }}
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Detalhes do relatorio"
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="fixed inset-0 z-50 m-auto flex max-h-[90vh] w-[min(560px,94vw)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        <header className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">Detalhes do relatorio</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:outline-none"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {loading || !detalhe ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-violet-500" aria-label="Carregando" />
          </div>
        ) : (
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
            {/* Nome editavel */}
            <div className="space-y-1.5">
              <label htmlFor="rel-nome" className="text-xs font-medium text-muted-foreground">
                Nome do relatorio
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Pencil className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="rel-nome"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void salvarNome();
                    }}
                    maxLength={120}
                    className="w-full rounded-lg border border-border bg-background py-2 pr-3 pl-8 text-sm text-foreground focus-visible:border-violet-500/60 focus-visible:ring-2 focus-visible:ring-violet-400/30 focus-visible:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void salvarNome()}
                  disabled={!nomeMudou || salvandoNome}
                  className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-sm font-medium text-white transition-colors hover:bg-violet-500 focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {salvandoNome ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Salvar
                </button>
              </div>
            </div>

            {/* Criado por */}
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Criado por</span>
              <div className="flex items-center gap-2.5 rounded-xl border border-border bg-background px-3 py-2">
                <Avatar name={detalhe.criador?.name ?? "?"} url={detalhe.criador?.avatarUrl ?? null} />
                <div className="min-w-0 leading-tight">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-foreground">
                      {detalhe.criador?.name ?? "Usuario removido"}
                    </span>
                    {detalhe.criador ? <RoleTag role={detalhe.criador.platformRole} /> : null}
                  </div>
                  <span className="block truncate text-xs text-muted-foreground">
                    {detalhe.criador?.email ?? ""}
                  </span>
                </div>
                <Link
                  href={`/relatorios-2/d/${detalhe.id}`}
                  className="ml-auto flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-violet-500/50 hover:bg-violet-600/5 focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:outline-none"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  Abrir
                </Link>
              </div>
            </div>

            {/* Visibilidade */}
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground">Quem pode ver</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCompartilhar(false)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:outline-none",
                    !compartilhar
                      ? "border-violet-500/60 bg-violet-600/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Lock className="h-3.5 w-3.5" aria-hidden />
                  Privado
                </button>
                <button
                  type="button"
                  onClick={() => setCompartilhar(true)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:outline-none",
                    compartilhar
                      ? "border-violet-500/60 bg-violet-600/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Users className="h-3.5 w-3.5" aria-hidden />
                  Compartilhado
                </button>
              </div>

              {compartilhar ? (
                <div className="space-y-3 rounded-xl border border-border bg-background/60 p-3">
                  {/* Atalhos por nivel */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">Marcar nivel:</span>
                    {NIVEIS.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => marcarNivel(n)}
                        className="cursor-pointer rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-foreground/90 transition-colors hover:bg-violet-500/20 focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:outline-none"
                      >
                        {PLATFORM_ROLE_LABELS[n]}
                      </button>
                    ))}
                  </div>

                  {/* Busca */}
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      placeholder="Buscar pessoa por nome ou e-mail"
                      aria-label="Buscar pessoa"
                      className="w-full rounded-lg border border-border bg-background py-2 pr-3 pl-8 text-sm text-foreground focus-visible:border-violet-500/60 focus-visible:ring-2 focus-visible:ring-violet-400/30 focus-visible:outline-none"
                    />
                  </div>

                  {/* Lista de usuarios */}
                  <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
                    {visiveis.length === 0 ? (
                      <li className="px-1 py-3 text-center text-xs text-muted-foreground">
                        Nenhuma pessoa encontrada.
                      </li>
                    ) : (
                      visiveis.map((u) => {
                        const marcado = selecionados.has(u.id);
                        return (
                          <li key={u.id}>
                            <button
                              type="button"
                              onClick={() => toggleUser(u.id)}
                              aria-pressed={marcado}
                              className={cn(
                                "flex w-full cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:outline-none",
                                marcado
                                  ? "border-violet-500/50 bg-violet-600/10"
                                  : "border-transparent hover:bg-muted",
                              )}
                            >
                              <Avatar name={u.name} url={u.avatarUrl} />
                              <div className="min-w-0 flex-1 leading-tight">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate text-sm font-medium text-foreground">
                                    {u.name}
                                  </span>
                                  <RoleTag role={u.platformRole} />
                                </div>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {u.email}
                                </span>
                              </div>
                              <span
                                className={cn(
                                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                                  marcado
                                    ? "border-violet-500 bg-violet-600 text-white"
                                    : "border-border bg-background",
                                )}
                                aria-hidden
                              >
                                {marcado ? <Check className="h-3.5 w-3.5" /> : null}
                              </span>
                            </button>
                          </li>
                        );
                      })
                    )}
                  </ul>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-border bg-background/40 px-3 py-2.5 text-xs text-muted-foreground">
                  Apenas voce (o criador) ve este relatorio. Mude para
                  <span className="font-medium text-foreground"> Compartilhado </span>
                  para liberar por nivel ou por pessoa.
                </p>
              )}
            </div>
          </div>
        )}

        {!loading && detalhe ? (
          <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:outline-none"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={() => void salvarPermissoes()}
              disabled={salvandoPerm}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            >
              {salvandoPerm ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Atualizar permissoes
            </button>
          </footer>
        ) : null}
      </motion.div>
    </AnimatePresence>
  );
}
