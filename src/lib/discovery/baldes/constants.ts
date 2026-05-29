/** count > 50 (ou seja, >= 51) vira Balde A. */
export const BALDE_A_MIN = 51;
/** count entre 0 e 50 (inclusive) é candidato a Balde B. */
export const BALDE_B_MAX = 50;

/** Sufixos de nome técnico (modelo termina com um destes -> C-técnico). */
export const SUFIXOS_TECNICOS = [
  ".base",
  ".metodos",
  ".arvore",
  ".wizard",
  ".modelo.impressao",
  ".impressao",
  ".configuracao.base",
  ".configuracao",
  ".settings",
  ".mixin",
] as const;

/** Prefixos de módulos puramente UI/infra/sistema do Odoo -> C-técnico. */
export const PREFIXOS_UI_INFRA = new Set<string>([
  "ir",
  "ks_dashboard_ninja",
  "ks",
  "web_editor",
  "web",
  "report",
  "mail",
  "discuss",
  "bus",
  "base_import",
  "base",
  "hardware",
  "change",
  "api",
]);

/** Prefixos reconhecidos como domínio de negócio (baixo volume -> Balde B). */
export const PREFIXOS_NEGOCIO = new Set<string>([
  "sped",
  "finan",
  "contabil",
  "pedido",
  "estoque",
  "producao",
  "crm",
  "relatorio",
  "wms",
  "auditoria",
  "rh",
  "res",
  "reinf",
]);

/** Os 5 domínios prioritários do roadmap (destaque no relatório). */
export const DOMINIOS_PRIORITARIOS = ["sped", "crm", "pedido", "finan", "contabil"] as const;
