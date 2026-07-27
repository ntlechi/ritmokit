import type { Locale } from "@/lib/i18n/config";

/** Texte type de convention CNESST pour Bati — point de départ proposé par le gérant. */
export const DEFAULT_TIP_AGREEMENT_TEXT_FR = `CONVENTION DE PARTAGE DES POURBOIRES — BATI QUÉBEC

Les employés de la succursale Bati — Québec conviennent de partager les pourboires collectés selon les modalités suivantes, conformément à l'article 50 de la Loi sur les normes du travail (LNT).

1. OBJET
Les pourboires reçus via le terminal de paiement et les commandes mobiles sont versés dans un pot commun et redistribués équitablement selon les heures réellement travaillées (pointages) et le poids de chaque station.

2. POIDS PAR STATION
• Comptoir / Accueil : 1,2 point par heure
• Emballage : 1,0 point par heure
• Cuisine : 0,8 point par heure

3. CALCUL
Pour chaque journée clôturée :
Part employé = (Heures nettes travaillées × Poids station) / Total des points × Montant du pot

4. FRÉQUENCE
Distribution après chaque journée d'affaires, une fois le montant POS saisi par le gérant conformément à la convention.

5. DURÉE
Cette convention entre en vigueur dès son approbation par la majorité absolue (50 % + 1) des employés éligibles et demeure en vigueur jusqu'à modification votée selon les mêmes règles.

6. CONSENTEMENT LIBRE
Chaque employé vote et signe librement. L'employeur n'impose pas cette convention ; il applique uniquement la répartition convenue par l'équipe.`;

export const DEFAULT_TIP_AGREEMENT_TEXT_EN = `TIP-SHARING AGREEMENT — BATI QUEBEC

Employees at the Bati — Quebec location agree to share tips collected under the following terms, in accordance with Quebec Labour Standards Act (LNT) section 50.

1. PURPOSE
Tips received via payment terminal and mobile orders are pooled and redistributed fairly based on actual punched hours and each station's weight.

2. STATION WEIGHTS
• Counter / Front: 1.2 points per hour
• Packaging: 1.0 point per hour
• Kitchen: 0.8 point per hour

3. CALCULATION
For each closed business day:
Employee share = (Net hours worked × Station weight) / Total points × Pool amount

4. FREQUENCY
Distributed after each business day once the POS total is entered by the manager per this agreement.

5. TERM
This agreement takes effect upon approval by an absolute majority (50% + 1) of eligible employees and remains in force until amended by the same voting rules.

6. FREE CONSENT
Each employee votes and signs freely. The employer does not impose this agreement; it only applies the split agreed by the team.`;

export const DEFAULT_TIP_AGREEMENT_TEXT_ES = `CONVENIO DE REPARTO DE PROPINAS — BATI QUÉBEC

Los empleados de la sucursal Bati — Québec acuerdan compartir las propinas recaudadas según los siguientes términos, conforme al artículo 50 de la Ley sobre las normas del trabajo (LNT).

1. OBJETO
Las propinas recibidas por terminal de pago y pedidos móviles se depositan en un fondo común y se redistribuyen de forma justa según las horas realmente trabajadas (fichajes) y el peso de cada estación.

2. PESO POR ESTACIÓN
• Mostrador / Recepción: 1,2 puntos por hora
• Empaque: 1,0 punto por hora
• Cocina: 0,8 puntos por hora

3. CÁLCULO
Para cada día cerrado:
Parte del empleado = (Horas netas trabajadas × Peso estación) / Total de puntos × Monto del fondo

4. FRECUENCIA
Reparto después de cada día de operación, una vez que el gerente ingresa el total del POS conforme al acuerdo.

5. VIGENCIA
Este acuerdo entra en vigor tras la aprobación por mayoría absoluta (50 % + 1) de los empleados elegibles y permanece vigente hasta modificación votada con las mismas reglas.

6. CONSENTIMIENTO LIBRE
Cada empleado vota y firma libremente. El empleador no impone este acuerdo; solo aplica el reparto acordado por el equipo.`;

export function getDefaultTipAgreementText(locale: Locale): string {
  if (locale === "en") return DEFAULT_TIP_AGREEMENT_TEXT_EN;
  if (locale === "es") return DEFAULT_TIP_AGREEMENT_TEXT_ES;
  return DEFAULT_TIP_AGREEMENT_TEXT_FR;
}

/** Affiche le modèle traduit si le gérant n'a pas personnalisé le texte au-delà des 3 défauts. */
export function resolveTipAgreementTextForLocale(stored: string, locale: Locale): string {
  const defaults = new Set(
    (["fr", "en", "es"] as const).map((lang) => getDefaultTipAgreementText(lang)),
  );
  if (defaults.has(stored)) return getDefaultTipAgreementText(locale);
  return stored;
}
