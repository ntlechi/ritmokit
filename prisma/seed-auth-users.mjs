/**
 * Creates Supabase Auth accounts for RitmoKit seed users (same UUIDs as public.users).
 *
 * Owner (full control): owner@ritmokit.com
 * Dev password: RitmoKit2026!
 *
 * Usage: npx tsx prisma/seed-auth-users.mjs
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const DEV_PASSWORD = "RitmoKit2026!";

const SEED_AUTH_USERS = [
  {
    id: "00000000-0000-0000-0000-000000000010",
    email: "owner@ritmokit.com",
    fullName: "RitmoKit Owner",
  },
  {
    id: "00000000-0000-0000-0000-000000000001",
    email: "manager@ritmokit.com",
    fullName: "Studio Manager",
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    email: "instructor@ritmokit.com",
    fullName: "Demo Instructor",
  },
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

for (const user of SEED_AUTH_USERS) {
  const { data: existing } = await admin.auth.admin.getUserById(user.id);

  if (existing?.user) {
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      email: user.email,
      password: DEV_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: user.fullName },
    });
    console.log(
      `${user.email}: updated existing auth user ${updateError ? "FAILED: " + updateError.message : "OK"}`,
    );
    continue;
  }

  const { data, error } = await admin.auth.admin.createUser({
    id: user.id,
    email: user.email,
    password: DEV_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: user.fullName },
  });

  if (error) {
    if (
      error.message.includes("already been registered") ||
      error.message.includes("already exists")
    ) {
      console.log(`${user.email}: email already registered — update email in Supabase dashboard if needed`);
    } else {
      console.log(`${user.email}: FAILED — ${error.message}`);
    }
  } else {
    console.log(`${user.email}: created (id=${data.user.id})`);
  }
}

console.log(`\nOwner login (full control): owner@ritmokit.com / ${DEV_PASSWORD}`);
