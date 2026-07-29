import type { CSSProperties } from "react";

/**
 * RitmoKit app icon glyph for `next/og` ImageResponse routes.
 */
export function RitmoKitMark({ size }: { size: number }) {
  const containerStyle: CSSProperties = {
    width: size,
    height: size,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(145deg, #e11d48 0%, #7c3aed 55%, #0ea5e9 100%)",
    borderRadius: size * 0.22,
  };

  const glyphStyle: CSSProperties = {
    color: "#ffffff",
    fontSize: size * 0.44,
    fontWeight: 800,
    fontFamily: "Helvetica, Arial, sans-serif",
    letterSpacing: -size * 0.03,
  };

  return (
    <div style={containerStyle}>
      <span style={glyphStyle}>RK</span>
    </div>
  );
}
