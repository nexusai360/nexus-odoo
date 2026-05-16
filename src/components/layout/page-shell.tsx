import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "wide" | "narrow";

interface Props {
  variant?: Variant;
  children: ReactNode;
  className?: string;
}

export function PageShell({ variant = "wide", children, className }: Props) {
  const max = variant === "wide" ? "max-w-[1600px]" : "max-w-7xl";
  return (
    <div className={cn(max, "mx-auto px-4 sm:px-6 lg:px-8 xl:px-10", className)}>
      {children}
    </div>
  );
}
