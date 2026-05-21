export const meta = {
  id: "permissoes",
  title: "Permissões (RBAC)",
  description: "Capabilities, módulos, ações e as 7 camadas de controle.",
  order: 3,
};

export const content = `
# Permissões e RBAC

O MCP semântico implementa **RBAC em 7 camadas** — controle de acesso estrutural, não dependente de prompt.

---

## Capabilities

Cada chave de API declara suas **capabilities** no formato:

\`\`\`json
{
  "version": 1,
  "read": ["estoque", "financeiro"],
  "write": {
    "crm": ["res_partner.create"]
  }
}
\`\`\`

- **read** — lista de módulos que a chave pode consultar
- **write** — mapa de módulo → lista de ações permitidas (ex.: \`res_partner.create\`)

---

## Módulos disponíveis

| Módulo | Operações |
|---|---|
| \`estoque\` | read |
| \`financeiro\` | read |
| \`comercial\` | read |
| \`fiscal\` | read |
| \`cadastros\` | read |
| \`contabil\` | read |
| \`crm\` | read, write |

---

## As 7 camadas de controle

1. **Catálogo filtrado** — a resposta de \`tools/list\` já é filtrada pelas capabilities da chave
2. **Validação no handler** — todo handler verifica capability antes de executar
3. **Tenant scoping** — queries injetam automaticamente o \`tenantId\` da chave
4. **Role Postgres** — usuário DB com GRANTs mínimos (read-only para consultas)
5. **RLS (opcional)** — Row-Level Security no Postgres para isolamento extra
6. **Validação Zod** — input e output validados por schema tipado
7. **Audit + rate limit** — toda chamada é logada; limite por chave por minuto

---

## Versão de capabilities

Chaves criadas antes de uma tool ser adicionada ao catálogo **não enxergam** essa tool automaticamente (campo \`addedInVersion\` na tool vs. \`capabilitiesVersion\` da chave).

Para conceder acesso a tools novas, edite a chave e salve — isso atualiza a \`capabilitiesVersion\`.

---

## Scope mínimo recomendado

Conceda apenas o necessário:

\`\`\`json
// ✅ Bom — só leitura de estoque
{ "version": 1, "read": ["estoque"], "write": {} }

// ⚠️ Excessivo — evite conceder todos os módulos
{ "version": 1, "read": ["estoque","financeiro","comercial","fiscal","cadastros","contabil","crm"], "write": { "crm": ["res_partner.create"] } }
\`\`\`

Tools marcadas como **Sensível** (badge laranja) requerem permissão de escrita explícita e geram audit extra.
`;
