import { cookies } from "next/headers";

export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

export const THEME_COOKIE = "theme";
export const THEME_PREF_COOKIE = "theme-pref";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 ano

/**
 * Lê o tema resolvido ("dark" | "light") do cookie para uso em SSR.
 * Default: "dark".
 */
export async function getResolvedThemeFromCookie(): Promise<ResolvedTheme> {
  const store = await cookies();
  const value = store.get(THEME_COOKIE)?.value;
  return value === "light" ? "light" : "dark";
}

/**
 * Lê a preferência de tema ("dark" | "light" | "system") do cookie.
 * Default: "dark".
 */
export async function getThemePreferenceFromCookie(): Promise<ThemePreference> {
  const store = await cookies();
  const value = store.get(THEME_PREF_COOKIE)?.value;
  if (value === "light" || value === "dark" || value === "system") return value;
  return "dark";
}
