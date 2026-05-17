"use client";

import { REPORT_DOMAINS, type ReportDomainId } from "@/lib/reports/domains";

interface AccessStepProps {
  selected: ReportDomainId[];
  onChange: (domains: ReportDomainId[]) => void;
  /** Domínios que o concedente pode conceder; os demais ficam desabilitados. */
  grantable: ReportDomainId[];
}

/** Etapa "Acesso": checkboxes de domínio de relatório. */
export function AccessStep({ selected, onChange, grantable }: AccessStepProps) {
  function toggle(id: ReportDomainId) {
    onChange(
      selected.includes(id)
        ? selected.filter((d) => d !== id)
        : [...selected, id],
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Selecione os domínios de relatório que este usuário poderá ver.
      </p>
      <ul className="flex flex-col gap-2">
        {REPORT_DOMAINS.map((d) => {
          const disabled = !grantable.includes(d.id);
          return (
            <li key={d.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`dominio-${d.id}`}
                checked={selected.includes(d.id)}
                disabled={disabled}
                onChange={() => toggle(d.id)}
              />
              <label
                htmlFor={`dominio-${d.id}`}
                className={disabled ? "text-muted-foreground" : ""}
              >
                {d.label}
              </label>
            </li>
          );
        })}
      </ul>
      {selected.length === 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          Este usuário ainda não verá nenhum relatório até receber acesso a um
          domínio.
        </p>
      )}
    </div>
  );
}
