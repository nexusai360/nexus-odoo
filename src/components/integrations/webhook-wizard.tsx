"use client"

import * as React from "react"
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  Lock,
  MessageCircle,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { StepIndicator } from "@/components/ui/step-indicator"
import { SecretRevealStep } from "@/components/ui/secret-reveal-step"
import { Textarea } from "@/components/ui/textarea"
import { WebhookEventSelector } from "@/components/integrations/webhook-event-selector"
import { WhatsappInboundHelp } from "@/components/integrations/whatsapp-inbound-help"
import {
  createWebhook,
  type CreateWebhookInput,
  type CreatedWebhook,
  type WebhookEventName,
  type WebhookMethod,
} from "@/lib/actions/webhooks"

/** Métodos HTTP disponíveis para seleção (genérico/saída). */
const HTTP_METHODS: WebhookMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]

/** Slug seguro: mesma regra do schema da Server Action. */
const PATH_RE = /^[a-z0-9][a-z0-9-/]*$/

/** Tipo de webhook escolhido no passo 1 (cada um com experiência própria). */
export type WebhookKind = "whatsapp" | "inbound_generic" | "outbound"

interface KindMeta {
  id: WebhookKind
  icon: LucideIcon
  title: string
  description: string
  /** Cores do tipo. `badge` = classes da tag/pílula (cabeçalho/navegação). */
  accent: { icon: string; ring: string; bg: string; badge: string }
}

const KINDS: KindMeta[] = [
  {
    id: "whatsapp",
    icon: MessageCircle,
    title: "Receber mensagens do WhatsApp",
    description:
      "Recebe as mensagens do WhatsApp e alimenta o Agente Nex. A plataforma cuida da validação e da resposta.",
    accent: {
      icon: "text-green-500",
      ring: "ring-green-500/50 border-green-500/40",
      bg: "bg-green-500/5",
      badge: "bg-green-500/15 text-green-700 dark:text-green-400",
    },
  },
  {
    id: "inbound_generic",
    icon: ArrowDownToLine,
    title: "Receber eventos",
    description:
      "Endpoint genérico: outro sistema chama este endereço quando algo acontece e a plataforma escuta.",
    accent: {
      icon: "text-sky-500",
      ring: "ring-sky-500/50 border-sky-500/40",
      bg: "bg-sky-500/5",
      badge: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
    },
  },
  {
    id: "outbound",
    icon: ArrowUpFromLine,
    title: "Enviar eventos",
    description:
      "A plataforma dispara uma chamada para um endereço externo quando um evento ocorre aqui dentro.",
    accent: {
      icon: "text-violet-500",
      ring: "ring-violet-500/50 border-violet-500/40",
      bg: "bg-violet-500/5",
      badge: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
    },
  },
]

/** Rótulo curto do tipo (para navegação/cabeçalho). */
export function webhookKindLabel(kind: WebhookKind): string {
  return kindMeta(kind).title
}

/** Classes da tag/pílula do tipo (segue a cor do tipo: verde/azul/roxo). */
export function webhookKindBadgeClass(kind: WebhookKind): string {
  return kindMeta(kind).accent.badge
}

/** Subtítulo personalizado por tipo (cabeçalho da tela). */
export function webhookKindSubtitle(kind: WebhookKind | null): string {
  if (kind === "whatsapp") return "Configure um webhook para receber mensagens do WhatsApp."
  if (kind === "inbound_generic") return "Configure um webhook para receber eventos de outros sistemas."
  if (kind === "outbound") return "Configure um webhook para enviar eventos para outros sistemas."
  return "Escolha o tipo de webhook que você quer criar."
}

function kindMeta(kind: WebhookKind): KindMeta {
  return KINDS.find((k) => k.id === kind) ?? KINDS[0]
}

export interface WebhookWizardProps {
  embedded?: boolean
  /** URL base read-only exibida como prefixo dos webhooks de entrada. */
  inboundBaseUrl?: string
  onCreated: (webhook: CreatedWebhook) => void
  onCancel?: () => void
  /** Notifica o tipo escolhido (para a navegação/cabeçalho da tela). */
  onKindChange?: (kind: WebhookKind | null) => void
}

type Step = 1 | 2 | 3

/**
 * Wizard de criação de webhook. Passo 1: escolha do TIPO (WhatsApp / outros
 * dados / enviar eventos), cada um com experiência própria. Passo 2:
 * configuração personalizada pelo tipo (com um banner de identificação em
 * destaque). Passo 3: revela o secret uma única vez.
 */
