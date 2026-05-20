"use client";

/**
 * PlaygroundContent — Playground do Agente Nex com sessões persistentes.
 *
 * Layout: painel lateral esquerdo (config + histórico de sessões + consumo) +
 * área de chat à direita. A edição do prompt da sessão abre uma sub-tela
 * navegável (não modal). Sessões persistem em Postgres (PlaygroundSession).
 *
 * Bloco 6 — F5 UI rework v2.
 * Design: ui-ux-pro-max Quick Reference §5 (layout), §9 (navegação).
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Check,
  FileText,
  KeyRound,
  Loader2,
  MessageSquare,
  Mic,
  Pencil,
  Plus,
  Save,
  Send,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { AgentMessage, type AgentMessageRole } from "@/components/agent/agent-message";
import { SuggestionsBar } from "@/components/agent/suggestions-bar";
import { AudioRecorder, type AudioRecorderHandle } from "@/components/agent/audio-recorder";
import { AttachMenu, defaultAttachHandler } from "@/components/agent/attach-menu";
import { MessageInput } from "@/components/agent/message-input";
import { PlaygroundSessionPrompt } from "@/components/agent/playground-session-prompt";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/ui/searchable-select";
import { TierBadge, type CostTier } from "@/components/ui/tier-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  listAvailablePlaygroundProviders,
  listPlaygroundSessions,
  createPlaygroundSession,
  getPlaygroundSession,
  deletePlaygroundSession,
  renamePlaygroundSession,
  updatePlaygroundSessionModel,
} from "@/lib/actions/playground";
import { Input } from "@/components/ui/input";
import type {
  PlaygroundSessionSummary,
  PlaygroundSessionDetail,
  PlaygroundPromptSnapshot,
} from "@/lib/actions/playground-types";

// ---------------------------------------------------------------------------
// Constantes / tipos
// ---------------------------------------------------------------------------

const MAX_INPUT_LEN = 1000;

interface UiMessage {
  id: string;
  role: AgentMessageRole;
  content: string;
  toolName?: string;
  suggestions?: string[];
  streaming?: boolean;
  /** D5 — provedor/modelo que gerou esta mensagem. */
  provider?: string | null;
  /** D5 — modelo que gerou esta mensagem. */
  model?: string | null;
  /** D5 — tipo da requisição: texto | audio | imagem | arquivo. */
  requestKind?: string | null;
}

interface ProviderOption {
  provider: string;
  label: string;
  models: { id: string; label: string; tier: string; description: string }[];
}

