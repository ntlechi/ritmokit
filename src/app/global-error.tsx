"use client";

/**
 * Last-resort boundary — must render its own <html>/<body> because the root
 * layout may have failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#f4f4f5",
          color: "#18181b",
        }}
      >
        <div style={{ maxWidth: 360, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>Mirok</h1>
          <p style={{ fontSize: 14, color: "#71717a", margin: "0 0 16px" }}>
            Une erreur critique s&apos;est produite.
            {error.digest ? ` (réf. ${error.digest})` : ""}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              height: 40,
              padding: "0 16px",
              borderRadius: 8,
              border: "none",
              background: "#18181b",
              color: "#fff",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Réessayer
          </button>
        </div>
      </body>
    </html>
  );
}
