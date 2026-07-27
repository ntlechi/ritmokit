/**
 * Crée les comptes Supabase Auth pour les utilisateurs seed (mêmes UUID que
 * public.users) afin que la connexion par mot de passe fonctionne en local.
 *
 * Mot de passe partagé dev : Bati2026!
 *
 * Usage : npx tsx prisma/seed-auth-users.mjs
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const DEV_PASSWORD = "Bati2026!";

const SEED_AUTH_USERS = [
  { id: "00000000-0000-0000-0000-000000000000", email: "owner@bati.ca", fullName: "Marie Propriétaire" },
  { id: "00000000-0000-0000-0000-000000000001", email: "gerant@mirok.ca", fullName: "Alex Gérant" },
  { id: "00000000-0000-0000-0000-000000000002", email: "employe@mirok.ca", fullName: "Sam Employé" },
  { id: "00000000-0000-0000-0000-000000000003", email: "soir@mirok.ca", fullName: "Léa Soir" },
];

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

for (const user of SEED_AUTH_USERS) {
  const { data, error } = await admin.auth.admin.createUser({
    id: user.id,
    email: user.email,
    password: DEV_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: user.fullName },
  });

  if (error) {
    if (error.message.includes("already been registered") || error.message.includes("already exists")) {
      const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
        password: DEV_PASSWORD,
        email_confirm: true,
      });
      console.log(`${user.email}: already exists → password reset ${updateError ? "FAILED: " + updateError.message : "OK"}`);
    } else {
      console.log(`${user.email}: FAILED — ${error.message}`);
    }
  } else {
    console.log(`${user.email}: created (id=${data.user.id})`);
  }
}

console.log(`\nDone. Dev password for all seed accounts: ${DEV_PASSWORD}`);
