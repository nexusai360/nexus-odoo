import Link from "next/link";

/**
 * not-found.tsx — página 404 da aplicação. Estática e leve, sem dependência
 * de cookies/contexto (evita conflito no prerender com o root layout).
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-5xl font-bold text-violet-500">404</p>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Página não encontrada</h1>
        <p className="text-sm text-muted-foreground">
          O endereço acessado não existe ou foi movido.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="mt-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700"
      >
        Voltar ao início
      </Link>
    </div>
  );
}
