import type { CSSProperties } from "react";

/**
 * Renders the Mirok wordmark for use with `next/og` ImageResponse.
 * Kept deliberately minimal (Apple/Linear aesthetic): a single glyph
 * on a high-contrast rounded surface, no external image assets.
 */
export function MirokMark({ size }: { size: number }) {
  const containerStyle: CSSProperties = {
    width: size,
    height: size,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0b0b0c",
    borderRadius: size * 0.22,
  };

  const glyphStyle: CSSProperties = {
    color: "#ffffff",
    fontSize: size * 0.56,
    fontWeight: 700,
    fontFamily: "Helvetica, Arial, sans-serif",
    letterSpacing: -size * 0.02,
  };

  return (
    <div style={containerStyle}>
      <span style={glyphStyle}>M</span>
    </div>
  );
}
