import "server-only";

/**
 * Sérialise un objet en JSON avec les clés triées récursivement (l'ordre
 * des éléments dans les tableaux est préservé — il reflète l'ordre
 * chronologique des preuves). Un manifeste canonique garantit que deux
 * générations portant sur des données identiques produisent le même hash,
 * indépendamment de l'ordre d'insertion des champs en JS.
 */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value), null, 2);
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortDeep);
  }
  if (value !== null && typeof value === "object") {
    const sortedKeys = Object.keys(value as Record<string, unknown>).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      result[key] = sortDeep((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
}
