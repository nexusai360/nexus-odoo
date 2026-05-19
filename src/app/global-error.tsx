"use client";

/**
 * global-error.tsx — fallback de erro no nível raiz da aplicação.
 *
 * Renderiza seu próprio <html>/<body> (substitui o root layout). Mantido
 * mínimo e estático para não depender de cookies/contexto no prerender.
 */

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#0a0a0a",
          color: "#fafafa",
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>
            Algo deu errado
          </h1>
          <p style={{ color: "#a1a1aa", marginTop: "0.5rem" }}>
            Ocorreu um erro inesperado. Tente novamente.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              padding: "0.5rem 1.25rem",
              borderRadius: "0.5rem",
              border: "none",
              background: "#7c3aed",
              color: "#fff",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Recarregar
          </button>
        </div>
      </body>
    </html>
  );
}
