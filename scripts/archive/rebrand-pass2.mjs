import fs from "node:fs";

const files = [
  "src/lib/i18n/dictionaries/fr.ts",
  "src/lib/i18n/dictionaries/en.ts",
  "src/lib/i18n/dictionaries/es.ts",
  "src/lib/policy/workplace-convention.ts",
];

const pairs = [
  [/Mirok/g, "RitmoKit"],
  [/piso Bati/g, "equipo del estudio"],
  [/Bati floor/g, "studio team"],
  [/del piso Bati/g, "del equipo del estudio"],
  [/Outside Bati's perimeter/g, "Outside studio perimeter"],
  [/Fuera del perímetro de Bati/g, "Fuera del perímetro del estudio"],
  [/Ficha Bati — Latte signature/g, "Ficha studio — Accueil cours débutant"],
  [/Bati Sheet — Signature Latte/g, "Studio guide — Beginner class check-in"],
  [/Constitución Bati/g, "Constitución studio"],
  [/Bati constitution/g, "Studio constitution"],
  [/Bati's 5 values/g, "the studio's 5 values"],
  [/un valor Bati/g, "un valor del estudio"],
  [/Bati value/g, "Studio value"],
  [/Bati guides/g, "Studio guides"],
  [/tableta del restaurante/g, "tableta del estudio"],
  [/propinas del restaurante/g, "propinas (module désactivé)"],
  [/restaurant tips/g, "tips (module retired)"],
  [/for rush/g, "for class"],
  [/studio Bati/g, "équipe studio"],
  [/MAPAQ — Hygiène/g, "CNESST — Sécurité studio"],
  [/MAPAQ — Hygiene/g, "CNESST — Studio safety"],
  [/MAPAQ — Higiene/g, "CNESST — Seguridad estudio"],
  [/inspection CNESST, MAPAQ ou fiscale/g, "inspection CNESST ou paie"],
  [/CNESST, MAPAQ, or fiscal inspection/g, "CNESST or payroll inspection"],
  [/CNESST, MAPAQ o fiscal/g, "CNESST o nómina"],
];

for (const f of files) {
  let s = fs.readFileSync(f, "utf8");
  for (const [re, rep] of pairs) s = s.replace(re, rep);
  fs.writeFileSync(f, s);
  console.log("updated", f);
}
