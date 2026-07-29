/**
 * Dance-studio station defaults.
 *
 * A `Station` row is either a bookable ROOM or a staff DEPARTMENT. Rooms carry
 * capacity/surface for $/m² analytics; departments only group the roster.
 */

export type StationKindValue = "ROOM" | "DEPARTMENT";

export type StationSeedDef = {
  slug: string;
  kind: StationKindValue;
  nameFr: string;
  nameEn: string;
  nameEs: string;
  colorHex: string;
  sortOrder: number;
  capacity?: number;
  surfaceSqm?: number;
};

export const DANCE_ROOMS: StationSeedDef[] = [
  {
    slug: "studio-a",
    kind: "ROOM",
    nameFr: "Studio A",
    nameEn: "Studio A",
    nameEs: "Estudio A",
    colorHex: "#E11D48",
    sortOrder: 1,
    capacity: 40,
    surfaceSqm: 110,
  },
  {
    slug: "studio-b",
    kind: "ROOM",
    nameFr: "Studio B",
    nameEn: "Studio B",
    nameEs: "Estudio B",
    colorHex: "#8B5CF6",
    sortOrder: 2,
    capacity: 28,
    surfaceSqm: 75,
  },
  {
    slug: "studio-c",
    kind: "ROOM",
    nameFr: "Studio C",
    nameEn: "Studio C",
    nameEs: "Estudio C",
    colorHex: "#0EA5E9",
    sortOrder: 3,
    capacity: 18,
    surfaceSqm: 48,
  },
  {
    slug: "hall-accueil",
    kind: "ROOM",
    nameFr: "Hall d'accueil",
    nameEn: "Lobby",
    nameEs: "Vestíbulo",
    colorHex: "#14B8A6",
    sortOrder: 4,
    capacity: 25,
    surfaceSqm: 40,
  },
];

export const DANCE_DEPARTMENTS: StationSeedDef[] = [
  {
    slug: "instructeurs",
    kind: "DEPARTMENT",
    nameFr: "Instructeurs",
    nameEn: "Instructors",
    nameEs: "Instructores",
    colorHex: "#F59E0B",
    sortOrder: 11,
  },
  {
    slug: "accueil",
    kind: "DEPARTMENT",
    nameFr: "Accueil",
    nameEn: "Front Desk",
    nameEs: "Recepción",
    colorHex: "#10B981",
    sortOrder: 12,
  },
  {
    slug: "direction",
    kind: "DEPARTMENT",
    nameFr: "Direction",
    nameEn: "Management",
    nameEs: "Dirección",
    colorHex: "#6366F1",
    sortOrder: 13,
  },
  {
    slug: "entretien",
    kind: "DEPARTMENT",
    nameFr: "Entretien",
    nameEn: "Facilities",
    nameEs: "Mantenimiento",
    colorHex: "#64748B",
    sortOrder: 14,
  },
];

export const DANCE_STATIONS: StationSeedDef[] = [...DANCE_ROOMS, ...DANCE_DEPARTMENTS];

/** Legacy station slug → dance department slug, for migrating existing rosters. */
export const LEGACY_STATION_TO_DEPARTMENT: Record<string, string> = {
  cuisine: "instructeurs",
  emballage: "instructeurs",
  services: "accueil",
  comptoir: "accueil",
  "gerants-jour": "direction",
  "gerants-soir": "direction",
  entretiens: "entretien",
};

export const LEGACY_STATION_SLUGS = Object.keys(LEGACY_STATION_TO_DEPARTMENT);
