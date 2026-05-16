"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { SessionProvider } from "next-auth/react";

type ThemePreference = "dark" | "light" | "system";
type ResolvedTheme = "dark" | "light";

interface ThemeContextValue {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const ONE_YEAR = 60 * 60 * 24 * 365;

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

function applyClass(resolved: ResolvedTheme) {
  const el = document.documentElement;
  el.classList.remove("dark", "light");
  el.classList.add(resolved);
  el.style.colorScheme = resolved;
}

function resolveSystem(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

interface ProvidersProps {
  children: ReactNode;
  initialTheme: ResolvedTheme;
}

function ThemeProvider({
  children,
  initialTheme,
}: ProvidersProps) {
  // Preferência vem do cookie (client), ou fallback para initialTheme (SSR).
  const [theme, setThemeState] = useState<ThemePreference>(() => {
    const pref = readCookie("theme-pref");
    if (pref === "dark" || pref === "light" || pref === "system") return pref;
    return initialTheme;
  });

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(initialTheme);

  // Aplica mudanças de preferência: calcula resolvido, grava cookies, muta html.
  useEffect(() => {
    const resolved: ResolvedTheme = theme === "system" ? resolveSystem() : theme;
    setResolvedTheme(resolved);
    writeCookie("theme", resolved);
    writeCookie("theme-pref", theme);
    applyClass(resolved);
  }, [theme]);

  // Listener de matchMedia apenas quando preferência é "system".
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const resolved: ResolvedTheme = mq.matches ? "dark" : "light";
      setResolvedTheme(resolved);
      writeCookie("theme", resolved);
      applyClass(resolved);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    // Persiste preferência no banco sem esperar resposta (não afeta UI).
    fetch("/api/user/theme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: next }),
    }).catch(() => {
      /* ignorar — cookies e UI já foram atualizados */
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme precisa estar dentro de <Providers>");
  }
  return ctx;
}

export function Providers({
  children,
  initialTheme,
}: {
  children: ReactNode;
  initialTheme: ResolvedTheme;
}) {
  return (
    <SessionProvider>
      <ThemeProvider initialTheme={initialTheme}>{children}</ThemeProvider>
    </SessionProvider>
  );
}
