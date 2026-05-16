"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Save, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { updateProfile } from "@/lib/actions/profile";

interface PersonalInfoCardProps {
  initialName: string;
  initialAvatarUrl: string | null;
  createdAt: string;
}

const AVATAR_MAX_SIZE = 128;

function resizeImage(file: File, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = maxSize;
        canvas.height = maxSize;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas não suportado"));
          return;
        }
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        ctx.drawImage(img, sx, sy, size, size, 0, 0, maxSize, maxSize);
        resolve(canvas.toDataURL("image/webp", 0.85));
      };
      img.onerror = () => reject(new Error("Imagem inválida"));
      img.src = (event.target?.result as string) ?? "";
    };
    reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
    reader.readAsDataURL(file);
  });
}

function formatMemberSince(iso: string): string {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(date);
  } catch {
    return "";
  }
}

export function PersonalInfoCard({
  initialName,
  initialAvatarUrl,
  createdAt,
}: PersonalInfoCardProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl);
  const [isPending, start] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const memberSince = useMemo(() => formatMemberSince(createdAt), [createdAt]);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem");
      return;
    }
    try {
      const resized = await resizeImage(file, AVATAR_MAX_SIZE);
      setAvatarUrl(resized);
    } catch {
      toast.error("Não foi possível processar a imagem");
    }
  }

  function handleSave() {
    if (name.trim().length < 2) {
      toast.error("Informe um nome com pelo menos 2 caracteres");
      return;
    }
    start(async () => {
      const result = await updateProfile({ name: name.trim(), avatarUrl });
      if (result.success) {
        toast.success("Perfil atualizado");
        router.refresh();
      } else {
        toast.error(result.error || "Erro ao salvar perfil");
      }
    });
  }

  const initials = (
    name.trim().charAt(0) ||
    initialName.charAt(0) ||
    "?"
  ).toUpperCase();

  return (
    <Card className="rounded-2xl border border-border bg-muted/30 p-2">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base text-foreground">
          <UserIcon
            className="h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          Informações Pessoais
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <div className="group relative shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isPending}
              aria-label="Trocar foto do perfil"
              className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-border bg-muted outline-none transition-all duration-200 hover:border-violet-500/60 focus-visible:border-violet-500 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={`Foto de ${initialName}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-2xl font-semibold text-muted-foreground">
                  {initials}
                </span>
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-visible:opacity-100">
                <Camera className="h-5 w-5" aria-hidden="true" />
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
            />
          </div>

          <div className="flex w-full flex-1 flex-col gap-1.5">
            <Label htmlFor="profile-name">Nome</Label>
            <Input
              id="profile-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isPending}
              maxLength={120}
              autoComplete="name"
            />
            {memberSince ? (
              <p className="text-xs text-muted-foreground">
                Membro desde {memberSince}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={isPending}
            className="h-10 cursor-pointer bg-violet-600 px-4 text-white hover:bg-violet-700"
          >
            {isPending ? (
              <Loader2
                className="mr-1.5 h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
            )}
            Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
