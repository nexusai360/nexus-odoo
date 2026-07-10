"use client";

/**
 * Assistente de criação da CONEXÃO COM WHATSAPP (SPEC §3.7): 4 etapas
 * (Recebimento · Envio · Revisão · Conclusão), renderizado pelo WebhookWizard
 * quando o tipo escolhido é "whatsapp".
 *
 * Os dois tokens são gerados NO SERVIDOR quando o assistente abre
 * (`prepararTokensConexao`, sem efeito colateral) e exibidos nas etapas onde o
 * usuário precisa deles; só passam a valer quando a conexão é criada
 * (SPEC §3.8). Recarregar a página gera tokens novos.
 */

import * as React from "react";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StepIndicator } from "@/components/ui/step-indicator";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  type Country,
  DEFAULT_COUNTRY,
  composeE164,
  validateNationalPhone,
} from "@/lib/whatsapp/countries";
import { WhatsappInboundHelp, CopyButton } from "@/components/integrations/whatsapp-inbound-help";
import { ConexaoEnvioHelp } from "@/components/integrations/conexao-envio-help";
import {
  prepararTokensConexao,
  criarConexaoWhatsapp,
  type TokensDaConexao,
} from "@/lib/actions/whatsapp-connection";

/** Slug seguro: mesma regra do schema da Server Action. */
const PATH_RE = /^[a-z0-9][a-z0-9-/]*$/;

type Etapa = 1 | 2 | 3 | 4;

const ETAPAS = ["Recebimento", "Envio", "Revisão", "Conclusão"];

export interface ConexaoWhatsappWizardProps {
  /** URL base read-only exibida como prefixo do endereço de recebimento. */
  inboundBaseUrl: string;
  /** Slugs (path) já cadastrados, para validar unicidade em tempo real. */
  existingPaths: string[];
  /** business_id já cadastrados, para validar unicidade em tempo real. */
  existingBusinessIds: string[];
  /** Volta para a seleção de tipo. */
  onBack: () => void;
  /** Conexão criada e tokens confirmados: fecha o fluxo. */
  onDone: () => void;
}

