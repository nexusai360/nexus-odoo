"use client";

import { useTransition } from "react";
import { Monitor, Moon, Palette, Sun } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTheme } from "@/components/providers/theme-provider";
import { updateProfile } from "@/lib/actions/profile";

type ThemeOption = "dark" | "light" | "system";

interface AppearanceCardProps {
  initialTheme: ThemeOption;
}

const THEME_OPTIONS: Array<{
  value: ThemeOption;
  label: string;
  description: string;
  icon: typeof Sun;
}> = [
  {
    value: "light",
    label: "Claro",
    description: "Tema claro",
    icon: Sun,
  },
  {
    value: "dark",
    label: "Escuro",
    description: "Tema escuro padrão",
    icon: Moon,
  },
  {
    value: "system",
    label: "Sistema",
    description: "Segue o sistema operacional",
    icon: Monitor,
  },
];

export function AppearanceCard({ initialTheme }: AppearanceCardProps) {
  const { theme, setTheme } = useTheme();
  const [isPending, start] = useTransition();

  const active: ThemeOption = (theme as ThemeOption | undefined) ?? initialTheme;

  function handleSelect(option: ThemeOption) {
    if (option === active) return;
    setTheme(option);
    start(async () => {
      const result = await updateProfile({ theme: option });
      if (!result.success) {
        toast.error(result.error || "Não foi possível salvar o tema");
      }
    });
  }

  return (
    <Card className="rounded-2xl border border-border bg-muted/30 p-2">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base text-foreground">
          <Palette
            className="h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          Aparência
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          role="radiogroup"
          aria-label="Tema da plataforma"
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = active === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`${option.label} , ${option.description}`}
                onClick={() => handleSelect(option.value)}
                disabled={isPending}
                className={[
                  "flex h-28 flex-col items-center justify-center gap-2 rounded-xl border p-4 text-center outline-none transition-all duration-200 cursor-pointer",
                  "focus-visible:ring-2 focus-visible:ring-ring/50",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                  selected
                    ? "border-violet-500 bg-violet-500/5 text-violet-300 ring-2 ring-violet-500"
                    : "border-border bg-muted/30 text-muted-foreground hover:border-muted-foreground/30 hover:bg-muted/50 hover:text-foreground",
                ].join(" ")}
              >
                <Icon
                  className={[
                    "h-5 w-5",
                    selected ? "text-violet-400" : "",
                  ].join(" ")}
                  aria-hidden="true"
                />
                <span
                  className={[
                    "text-sm font-semibold",
                    selected ? "text-violet-200" : "text-foreground",
                  ].join(" ")}
                >
                  {option.label}
                </span>
                <span className="text-xs leading-tight text-muted-foreground">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