function genId(): string {
  return `pg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const usdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const brlFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PlaygroundContentProps {
  /** Áudio disponível no playground (checkpoint >= PLAYGROUND). */
  audioInputEnabled?: boolean;
  userId: string;
  /** D2 — credenciais agrupadas por provedor. */
  credentialsByProvider?: Record<string, { id: string; label: string }[]>;
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function PlaygroundContent({
  audioInputEnabled,
  userId: _userId,
  credentialsByProvider = {},
}: PlaygroundContentProps) {
  const prefersReducedMotion = useReducedMotion();

  // Provedores/modelos disponíveis (com chave cadastrada)
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [providersLoaded, setProvidersLoaded] = useState(false);

  // Sessões
  const [sessions, setSessions] = useState<PlaygroundSessionSummary[]>([]);
  const [active, setActive] = useState<PlaygroundSessionDetail | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(false);

  // D2 — rascunho de configuração antes do "Salvar"
  const [draftProvider, setDraftProvider] = useState<string>("");
  const [draftModel, setDraftModel] = useState<string>("");
  const [draftCredentialId, setDraftCredentialId] = useState<string>("");
  const [savingConfig, setSavingConfig] = useState(false);

  // D3 — rename da sessão
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Painel lateral: alterna entre Configuração e Histórico (resolve cobrir o histórico)
  const [sidePanel, setSidePanel] = useState<"config" | "history">("config");

  // Chat
  const [items, setItems] = useState<UiMessage[]>([]);
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Vista: chat ou sub-tela de prompt
  const [view, setView] = useState<"chat" | "prompt">("chat");

  // Áudio
  const recorderRef = useRef<AudioRecorderHandle | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioFlight, setAudioFlight] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const trimmed = message.trim();
  const overLimit = message.length > MAX_INPUT_LEN;
  const isConfigured = Boolean(active?.provider && active?.model);
  const canSubmit =
    trimmed.length > 0 &&
    !overLimit &&
    !isSending &&
    active !== null &&
    isConfigured;
  const draftDirty =
    !!active &&
    (draftProvider !== (active.provider ?? "") ||
      draftModel !== (active.model ?? "") ||
      draftCredentialId !== (active.credentialId ?? ""));
  const draftValid = !!draftProvider && !!draftModel;

  // ---- Carregamento inicial -----------------------------------------------

  const reloadSessions = useCallback(async () => {
    const res = await listPlaygroundSessions();
    if (res.success && res.data) {
      setSessions(res.data.filter((s) => s.archivedAt === null));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const [provRes] = await Promise.all([
        listAvailablePlaygroundProviders(),
        reloadSessions(),
      ]);
      if (provRes.success && provRes.data) setProviders(provRes.data);
      setProvidersLoaded(true);
    })();
  }, [reloadSessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items]);

  // ---- Helpers de chat -----------------------------------------------------

  const appendItems = useCallback((next: UiMessage[]) => {
    setItems((prev) => [...prev, ...next]);
  }, []);

  const updateLastAssistant = useCallback(
    (updater: (msg: UiMessage) => UiMessage) => {
      setItems((prev) => {
        const idx = [...prev].reverse().findIndex((m) => m.role === "assistant");
        if (idx === -1) return prev;
        const realIdx = prev.length - 1 - idx;
        const next = [...prev];
        next[realIdx] = updater(next[realIdx]!);
        return next;
      });
    },
    [],
  );

  // ---- Sessões -------------------------------------------------------------

  function loadDetailIntoChat(detail: PlaygroundSessionDetail) {
    setActive(detail);
    setItems(
      detail.messages.map((m) => ({
        id: m.id,
        role: m.role as AgentMessageRole,
        content: m.content,
        provider: m.provider,
        model: m.model,
        requestKind: m.requestKind,
      })),
    );
    setMessage("");
    setDraftProvider(detail.provider ?? "");
    setDraftModel(detail.model ?? "");
    setDraftCredentialId(detail.credentialId ?? "");
    setView("chat");
  }

  async function handleNewSession() {
    if (providers.length === 0) {
      toast.error("Cadastre uma chave de API antes de criar uma sessão.");
      return;
    }
    setIsLoadingSession(true);
    // D2 — não auto-seleciona provedor/modelo/chave; usuário escolhe e clica
    // Salvar antes da primeira mensagem.
    // D4 — não arquiva a sessão atual; ela continua no histórico.
    const res = await createPlaygroundSession({});
    setIsLoadingSession(false);
    if (res.success && res.data) {
      loadDetailIntoChat(res.data);
      await reloadSessions();
    } else {
      toast.error(
        (res.success ? undefined : res.error) ?? "Erro ao criar sessão.",
      );
    }
  }

  async function handleOpenSession(id: string) {
    if (active?.id === id) return;
    setIsLoadingSession(true);
    const res = await getPlaygroundSession(id);
    setIsLoadingSession(false);
    if (res.success && res.data) {
      loadDetailIntoChat(res.data);
    } else {
      toast.error(
        (res.success ? undefined : res.error) ?? "Erro ao abrir sessão.",
      );
    }
  }

  async function handleDeleteSession(id: string) {
    const res = await deletePlaygroundSession(id);
    if (res.success) {
      if (active?.id === id) {
        setActive(null);
        setItems([]);
      }
      await reloadSessions();
      toast.success("Sessão excluída.");
    } else {
      toast.error(res.error ?? "Erro ao excluir sessão.");
    }
  }

  // D2 — handlers de rascunho (não persistem direto; o usuário aciona Salvar).
  function handleDraftProviderChange(providerKey: string) {
    setDraftProvider(providerKey);
    setDraftModel("");
    setDraftCredentialId("");
  }
  function handleDraftModelChange(modelId: string) {
    setDraftModel(modelId);
  }
  function handleDraftCredentialChange(id: string) {
    setDraftCredentialId(id);
  }

  async function handleSaveConfig() {
    if (!active) return;
    if (!draftProvider || !draftModel) {
      toast.error("Selecione provedor e modelo antes de salvar.");
      return;
    }
    setSavingConfig(true);
    const res = await updatePlaygroundSessionModel({
      sessionId: active.id,
      provider: draftProvider,
      model: draftModel,
      credentialId: draftCredentialId || null,
    });
    setSavingConfig(false);
    if (!res.success) {
      toast.error(res.error ?? "Erro ao salvar configuração.");
      return;
    }
    setActive({
      ...active,
      provider: draftProvider,
      model: draftModel,
      credentialId: draftCredentialId || null,
    });
    await reloadSessions();
    toast.success("Configuração da sessão salva.");
  }

  function startRename(id: string, currentTitle: string | null | undefined) {
    setRenamingId(id);
    setRenameValue(currentTitle ?? "");
  }
  function cancelRename() {
    setRenamingId(null);
    setRenameValue("");
  }
  async function commitRename(id: string) {
    const next = renameValue.trim();
    setRenamingId(null);
    const res = await renamePlaygroundSession({
      sessionId: id,
      title: next,
    });
    if (!res.success) {
      toast.error(res.error ?? "Erro ao renomear sessão.");
      return;
    }
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title: next || null } : s)),
    );
    if (active?.id === id) setActive({ ...active, title: next || null });
  }

  function handlePromptSaved(saved: PlaygroundPromptSnapshot | null) {
    if (saved && active) {
      setActive({ ...active, promptSnapshot: saved });
    }
    setView("chat");
  }

  // ---- Submit via SSE ------------------------------------------------------

  async function submitMessage(text: string) {
    const trimmedText = text.trim();
    if (!trimmedText || isSending || !active) return;
    if (trimmedText.length > MAX_INPUT_LEN) {
      toast.error(`Mensagem acima de ${MAX_INPUT_LEN} caracteres.`);
      return;
    }

    appendItems([
      {
        id: genId(),
        role: "user",
        content: trimmedText,
        requestKind: "texto",
      },
    ]);
    setMessage("");
    setIsSending(true);

    const assistantId = genId();
    // D5 — tag de modelo já fica preenchida durante o streaming.
    appendItems([
      {
        id: assistantId,
        role: "loading" as AgentMessageRole,
        content: "",
        provider: active.provider,
        model: active.model,
        requestKind: "texto",
      },
    ]);

    try {
      const res = await fetch("/api/agent/playground/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: active.id, message: trimmedText }),
      });

      if (!res.ok || !res.body) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error ?? `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      setItems((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, role: "assistant" as AgentMessageRole, content: "", streaming: true }
            : m,
        ),
      );

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let evt: Record<string, unknown>;
          try {
            evt = JSON.parse(line.slice(6)) as Record<string, unknown>;
          } catch {
            continue;
          }
          if (evt.type === "token") {
            updateLastAssistant((m) => ({
              ...m,
              content: m.content + String(evt.delta ?? ""),
              streaming: true,
            }));
          } else if (evt.type === "tool_call") {
            appendItems([
              {
                id: genId(),
                role: "tool_call" as AgentMessageRole,
                content: "",
                toolName: String(evt.toolName ?? ""),
              },
            ]);
          } else if (evt.type === "done") {
            const suggestions = Array.isArray(evt.suggestions)
              ? (evt.suggestions as string[])
              : [];
            updateLastAssistant((m) => ({
              ...m,
              content: String(evt.message ?? m.content),
              streaming: false,
              suggestions: suggestions.length > 0 ? suggestions : undefined,
            }));
            // Atualiza o custo acumulado da sessão
            if (
              typeof evt.costUsd === "number" &&
              typeof evt.costBrl === "number"
            ) {
              setActive((prev) =>
                prev
                  ? { ...prev, costUsd: evt.costUsd as number, costBrl: evt.costBrl as number }
                  : prev,
              );
            }
          } else if (evt.type === "error") {
            throw new Error(String(evt.error ?? "Erro do agente"));
          }
        }
      }
      await reloadSessions();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Erro: ${msg}`);
      setItems((prev) =>
        prev.filter((m) => !(m.id === assistantId && m.role === "loading")),
      );
    } finally {
      setIsSending(false);
      updateLastAssistant((m) => ({ ...m, streaming: false }));
    }
  }

  /* eslint-disable react-hooks/exhaustive-deps */
  const handlePickSuggestion = useCallback(
    (msgId: string, suggestion: string) => {
      setItems((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, suggestions: undefined } : m)),
      );
      void submitMessage(suggestion);
    },
    [],
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  function handleSendClick() {
    if (isRecording) {
      recorderRef.current?.sendNow();
      return;
    }
    void submitMessage(message);
  }

  async function handleSendAudio(blob: Blob) {
    if (audioFlight) return;
    setAudioFlight(true);
    try {
      const fd = new FormData();
      fd.append("audio", blob, "recording.webm");
      fd.append("language", "pt");
      const res = await fetch("/api/agent/transcribe", { method: "POST", body: fd });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d?.error ?? `HTTP ${res.status}`);
      }
      const d = (await res.json()) as { text?: string };
      const text = (d?.text ?? "").trim();
      if (!text) {
        toast.error("Não conseguimos entender o áudio.");
        return;
      }
      // D5 — marca a mensagem do usuário como "audio" (transcrita).
      appendItems([
        {
          id: genId(),
          role: "user",
          content: text,
          requestKind: "audio",
        },
      ]);
      void submitMessage(text);
    } catch (err) {
      toast.error(
        `Falha ao transcrever: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setAudioFlight(false);
    }
  }

  // ---- Derivados -----------------------------------------------------------

  const hasProviders = providers.length > 0;
  const activeProvider = active
    ? providers.find((p) => p.provider === active.provider)
    : undefined;
  const draftProviderEntry = providers.find((p) => p.provider === draftProvider);
  const draftModelOptions: SearchableSelectOption[] = (
    draftProviderEntry?.models ?? []
  ).map((m) => ({
    value: m.id,
    label: m.label,
    notes: m.description,
    endAdornment: <TierBadge tier={m.tier as CostTier} />,
  }));
  const draftCredOptions = (credentialsByProvider[draftProvider] ?? []).map(
    (c) => ({ value: c.id, label: c.label }),
  );
  const providersWithCreds = useMemo(
    () =>
      providers.filter(
        (p) => (credentialsByProvider[p.provider]?.length ?? 0) > 0,
      ),
    [providers, credentialsByProvider],
  );

  // ---- Render --------------------------------------------------------------

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex h-[calc(100vh-220px)] min-h-[520px] gap-4"
    >
      {/* ===================== Painel lateral ===================== */}
      <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-muted/30 p-3">
        <Button
          type="button"
          size="sm"
          onClick={handleNewSession}
          disabled={isLoadingSession || !hasProviders}
          className="h-9 w-full cursor-pointer text-xs"
        >
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          Nova sessão
        </Button>

        {/* Tabs Configuração / Histórico — alterna o painel inferior */}
        {active ? (
          <div className="flex w-full items-center gap-0.5 rounded-full border border-border bg-background/40 p-0.5">
            {(["config", "history"] as const).map((p) => {
              const selected = sidePanel === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSidePanel(p)}
                  className={cn(
                    "flex h-8 flex-1 cursor-pointer items-center justify-center rounded-full text-xs font-medium transition-all",
                    selected
                      ? "bg-violet-500/15 text-violet-600 dark:text-violet-300"
                      : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                  )}
                >
                  {p === "config" ? "Configuração" : "Histórico"}
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Config da sessão ativa */}
        {active && sidePanel === "config" ? (
          <div className="space-y-3 rounded-xl border border-border bg-card p-3">
            <p className="text-sm font-semibold text-foreground">
              Configuração da sessão
            </p>
            {providersWithCreds.length > 0 ? (
              <>
                {/* Nome da sessão — campo no topo, antes de Provedor */}
                <div className="space-y-1">
                  <label
                    htmlFor="pg-session-name"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Nome da sessão
                  </label>
                  {/* Input direto — Salvar fica no botão geral lá embaixo,
                      não precisa de check inline. */}
                  <Input
                    id="pg-session-name"
                    value={
                      renamingId === active.id
                        ? renameValue
                        : (active.title ?? "")
                    }
                    onFocus={() =>
                      renamingId !== active.id &&
                      startRename(active.id, active.title)
                    }
                    onChange={(e) => setRenameValue(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(active.id);
                      if (e.key === "Escape") cancelRename();
                    }}
                    onBlur={() =>
                      renamingId === active.id && commitRename(active.id)
                    }
                    className="h-9 text-xs"
                    placeholder="Nome da sessão"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Provedor
                  </label>
                  <CustomSelect
                    aria-label="Provedor da sessão"
                    value={draftProvider}
                    onChange={handleDraftProviderChange}
                    triggerClassName="h-9 w-full text-xs"
                    placeholder="Selecione…"
                    options={providersWithCreds.map((p) => ({
                      value: p.provider,
                      label: p.label,
                    }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Modelo
                  </label>
                  <SearchableSelect
                    value={draftModel}
                    onChange={handleDraftModelChange}
                    options={draftModelOptions}
                    placeholder="Selecionar modelo"
                    searchPlaceholder="Buscar modelo…"
                    triggerClassName="h-9 w-full text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Chave de API
                  </label>
                  <CustomSelect
                    aria-label="Chave de API da sessão"
                    value={draftCredentialId}
                    onChange={handleDraftCredentialChange}
                    triggerClassName="h-9 w-full text-xs"
                    placeholder="Selecione…"
                    options={draftCredOptions}
                  />
                </div>
                {draftDirty ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSaveConfig}
                    disabled={!draftValid || savingConfig}
                    className="mt-1 h-8 w-full text-xs"
                  >
                    {savingConfig ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Salvar
                  </Button>
                ) : null}
              </>
            ) : (
              <Link
                href="/agente/chaves"
                className="flex items-center justify-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-500/20 dark:text-violet-300"
              >
                <KeyRound className="h-3.5 w-3.5" aria-hidden />
                Nova chave
              </Link>
            )}

            {/* Consumo da sessão — destacado (atualiza ao vivo a cada done SSE) */}
            <div className="mt-4 rounded-xl border border-violet-500/30 bg-violet-500/[0.04] px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Consumo da sessão
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  ≈ {usdFmt.format(active.costUsd)}
                </span>
              </div>
              <p className="mt-1 text-sm font-semibold tabular-nums text-violet-700 dark:text-violet-300">
                {brlFmt.format(active.costBrl)}
              </p>
              <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-400 transition-all"
                  style={{
                    width: `${Math.min(100, active.costBrl > 0 ? Math.max(6, (active.costBrl / 1) * 100) : 0)}%`,
                  }}
                />
              </div>
            </div>

          </div>
        ) : null}

        {/* Histórico de sessões — só visível quando sidePanel="history" ou sem sessão ativa */}
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            active && sidePanel !== "history" && "hidden",
          )}
        >
          <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Histórico
          </p>
          <div className="flex-1 space-y-1 overflow-y-auto">
            {sessions.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground">
                Nenhuma sessão ainda.
              </p>
            ) : (
              sessions.map((s) => {
                const isRenaming = renamingId === s.id;
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "group flex items-center gap-1 rounded-lg border px-2 py-1.5 transition-colors",
                      active?.id === s.id
                        ? "border-violet-500/50 bg-violet-500/10"
                        : "border-transparent hover:bg-muted",
                    )}
                  >
                    {isRenaming ? (
                      <div className="flex flex-1 items-center gap-1">
                        <Input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.currentTarget.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename(s.id);
                            if (e.key === "Escape") cancelRename();
                          }}
                          className="h-7 px-2 text-xs"
                          placeholder="Nome da sessão"
                          aria-label="Renomear sessão"
                        />
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <button
                                type="button"
                                onClick={() => commitRename(s.id)}
                                aria-label="Salvar nome"
                                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-emerald-600 transition-colors hover:bg-emerald-500/10"
                              >
                                <Check className="h-3.5 w-3.5" aria-hidden />
                              </button>
                            }
                          />
                          <TooltipContent>Salvar (Enter)</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <button
                                type="button"
                                onClick={cancelRename}
                                aria-label="Cancelar"
                                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
                              >
                                <X className="h-3.5 w-3.5" aria-hidden />
                              </button>
                            }
                          />
                          <TooltipContent>Cancelar (Esc)</TooltipContent>
                        </Tooltip>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenSession(s.id)}
                          className="flex-1 cursor-pointer space-y-1.5 py-1 text-left"
                        >
                          <p className="truncate text-sm font-semibold text-foreground">
                            {s.title ? (
                              <>
                                {s.title}
                                {s.provider && s.model ? (
                                  <span className="ml-1 font-normal text-muted-foreground">
                                    · {s.provider} {s.model}
                                  </span>
                                ) : null}
                              </>
                            ) : (
                              `Sessão · ${s.provider ?? ""} ${s.model || "—"}`.trim()
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {dateTimeFmt.format(new Date(s.createdAt))}
                          </p>
                          <p className="flex items-baseline gap-1.5 tabular-nums">
                            <span className="text-xs text-muted-foreground">
                              Consumo:
                            </span>
                            <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                              {brlFmt.format(s.costBrl)}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              · {usdFmt.format(s.costUsd)}
                            </span>
                          </p>
                        </button>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <button
                                type="button"
                                onClick={async () => {
                                  // Abre a sessão (se ainda não estiver aberta)
                                  // e leva para a aba Configuração para edição
                                  // completa de nome / provedor / modelo / chave.
                                  if (active?.id !== s.id) {
                                    await handleOpenSession(s.id);
                                  }
                                  setSidePanel("config");
                                }}
                                aria-label="Editar sessão"
                                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                              >
                                <Pencil className="h-3.5 w-3.5" aria-hidden />
                              </button>
                            }
                          />
                          <TooltipContent>Editar</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <button
                                type="button"
                                onClick={() => handleDeleteSession(s.id)}
                                aria-label="Excluir sessão"
                                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                              </button>
                            }
                          />
                          <TooltipContent>Excluir</TooltipContent>
                        </Tooltip>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </aside>

      {/* ===================== Área principal ===================== */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
        {view === "prompt" && active ? (
          <PlaygroundSessionPrompt
            sessionId={active.id}
            initial={active.promptSnapshot}
            onBack={handlePromptSaved}
          />
        ) : (
          <>
            {/* Cabeçalho do chat */}
            <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
              <MessageSquare className="h-4 w-4 shrink-0 text-violet-500" aria-hidden />
              <span className="truncate text-sm font-medium">
                {active
                  ? `Playground · ${activeProvider?.label ?? active.provider} · ${active.model}`
                  : "Playground do Agente Nex"}
              </span>
              {active ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        onClick={() => setView("prompt")}
                        className="ml-auto inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:text-violet-300"
                      >
                        <FileText className="h-3.5 w-3.5" aria-hidden />
                        Prompt da sessão
                      </button>
                    }
                  />
                  <TooltipContent>
                    Editar o prompt usado nesta sessão de teste
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </div>

            {/* Mensagens */}
            <div
              className="flex-1 overflow-y-auto px-4 py-3"
              aria-live="polite"
              aria-label="Conversa do playground"
            >
              {!providersLoaded ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Carregando…
                </div>
              ) : !active ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 bg-muted/20 px-6 py-10 text-center">
                  <MessageSquare className="h-8 w-8 text-muted-foreground" aria-hidden />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {hasProviders
                        ? "Crie uma sessão para testar o Agente Nex"
                        : "Cadastre uma chave de API"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {hasProviders
                        ? 'Use "Nova sessão" no painel ao lado.'
                        : "O playground precisa de pelo menos uma chave cadastrada."}
                    </p>
                  </div>
                  {hasProviders ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleNewSession}
                      disabled={isLoadingSession}
                      className="h-8 cursor-pointer text-xs"
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                      Nova sessão
                    </Button>
                  ) : (
                    <Link
                      href="/agente/chaves"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-500/20 dark:text-violet-300"
                    >
                      <KeyRound className="h-3.5 w-3.5" aria-hidden />
                      Ir para Chaves de API
                    </Link>
                  )}
                </div>
              ) : items.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <MessageSquare className="h-8 w-8 text-muted-foreground" aria-hidden />
                  <p className="text-sm font-medium text-foreground">
                    Comece uma conversa de teste
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Esta sessão é salva e marcada como Playground no Consumo.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((item, idx) => {
                    const isLastAssistant =
                      item.role === "assistant" &&
                      idx === items.length - 1 &&
                      !isSending;
                    const showTag =
                      (item.role === "assistant" || item.role === "user") &&
                      ((item.provider && item.model) ||
                        (item.requestKind && item.requestKind !== "texto"));
                    return (
                      <React.Fragment key={item.id}>
                        <AgentMessage
                          role={item.role}
                          content={item.content}
                          toolName={item.toolName}
                          streaming={item.streaming}
                        />
                        {showTag ? (
                          <MessageMetaTag
                            provider={item.provider ?? null}
                            model={item.model ?? null}
                            requestKind={item.requestKind ?? null}
                            providerLabel={
                              providers.find((p) => p.provider === item.provider)
                                ?.label ?? item.provider ?? ""
                            }
                            alignRight={item.role === "user"}
                          />
                        ) : null}
                        {isLastAssistant &&
                        item.suggestions &&
                        item.suggestions.length > 0 ? (
                          <SuggestionsBar
                            suggestions={item.suggestions}
                            onPick={(s) => handlePickSuggestion(item.id, s)}
                          />
                        ) : null}
                      </React.Fragment>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input bar (G4 + D8 + D9) — anexo+mic dentro do MessageInput */}
            {active ? (
              <footer className="shrink-0 border-t border-border bg-background/80 px-4 pb-4 pt-3">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendClick();
                  }}
                  className="flex items-center gap-2"
                >
                  <div className="min-w-0 flex-1">
                    {isRecording ? (
                      <div className="flex min-h-9 items-center rounded-xl border border-violet-500/40 bg-violet-500/5 px-3 py-1">
                        {audioInputEnabled ? (
                          <AudioRecorder
                            ref={recorderRef}
                            mode="embedded"
                            onSend={(blob) => {
                              void handleSendAudio(blob);
                            }}
                            onRecordingStateChange={setIsRecording}
                          />
                        ) : null}
                      </div>
                    ) : (
                      <MessageInput
                        value={message}
                        onChange={setMessage}
                        onSend={() => void submitMessage(message)}
                        disabled={isSending}
                        placeholder="Pergunte ao Agente Nex…"
                        aria-label="Mensagem para o Agente Nex"
                        maxRows={6}
                        leftSlot={
                          <AttachMenu
                            disabled={isSending}
                            onPick={defaultAttachHandler}
                          />
                        }
                        rightSlot={
                          audioInputEnabled && !audioFlight ? (
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void recorderRef.current?.start();
                                    }}
                                    aria-label="Gravar áudio"
                                    className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                                  >
                                    <Mic className="h-4 w-4" />
                                  </button>
                                }
                              />
                              <TooltipContent>Gravar áudio</TooltipContent>
                            </Tooltip>
                          ) : null
                        }
                        id="playground-input"
                      />
                    )}
                    {audioInputEnabled && !isRecording ? (
                      <div className="sr-only" aria-hidden>
                        <AudioRecorder
                          ref={recorderRef}
                          mode="embedded"
                          onSend={(blob) => {
                            void handleSendAudio(blob);
                          }}
                          onRecordingStateChange={setIsRecording}
                        />
                      </div>
                    ) : null}
                  </div>

                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="submit"
                          aria-label={isRecording ? "Enviar áudio" : "Enviar pergunta"}
                          disabled={isRecording ? false : !canSubmit || audioFlight}
                          className={cn(
                            "flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center self-center rounded-xl",
                            "bg-gradient-to-br from-violet-600 to-violet-500 text-white shadow-md shadow-violet-600/30",
                            "transition-all hover:from-violet-500 hover:to-violet-400 hover:shadow-lg",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50",
                            "disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
                          )}
                        >
                          {isSending ? (
                            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                          ) : (
                            <Send className="h-4 w-4" strokeWidth={2.25} />
                          )}
                        </button>
                      }
                    />
                    <TooltipContent>Enviar mensagem (Enter)</TooltipContent>
                  </Tooltip>
                </form>
                {overLimit ? (
                  <p className="mt-1.5 px-1 text-[11px] text-destructive">
                    Mensagem acima de {MAX_INPUT_LEN} caracteres.
                  </p>
                ) : (
                  <p
                    className={cn(
                      "mt-1.5 px-1 text-[11px] text-muted-foreground transition-opacity",
                      isRecording ? "invisible" : "visible",
                    )}
                  >
                    Enter envia · Shift+Enter quebra linha
                  </p>
                )}
              </footer>
            ) : null}
          </>
        )}
      </section>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// MessageMetaTag (D5) — badge "provedor · modelo · tipo" por mensagem
// ---------------------------------------------------------------------------

function MessageMetaTag({
  provider,
  model,
  requestKind,
  providerLabel,
  alignRight,
}: {
  provider: string | null;
  model: string | null;
  requestKind: string | null;
  providerLabel: string;
  alignRight?: boolean;
}) {
  const KIND_LABELS: Record<string, string> = {
    texto: "Texto",
    audio: "Áudio",
    imagem: "Imagem",
    arquivo: "Arquivo",
  };
  const KIND_STYLES: Record<string, string> = {
    texto: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
    audio: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    imagem: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    arquivo: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  };
  return (
    <div
      className={cn(
        "mt-0.5 flex flex-wrap items-center gap-1.5",
        alignRight ? "justify-end" : "justify-start",
      )}
    >
      {provider && model ? (
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
          {providerLabel} · <span className="ml-1 font-mono">{model}</span>
        </span>
      ) : null}
      {requestKind && requestKind !== "texto" ? (
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
            KIND_STYLES[requestKind] ?? "bg-muted text-muted-foreground",
          )}
        >
          {KIND_LABELS[requestKind] ?? requestKind}
        </span>
      ) : null}
    </div>
  );
}
