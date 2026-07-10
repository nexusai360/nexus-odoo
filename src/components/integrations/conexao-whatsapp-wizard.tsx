"use client";

/**
 * Assistente de criação da CONEXÃO COM WHATSAPP: 4 etapas
 * (Recebimento · Envio · Revisão · Conclusão), renderizado pelo WebhookWizard
 * quando o tipo escolhido é "whatsapp".
 *
 * Segue o MESMO padrão dos outros tipos de webhook:
 *  - os campos que definem identidade (endereço, número, destino) têm botão de
 *    confirmar (`FieldValidateButton`), com reversão ao sair sem confirmar;
 *  - o segredo é RESERVADO: nasce mascarado, com mostrar/copiar e aviso
 *    (`SecretField`), nunca solto no meio do formulário.
 *
 * Uma coisa de cada vez: a etapa 1 configura o RECEBIMENTO por inteiro (e
 * termina com o token de recebimento); a etapa 2 configura o ENVIO por inteiro
 * (e termina com o token de assinatura). A Conclusão não repete os tokens.
 *
 * Cada etapa é dividida em SEÇÕES com respiro (identificação → configuração →
 * token → guia), para o preenchimento ter uma ordem óbvia.
 */

import * as React from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BookOpen,
  CheckCircle2,
  Loader2,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StepIndicator } from "@/components/ui/step-indicator";
import { SecretField } from "@/components/ui/secret-field";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  FieldValidateButton,
  type FieldConfirmVariant,
} from "@/components/integrations/field-validate-button";
import {
  type Country,
  DEFAULT_COUNTRY,
  composeE164,
  splitE164,
  validateNationalPhone,
} from "@/lib/whatsapp/countries";
import { mesmoNome } from "@/lib/integrations/nome-webhook";
import { WhatsappInboundHelp } from "@/components/integrations/whatsapp-inbound-help";
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
  inboundBaseUrl: string;
  existingPaths: string[];
  existingBusinessIds: string[];
  /** Nomes já usados por QUALQUER webhook (trava de nome único). */
  existingNames: string[];
  /** Volta para a seleção de tipo. */
  onBack: () => void;
  /** Conexão criada e tokens confirmados: fecha o fluxo. */
  onDone: () => void;
}

