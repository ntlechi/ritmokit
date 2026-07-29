import fs from "node:fs";

const files = [
  "src/lib/i18n/dictionaries/en.ts",
  "src/lib/i18n/dictionaries/es.ts",
];

const pairs = [
  [/helpDesc: "Simple guides for schedule, time clock, front desk, and training."/g,
    'helpDesc: "Simple guides for schedule, time clock, front desk, and training."'],
  [/helpDesc: "Guías para horario, fichaje, recepción y formación."/g,
    'helpDesc: "Guías para horario, fichaje, recepción y formación."'],
  [/Bati floor rules/g, "Studio team rules"],
  [/Reglas del piso Bati/g, "Reglas del equipo del estudio"],
  [/Reglas del equipo del estudio — lee/g, "Reglas del equipo del estudio — lee"],
  [/Bati floor rules — read/g, "Studio team rules — read"],
  [/tagged to a Bati value/g, "tagged to a studio value"],
  [/etiquetado con un valor Bati/g, "etiquetado con un valor del estudio"],
  [/Studio value/g, "Studio value"],
  [/Activate Bati's 5 values/g, "Activate the studio's 5 values"],
  [/Activa los 5 valores Bati/g, "Activa los 5 valores del estudio"],
  [/Studio guides, CNESST/g, "Studio guides, CNESST"],
  [/Fichas del estudio, seguridad CNESST/g, "Fichas del estudio, seguridad CNESST"],
  [/#kitchen, #counter/g, "#instructors, #frontdesk"],
  [/#kitchen, #services/g, "#instructors, #frontdesk"],
  [/#cocina, #mostrador/g, "#instructores, #recepcion"],
  [/Each station has its own channel \(#kitchen/g,
    "Each department has its own channel (#instructors"],
  [/Cada estación tiene su canal \(#cocina/g,
    "Cada departamento tiene su canal (#instructores"],
  [/Restaurant tips are shared/g, "Tips module is retired for RitmoKit studios"],
  [/Las propinas del restaurante se reparten/g, "El módulo de propinas está desactivado en RitmoKit"],
  [/Les pourboires du restaurant/g, "Les pourboires ne sont pas activés"],
  [/What is Code Red\?/g, "How do I request a shift swap?"],
  [/Qu'est-ce que Code Rouge/g, "Comment demander un échange de quart"],
  [/¿Qué es Code Rouge/g, "¿Cómo pedir un intercambio de turno"],
  [/Code Red is a staffing emergency/g, "Open your shift in the mobile calendar and use Request swap"],
  [/Une urgence de staffing/g, "Ouvre ton quart dans le calendrier mobile et utilise Demander un échange"],
  [/Cuisine 101/g, "Front desk 101"],
  [/Cocina 101/g, "Recepción 101"],
  [/\(Kitchen, Service, Cleaning…\)/g, "(Instructors, Front desk, Facilities…)"],
  [/\(Cocina, Servicio, Limpieza…\)/g, "(Instructores, Recepción, Mantenimiento…)"],
  [/trigger Code Red/g, "contact available instructors via Messages"],
  [/declenche Code Rouge/g, "contacte les instructeurs disponibles via Messages"],
  [/activar Code Rouge/g, "contacta instructores disponibles vía Mensajes"],
  [/Code Red…/g, "shift reminders…"],
  [/Code Rouge…/g, "rappels de quart…"],
];

for (const f of files) {
  let s = fs.readFileSync(f, "utf8");
  for (const [re, rep] of pairs) s = s.replace(re, rep);
  fs.writeFileSync(f, s);
  console.log("updated", f);
}

// Mirror key FR help fixes onto EN/ES FAQ if patterns exist
const en = fs.readFileSync("src/lib/i18n/dictionaries/en.ts", "utf8");
if (en.includes("Code Red")) {
  console.warn("EN still contains Code Red — manual review may be needed");
}
