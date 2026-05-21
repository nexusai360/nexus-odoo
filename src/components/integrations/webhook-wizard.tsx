"use client"

import * as React from "react"
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { StepIndicator } from "@/components/ui/step-indicator"
import { SecretRevealStep } from "@/components/ui/secret-reveal-step"
import {
  createWebhook,
  type CreateWebhookInput,
  type CreatedWebhook,
  type WebhookDirection,
  type WebhookMethod,
} from "@/lib/actions/webhooks"

/** Métodos HTTP disponíveis para seleção. */
const HTTP_METHODS: WebhookMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"]

/** Slug seguro: mesma regra do schema da Server Action. */
const PATH_RE = /^[a-z0-9][a-z0-9-/]*$/

export interface WebhookWizardProps {
  /**
   * Quando `true`, o wizard é renderizado para uso dentro de um `Dialog`
   * (sem padding/borda própria de página). Default `false`.
   */
  embedded?: boolean
  /** URL base read-only exibida como prefixo dos webhooks de entrada. */
  inboundBaseUrl?: string
  /** Disparado quando o webhook é criado e o usuário confirma o secret. */
  onCreated: (webhook: CreatedWebhook) => void
  /** Disparado quando o usuário cancela o wizard. */
  onCancel?: () => void
}

type Step = 1 | 2 | 3

/**
 * Wizard de criação de webhook, componente compartilhado entre a tela de
 * Webhooks e o passo embutido do wizard de instância WhatsApp (SPEC §4.5).
 *
 * Passo 1: direção (Entrada/Saída). Passo 2: configuração (path ou targetUrl
 * + métodos + nome). Passo 3: cria o webhook e exibe o secret via
 * `SecretRevealStep`, uma única vez.
 */
export function WebhookWizard({
  embedded = false,
  inboundBaseUrl = "https://app.nexus-odoo.com/api/hooks/",
  onCreated,
  onCancel,
}: WebhookWizardProps) {
  const [step, setStep] = React.useState<Step>(1)
  const [direction, setDirection] = React.useState<WebhookDirection | null>(null)
  const [name, setName] = React.useState("")
  const [path, setPath] = React.useState("")
  const [targetUrl, setTargetUrl] = React.useState("")
  const [methods, setMethods] = React.useState<WebhookMethod[]>(["POST"])
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [created, setCreated] = React.useState<CreatedWebhook | null>(null)

  function toggleMethod(m: WebhookMethod) {
    setMethods((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
    )
  }

  const step2Valid =
    name.trim().length > 0 &&
    methods.length > 0 &&
    (direction === "inbound"
      ? PATH_RE.test(path.trim())
      : isValidUrl(targetUrl.trim()))

  async function handleCreate() {
    if (!direction) return
    setSubmitting(true)
    setError(null)
    const input: CreateWebhookInput = {
      direction,
      name: name.trim(),
      path: direction === "inbound" ? path.trim() : null,
      targetUrl: direction === "outbound" ? targetUrl.trim() : null,
      methods,
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
    <div className={cn("space-y-5", !embedded && "rounded-xl border p-6")}>
      <StepIndicator steps={["Tipo", "Configuração", "Conclusão"]} current={step} />

      {/* Passo 1, Direção */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-sm font-medium">Tipo do webhook</h3>
            <p className="text-xs text-muted-foreground">
              Escolha se a plataforma vai receber ou enviar eventos.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2" data-tour="webhook-wizard-tipo">
            <DirectionCard
              selected={direction === "inbound"}
              onSelect={() => setDirection("inbound")}
              icon={<ArrowDownToLine className="size-5" />}
              title="Receber eventos"
              description="A plataforma expõe um endereço e fica escutando. Um sistema externo chama esse endereço quando algo acontece."
            />
            <DirectionCard
              selected={direction === "outbound"}
              onSelect={() => setDirection("outbound")}
              icon={<ArrowUpFromLine className="size-5" />}
              title="Enviar eventos"
              description="A plataforma dispara uma chamada para um endereço externo quando um evento ocorre aqui dentro."
            />
          </div>
          <div className="flex justify-end gap-2">
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                className="cursor-pointer"
              >
                Cancelar
              </Button>
            )}
            <Button
              type="button"
              disabled={!direction}
              onClick={() => setStep(2)}
              className="cursor-pointer"
            >
              Próximo
            </Button>
          </div>
        </div>
      )}

      {/* Passo 2, Configuração */}
      {step === 2 && direction && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="wh-name">Nome</Label>
            <Input
              id="wh-name"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder="Ex.: Receptor do WhatsApp"
            />
          </div>

          {direction === "inbound" ? (
            <div className="space-y-1.5">
              <Label htmlFor="wh-path">Caminho</Label>
              <div className="flex items-stretch">
                <span className="flex items-center rounded-l-lg border border-r-0 border-input bg-muted px-2.5 text-xs text-muted-foreground">
                  {inboundBaseUrl}
                </span>
                <Input
                  id="wh-path"
                  value={path}
                  onChange={(e) => setPath(e.currentTarget.value)}
                  placeholder="whatsapp/inbound"
                  className="rounded-l-none"
                  aria-invalid={path.length > 0 && !PATH_RE.test(path.trim())}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Apenas letras minúsculas, números, hífen e barra.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="wh-target">URL de destino</Label>
              <Input
                id="wh-target"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.currentTarget.value)}
                placeholder="https://n8n.example.com/webhook/abc"
                aria-invalid={
                  targetUrl.length > 0 && !isValidUrl(targetUrl.trim())
                }
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Métodos HTTP</Label>
            <div className="flex flex-wrap gap-3">
              {HTTP_METHODS.map((m) => (
                <label
                  key={m}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={methods.includes(m)}
                    onCheckedChange={() => toggleMethod(m)}
                  />
                  {m}
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(1)}
              className="cursor-pointer"
            >
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
        <div className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-sm font-medium">Webhook criado</h3>
            <p className="text-xs text-muted-foreground">
              Guarde o secret abaixo, ele é usado para validar as requisições.
            </p>
          </div>
          <SecretRevealStep
            secret={created.secretPlain}
            label="Secret do webhook"
            onAcknowledge={() => onCreated(created)}
          />
        </div>
      )}
    </div>
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

function DirectionCard({
  selected,
  onSelect,
  icon,
  title,
  description,
}: {
  selected: boolean
  onSelect: () => void
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex cursor-pointer flex-col gap-2 rounded-lg border p-4 text-left transition-colors",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-border hover:bg-accent",
      )}
    >
      <span className="flex items-center gap-2 font-medium">
        {icon}
        {title}
      </span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </button>
  )
}