export function ConexaoWhatsappWizard({
  inboundBaseUrl,
  existingPaths,
  existingBusinessIds,
  existingNames,
  onBack,
  onDone,
}: ConexaoWhatsappWizardProps) {
  const [etapa, setEtapa] = React.useState<Etapa>(1);

  const [name, setName] = React.useState("");
  const [nameTouched, setNameTouched] = React.useState(false);
  const [description, setDescription] = React.useState("");

  // Endereço (slug) , com confirmação, como nos outros webhooks.
  const [path, setPath] = React.useState("");
  const [pathTouched, setPathTouched] = React.useState(false);
  const [pathConfirmed, setPathConfirmed] = React.useState("");

  // Número da empresa , com confirmação.
  const [bizCountry, setBizCountry] = React.useState<Country>(DEFAULT_COUNTRY);
  const [bizNational, setBizNational] = React.useState("");
  const [bizTouched, setBizTouched] = React.useState(false);
  const [bizConfirmed, setBizConfirmed] = React.useState("");

  // URL de destino , com confirmação.
  const [targetUrl, setTargetUrl] = React.useState("");
  const [urlTouched, setUrlTouched] = React.useState(false);
  const [urlConfirmed, setUrlConfirmed] = React.useState("");

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Tokens gerados no servidor quando o assistente abre (nada persistido).
  const [tokens, setTokens] = React.useState<TokensDaConexao | null>(null);
  const [tokensError, setTokensError] = React.useState<string | null>(null);
  const carregarTokens = React.useCallback(() => {
    setTokensError(null);
    prepararTokensConexao().then(
      (r) => (r.success ? setTokens(r.data) : setTokensError(r.error)),
      () => setTokensError("Não foi possível preparar os tokens da conexão."),
    );
  }, []);
  React.useEffect(() => {
    carregarTokens();
  }, [carregarTokens]);

  // ── Nome (único entre TODOS os webhooks) ────────────────────────────────────
  const nameTrim = name.trim();
  const nameDuplicate = existingNames.some((n) => mesmoNome(n, nameTrim));
  const nameValid = nameTrim.length > 0 && !nameDuplicate;
  const showNameError = nameDuplicate && (nameTrim.length > 0 || nameTouched);

  // ── Endereço ────────────────────────────────────────────────────────────────
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
  const pathVariant: FieldConfirmVariant = !pathValid
    ? pathTrim.length > 0 || pathTouched
      ? "error"
      : "idle"
    : pathTrim === pathConfirmed
      ? "confirmed"
      : "pending";

  function confirmPath() {
    if (!pathValid) {
      setPathTouched(true);
      return;
    }
    const wasEmpty = pathConfirmed.length === 0;
    setPathConfirmed(pathTrim);
    toast.success(wasEmpty ? "Endereço definido" : "Endereço atualizado");
  }
  function revertPath() {
    if (pathTrim !== pathConfirmed) {
      setPath(pathConfirmed);
      setPathTouched(false);
    }
  }

  // ── Número da empresa ───────────────────────────────────────────────────────
  const businessIdDigits = bizNational ? composeE164(bizCountry.dial, bizNational).slice(1) : "";
  const bizFormatError = validateNationalPhone(bizCountry, bizNational);
  const bizDuplicate = bizFormatError === null && existingBusinessIds.includes(businessIdDigits);
  const bizValid = bizFormatError === null && !bizDuplicate;
  const bizErrorMsg =
    bizFormatError ?? (bizDuplicate ? "Já existe uma conexão de WhatsApp com esse número." : null);
  const showBizError = bizErrorMsg !== null && (bizNational.length > 0 || bizTouched);
  const bizVariant: FieldConfirmVariant = !bizValid
    ? bizNational.length > 0 || bizTouched
      ? "error"
      : "idle"
    : businessIdDigits === bizConfirmed
      ? "confirmed"
      : "pending";

  function confirmBiz() {
    if (!bizValid) {
      setBizTouched(true);
      return;
    }
    const wasEmpty = bizConfirmed.length === 0;
    setBizConfirmed(businessIdDigits);
    toast.success(wasEmpty ? "Número da empresa definido" : "Número da empresa atualizado");
  }
  const bizFieldRef = React.useRef<HTMLDivElement>(null);
  function revertBiz(e: React.FocusEvent) {
    const next = e.relatedTarget as Node | null;
    if (next && bizFieldRef.current?.contains(next)) return;
    if (businessIdDigits !== bizConfirmed) {
      const snap = splitE164(bizConfirmed ? `+${bizConfirmed}` : "");
      setBizCountry(snap.country ?? DEFAULT_COUNTRY);
      setBizNational(snap.nationalDigits);
      setBizTouched(false);
    }
  }

  // ── URL de destino ──────────────────────────────────────────────────────────
  const urlTrim = targetUrl.trim();
  const urlValid = isValidUrl(urlTrim);
  const showUrlError = !urlValid && (urlTrim.length > 0 || urlTouched);
  const urlVariant: FieldConfirmVariant = !urlValid
    ? urlTrim.length > 0 || urlTouched
      ? "error"
      : "idle"
    : urlTrim === urlConfirmed
      ? "confirmed"
      : "pending";

  function confirmUrl() {
    if (!urlValid) {
      setUrlTouched(true);
      return;
    }
    const wasEmpty = urlConfirmed.length === 0;
    setUrlConfirmed(urlTrim);
    toast.success(wasEmpty ? "Destino definido" : "Destino atualizado");
  }
  function revertUrl() {
    if (urlTrim !== urlConfirmed) {
      setTargetUrl(urlConfirmed);
      setUrlTouched(false);
    }
  }

  const etapa1Valida =
    nameValid &&
    pathValid &&
    pathTrim === pathConfirmed &&
    bizValid &&
    businessIdDigits === bizConfirmed &&
    tokens !== null;
  const etapa2Valida = urlValid && urlTrim === urlConfirmed && tokens !== null;

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
    <div className="space-y-8">
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
        <div className="space-y-10">
          <EtapaBanner
            icon={ArrowDownToLine}
            titulo="Recebimento"
            texto="Por onde as mensagens do WhatsApp entram na plataforma."
          />

          <Secao titulo="Identificação" descricao="Como esta conexão aparece na lista.">
            <div className="space-y-1.5">
              <Label htmlFor="cx-name">Nome</Label>
              <Input
                id="cx-name"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                onBlur={() => setNameTouched(true)}
                placeholder="Ex.: WhatsApp da loja matriz"
                aria-invalid={showNameError}
              />
              {showNameError && (
                <p className="text-xs text-destructive" role="alert">
                  Já existe um webhook com esse nome. Escolha outro.
                </p>
              )}
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
          </Secao>

          <Secao
            titulo="Endereço de entrada"
            descricao="O endereço que o seu fluxo vai chamar, e o número que ele atende."
          >
            <div className="space-y-1.5">
              <Label htmlFor="cx-path">Endereço (URL)</Label>
              <div className="flex items-stretch">
                <div
                  className={cn(
                    "flex h-9 flex-1 items-stretch overflow-hidden rounded-lg border bg-transparent transition-colors dark:bg-input/30",
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
                    onBlur={revertPath}
                    placeholder="whatsapp/loja-matriz"
                    aria-invalid={showPathError}
                    className="min-w-0 flex-1 bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <div
                  className={cn(
                    "flex items-stretch transition-all duration-200",
                    pathTrim.length > 0 ? "ml-2 w-9 opacity-100" : "ml-0 w-0 opacity-0",
                  )}
                >
                  <FieldValidateButton
                    variant={pathVariant}
                    onClick={confirmPath}
                    label="Confirmar endereço"
                  />
                </div>
              </div>
              {showPathError ? (
                <p className="text-xs text-destructive" role="alert">
                  {pathErrorMsg}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Você define o final do endereço. Apenas minúsculas, números, hífen e barra.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cx-business">Número da empresa</Label>
              <div ref={bizFieldRef} className="flex items-stretch">
                <PhoneInput
                  className="flex-1"
                  country={bizCountry}
                  onCountryChange={setBizCountry}
                  national={bizNational}
                  onNationalChange={setBizNational}
                  onBlur={revertBiz}
                  invalid={showBizError}
                  inputId="cx-business"
                />
                <div
                  className={cn(
                    "flex items-stretch transition-all duration-200",
                    bizNational.length > 0 ? "ml-2 w-9 opacity-100" : "ml-0 w-0 opacity-0",
                  )}
                >
                  <FieldValidateButton
                    variant={bizVariant}
                    onClick={confirmBiz}
                    label="Confirmar número"
                  />
                </div>
              </div>
              {showBizError ? (
                <p className="text-xs text-destructive" role="alert">
                  {bizErrorMsg}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Um número existe em uma única configuração, aqui ou no envio direto.
                </p>
              )}
            </div>

            <MetodoPostTravado />
          </Secao>

          <SecretField
            secret={tokens?.tokenRecebimento ?? ""}
            label="Token de recebimento"
            descricao="Copie agora e envie no header Authorization das chamadas de entrada. Ele passa a valer quando você criar a conexão; depois disso, só reaparece por rotação."
          />

          <GuiaDaEtapa dica="Veja como montar o payload">
            <WhatsappInboundHelp
              inboundBaseUrl={inboundBaseUrl}
              path={pathConfirmed}
              defaultOpen={false}
              destaque
            />
          </GuiaDaEtapa>

          <Rodape
            voltar={{ label: "Voltar", onClick: onBack }}
            avancar={{
              label: "Concluir configuração e continuar",
              onClick: () => setEtapa(2),
              disabled: !etapa1Valida,
            }}
          />
        </div>
      )}

      {/* ── Etapa 2 · Envio ───────────────────────────────────────────────── */}
      {etapa === 2 && (
        <div className="space-y-10">
          <EtapaBanner
            icon={ArrowUpFromLine}
            titulo="Envio"
            texto="Para onde a plataforma entrega a resposta pronta do Agente Nex."
          />

          <Secao
            titulo="Endereço de saída"
            descricao="A resposta desta conexão é entregue somente neste endereço."
          >
            <div className="space-y-1.5">
              <Label htmlFor="cx-target">URL de destino</Label>
              <div className="flex items-stretch">
                <Input
                  id="cx-target"
                  className="flex-1"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.currentTarget.value)}
                  onBlur={revertUrl}
                  placeholder="https://seu-ambiente.exemplo.com/whatsapp/resposta"
                  aria-invalid={showUrlError}
                />
                <div
                  className={cn(
                    "flex items-stretch transition-all duration-200",
                    urlTrim.length > 0 ? "ml-2 w-9 opacity-100" : "ml-0 w-0 opacity-0",
                  )}
                >
                  <FieldValidateButton
                    variant={urlVariant}
                    onClick={confirmUrl}
                    label="Confirmar destino"
                  />
                </div>
              </div>
              {showUrlError && (
                <p className="text-xs text-destructive" role="alert">
                  Informe uma URL válida (http ou https).
                </p>
              )}
            </div>

            <MetodoPostTravado />
          </Secao>

          <SecretField
            secret={tokens?.tokenAssinatura ?? ""}
            label="Token de assinatura"
            descricao="Copie agora e use para conferir a assinatura (X-Signature) de cada entrega. Ele passa a valer quando você criar a conexão; depois disso, só reaparece por rotação."
          />

          <GuiaDaEtapa dica="Veja como será enviado o payload">
            <ConexaoEnvioHelp defaultOpen={false} destaque />
          </GuiaDaEtapa>

          <Rodape
            voltar={{ label: "Voltar", onClick: () => setEtapa(1) }}
            avancar={{
              label: "Concluir configuração e continuar",
              onClick: () => setEtapa(3),
              disabled: !etapa2Valida,
            }}
          />
        </div>
      )}

      {/* ── Etapa 3 · Revisão ─────────────────────────────────────────────── */}
      {etapa === 3 && (
        <div className="space-y-8">
          <div className="space-y-1">
            <h3 className="text-sm font-medium">Revise a conexão</h3>
            <p className="text-xs text-muted-foreground">
              As duas pontas, lado a lado. Volte se algo precisar de ajuste.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
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

          <Rodape
            voltar={{ label: "Voltar", onClick: () => setEtapa(2) }}
            avancar={{
              label: "Criar conexão",
              onClick: handleCriar,
              disabled: submitting || !tokens,
              loading: submitting,
            }}
          />
        </div>
      )}

      {/* ── Etapa 4 · Conclusão , sem tokens: cada um já foi exibido na sua etapa */}
      {etapa === 4 && (
        <div className="space-y-8">
          <div className="flex items-start gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-500" aria-hidden />
            <div className="space-y-1">
              <p className="text-sm font-medium">Conexão criada</p>
              <p className="text-xs text-muted-foreground">
                Os dois tokens que você copiou nas etapas anteriores estão valendo a partir de agora.
              </p>
            </div>
          </div>

          <Secao titulo="Próximos passos" descricao="O que fazer no seu ambiente para as mensagens começarem a fluir.">
            <ol className="list-decimal space-y-2 pl-5 text-xs text-muted-foreground marker:text-muted-foreground/70">
              <li>
                Aponte o seu fluxo para{" "}
                <code className="rounded bg-muted px-1 font-mono text-foreground">{enderecoCompleto}</code>, com o{" "}
                <span className="font-medium text-foreground">token de recebimento</span> no header Authorization.
              </li>
              <li>
                Prepare o seu destino para receber os disparos em{" "}
                <code className="rounded bg-muted px-1 font-mono text-foreground">{urlTrim}</code> e valide a assinatura
                com o <span className="font-medium text-foreground">token de assinatura</span>.
              </li>
              <li>
                Perdeu algum token? Rotacione a ponta correspondente na tela de edição desta conexão.
              </li>
            </ol>
          </Secao>

          <div className="flex justify-end border-t border-border/60 pt-5">
            <Button type="button" onClick={onDone} className="cursor-pointer">
              Concluir
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Blocos de apoio
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Guia da etapa: fica bem depois do token (respiro grande) e é anunciado por
 * uma dica discreta , atenção suficiente para ser notado, sem competir com o
 * bloco de segredo, que é o que realmente exige cuidado.
 */
function GuiaDaEtapa({ dica, children }: { dica: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 pt-6">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {dica}
      </p>
      {children}
    </div>
  );
}

/** Seção do formulário: título, descrição e campos, com respiro entre elas. */
function Secao({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div className="space-y-1 border-b border-border/60 pb-3">
        <h4 className="text-sm font-semibold text-foreground">{titulo}</h4>
        {descricao && <p className="text-xs text-muted-foreground">{descricao}</p>}
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function EtapaBanner({
  icon: Icon,
  titulo,
  texto,
}: {
  icon: React.ElementType;
  titulo: string;
  texto: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-green-500/40 bg-green-500/5 p-3">
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

function Rodape({
  voltar,
  avancar,
}: {
  voltar: { label: string; onClick: () => void };
  avancar: { label: string; onClick: () => void; disabled?: boolean; loading?: boolean };
}) {
  return (
    <div className="flex justify-between gap-2 border-t border-border/60 pt-5">
      <Button type="button" variant="outline" onClick={voltar.onClick} className="cursor-pointer">
        {voltar.label}
      </Button>
      <Button
        type="button"
        disabled={avancar.disabled}
        onClick={avancar.onClick}
        className="cursor-pointer"
      >
        {avancar.loading && <Loader2 className="size-4 animate-spin" />}
        {avancar.label}
      </Button>
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

function RevisaoLinha({
  rotulo,
  valor,
  mono = false,
}: {
  rotulo: string;
  valor: string;
  mono?: boolean;
}) {
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
