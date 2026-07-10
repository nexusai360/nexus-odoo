"use client";

/**
 * Edição da Conexão com WhatsApp (SPEC §3.6): não é assistente, é a tela de
 * edição. Nome e descrição são DA conexão (gravados nas duas linhas);
 * Recebimento (endereço + número) e Envio (destino) editam a sua linha.
 *
 * Tokens: cada ponta rotaciona o seu, de forma independente; o valor novo é
 * exibido uma única vez. Se a conexão ainda não tem a ponta de envio (caso do
 * backfill), informar o destino cria a linha e revela o token de assinatura.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine, Loader2, Lock, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SecretRevealStep } from "@/components/ui/secret-reveal-step";
import { PhoneInput } from "@/components/ui/phone-input";
import { KindBanner } from "@/components/integrations/webhook-wizard";
import { WhatsappInboundHelp } from "@/components/integrations/whatsapp-inbound-help";
import { ConexaoEnvioHelp } from "@/components/integrations/conexao-envio-help";
import {
  type Country,
  DEFAULT_COUNTRY,
  composeE164,
  splitE164,
  validateNationalPhone,
} from "@/lib/whatsapp/countries";
import { mesmoNome } from "@/lib/integrations/nome-webhook";
import {
  atualizarConexaoWhatsapp,
  rotacionarTokenConexao,
  type ConexaoWhatsappListItem,
  type PontaDaConexao,
} from "@/lib/actions/whatsapp-connection";

const PATH_RE = /^[a-z0-9][a-z0-9-/]*$/;

export function ConexaoEditForm({
  conexao,
  inboundBaseUrl,
  existingPaths = [],
  existingBusinessIds = [],
  existingNames = [],
}: {
  conexao: ConexaoWhatsappListItem;
  inboundBaseUrl: string;
  /** Nomes de OUTROS webhooks/conexões, para a trava de nome único. */
  existingNames?: string[];
  /** Slugs de OUTROS webhooks (exclui esta conexão), para unicidade. */
  existingPaths?: string[];
  /** business_id de OUTRAS conexões (exclui esta), para unicidade. */
  existingBusinessIds?: string[];
}) {
  const router = useRouter();

  const [name, setName] = React.useState(conexao.name ?? "");
  const [description, setDescription] = React.useState(conexao.description ?? "");
  const [path, setPath] = React.useState(conexao.path ?? "");
  const snapNumero = splitE164(conexao.businessId ? `+${conexao.businessId}` : "");
  const [bizCountry, setBizCountry] = React.useState<Country>(snapNumero.country ?? DEFAULT_COUNTRY);
  const [bizNational, setBizNational] = React.useState(snapNumero.nationalDigits);
  const [targetUrl, setTargetUrl] = React.useState(conexao.targetUrl ?? "");

  const [saving, setSaving] = React.useState(false);
  const [rotating, setRotating] = React.useState<PontaDaConexao | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [revealed, setRevealed] = React.useState<{ label: string; secret: string } | null>(null);
  const [fecharAoConfirmar, setFecharAoConfirmar] = React.useState(false);

  // ── Validações ──────────────────────────────────────────────────────────────
  const pathTrim = path.trim();
  const pathFormatOk = PATH_RE.test(pathTrim);
  const pathDuplicate = pathFormatOk && existingPaths.includes(pathTrim);
  const pathValid = pathFormatOk && !pathDuplicate;

  const businessIdDigits = bizNational ? composeE164(bizCountry.dial, bizNational).slice(1) : "";
  const bizFormatError = validateNationalPhone(bizCountry, bizNational);
  const bizDuplicate = bizFormatError === null && existingBusinessIds.includes(businessIdDigits);
  const bizValid = bizFormatError === null && !bizDuplicate;

  const urlTrim = targetUrl.trim();
  const urlValid = urlTrim.length === 0 || isValidUrl(urlTrim);

  const nomeDuplicado = existingNames.some((n) => mesmoNome(n, name));
  const formValid =
    name.trim().length > 0 && !nomeDuplicado && pathValid && bizValid && urlValid;

  async function handleSalvar() {
    setSaving(true);
    setError(null);
    const r = await atualizarConexaoWhatsapp(conexao.connectionId, {
      name: name.trim(),
      description: description.trim() || null,
      path: pathTrim,
      businessId: businessIdDigits,
      targetUrl: urlTrim || null,
    });
    setSaving(false);
    if (!r.success) {
      setError(r.error);
      return;
    }
    if (r.data.novoTokenAssinatura) {
      // A ponta de envio acabou de nascer: o token aparece UMA vez, aqui.
      setRevealed({ label: "Token de assinatura", secret: r.data.novoTokenAssinatura });
      setFecharAoConfirmar(true);
      return;
    }
    toast.success("Conexão atualizada");
    router.push("/integracoes/webhooks");
    router.refresh();
  }

  function handleRotacionar(ponta: PontaDaConexao) {
    setRotating(ponta);
    setError(null);
    rotacionarTokenConexao(conexao.connectionId, ponta).then((r) => {
      setRotating(null);
      if (r.success) {
        setRevealed({
          label: ponta === "recebimento" ? "Token de recebimento" : "Token de assinatura",
          secret: r.data.secretPlain,
        });
        setFecharAoConfirmar(false);
      } else {
        toast.error(r.error);
      }
    });
  }

  if (revealed) {
    return (
      <div className="space-y-5 rounded-xl border border-border p-6">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">{revealed.label} novo</h3>
          <p className="text-xs text-muted-foreground">
            Atualize o valor no seu ambiente: o antigo deixou de valer agora.
          </p>
        </div>
        <SecretRevealStep
          secret={revealed.secret}
          label={revealed.label}
          onAcknowledge={() => {
            setRevealed(null);
            if (fecharAoConfirmar) {
              toast.success("Conexão atualizada");
              router.push("/integracoes/webhooks");
              router.refresh();
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-xl border border-border p-6">
      <KindBanner kind="whatsapp" />

      <div className="space-y-1.5">
        <Label htmlFor="ce-name">Nome</Label>
        <Input
          id="ce-name"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          aria-invalid={nomeDuplicado}
        />
        {nomeDuplicado ? (
          <p className="text-xs text-destructive" role="alert">
            Já existe um webhook com esse nome. Escolha outro.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">O nome vale para as duas pontas da conexão.</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ce-desc">Descrição</Label>
        <Textarea
          id="ce-desc"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          rows={2}
        />
      </div>

      {/* ── Recebimento ─────────────────────────────────────────────────────── */}
      <section className="space-y-4 rounded-lg border border-border p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ArrowDownToLine className="h-4 w-4 text-green-500" aria-hidden />
          Recebimento
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="ce-path">Endereço (URL)</Label>
          <div
            className={cn(
              "flex h-9 items-stretch overflow-hidden rounded-lg border bg-transparent transition-colors dark:bg-input/30",
              !pathValid && pathTrim.length > 0
                ? "border-destructive focus-within:border-destructive focus-within:ring-2 focus-within:ring-destructive/40"
                : "border-input focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50",
            )}
          >
            <span className="flex items-center whitespace-nowrap bg-muted px-2.5 text-xs text-muted-foreground">
              {inboundBaseUrl}
            </span>
            <div className="my-1.5 w-px shrink-0 bg-border" aria-hidden />
            <input
              id="ce-path"
              value={path}
              onChange={(e) => setPath(e.currentTarget.value)}
              aria-invalid={!pathValid && pathTrim.length > 0}
              className="min-w-0 flex-1 bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          {!pathValid && pathTrim.length > 0 && (
            <p className="text-xs text-destructive" role="alert">
              {pathDuplicate
                ? "Já existe um webhook de entrada com esse caminho."
                : "Apenas minúsculas, números, hífen e barra."}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ce-business">Número da empresa</Label>
          <PhoneInput
            country={bizCountry}
            onCountryChange={setBizCountry}
            national={bizNational}
            onNationalChange={setBizNational}
            invalid={!bizValid && bizNational.length > 0}
            inputId="ce-business"
          />
          {!bizValid && bizNational.length > 0 && (
            <p className="text-xs text-destructive" role="alert">
              {bizDuplicate ? "Já existe uma conexão de WhatsApp com esse número." : bizFormatError}
            </p>
          )}
        </div>

        <TokenRotacao
          label="Token de recebimento"
          hint={conexao.secretHintRecebimento}
          rotating={rotating === "recebimento"}
          onRotate={() => handleRotacionar("recebimento")}
        />

        <WhatsappInboundHelp inboundBaseUrl={inboundBaseUrl} path={pathTrim} defaultOpen={false} />
      </section>

      {/* ── Envio ───────────────────────────────────────────────────────────── */}
      <section className="space-y-4 rounded-lg border border-border p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ArrowUpFromLine className="h-4 w-4 text-green-500" aria-hidden />
          Envio
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="ce-target">URL de destino</Label>
          <Input
            id="ce-target"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.currentTarget.value)}
            placeholder="https://seu-ambiente.exemplo.com/whatsapp/resposta"
            aria-invalid={!urlValid}
          />
          {!urlValid ? (
            <p className="text-xs text-destructive" role="alert">
              Informe uma URL válida (http ou https).
            </p>
          ) : conexao.outboundId === null ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Esta conexão ainda não tem a ponta de envio. Informe a URL e salve: o token de
              assinatura será exibido uma única vez.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              A resposta desta conexão é entregue somente neste endereço.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Método HTTP</Label>
          <span className="inline-flex items-center gap-1 rounded-lg border border-violet-500/50 bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-600 dark:text-violet-400">
            <Lock className="h-3 w-3" strokeWidth={1.5} aria-hidden />
            POST
          </span>
        </div>

        {conexao.outboundId !== null && (
          <TokenRotacao
            label="Token de assinatura"
            hint={conexao.secretHintAssinatura}
            rotating={rotating === "assinatura"}
            onRotate={() => handleRotacionar("assinatura")}
          />
        )}

        <ConexaoEnvioHelp defaultOpen={false} />
      </section>

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex justify-between gap-2 border-t border-border/60 pt-5">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/integracoes/webhooks")}
          className="cursor-pointer"
        >
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={!formValid || saving}
          onClick={handleSalvar}
          className="cursor-pointer"
        >
          {saving && <Loader2 className="size-4 animate-spin" />}
          Salvar alterações
        </Button>
      </div>
    </div>
  );
}

function TokenRotacao({
  label,
  hint,
  rotating,
  onRotate,
}: {
  label: string;
  hint: string | null;
  rotating: boolean;
  onRotate: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <code className="flex h-9 min-w-0 flex-1 items-center rounded-lg border border-input bg-background px-3 font-mono text-xs text-muted-foreground">
          {hint ?? "••••"}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={rotating}
          onClick={onRotate}
          className="h-9 cursor-pointer"
        >
          {rotating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RotateCcw className="size-4" />
          )}
          Rotacionar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Rotacionar gera um valor novo na hora e invalida o atual. As duas pontas são independentes.
      </p>
    </div>
  );
}

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