export function WebhookWizard({
  embedded = false,
  inboundBaseUrl = "https://app.nexus-odoo.com/api/hooks/",
  onCreated,
  onCancel,
  onKindChange,
}: WebhookWizardProps) {
  const [step, setStep] = React.useState<Step>(1)
  const [kind, setKindState] = React.useState<WebhookKind | null>(null)
  const setKind = (k: WebhookKind | null) => {
    setKindState(k)
    onKindChange?.(k)
  }
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [path, setPath] = React.useState("")
  const [targetUrl, setTargetUrl] = React.useState("")
  const [methods, setMethods] = React.useState<WebhookMethod[]>(["POST"])
  const [events, setEvents] = React.useState<WebhookEventName[]>(["agent_reply"])
  const [businessId, setBusinessId] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [created, setCreated] = React.useState<CreatedWebhook | null>(null)

  const isWhatsapp = kind === "whatsapp"
  const isOutbound = kind === "outbound"
  const direction = isOutbound ? "outbound" : "inbound"

  function toggleMethod(m: WebhookMethod) {
    setMethods((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
    )
  }

  function handleEnterAdvance(e: React.FormEvent) {
    e.preventDefault()
    if (step === 1 && kind) setStep(2)
  }

  const step2Valid =
    name.trim().length > 0 &&
    (isOutbound
      ? isValidUrl(targetUrl.trim()) && methods.length > 0
      : PATH_RE.test(path.trim()) &&
        (!isWhatsapp || businessId.trim().length > 0) &&
        (isWhatsapp || methods.length > 0))

  async function handleCreate() {
    if (!kind) return
    setSubmitting(true)
    setError(null)
    const input: CreateWebhookInput = {
      direction,
      name: name.trim(),
      description: description.trim() || null,
      path: direction === "inbound" ? path.trim() : null,
      targetUrl: isOutbound ? targetUrl.trim() : null,
      // WhatsApp usa POST fixo; demais usam o que foi escolhido.
      methods: isWhatsapp ? ["POST"] : methods,
      events: isOutbound ? events : undefined,
      isWhatsappReceiver: direction === "inbound" ? isWhatsapp : undefined,
      businessId: isWhatsapp ? businessId.trim() : undefined,
    }
    const res = await createWebhook(input)
    setSubmitting(false)
    if (res.success) {
      setCreated(res.data)
      setStep(3)
    } else {
      setError(res.error)
    }
  }

  return (
    <form
      onSubmit={handleEnterAdvance}
      className={cn("space-y-6", !embedded && "rounded-xl border border-border p-6")}
    >
      <StepIndicator steps={["Tipo", "Configuração", "Conclusão"]} current={step} />

      {/* Passo 1, Tipo */}
      {step === 1 && (
        <div className="space-y-5">
          <div className="space-y-1">
            <h3 className="text-sm font-medium">Tipo do webhook</h3>
            <p className="text-xs text-muted-foreground">
              Escolha o que a plataforma vai fazer. Cada tipo tem a sua configuração.
            </p>
          </div>
          <div className="grid gap-3" data-tour="webhook-wizard-tipo">
            {KINDS.map((k) => (
              <KindCard
                key={k.id}
                meta={k}
                selected={kind === k.id}
                onSelect={() => setKind(k.id)}
              />
            ))}
          </div>
          <div className="flex justify-end gap-2 border-t border-border/60 pt-5">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel} className="cursor-pointer">
                Cancelar
              </Button>
            )}
            <Button
              type="button"
              disabled={!kind}
              onClick={() => setStep(2)}
              className="cursor-pointer"
            >
              Próximo
            </Button>
          </div>
        </div>
      )}

      {/* Passo 2, Configuração (personalizada pelo tipo) */}
      {step === 2 && kind && (
        <div className="space-y-5">
          <KindBanner kind={kind} />

          <div className="space-y-1.5">
            <Label htmlFor="wh-name">Nome</Label>
            <Input
              id="wh-name"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder={isWhatsapp ? "Ex.: WhatsApp da loja matriz" : "Ex.: Receptor de pedidos"}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wh-desc">Descrição</Label>
            <Textarea
              id="wh-desc"
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
              placeholder="O que este webhook faz (opcional)."
              rows={2}
            />
          </div>

          {isOutbound ? (
            <div className="space-y-1.5">
              <Label htmlFor="wh-target">URL de destino</Label>
              <Input
                id="wh-target"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.currentTarget.value)}
                placeholder="https://exemplo.com/webhook/abc"
                aria-invalid={targetUrl.length > 0 && !isValidUrl(targetUrl.trim())}
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="wh-path">Endereço (URL)</Label>
              <div className="flex items-stretch">
                <span className="flex items-center rounded-l-lg border border-r-0 border-input bg-muted px-2.5 text-xs text-muted-foreground">
                  {inboundBaseUrl}
                </span>
                <Input
                  id="wh-path"
                  value={path}
                  onChange={(e) => setPath(e.currentTarget.value)}
                  placeholder={isWhatsapp ? "whatsapp/loja-matriz" : "meu-sistema/eventos"}
                  className="rounded-l-none"
                  aria-invalid={path.length > 0 && !PATH_RE.test(path.trim())}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Você define o final do endereço. Apenas minúsculas, números, hífen e barra. Precisa ser único.
              </p>
            </div>
          )}

          {isWhatsapp && (
            <div className="space-y-1.5">
              <Label htmlFor="wh-business">Número da empresa</Label>
              <Input
                id="wh-business"
                value={businessId}
                onChange={(e) => setBusinessId(e.currentTarget.value)}
                placeholder="Ex.: 558881008888"
                inputMode="numeric"
              />
              <p className="text-xs text-muted-foreground">
                Número do WhatsApp da empresa que recebe as mensagens. Identifica este webhook e não pode repetir.
              </p>
            </div>
          )}

          {/* Métodos: livres no genérico/saída; travado em POST no WhatsApp. */}
          {isWhatsapp ? (
            <div className="space-y-1.5">
              <Label>Método HTTP</Label>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-xs font-semibold text-foreground">
                  <Lock className="h-3 w-3 text-muted-foreground" aria-hidden />
                  POST
                </span>
                <span className="text-xs text-muted-foreground">
                  Definido automaticamente.
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Métodos HTTP</Label>
              <div className="flex flex-wrap gap-3">
                {HTTP_METHODS.map((m) => (
                  <label key={m} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox checked={methods.includes(m)} onCheckedChange={() => toggleMethod(m)} />
                    {m}
                  </label>
                ))}
              </div>
            </div>
          )}

          {isOutbound && (
            <div className="space-y-2">
              <Label>Eventos</Label>
              <p className="text-xs text-muted-foreground">
                Quais eventos da plataforma disparam este webhook.
              </p>
              <WebhookEventSelector value={events} onChange={setEvents} />
              {events.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Sem nenhum evento marcado, este webhook não receberá nada.
                </p>
              )}
            </div>
          )}

          {isWhatsapp && <WhatsappInboundHelp inboundBaseUrl={inboundBaseUrl} path={path} />}

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-between gap-2 border-t border-border/60 pt-5">
            <Button type="button" variant="outline" onClick={() => setStep(1)} className="cursor-pointer">
              Voltar
            </Button>
            <Button
              type="button"
              disabled={!step2Valid || submitting}
              onClick={handleCreate}
              className="cursor-pointer"
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Criar webhook
            </Button>
          </div>
        </div>
      )}

      {/* Passo 3, Secret */}
      {step === 3 && created && (
        <div className="space-y-5">
          <div className="space-y-1">
            <h3 className="text-sm font-medium">Webhook criado</h3>
            <p className="text-xs text-muted-foreground">
              Guarde o token abaixo, ele é usado para validar as requisições.
            </p>
          </div>
          <SecretRevealStep
            secret={created.secretPlain}
            label="Token do webhook"
            onAcknowledge={() => onCreated(created)}
          />
        </div>
      )}
    </form>
  )
}

/** Banner de identificação do tipo escolhido (em destaque no passo 2). */
export function KindBanner({ kind }: { kind: WebhookKind }) {
  const meta = kindMeta(kind)
  const Icon = meta.icon
  return (
    <div className={cn("flex items-center gap-3 rounded-lg border p-3", meta.accent.ring, meta.accent.bg)}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background/60">
        <Icon className={cn("h-5 w-5", meta.accent.icon)} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{meta.title}</p>
        <p className="truncate text-xs text-muted-foreground">{meta.description}</p>
      </div>
    </div>
  )
}

function KindCard({
  meta,
  selected,
  onSelect,
}: {
  meta: KindMeta
  selected: boolean
  onSelect: () => void
}) {
  const Icon = meta.icon
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex items-start gap-3 rounded-lg border p-4 text-left transition-colors",
        selected
          ? cn("ring-1", meta.accent.ring, meta.accent.bg)
          : "border-border hover:bg-accent",
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background/60">
        <Icon className={cn("h-5 w-5", selected ? meta.accent.icon : "text-muted-foreground")} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block font-medium text-foreground">{meta.title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{meta.description}</span>
      </span>
    </button>
  )
}

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}
