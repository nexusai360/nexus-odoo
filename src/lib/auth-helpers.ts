import bcrypt from "bcryptjs";
import { pgPool } from "@/lib/pg-pool";
import { checkLoginRateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import type { PlatformRole, Theme } from "@/generated/prisma/client";

interface Credentials {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  platformRole: PlatformRole;
  isOwner: boolean;
  mustChangePassword: boolean;
  avatarUrl: string | null;
  theme: Theme;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  password: string;
  platform_role: PlatformRole;
  is_owner: boolean;
  is_active: boolean;
  must_change_password: boolean;
  avatar_url: string | null;
  theme: Theme;
}

export async function authorizeCredentials(
  credentials: Credentials,
  ipAddress: string,
): Promise<AuthUser | null> {
  const { email, password } = credentials;
  if (!email || !password) return null;

  const rateLimit = await checkLoginRateLimit(email, ipAddress);
  if (!rateLimit.allowed) {
    throw new Error(
      "Muitas tentativas de login. Tente novamente em 15 minutos.",
    );
  }

  const userResult = await pgPool.query<UserRow>(
    `SELECT id, email, name, password, platform_role, is_owner, is_active,
            must_change_password, avatar_url, theme
     FROM users WHERE email = $1`,
    [email],
  );
  const user = userResult.rows[0];

  if (!user || !user.is_active) {
    logAudit({
      userId: user?.id,
      action: "login_failed",
      ipAddress,
      details: { email, reason: !user ? "user_not_found" : "inactive" },
    });
    return null;
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    logAudit({
      userId: user.id,
      action: "login_failed",
      ipAddress,
      details: { email, reason: "invalid_password" },
    });
    return null;
  }

  await pgPool.query(
    `UPDATE users SET last_login_at = NOW(), last_login_ip = $1 WHERE id = $2`,
    [ipAddress, user.id],
  );

  logAudit({
    userId: user.id,
    action: "login_succeeded",
    ipAddress,
    details: { email },
  });

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    platformRole: user.platform_role,
    isOwner: user.is_owner,
    mustChangePassword: user.must_change_password,
    avatarUrl: user.avatar_url,
    theme: user.theme,
  };
}

const PUBLIC_ROUTES = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
];
const PUBLIC_PREFIXES = ["/api/auth/", "/api/health"];

export function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}
