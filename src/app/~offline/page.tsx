export default function OfflinePage() {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
          background: "#09090b",
          color: "#fafafa",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <div style={{ fontSize: "2rem", fontWeight: 600, letterSpacing: "-0.025em" }}>
          RitmoKit
        </div>
        <p style={{ fontSize: "1rem", color: "#a1a1aa", maxWidth: 360 }}>
          Vous êtes hors ligne. Vos derniers horaires consultés restent
          disponibles — reconnectez-vous pour les mettre à jour.
        </p>
      </body>
    </html>
  );
}
