import type { ReactNode } from "react";
import { requireMenuAccess } from "@/lib/nav/require-menu-access";

/**
 * Layout da tela de Configuração da plataforma.
 * Gate: o nível do menu "Configuração" (padrão super_admin). Este menu é
 * travado: o super_admin sempre entra, mesmo com o nível em "off". É a trava
 * anti-lockout, ninguém consegue se trancar fora da própria configuração.
 *
 * Só o super_admin salva as configurações; um admin que receba acesso ao menu
 * vê a tela em modo leitura.
 *
 * RBAC v2: defesa em profundidade.
 */
export default async function ConfiguracaoLayout({ children }: { children: ReactNode }) {
  await requireMenuAccess("configuracao");
  return <>{children}</>;
}
