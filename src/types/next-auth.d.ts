import type { DefaultSession, DefaultUser } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";
import type { PlatformRole, Theme } from "@/generated/prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      platformRole: PlatformRole;
      isOwner: boolean;
      mustChangePassword: boolean;
      avatarUrl: string | null;
      theme: Theme;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    platformRole?: PlatformRole;
    isOwner?: boolean;
    mustChangePassword?: boolean;
    avatarUrl?: string | null;
    theme?: Theme;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    platformRole: PlatformRole;
    isOwner: boolean;
    mustChangePassword: boolean;
    avatarUrl: string | null;
    theme: Theme;
  }
}
