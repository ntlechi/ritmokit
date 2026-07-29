/**
 * Color-code class cards by dance style (Salsa / Bachata / Kizomba / …).
 * Falls back to a stable hash into the chart palette for unknown styles.
 */

const STYLE_COLORS: Record<string, { accent: string; soft: string }> = {
  salsa: { accent: "var(--style-salsa)", soft: "color-mix(in srgb, var(--style-salsa) 16%, transparent)" },
  bachata: { accent: "var(--style-bachata)", soft: "color-mix(in srgb, var(--style-bachata) 16%, transparent)" },
  kizomba: { accent: "var(--style-kizomba)", soft: "color-mix(in srgb, var(--style-kizomba) 16%, transparent)" },
  zouk: { accent: "#0EA5E9", soft: "color-mix(in srgb, #0EA5E9 16%, transparent)" },
  tango: { accent: "#F59E0B", soft: "color-mix(in srgb, #F59E0B 16%, transparent)" },
  west: { accent: "#14B8A6", soft: "color-mix(in srgb, #14B8A6 16%, transparent)" },
  "west coast": { accent: "#14B8A6", soft: "color-mix(in srgb, #14B8A6 16%, transparent)" },
  fusion: { accent: "#A78BFA", soft: "color-mix(in srgb, #A78BFA 16%, transparent)" },
};

const FALLBACK = [
  "var(--style-salsa)",
  "var(--style-bachata)",
  "var(--style-kizomba)",
  "#0EA5E9",
  "#F59E0B",
  "#A78BFA",
] as const;

function hashStyle(style: string): number {
  let h = 0;
  for (let i = 0; i < style.length; i++) h = (h * 31 + style.charCodeAt(i)) >>> 0;
  return h;
}

export function styleColors(style: string): { accent: string; soft: string } {
  const key = style.trim().toLowerCase();
  if (STYLE_COLORS[key]) return STYLE_COLORS[key]!;
  for (const [name, colors] of Object.entries(STYLE_COLORS)) {
    if (key.includes(name)) return colors;
  }
  const accent = FALLBACK[hashStyle(key) % FALLBACK.length]!;
  return {
    accent,
    soft: `color-mix(in srgb, ${accent} 16%, transparent)`,
  };
}
