import "server-only";

import { randomBytes } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";

export type InviteEmployeeResult =
  | { ok: true; userId: string; alreadyInvited: false }
  | { ok: true; userId: null; alreadyInvited: true }
  | { ok: false; error: string };

export async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const admin = createServiceRoleClient();
  const normalized = email.trim().toLowerCase();

  for (let page = 1; page <= 8; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users) return null;
    const match = data.users.find((user) => user.email?.toLowerCase() === normalized);
    if (match) return match.id;
    if (data.users.length < 200) break;
  }

  return null;
}

/** Creates the Auth user and sends the Supabase invite email. Prisma `User.id` must match. */
export async function inviteEmployeeByEmail(input: {
  email: string;
  fullName: string;
  redirectTo: string;
}): Promise<InviteEmployeeResult> {
  let admin;
  try {
    admin = createServiceRoleClient();
  } catch (error) {
    console.error("[inviteEmployeeByEmail]", error);
    return { ok: false, error: "invite_failed" };
  }

  const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
    data: { full_name: input.fullName },
    redirectTo: input.redirectTo,
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("already been registered") || message.includes("already exists")) {
      return { ok: true, userId: null, alreadyInvited: true };
    }
    console.error("[inviteEmployeeByEmail]", error.message);
    return { ok: false, error: error.message };
  }

  if (!data.user) {
    return { ok: false, error: "invite_no_user_returned" };
  }

  return { ok: true, userId: data.user.id, alreadyInvited: false };
}

/** Lets magic-link login work even if the invite email click is skipped. */
export async function confirmAuthEmail(userId: string): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { email_confirm: true });
  if (error) {
    console.error("[confirmAuthEmail]", error.message);
  }
}

export type CreateAccountResult =
  | { ok: true; userId: string; tempPassword: string; alreadyInvited: false }
  | { ok: true; userId: null; tempPassword: null; alreadyInvited: true }
  | { ok: false; error: string };

export async function createEmployeeAccountWithTempPassword(input: {
  email: string;
  fullName: string;
}): Promise<CreateAccountResult> {
  const admin = createServiceRoleClient();
  const tempPassword = randomBytes(9).toString("base64url");

  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("already been registered") || message.includes("already exists")) {
      return { ok: true, userId: null, tempPassword: null, alreadyInvited: true };
    }
    return { ok: false, error: error.message };
  }

  if (!data.user) {
    return { ok: false, error: "invite_no_user_returned" };
  }

  return { ok: true, userId: data.user.id, tempPassword, alreadyInvited: false };
}

export async function resetAccountPassword(userId: string): Promise<CreateAccountResult> {
  const admin = createServiceRoleClient();
  const tempPassword = randomBytes(9).toString("base64url");
  const { error } = await admin.auth.admin.updateUserById(userId, { password: tempPassword });
  if (error) return { ok: false, error: error.message };
  return { ok: true, userId, tempPassword, alreadyInvited: false };
}
