import type { LucideIcon } from "lucide-react";
import { PageHeaderHeightProbe } from "./page-header-height-probe";

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  /** Conteúdo colado ao título (ex.: botão de tour). Fica logo após o `h1`. */
  titleAccessory?: React.ReactNode;
  /** Ações à direita do cabeçalho. */
  actions?: React.ReactNode;
}

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  titleAccessory,
  actions,
}: PageHeaderProps) {
  return (
    <PageHeaderHeightProbe className="mb-6 flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600/10">
          <Icon className="h-5 w-5 text-violet-500" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {titleAccessory}
          </div>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div>{actions}</div> : null}
    </PageHeaderHeightProbe>
  );
}
