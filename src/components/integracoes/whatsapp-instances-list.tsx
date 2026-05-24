"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, MessageSquare, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  createWhatsappInstance,
  deleteWhatsappInstance,
  listWhatsappInstances,
  toggleWhatsappInstance,
  type WhatsappInstanceItem,
} from "@/lib/actions/whatsapp-instances";
import { cn } from "@/lib/utils";

export function WhatsappInstancesList() {
  const [items, setItems] = useState<WhatsappInstanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCreate, setOpenCreate] = useState(false);
  const [pending, startTransition] = useTransition();
  const [confirmDel, setConfirmDel] = useState<WhatsappInstanceItem | null>(null);

  const reload = () => {
    listWhatsappInstances().then((res) => {
      if (res.success) setItems(res.data ?? []);
      setLoading(false);
    });
  };

  useEffect(reload, []);

  function handleToggle(it: WhatsappInstanceItem, enabled: boolean) {
    startTransition(async () => {
      const res = await toggleWhatsappInstance({ id: it.id, enabled });
      if (!res.success) toast.error(res.error ?? "Erro ao atualizar.");
      reload();
    });
  }

  function handleDelete(it: WhatsappInstanceItem) {
    startTransition(async () => {
      const res = await deleteWhatsappInstance(it.id);
      if (!res.success) toast.error(res.error ?? "Erro ao excluir.");
      else toast.success("Instância excluída.");
      setConfirmDel(null);
      reload();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Instâncias WhatsApp
        </h3>
        <Button
          type="button"
          size="sm"
          onClick={() => setOpenCreate(true)}
          className="h-9"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Nova instância
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          Nenhuma instância cadastrada , clique em &quot;Nova instância&quot;
          para configurar a primeira conta Meta.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li
              key={it.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-3 py-3",
                !it.enabled && "opacity-60",
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                <MessageSquare className="h-4 w-4 text-violet-500" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {it.name}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {it.phoneNumber}
                  <span className="mx-1.5 text-muted-foreground/60">·</span>
                  <span>
                    {it.responseMode === "direct"
                      ? "Resposta direta"
                      : "Webhook n8n"}
                  </span>
                  {it.hasToken ? (
                    <>
                      <span className="mx-1.5 text-muted-foreground/60">·</span>
                      <span className="text-emerald-600 dark:text-emerald-400">
                        Token cifrado
                      </span>
                    </>
                  ) : null}
                </p>
              </div>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Switch
                      checked={it.enabled}
                      onCheckedChange={(v) => handleToggle(it, v)}
                      disabled={pending}
                      aria-label={
                        it.enabled
                          ? "Desativar instância"
                          : "Ativar instância"
                      }
                    />
                  }
                />
                <TooltipContent>
                  {it.enabled ? "Desativar" : "Ativar"}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Excluir instância"
                      onClick={() => setConfirmDel(it)}
                      disabled={pending}
                      className="h-9 w-9 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  }
                />
                <TooltipContent>Excluir</TooltipContent>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}

      <CreateDialog
        open={openCreate}
        onOpenChange={setOpenCreate}
        onCreated={() => {
          setOpenCreate(false);
          reload();
        }}
      />

      <Dialog
        open={confirmDel !== null}
        onOpenChange={(o) => {
          if (!o && !pending) setConfirmDel(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir instância</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Excluir <strong>{confirmDel?.name}</strong>? A ação não pode ser
            desfeita.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setConfirmDel(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => confirmDel && handleDelete(confirmDel)}
            >
              {pending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : null}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [phoneId, setPhoneId] = useState("");
  const [token, setToken] = useState("");
  const [mode, setMode] = useState<"direct" | "n8n_webhook">("direct");
  const [pending, startTransition] = useTransition();

  function reset() {
    setName("");
    setPhone("");
    setBusinessId("");
    setPhoneId("");
    setToken("");
    setMode("direct");
  }

  function handleSubmit() {
    if (!name.trim() || !phone.trim()) {
      toast.error("Nome e número são obrigatórios.");
      return;
    }
    startTransition(async () => {
      const res = await createWhatsappInstance({
        name,
        phoneNumber: phone,
        businessAccountId: businessId || null,
        phoneNumberId: phoneId || null,
        graphApiToken: token || null,
        responseMode: mode,
      });
      if (!res.success) {
        toast.error(res.error ?? "Erro ao criar.");
        return;
      }
      toast.success("Instância criada.");
      reset();
      onCreated();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !pending) {
          reset();
          onOpenChange(false);
        } else {
          onOpenChange(o);
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova instância WhatsApp</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="wi-name">Nome</Label>
            <Input
              id="wi-name"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder="Ex.: Matrix Atendimento"
              disabled={pending}
              maxLength={100}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wi-phone">Número (E.164)</Label>
            <Input
              id="wi-phone"
              value={phone}
              onChange={(e) => setPhone(e.currentTarget.value)}
              placeholder="+5511999999999"
              disabled={pending}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wi-biz">Business Account ID</Label>
              <Input
                id="wi-biz"
                value={businessId}
                onChange={(e) => setBusinessId(e.currentTarget.value)}
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wi-phoneid">Phone Number ID</Label>
              <Input
                id="wi-phoneid"
                value={phoneId}
                onChange={(e) => setPhoneId(e.currentTarget.value)}
                disabled={pending}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wi-token">Graph API Token</Label>
            <Input
              id="wi-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.currentTarget.value)}
              placeholder="Cifrado AES-256 antes de salvar"
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Modo de resposta</Label>
            <CustomSelect
              aria-label="Modo de resposta"
              value={mode}
              onChange={(v) => setMode(v as "direct" | "n8n_webhook")}
              options={[
                { value: "direct", label: "Direta (Graph API)" },
                { value: "n8n_webhook", label: "Webhook n8n" },
              ]}
              triggerClassName="h-9 w-full"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            Cancelar
          </Button>
          <Button type="button" disabled={pending} onClick={handleSubmit}>
            {pending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-1.5 h-4 w-4" />
            )}
            Criar instância
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