export function ConexaoWhatsappWizard({
  inboundBaseUrl,
  existingPaths,
  existingBusinessIds,
  onBack,
  onDone,
}: ConexaoWhatsappWizardProps) {
  const [etapa, setEtapa] = React.useState<Etapa>(1);
  const [tokens, setTokens] = React.useState<TokensDaConexao | null>(null);
  const [tokensError, setTokensError] = React.useState<string | null>(null);

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [path, setPath] = React.useState("");
  const [pathTouched, setPathTouched] = React.useState(false);
  const [bizCountry, setBizCountry] = React.useState<Country>(DEFAULT_COUNTRY);
  const [bizNational, setBizNational] = React.useState("");
  const [bizTouched, setBizTouched] = React.useState(false);
  const [targetUrl, setTargetUrl] = React.useState("");
  const [urlTouched, setUrlTouched] = React.useState(false);

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Tokens gerados no servidor quando o assistente abre (SPEC §3.8).
  const carregarTokens = React.useCallback(() => {
    setTokensError(null);
    prepararTokensConexao().then(
      (r) => {
        if (r.success) setTokens(r.data);
        else setTokensError(r.error);
      },
      () => setTokensError("Não foi possível preparar os tokens da conexão."),
    );
  }, []);
  React.useEffect(() => {
    carregarTokens();
  }, [carregarTokens]);

  // ── Validações ──────────────────────────────────────────────────────────────
  const pathTrim = path.trim();
  const pathFormatOk = PATH_RE.test(pathTrim);
  const pathDuplicate = pathFormatOk && existingPaths.includes(pathTrim);
  const pathValid = pathFormatOk && !pathDuplicate;
  const pathErrorMsg = !pathFormatOk
    ? "Apenas minúsculas, números, hífen e barra. Precisa ser único."
    : pathDuplicate
      ? "Já existe um webhook de entrada com esse caminho."
      : null;
  const showPathError = pathErrorMsg !== null && (pathTrim.length > 0 || pathTouched);

  const businessIdDigits = bizNational ? composeE164(bizCountry.dial, bizNational).slice(1) : "";
  const bizFormatError = validateNationalPhone(bizCountry, bizNational);
  const bizDuplicate = bizFormatError === null && existingBusinessIds.includes(businessIdDigits);
  const bizValid = bizFormatError === null && !bizDuplicate;
  const bizErrorMsg =
    bizFormatError ?? (bizDuplicate ? "Já existe uma conexão de WhatsApp com esse número." : null);
  const showBizError = bizErrorMsg !== null && (bizNational.length > 0 || bizTouched);

  const urlTrim = targetUrl.trim();
  const urlValid = isValidUrl(urlTrim);
  const showUrlError = !urlValid && (urlTrim.length > 0 || urlTouched);

  const etapa1Valida = name.trim().length > 0 && pathValid && bizValid && tokens !== null;
  const etapa2Valida = urlValid && tokens !== null;

  const enderecoCompleto = `${inboundBaseUrl}${pathTrim}`;

  async function handleCriar() {
    if (!tokens) return;
    setSubmitting(true);
    setError(null);
    const res = await criarConexaoWhatsapp({
      name: name.trim(),
      description: description.trim() || null,
      path: pathTrim,
      businessId: businessIdDigits,
      targetUrl: urlTrim,
      tokenRecebimento: tokens.tokenRecebimento,
      tokenAssinatura: tokens.tokenAssinatura,
    });
    setSubmitting(false);
    if (res.success) {
      setEtapa(4);
    } else {
      setError(res.error);
    }
  }

  return (
    <div className="space-y-6">
      <StepIndicator steps={ETAPAS} current={etapa} />

      {tokensError && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-xs text-destructive" role="alert">
            {tokensError}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={carregarTokens} className="cursor-pointer">
            Tentar de novo
          </Button>
        </div>
      )}

      {/* ── Etapa 1 · Recebimento ─────────────────────────────────────────── */}
      {etapa === 1 && (
        <div className="space-y-5">
          <EtapaCabecalho
            icon={ArrowDownToLine}
            titulo="Recebimento"
            texto="Por onde as mensagens do WhatsApp entram na plataforma."
          />

          <div className="space-y-1.5">
            <Label htmlFor="cx-name">Nome</Label>
            <Input
              id="cx-name"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder="Ex.: WhatsApp da loja matriz"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cx-desc">Descrição</Label>
            <Textarea
              id="cx-desc"
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
              placeholder="O que esta conexão atende (opcional)."
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cx-path">Endereço (URL)</Label>
            <div
              className={cn(
                "flex h-9 items-stretch overflow-hidden rounded-lg border bg-transparent transition-colors dark:bg-input/30",
                showPathError
                  ? "border-destructive focus-within:border-destructive focus-within:ring-2 focus-within:ring-destructive/40"
                  : "border-input focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50",
              )}
            >
              <span className="flex items-center whitespace-nowrap bg-muted px-2.5 text-xs text-muted-foreground">
                {inboundBaseUrl}
              </span>
              <div className="my-1.5 w-px shrink-0 bg-border" aria-hidden />
              <input
                id="cx-path"
                value={path}
                onChange={(e) => setPath(e.currentTarget.value)}
                onBlur={() => setPathTouched(true)}
                placeholder="whatsapp/loja-matriz"
                aria-invalid={showPathError}
                className="min-w-0 flex-1 bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
            {showPathError ? (
              <p className="text-xs text-destructive" role="alert">
                {pathErrorMsg}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Você define o final do endereço. Apenas minúsculas, números, hífen e barra. Precisa ser único.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cx-business">Número da empresa</Label>
            <PhoneInput
              country={bizCountry}
              onCountryChange={setBizCountry}
              national={bizNational}
              onNationalChange={setBizNational}
              onBlur={() => setBizTouched(true)}
              invalid={showBizError}
              inputId="cx-business"
            />
            {showBizError ? (
              <p className="text-xs text-destructive" role="alert">
                {bizErrorMsg}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Número do WhatsApp da empresa que recebe as mensagens. Um número existe em uma única
                configuração.
              </p>
            )}
          </div>

          <MetodoPostTravado />

          <TokenBloco
            label="Token de recebimento"
            valor={tokens?.tokenRecebimento ?? null}
            descricao="É o Bearer que o seu fluxo usa para chamar o endereço acima."
            avisoValidade="O token só funciona depois que você concluir a criação da conexão. Recarregar esta página gera tokens novos e invalida os copiados."
          />

          <AvisoPayload />

          <WhatsappInboundHelp inboundBaseUrl={inboundBaseUrl} path={pathTrim} defaultOpen={false} />

          <div className="flex justify-between gap-2 border-t border-border/60 pt-5">
            <Button type="button" variant="outline" onClick={onBack} className="cursor-pointer">
              Voltar
            </Button>
            <Button
              type="button"
              disabled={!etapa1Valida}
              onClick={() => setEtapa(2)}
              className="cursor-pointer"
            >
              Concluir configuração e continuar
            </Button>
          </div>
        </div>
      )}

      {/* ── Etapa 2 · Envio ───────────────────────────────────────────────── */}
      {etapa === 2 && (
        <div className="space-y-5">
          <EtapaCabecalho
            icon={ArrowUpFromLine}
            titulo="Envio"
            texto="Para onde a plataforma entrega a resposta pronta do Agente Nex."
          />

          <div className="space-y-1.5">
            <Label htmlFor="cx-target">URL de destino</Label>
            <Input
              id="cx-target"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.currentTarget.value)}
              onBlur={() => setUrlTouched(true)}
              placeholder="https://seu-ambiente.exemplo.com/whatsapp/resposta"
              aria-invalid={showUrlError}
            />
            {showUrlError ? (
              <p className="text-xs text-destructive" role="alert">
                Informe uma URL válida (http ou https).
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                A resposta desta conexão é entregue somente neste endereço.
              </p>
            )}
          </div>

          <MetodoPostTravado />

          <TokenBloco
            label="Token de assinatura"
            valor={tokens?.tokenAssinatura ?? null}
            descricao="Cada disparo vai assinado (X-Signature, HMAC SHA-256 do corpo) com este token."
            avisoValidade="O token só passa a valer quando você concluir a criação da conexão."
          />

          <ConexaoEnvioHelp defaultOpen={false} />

          <div className="flex justify-between gap-2 border-t border-border/60 pt-5">
            <Button type="button" variant="outline" onClick={() => setEtapa(1)} className="cursor-pointer">
              Voltar
            </Button>
            <Button
              type="button"
              disabled={!etapa2Valida}
              onClick={() => setEtapa(3)}
              className="cursor-pointer"
            >
              Concluir configuração e continuar
            </Button>
          </div>
        </div>
      )}

      {/* ── Etapa 3 · Revisão ─────────────────────────────────────────────── */}
      {etapa === 3 && (
        <div className="space-y-5">
          <div className="space-y-1">
            <h3 className="text-sm font-medium">Revise a conexão</h3>
            <p className="text-xs text-muted-foreground">
              As duas pontas, lado a lado. Volte se algo precisar de ajuste.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <RevisaoCard icon={ArrowDownToLine} titulo="Recebimento">
              <RevisaoLinha rotulo="Nome" valor={name.trim()} />
              {description.trim() && <RevisaoLinha rotulo="Descrição" valor={description.trim()} />}
              <RevisaoLinha rotulo="Endereço" valor={enderecoCompleto} mono />
              <RevisaoLinha rotulo="Número da empresa" valor={`+${businessIdDigits}`} mono />
              <RevisaoLinha rotulo="Método" valor="POST" mono />
            </RevisaoCard>
            <RevisaoCard icon={ArrowUpFromLine} titulo="Envio">
              <RevisaoLinha rotulo="URL de destino" valor={urlTrim} mono />
              <RevisaoLinha rotulo="Método" valor="POST" mono />
              <RevisaoLinha rotulo="Evento" valor="Resposta do Agente Nex" />
            </RevisaoCard>
          </div>

          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-between gap-2 border-t border-border/60 pt-5">
            <Button type="button" variant="outline" onClick={() => setEtapa(2)} className="cursor-pointer">
              Voltar
            </Button>
            <Button
              type="button"
              disabled={submitting || !tokens}
              onClick={handleCriar}
              className="cursor-pointer"
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Criar conexão
            </Button>
          </div>
        </div>
      )}

      {/* ── Etapa 4 · Conclusão ───────────────────────────────────────────── */}
      {etapa === 4 && tokens && (
        <div className="space-y-5">
          <div className="space-y-1">
            <h3 className="text-sm font-medium">Conexão criada</h3>
            <p className="text-xs text-muted-foreground">
              Os dois tokens agora estão valendo. Depois desta tela, eles só reaparecem por rotação.
            </p>
          </div>

          <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" aria-hidden />
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Copie agora, eles não aparecem de novo</p>
                <p className="text-xs text-muted-foreground">
                  Guarde em local seguro. Se perder, rotacione o token na tela da conexão.
                </p>
              </div>
            </div>

            <TokenLinha label="Token de recebimento" valor={tokens.tokenRecebimento} />
            <TokenLinha label="Token de assinatura" valor={tokens.tokenAssinatura} />
          </div>

          <Button type="button" onClick={onDone} className="w-full cursor-pointer">
            Concluir
          </Button>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Blocos de apoio
// ──────────────────────────────────────────────────────────────────────────────

function EtapaCabecalho({
  icon: Icon,
  titulo,
  texto,
}: {
  icon: React.ElementType;
  titulo: string;
  texto: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-green-500/40 bg-green-500/5 p-3 ring-green-500/50">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background/60">
        <Icon className="h-5 w-5 text-green-500" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{titulo}</p>
        <p className="text-xs text-muted-foreground">{texto}</p>
      </div>
    </div>
  );
}

function MetodoPostTravado() {
  return (
    <div className="space-y-1.5">
      <Label>Método HTTP</Label>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-lg border border-violet-500/50 bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-600 dark:text-violet-400">
          <Lock className="h-3 w-3" strokeWidth={1.5} aria-hidden />
          POST
        </span>
        <span className="text-xs text-muted-foreground">Definido automaticamente.</span>
      </div>
    </div>
  );
}

/** Aviso da etapa 1, visível sem abrir nada (SPEC §3.7). */
function AvisoPayload() {
  return (
    <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      <p className="text-xs text-muted-foreground">
        Enquanto o payload não for montado no seu ambiente, nenhuma mensagem chega ao Agente Nex.
        O guia abaixo mostra o endereço, os headers e o corpo esperado.
      </p>
    </div>
  );
}

/** Bloco de token nas etapas 1 e 2: valor visível + copiar + avisos. */
function TokenBloco({
  label,
  valor,
  descricao,
  avisoValidade,
}: {
  label: string;
  valor: string | null;
  descricao: string;
  avisoValidade: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-stretch gap-2">
        <code
          className={cn(
            "flex h-9 min-w-0 flex-1 items-center overflow-x-auto rounded-lg border border-input bg-background px-3 font-mono text-xs whitespace-nowrap",
            !valor && "text-muted-foreground",
          )}
        >
          {valor ?? "gerando…"}
        </code>
        <CopyButton value={valor ?? ""} disabled={!valor} />
      </div>
      <p className="text-xs text-muted-foreground">{descricao}</p>
      <p className="text-xs text-amber-600 dark:text-amber-400">{avisoValidade}</p>
    </div>
  );
}

/** Linha de token na conclusão (etapa 4). */
function TokenLinha({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-stretch gap-2">
        <code className="flex h-9 min-w-0 flex-1 items-center overflow-x-auto rounded-lg border border-input bg-background px-3 font-mono text-xs whitespace-nowrap">
          {valor}
        </code>
        <CopyButton value={valor} />
      </div>
    </div>
  );
}

function RevisaoCard({
  icon: Icon,
  titulo,
  children,
}: {
  icon: React.ElementType;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5 rounded-lg border border-border p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-green-500" aria-hidden />
        {titulo}
      </p>
      <dl className="space-y-2">{children}</dl>
    </section>
  );
}

function RevisaoLinha({ rotulo, valor, mono = false }: { rotulo: string; valor: string; mono?: boolean }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</dt>
      <dd className={cn("break-all text-xs text-foreground", mono && "font-mono")}>{valor}</dd>
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
