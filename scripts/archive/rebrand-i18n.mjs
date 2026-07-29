import fs from "node:fs";

const files = [
  "src/lib/i18n/dictionaries/fr.ts",
  "src/lib/i18n/dictionaries/en.ts",
  "src/lib/i18n/dictionaries/es.ts",
];

const pairs = [
  [/Bienvenue chez Bati/g, "Bienvenue dans votre studio"],
  [/Welcome to Bati/g, "Welcome to your studio"],
  [/Bienvenido a Bati/g, "Bienvenido a tu estudio"],
  [/Plancher Bati/g, "Équipe studio"],
  [/Bati Floor/g, "Studio team"],
  [/Piso Bati/g, "Equipo del estudio"],
  [/chez Bati/g, "au studio"],
  [/at Bati/g, "at the studio"],
  [/en Bati/g, "en el estudio"],
  [/périmètre Bati/g, "périmètre du studio"],
  [/Bati perimeter/g, "studio perimeter"],
  [/perímetro Bati/g, "perímetro del estudio"],
  [/Constitution Bati/g, "Constitution studio"],
  [/valeurs Bati/g, "valeurs studio"],
  [/Valeur Bati/g, "Valeur studio"],
  [/Bati values/g, "studio values"],
  [/valores Bati/g, "valores del estudio"],
  [/Valor Bati/g, "Valor del estudio"],
  [/culture Bati/g, "culture studio"],
  [/Bati culture/g, "studio culture"],
  [/cultura Bati/g, "cultura del estudio"],
  [/Fiches Bati/g, "Fiches studio"],
  [/Fiche Bati/g, "Fiche studio"],
  [/Bati sheets/g, "Studio guides"],
  [/Bati cards/g, "Studio guides"],
  [/Fichas Bati/g, "Fichas del estudio"],
  [/Alignement culture Bati/g, "Alignement culture studio"],
  [/du restaurant pour pointer/g, "du studio pour pointer"],
  [/restaurant tablet/g, "studio tablet"],
  [/restaurante para fichar/g, "estudio para fichar"],
  [/tablette du restaurant/g, "tablette du studio"],
  [/too far from the restaurant/g, "too far from the studio"],
  [/lejos del restaurante/g, "lejos del estudio"],
  [/CUISINE: "Cuisine"/g, 'INSTRUCTEURS: "Instructeurs"'],
  [/CUISINE: "Kitchen"/g, 'INSTRUCTEURS: "Instructors"'],
  [/CUISINE: "Cocina"/g, 'INSTRUCTEURS: "Instructores"'],
  [/COMPTOIR: "Comptoir"/g, 'ACCUEIL: "Accueil"'],
  [/COMPTOIR: "Counter"/g, 'ACCUEIL: "Front desk"'],
  [/COMPTOIR: "Mostrador"/g, 'ACCUEIL: "Recepción"'],
  [/EMBALLAGE: "Emballage"/g, 'ENTRETIEN: "Entretien"'],
  [/EMBALLAGE: "Packing"/g, 'ENTRETIEN: "Facilities"'],
  [/EMBALLAGE: "Empaque"/g, 'ENTRETIEN: "Mantenimiento"'],
  [
    /helpDesc: "Guides simples pour le plancher, la pointeuse, les pourboires et les formations."/g,
    'helpDesc: "Guides pour le calendrier, la pointeuse, Accueil et les formations."',
  ],
  [
    /helpDesc: "Simple guides for the floor, time clock, tips, and training."/g,
    'helpDesc: "Simple guides for schedule, time clock, front desk, and training."',
  ],
  [
    /helpDesc: "Guías simples para el piso, fichaje, propinas y formación."/g,
    'helpDesc: "Guías para horario, fichaje, recepción y formación."',
  ],
  [/#cuisine, #comptoir/g, "#instructeurs, #accueil"],
  [/#cuisine, #services/g, "#instructeurs, #accueil"],
  [/\(Cuisine, Services, Entretiens…\)/g, "(Instructeurs, Accueil, Entretien…)"],
  [/\(Kitchen, Service, Cleaning…\)/g, "(Instructors, Front desk, Facilities…)"],
  [/Ex\. : Fiche studio — Latte signature/g, "Ex. : Fiche studio — Accueil cours débutant"],
  [/Ex\. : Retard de 12 min sans avis RitmoKit le 10 juillet, shift midi comptoir…/g,
    "Ex. : Retard de 12 min sans avis RitmoKit le 10 juillet, quart Accueil soir…"],
];

for (const f of files) {
  let s = fs.readFileSync(f, "utf8");
  for (const [re, rep] of pairs) s = s.replace(re, rep);
  fs.writeFileSync(f, s);
  console.log("updated", f);
}
