/**
 * Índice da documentação do MCP semântico.
 * Cada seção é um arquivo .ts exportando `meta` e `content` (string markdown).
 * Ordenado por meta.order.
 */

import { meta as quickstartMeta, content as quickstartContent } from "./quickstart";
import { meta as autenticacaoMeta, content as autenticacaoContent } from "./autenticacao";
import { meta as permissoesMeta, content as permissoesContent } from "./permissoes";
import { meta as idempotenciaMeta, content as idempotenciaContent } from "./idempotencia";
import { meta as externalIdMeta, content as externalIdContent } from "./external-id";
import { meta as rateLimitsMeta, content as rateLimitsContent } from "./rate-limits";
import { meta as changelogMeta, content as changelogContent } from "./changelog";

export interface DocSection {
  id: string;
  title: string;
  description: string;
  order: number;
  content: string;
}

export const docSections: DocSection[] = [
  { ...quickstartMeta, content: quickstartContent },
  { ...autenticacaoMeta, content: autenticacaoContent },
  { ...permissoesMeta, content: permissoesContent },
  { ...idempotenciaMeta, content: idempotenciaContent },
  { ...externalIdMeta, content: externalIdContent },
  { ...rateLimitsMeta, content: rateLimitsContent },
  { ...changelogMeta, content: changelogContent },
].sort((a, b) => a.order - b.order);

export function getDocSection(id: string): DocSection | undefined {
  return docSections.find((s) => s.id === id);
}
