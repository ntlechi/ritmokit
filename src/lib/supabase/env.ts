/**
 * Shared Supabase public env — used by edge proxy and Node server actions.
 */
function cleanEnv(value: string | undefined) {
  if (!value) return undefined;
  let trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed || undefined;
}

export function getSupabasePublicEnv() {
  const url = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!url || !anonKey) {
    throw new Error("configError");
  }
  return { url, anonKey };
}

export function getSupabaseServiceRoleEnv() {
  const { url } = getSupabasePublicEnv();
  const serviceRoleKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!serviceRoleKey) {
    throw new Error("configError");
  }
  return { url, serviceRoleKey };
}
