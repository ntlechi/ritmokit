/**
 * Strip retired QSR i18n blocks and reword restaurant copy for RitmoKit studios.
 * Run: node scripts/cleanup-qsr-i18n.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "src/lib/i18n");

const files = [
  join(root, "dictionaries.ts"),
  join(root, "dictionaries/en.ts"),
  join(root, "dictionaries/fr.ts"),
  join(root, "dictionaries/es.ts"),
];

function removeObjectBlock(content, marker) {
  const start = content.indexOf(marker);
  if (start === -1) return content;

  let i = start + marker.length;
  while (content[i] !== "{") i += 1;
  let depth = 0;
  let end = i;
  for (; end < content.length; end += 1) {
    const ch = content[end];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  while (content[end] === "," || content[end] === "\r") end += 1;
  if (content[end] === "\n") end += 1;

  return content.slice(0, start) + content.slice(end);
}

const STUDIO_REPLACEMENTS = [
  [/laborCostHint: "Vs today's sales"/g, 'laborCostHint: "Vs today\'s class revenue"'],
  [/laborCostHint: "Vs ventes du jour"/g, 'laborCostHint: "Vs revenus cours du jour"'],
  [/laborCostHint: "Vs ventas del día"/g, 'laborCostHint: "Vs ingresos de clases del día"'],
  [/efficiencyTitle: "Labor vs sales efficiency"/g, 'efficiencyTitle: "Labor vs class revenue"'],
  [/efficiencyTitle: "Efficacité main-d'œuvre vs ventes"/g, 'efficiencyTitle: "Main-d\'œuvre vs revenus cours"'],
  [/efficiencyTitle: "Eficiencia mano de obra vs ventas"/g, 'efficiencyTitle: "Mano de obra vs ingresos de clases"'],
  [
    /efficiencySubtitle: "Hourly curve — rush zones highlighted when the ratio drifts\."/g,
    'efficiencySubtitle: "Hourly curve — peak class blocks highlighted when the ratio drifts."',
  ],
  [
    /efficiencySubtitle: "Courbe horaire — zones de rush mises en évidence quand le ratio dérape\."/g,
    'efficiencySubtitle: "Courbe horaire — pics de cours mis en évidence quand le ratio dérape."',
  ],
  [
    /efficiencySubtitle: "Curva horaria — zonas pico resaltadas cuando el ratio se desvía\."/g,
    'efficiencySubtitle: "Curva horaria — bloques pico resaltados cuando el ratio se desvía."',
  ],
  [/laborSeries: "Labor \$"/g, 'laborSeries: "Labor $"'],
  [/salesSeries: "Sales \$"/g, 'salesSeries: "Class revenue $"'],
  [/salesSeries: "Ventes \$"/g, 'salesSeries: "Revenus cours $"'],
  [/salesSeries: "Ventas \$"/g, 'salesSeries: "Ingresos clases $"'],
  [/peakZone: "Rush zone"/g, 'peakZone: "Peak classes"'],
  [/peakZone: "Zone rush"/g, 'peakZone: "Pic de cours"'],
  [/peakZone: "Zona pico"/g, 'peakZone: "Pico de clases"'],
  [
    /targetSplh: "Target sales per labor hour \(\$\)"/g,
    'targetSplh: "Target students per staff hour"',
  ],
  [
    /targetSplh: "Ventes cibles par heure-personne \(\$\)"/g,
    'targetSplh: "Élèves cibles par heure-personnel"',
  ],
  [
    /targetSplh: "Ventas objetivo por hora-persona \(\$\)"/g,
    'targetSplh: "Alumnos objetivo por hora de personal"',
  ],
  [
    /targetSplhHint: "Sales one labor-hour at this station should generate\."/g,
    'targetSplhHint: "Students one staff hour at this department should cover."',
  ],
  [
    /targetSplhHint: "Ventes qu'une heure de travail à cette station doit générer\."/g,
    'targetSplhHint: "Élèves qu\'une heure de personnel à ce département doit couvrir."',
  ],
  [
    /targetSplhHint: "Ventas que una hora de trabajo en esta estación debe generar\."/g,
    'targetSplhHint: "Alumnos que una hora de personal en este departamento debe cubrir."',
  ],
  [/salesShare: "Share of revenue \(%\)"/g, 'salesShare: "Share of class mix (%)"'],
  [/salesShare: "Part des ventes \(%\)"/g, 'salesShare: "Part du mix de cours (%)"'],
  [/salesShare: "Participación en ventas \(%\)"/g, 'salesShare: "Participación en mix de clases (%)"'],
  [
    /invalidSplh: "Target SPLH must be greater than 0\."/g,
    'invalidSplh: "Target students per hour must be greater than 0."',
  ],
  [
    /invalidSplh: "La cible SPLH doit être supérieure à 0\."/g,
    'invalidSplh: "La cible élèves/heure doit être supérieure à 0."',
  ],
  [
    /invalidSplh: "El SPLH objetivo debe ser mayor que 0\."/g,
    'invalidSplh: "Los alumnos/hora objetivo deben ser mayores que 0."',
  ],
  [
    /panelSubtitle: "Generates a draft schedule from projected sales and staffing targets\."/g,
    'panelSubtitle: "Generates a draft schedule from projected class load and staffing targets."',
  ],
  [
    /panelSubtitle: "Génère un brouillon d'horaire à partir des ventes projetées et des cibles de staffing\."/g,
    'panelSubtitle: "Génère un brouillon d\'horaire à partir de la charge de cours projetée et des cibles de staffing."',
  ],
  [
    /panelSubtitle: "Genera un borrador de horario a partir de ventas proyectadas y objetivos de staffing\."/g,
    'panelSubtitle: "Genera un borrador de horario a partir de la carga de clases proyectada y objetivos de staffing."',
  ],
  [/alertSplhLow: "SPLH dropping"/g, 'alertSplhLow: "Coverage ratio dropping"'],
  [/alertSplhLow: "SPLH en baisse"/g, 'alertSplhLow: "Ratio de couverture en baisse"'],
  [/alertSplhLow: "SPLH bajando"/g, 'alertSplhLow: "Ratio de cobertura bajando"'],
  [/splh: "SPLH"/g, 'splh: "Coverage"'],
  [
    /tooltip: "Need: \{required\} \{station\} \| Scheduled: \{scheduled\} \| SPLH: \{splh\}"/g,
    'tooltip: "Need: {required} {station} | Scheduled: {scheduled} | Coverage: {splh}"',
  ],
  [
    /sidebarSubtitle: "Tune SPLH and revenue share per station\."/g,
    'sidebarSubtitle: "Tune coverage and class-mix share per department."',
  ],
  [
    /sidebarSubtitle: "Ajustez le SPLH et la part des ventes par poste\."/g,
    'sidebarSubtitle: "Ajustez la couverture et la part du mix par département."',
  ],
  [
    /sidebarSubtitle: "Ajuste SPLH y participación en ventas por estación\."/g,
    'sidebarSubtitle: "Ajuste cobertura y participación en mix por departamento."',
  ],
  [/noSalesData: "No sales projection configured for this day\."/g, 'noSalesData: "No class load projection configured for this day."'],
  [/noSalesData: "Aucune projection de ventes configurée pour ce jour\."/g, 'noSalesData: "Aucune projection de charge configurée pour ce jour."'],
  [/noSalesData: "No hay proyección de ventas configurada para este día\."/g, 'noSalesData: "No hay proyección de carga configurada para este día."'],
  [/projectedSales: "projected sales"/g, 'projectedSales: "projected class revenue"'],
  [/projectedSales: "ventes projetées"/g, 'projectedSales: "revenus cours projetés"'],
  [/projectedSales: "ventas proyectadas"/g, 'projectedSales: "ingresos de clases proyectados"'],
  [/namePlaceholder: "e\.g\. Summer week, Friday rush…"/g, 'namePlaceholder: "e.g. Summer week, Saturday peak…"'],
  [/namePlaceholder: "ex\. Semaine d'été, vendredi rush…"/g, 'namePlaceholder: "ex. Semaine d\'été, samedi pic…"'],
  [/namePlaceholder: "ej\. Semana de verano, viernes pico…"/g, 'namePlaceholder: "ej. Semana de verano, sábado pico…"'],
];

function patch(content, isTypeFile) {
  let out = content;

  out = removeObjectBlock(out, "    pos: ");
  out = removeObjectBlock(out, "    arsi: ");

  if (isTypeFile) {
    out = out.replace(/\n        tipsAmount: string;/g, "");
    out = out.replace(/\n        colTips: string;/g, "");
  } else {
    out = out.replace(/\n        tipsAmount: "[^"]+",/g, "");
    out = out.replace(/\n        colTips: "[^"]+",/g, "");
  }

  for (const [pattern, replacement] of STUDIO_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }

  return out;
}

for (const file of files) {
  const before = readFileSync(file, "utf8");
  const after = patch(before, file.endsWith("dictionaries.ts"));
  if (after !== before) {
    writeFileSync(file, after, "utf8");
    console.log("patched", file);
  } else {
    console.log("unchanged", file);
  }
}

console.log("done");
