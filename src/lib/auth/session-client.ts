import type { Role } from "@/generated/prisma/enums";

/** Client-safe role gates — mirror of `lib/auth/session.ts` without server-only. */
export function canAccessManagerSettings(role: Role) {
  return role === "MANAGER" || role === "OWNER" || role === "ADMIN";
}

export function canAccessAdminSettings(role: Role) {
  return role === "ADMIN";
}

/**
 * Authoring the training catalog. Same tier as the rest of the manager
 * settings hub — a shift manager needs to update SOPs and courses on the
 * fly, not just browse them.
 */
export function canManageTrainingCatalog(role: Role) {
  return canAccessManagerSettings(role);
}
