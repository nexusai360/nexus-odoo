"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Crown,
  IdCard,
  Loader2,
  MessageCircle,
  ShieldCheck,
  UserCheck,
  UserX,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PasswordInput } from "@/components/ui/password-input";

import {
  checkEmailAvailable,
  createUser,
  updateUser,
  type UserListItem,
} from "@/lib/actions/users";
import { updateUserDomains } from "@/lib/actions/domain-access";
import { addWhatsappNumber } from "@/lib/actions/user-whatsapp";
import { canCreateRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import {
  PLATFORM_ROLE_DESCRIPTIONS,
  PLATFORM_ROLE_ICONS,
  PLATFORM_ROLE_LABELS,
  PLATFORM_ROLE_STYLES,
} from "@/lib/constants/roles";
import type { AuthUser } from "@/lib/auth-helpers";
import { grantableDomains, REPORT_DOMAINS, type ReportDomainId } from "@/lib/reports/domains";
import { AccessStep } from "@/components/users/access-step";
import { WhatsappNumbersField } from "@/components/users/whatsapp-numbers-field";
import {
  handleRoleChange,
  type FormState,
  type RoleValue,
  type Step,
} from "@/components/users/user-form-dialog.internals";

// RoleValue, Step e FormState são importados de user-form-dialog.internals.
// Não redefini-los aqui.

interface RoleMeta {
  value: RoleValue;
  label: string;
  description: string;
  icon: typeof Crown;
}

const ROLE_META: Record<RoleValue, RoleMeta> = {
  super_admin: {
    value: "super_admin",
    label: PLATFORM_ROLE_LABELS.super_admin,
    description: PLATFORM_ROLE_DESCRIPTIONS.super_admin,
    icon: PLATFORM_ROLE_ICONS.super_admin,
  },
  admin: {
    value: "admin",
    label: PLATFORM_ROLE_LABELS.admin,
    description: PLATFORM_ROLE_DESCRIPTIONS.admin,
    icon: PLATFORM_ROLE_ICONS.admin,
  },
  manager: {
    value: "manager",
    label: PLATFORM_ROLE_LABELS.manager,
    description: PLATFORM_ROLE_DESCRIPTIONS.manager,
    icon: PLATFORM_ROLE_ICONS.manager,
  },
  viewer: {
    value: "viewer",
    label: PLATFORM_ROLE_LABELS.viewer,
    description: PLATFORM_ROLE_DESCRIPTIONS.viewer,
    icon: PLATFORM_ROLE_ICONS.viewer,
  },
};

// Fundo dos badges/quadrados de papel , alinhado a PLATFORM_ROLE_STYLES.
const ROLE_BADGE_BG: Record<RoleValue, string> = {
  super_admin: PLATFORM_ROLE_STYLES.super_admin.className,
  admin: PLATFORM_ROLE_STYLES.admin.className,
  manager: PLATFORM_ROLE_STYLES.manager.className,
  viewer: PLATFORM_ROLE_STYLES.viewer.className,
};

interface UserFormDialogProps {
  mode: "create" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: UserListItem;
  currentUser: AuthUser;
  onSuccess: () => void;
  /** Domínios que o concedente possui; usado para calcular o que pode conceder. */
  granterDomains: ReportDomainId[];
  /** Domínios atuais do usuário sendo editado; pré-carrega a etapa Acesso no modo edit. */
  userDomains?: ReportDomainId[];
}

const EMPTY_FORM: FormState = {
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
  role: "viewer",
  isActive: true,
  domains: [],
};

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

export function UserFormDialog({
  mode,
  open,
  onOpenChange,
  user,
  currentUser,
  onSuccess,
  granterDomains,
  userDomains,
}: UserFormDialogProps) {
  const isEdit = mode === "edit";
  const isOwner = !!user?.isOwner;
  const isSelf = user?.id === currentUser.id;

  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, start] = useTransition();

  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  // Modo criação: números de WhatsApp em rascunho, persistidos após criar.
  const [draftWhatsapp, setDraftWhatsapp] = useState<string[]>([]);

  const emailRef = useRef<HTMLInputElement | null>(null);

  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const confirmId = useId();
  const passwordErrorId = useId();
  const confirmErrorId = useId();
  const emailErrorId = useId();

  // owner e o próprio usuário têm nível/status protegidos.
  const showActiveToggle = isEdit && !isOwner && !isSelf;
  const lockRole = isEdit && (isOwner || isSelf);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setErrors({});
    setCreatedPassword(null);
    setCopied(false);
    setCheckingEmail(false);
    setDraftWhatsapp([]);
    if (isEdit && user) {
      setForm({
        ...EMPTY_FORM,
        name: user.name,
        email: user.email,
        role: user.platformRole,
        isActive: user.isActive,
        domains: userDomains ?? [],
      });
    } else {
      setForm({ ...EMPTY_FORM });
    }
  }, [open, isEdit, user, userDomains]);

  const availableRoles = useMemo<RoleMeta[]>(
    () =>
      (Object.values(ROLE_META) as RoleMeta[]).filter((r) =>
        canCreateRole(currentUser, r.value),
      ),
    [currentUser],
  );

  // manager/viewer têm a etapa "Acesso" (3 etapas); privilegiados, 2.
  const temEtapaAcesso = form.role === "manager" || form.role === "viewer";
  const ultimaEtapa: Step = temEtapaAcesso ? 3 : 2;

  // Domínios que o concedente pode conceder ao novo usuário.
  const grantable = grantableDomains(currentUser.platformRole, granterDomains);

  // N10: troca de role zera domínios e pode recuar a etapa.
  function onRoleChange(role: RoleValue) {
    setForm((f) => {
      const { form: nextForm } = handleRoleChange(f, role, step);
      return nextForm;
    });
    const { step: nextStep } = handleRoleChange(form, role, step);
    if (nextStep !== step) setStep(nextStep);
  }

  function clearError(key: keyof FieldErrors) {
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function validateIdentity(): boolean {
    const next: FieldErrors = {};
    if (!form.name.trim()) next.name = "Nome obrigatório";
    else if (form.name.trim().length < 2)
      next.name = "Mínimo de 2 caracteres";

    {
      // E-mail é validado em criação E em edição (agora editável).
      const e = form.email.trim();
      if (!e) next.email = "E-mail obrigatório";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
        next.email = "E-mail inválido";
    }

    if (form.password.length > 0) {
      if (form.password.length < 8) next.password = "Mínimo de 8 caracteres";
      else if (form.password.length > 72)
        next.password = "Máximo de 72 caracteres";
      if (form.password !== form.confirmPassword) {
        next.confirmPassword = "As senhas não coincidem";
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function goNext() {
    if (checkingEmail) return;
    if (!validateIdentity()) {
      toast.error("Verifique os campos da etapa Identidade.");
      return;
    }
    // Verifica duplicidade de e-mail antes de avançar: na criação sempre; na
    // edição só quando o e-mail mudou (manter o atual é permitido).
    const normalizedEmail = form.email.trim().toLowerCase();
    const emailChanged =
      isEdit && user ? normalizedEmail !== user.email.toLowerCase() : false;
    if (!isEdit || emailChanged) {
      setCheckingEmail(true);
      try {
        const { available } = await checkEmailAvailable(normalizedEmail);
        if (!available) {
          setErrors((e) => ({
            ...e,
            email: "Este e-mail já está cadastrado.",
          }));
          emailRef.current?.focus();
          return;
        }
      } catch {
        toast.error("Não foi possível verificar o e-mail. Tente novamente.");
        return;
      } finally {
        setCheckingEmail(false);
      }
    }
    setStep((s) => (s < ultimaEtapa ? ((s + 1) as Step) : s));
  }

  function goBack() {
    setStep((s) => (s > 1 ? ((s - 1) as Step) : s));
  }

  function handleSubmit() {
    if (pending) return;
    if (!validateIdentity()) {
      setStep(1);
      toast.error("Verifique os campos da etapa Identidade.");
      return;
    }

    start(async () => {
      if (!isEdit) {
        const result = await createUser({
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          platformRole: form.role,
          password: form.password.length > 0 ? form.password : undefined,
          domains: form.domains,
        });
        if (result.success && result.data) {
          // Persiste os números de WhatsApp informados na criação. Falhas
          // individuais não abortam o fluxo , o usuário já foi criado.
          if (draftWhatsapp.length > 0) {
            const failures: string[] = [];
            for (const raw of draftWhatsapp) {
              const r = await addWhatsappNumber({
                userId: result.data.id,
                raw,
              });
              if (!r.success) failures.push(raw);
            }
            if (failures.length > 0) {
              toast.error(
                `Usuário criado, mas ${failures.length} número(s) de WhatsApp não foram salvos: ${failures.join(", ")}`,
              );
            }
          }

          if (result.data.tempPassword) {
            setCreatedPassword(result.data.tempPassword);
          } else {
            toast.success("Usuário criado.");
            onSuccess();
            onOpenChange(false);
          }
        } else if (!result.success) {
          toast.error(result.error);
        }
        return;
      }

      if (!user) return;

      // N1: domínios primeiro. updateUserDomains é idempotente; com role
      // privilegiado, form.domains já é [] (N10) , então a chamada apenas
      // remove eventuais linhas remanescentes, sem deixar estado órfão.
      const editavelDominio =
        form.role === "manager" || form.role === "viewer";
      if (editavelDominio || true) {
        const domRes = await updateUserDomains(
          user.id,
          editavelDominio ? form.domains : [],
        );
        if (!domRes.success) {
          toast.error(`Falha ao atualizar domínios: ${domRes.error}`);
          return; // não prossegue para updateUser , nada de identidade foi tocado
        }
      }

      const result = await updateUser({
        id: user.id,
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        platformRole: lockRole ? undefined : form.role,
        password: form.password.length > 0 ? form.password : undefined,
        isActive: showActiveToggle ? form.isActive : undefined,
      });
      if (result.success) {
        toast.success("Usuário atualizado.");
        onSuccess();
        onOpenChange(false);
      } else {
        // Domínios já foram salvos; identidade falhou , erro parcial.
        toast.error(`Domínios salvos, mas a identidade falhou: ${result.error}`);
      }
    });
  }

  function copyPassword() {
    if (!createdPassword) return;
    void navigator.clipboard.writeText(createdPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function close(v: boolean) {
    if (pending) return;
    // Ao fechar, limpa a senha temporária do estado do cliente para não
    // deixá-la no heap / React DevTools mais do que o necessário (IM-06).
    if (!v) {
      setCreatedPassword(null);
      setCopied(false);
    }
    onOpenChange(v);
  }

  const stepperItems = useMemo<
    Array<{ n: Step; label: string; icon: typeof IdCard }>
  >(() => {
    const items: Array<{ n: Step; label: string; icon: typeof IdCard }> = [
      { n: 1, label: "Identidade", icon: IdCard },
    ];
    if (temEtapaAcesso) {
      items.push({ n: 2, label: "Acesso", icon: ShieldCheck });
      items.push({ n: 3, label: "Confirmação", icon: CheckCircle2 });
    } else {
      items.push({ n: 2, label: "Confirmação", icon: CheckCircle2 });
    }
    return items;
  }, [temEtapaAcesso]);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-xl overflow-visible">
        <DialogHeader>
          <DialogTitle>
            {createdPassword
              ? "Usuário criado"
              : isEdit
                ? "Editar usuário"
                : "Novo usuário"}
          </DialogTitle>
          <DialogDescription>
            {createdPassword
              ? "Compartilhe a senha temporária com o usuário."
              : isEdit
                ? "Atualize as informações em 2 etapas."
                : "Crie um novo usuário em 2 etapas."}
          </DialogDescription>
        </DialogHeader>

        {!createdPassword ? (
          <Stepper step={step} items={stepperItems} />
        ) : null}

        {createdPassword ? (
          <CreatedPanel
            password={createdPassword}
            copied={copied}
            onCopy={copyPassword}
            name={form.name}
          />
        ) : (
          <div className="space-y-4 py-1">
            {step === 1 ? (
              <StepIdentity
                form={form}
                setForm={setForm}
                onRoleChange={onRoleChange}
                errors={errors}
                clearError={clearError}
                isEdit={isEdit}
                lockRole={lockRole}
                availableRoles={availableRoles}
                showActiveToggle={showActiveToggle}
                editUserId={isEdit ? user?.id : undefined}
                onWhatsappDraftChange={setDraftWhatsapp}
                emailRef={emailRef}
                ids={{
                  name: nameId,
                  email: emailId,
                  password: passwordId,
                  confirm: confirmId,
                  passwordError: passwordErrorId,
                  confirmError: confirmErrorId,
                  emailError: emailErrorId,
                }}
              />
            ) : step === 2 && temEtapaAcesso ? (
              <AccessStep
                selected={form.domains}
                onChange={(domains) => setForm((f) => ({ ...f, domains }))}
                grantable={grantable}
              />
            ) : (
              <StepConfirm form={form} isEdit={isEdit} />
            )}
          </div>
        )}

        <DialogFooter>
          {createdPassword ? (
            <Button
              type="button"
              onClick={() => {
                onSuccess();
                close(false);
              }}
            >
              Concluir
            </Button>
          ) : (
            <>
              {step > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={goBack}
                  disabled={pending}
                >
                  <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Voltar
                </Button>
              ) : null}
              {step < ultimaEtapa ? (
                <Button
                  type="button"
                  onClick={() => void goNext()}
                  disabled={pending || checkingEmail}
                >
                  {checkingEmail ? (
                    <Loader2
                      className="mr-1.5 h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : null}
                  Próximo
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={pending}
                >
                  {pending ? (
                    <Loader2
                      className="mr-1.5 h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : null}
                  {isEdit ? "Salvar" : "Criar"}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Stepper visual
// ─────────────────────────────────────────────────────────────────────────

interface StepperProps {
  step: Step;
  items: Array<{ n: Step; label: string; icon: typeof IdCard }>;
}

function Stepper({ step, items }: StepperProps) {
  return (
    <div
      className="flex items-center gap-2 pt-1 pb-2"
      role="list"
      aria-label="Progresso do formulário"
    >
      {items.map((it, i) => {
        const Icon = it.icon;
        const active = step === it.n;
        const done = step > it.n;
        return (
          <div
            key={it.n}
            role="listitem"
            className="flex items-center gap-2 flex-1"
          >
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium transition-colors",
                active &&
                  "border-violet-500/60 bg-violet-500/10 text-violet-500",
                done &&
                  !active &&
                  "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
                !active &&
                  !done &&
                  "border-border bg-muted/30 text-muted-foreground",
              )}
              aria-current={active ? "step" : undefined}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            </div>
            <span
              className={cn(
                "text-xs",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {it.label}
            </span>
            {i < items.length - 1 ? (
              <div className="flex-1 h-px bg-border" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Etapa 1 , Identidade
// ─────────────────────────────────────────────────────────────────────────

interface StepIdentityProps {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  onRoleChange: (role: RoleValue) => void;
  errors: FieldErrors;
  clearError: (key: keyof FieldErrors) => void;
  isEdit: boolean;
  lockRole: boolean;
  availableRoles: RoleMeta[];
  showActiveToggle: boolean;
  /** Id do usuário sendo editado; habilita a seção de números de WhatsApp. */
  editUserId?: string;
  /** Modo criação: recebe os números de WhatsApp em rascunho. */
  onWhatsappDraftChange?: (numbers: string[]) => void;
  emailRef: React.RefObject<HTMLInputElement | null>;
  ids: {
    name: string;
    email: string;
    password: string;
    confirm: string;
    passwordError: string;
    confirmError: string;
    emailError: string;
  };
}

function StepIdentity({
  form,
  setForm,
  onRoleChange,
  errors,
  clearError,
  isEdit,
  lockRole,
  availableRoles,
  showActiveToggle,
  editUserId,
  onWhatsappDraftChange,
  emailRef,
  ids,
}: StepIdentityProps) {
  return (
    <>
      {/* Nome */}
      <div className="space-y-1.5">
        <label
          htmlFor={ids.name}
          className="block text-sm font-medium text-foreground/80"
        >
          Nome
        </label>
        <Input
          id={ids.name}
          value={form.name}
          onChange={(e) => {
            setForm((f) => ({ ...f, name: e.target.value }));
            if (errors.name) clearError("name");
          }}
          placeholder="Nome completo"
          aria-invalid={!!errors.name || undefined}
          autoComplete="name"
          maxLength={120}
        />
        {errors.name ? (
          <p className="text-xs text-red-400" role="alert">
            {errors.name}
          </p>
        ) : null}
      </div>

      {/* E-mail */}
      <div className="space-y-1.5">
        <label
          htmlFor={ids.email}
          className="block text-sm font-medium text-foreground/80"
        >
          E-mail
        </label>
        <Input
          ref={emailRef}
          id={ids.email}
          type="email"
          value={form.email}
          onChange={(e) => {
            setForm((f) => ({ ...f, email: e.target.value }));
            if (errors.email) clearError("email");
          }}
          placeholder="email@exemplo.com"
          aria-invalid={!!errors.email || undefined}
          aria-describedby={errors.email ? ids.emailError : undefined}
          autoComplete="email"
        />
        {isEdit ? (
          <p className="text-[11px] text-muted-foreground">
            Este é o login do usuário. Alterá-lo muda o e-mail de acesso.
          </p>
        ) : null}
        {errors.email ? (
          <p
            id={ids.emailError}
            className="text-xs text-destructive"
            role="alert"
            aria-live="polite"
          >
            {errors.email}
          </p>
        ) : null}
      </div>

      {/* Senha */}
      <div className="space-y-1.5">
        <label
          htmlFor={ids.password}
          className="block text-sm font-medium text-foreground/80"
        >
          Senha <span className="text-muted-foreground">(opcional)</span>
        </label>
        <PasswordInput
          id={ids.password}
          value={form.password}
          onChange={(v) => {
            setForm((f) => ({ ...f, password: v }));
            if (errors.password) clearError("password");
          }}
          placeholder={
            isEdit ? "Deixe vazio para manter" : "Mínimo 8 caracteres"
          }
          ariaInvalid={!!errors.password}
          ariaDescribedBy={errors.password ? ids.passwordError : undefined}
        />
        <p className="text-[11px] text-muted-foreground">
          {isEdit
            ? "Deixe vazio para manter a senha atual."
            : "Se vazia, uma senha temporária será gerada automaticamente."}
        </p>
        {errors.password ? (
          <p
            id={ids.passwordError}
            className="text-xs text-red-400"
            role="alert"
          >
            {errors.password}
          </p>
        ) : null}
      </div>

      {/* Confirmar senha , só quando há senha digitada */}
      {form.password.length > 0 ? (
        <div className="space-y-1.5">
          <label
            htmlFor={ids.confirm}
            className="block text-sm font-medium text-foreground/80"
          >
            Confirmar senha
          </label>
          <PasswordInput
            id={ids.confirm}
            value={form.confirmPassword}
            onChange={(v) => {
              setForm((f) => ({ ...f, confirmPassword: v }));
              if (errors.confirmPassword) clearError("confirmPassword");
            }}
            placeholder="Confirme a senha"
            ariaInvalid={!!errors.confirmPassword}
            ariaDescribedBy={
              errors.confirmPassword ? ids.confirmError : undefined
            }
          />
          {errors.confirmPassword ? (
            <p
              id={ids.confirmError}
              className="text-xs text-red-400"
              role="alert"
            >
              {errors.confirmPassword}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Nível de acesso */}
      <div className="space-y-1.5">
        <p className="block text-sm font-medium text-foreground/80">
          Nível de acesso
        </p>
        {lockRole ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
              ROLE_BADGE_BG[form.role],
            )}
          >
            {(() => {
              const Icon = ROLE_META[form.role].icon;
              return <Icon className="h-3 w-3" aria-hidden="true" />;
            })()}
            {ROLE_META[form.role].label}
          </span>
        ) : (
          <RoleDropdown
            value={form.role}
            options={availableRoles}
            onChange={onRoleChange}
          />
        )}
      </div>

      {/* Toggle ativo/inativo , apenas em edit */}
      {showActiveToggle ? (
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-2">
            {form.isActive ? (
              <UserCheck
                className="h-4 w-4 text-emerald-400"
                aria-hidden="true"
              />
            ) : (
              <UserX className="h-4 w-4 text-red-400" aria-hidden="true" />
            )}
            <span className="text-sm text-foreground/80">
              {form.isActive ? "Ativo" : "Inativo"}
            </span>
          </div>
          <Switch
            checked={form.isActive}
            onCheckedChange={(checked) =>
              setForm((f) => ({ ...f, isActive: checked }))
            }
            aria-label="Alternar status do usuário"
          />
        </div>
      ) : null}

      {/* Números de WhatsApp , edição grava na hora; criação fica em rascunho */}
      <div className="space-y-2.5 rounded-lg border border-border bg-muted/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageCircle
            className="h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-sm font-medium text-foreground/80">
            Números de WhatsApp
          </p>
        </div>
        {isEdit && editUserId ? (
          <WhatsappNumbersField userId={editUserId} />
        ) : (
          <WhatsappNumbersField onDraftChange={onWhatsappDraftChange} />
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Dropdown vertical de nível
// ─────────────────────────────────────────────────────────────────────────

interface RoleDropdownProps {
  value: RoleValue;
  options: RoleMeta[];
  onChange: (v: RoleValue) => void;
}

function RoleDropdown({ value, options, onChange }: RoleDropdownProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    const handler = () => updatePos();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [open, updatePos]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = ROLE_META[value];
  const CurrentIcon = current.icon;

  const popover = open ? (
    <div
      ref={popoverRef}
      role="listbox"
      id={listboxId}
      style={
        pos
          ? {
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: pos.width,
              zIndex: 200,
            }
          : undefined
      }
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/10",
        "animate-in fade-in-0 zoom-in-95 duration-150 ease-out",
      )}
      data-state="open"
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => {
              onChange(opt.value);
              setOpen(false);
              triggerRef.current?.focus();
            }}
            className={cn(
              "flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors",
              "hover:bg-accent focus:bg-accent focus:outline-none",
              selected && "bg-accent/50",
            )}
          >
            <span
              className={cn(
                "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
                ROLE_BADGE_BG[opt.value],
              )}
              aria-hidden="true"
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">
                {opt.label}
              </span>
              <span className="block text-xs text-muted-foreground">
                {opt.description}
              </span>
            </div>
            {selected ? (
              <Check
                className="h-4 w-4 shrink-0 text-violet-500"
                aria-hidden="true"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-3 py-2 text-sm transition-colors outline-none",
          "hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
          "cursor-pointer",
        )}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <span
            className={cn(
              "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
              ROLE_BADGE_BG[value],
            )}
            aria-hidden="true"
          >
            <CurrentIcon className="h-3.5 w-3.5" />
          </span>
          <span className="flex flex-col items-start min-w-0">
            <span className="text-sm font-medium text-foreground">
              {current.label}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              {current.description}
            </span>
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      {mounted && popover ? createPortal(popover, document.body) : null}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Etapa 2 , Confirmação
// ─────────────────────────────────────────────────────────────────────────

interface StepConfirmProps {
  form: FormState;
  isEdit: boolean;
}

function StepConfirm({ form, isEdit }: StepConfirmProps) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2 text-sm">
        <Row label="Nome" value={form.name || ","} />
        <Row label="E-mail" value={form.email || ","} />
        <Row label="Nível" value={ROLE_META[form.role].label} />
        {isEdit ? (
          <Row label="Status" value={form.isActive ? "Ativo" : "Inativo"} />
        ) : null}
        <Row
          label="Senha"
          value={
            form.password.length > 0
              ? "Senha definida"
              : isEdit
                ? "Sem alteração"
                : "Será gerada automaticamente"
          }
        />
      </div>
      {(form.role === "manager" || form.role === "viewer") && (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Acesso a relatórios</span>
          {form.domains.length > 0 ? (
            <span className="text-sm text-muted-foreground">
              {form.domains
                .map((d) => REPORT_DOMAINS.find((m) => m.id === d)?.label ?? d)
                .join(", ")}
            </span>
          ) : (
            <span className="text-xs text-amber-600 dark:text-amber-500">
              Nenhum domínio selecionado , o usuário não verá nenhum relatório.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground text-xs uppercase tracking-wide shrink-0">
        {label}
      </span>
      <span className="text-sm text-foreground text-right min-w-0">
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Painel pós-criação (mostra senha temporária)
// ─────────────────────────────────────────────────────────────────────────

interface CreatedPanelProps {
  password: string;
  copied: boolean;
  onCopy: () => void;
  name: string;
}

function CreatedPanel({ password, copied, onCopy, name }: CreatedPanelProps) {
  return (
    <div className="space-y-4 py-2">
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm text-emerald-500 font-medium">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          {name || "Usuário"} foi adicionado
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Senha temporária
          </p>
          <div className="flex gap-2">
            <Input
              value={password}
              readOnly
              className="font-mono text-sm"
              aria-label="Senha temporária do novo usuário"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onCopy}
              aria-label="Copiar senha"
            >
              {copied ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Compartilhe esta senha com o usuário. Ela não será exibida
            novamente. Será solicitada a troca no primeiro login.
          </p>
        </div>
      </div>
    </div>
  );
}

export default UserFormDialog;
