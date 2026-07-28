/**
 * Migrates owner from nil UUID (000…000) to a Supabase-compatible id and creates Auth login.
 * Usage: npx tsx scripts/provision-owner-auth.mjs
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const OLD_OWNER_ID = "00000000-0000-0000-0000-000000000000";
const NEW_OWNER_ID = "00000000-0000-0000-0000-000000000010";
const OWNER_EMAIL = "owner@ritmokit.com";
const OWNER_PASSWORD = "RitmoKit2026!";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing Supabase env vars in .env");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const USER_FK_UPDATES = [
  { table: "location_members", column: "user_id" },
  { table: "chat_channel_members", column: "user_id" },
  { table: "chat_messages", column: "author_id" },
  { table: "conversation_participants", column: "user_id" },
  { table: "employee_hr_profiles", column: "user_id" },
  { table: "employee_profiles", column: "user_id" },
  { table: "shifts", column: "employee_id" },
  { table: "shifts", column: "created_by_id" },
  { table: "shift_swap_requests", column: "requested_by_id" },
  { table: "shift_swap_requests", column: "target_employee_id" },
  { table: "time_off_requests", column: "user_id" },
  { table: "employee_formation_progress", column: "user_id" },
  { table: "formation_assignments", column: "assigned_to_id" },
  { table: "formation_assignments", column: "assigned_by_id" },
  { table: "payroll_line_items", column: "user_id" },
  { table: "employee_station_skills", column: "user_id" },
  { table: "schedule_template_shifts", column: "employee_id" },
  { table: "workplace_convention_signatures", column: "user_id" },
];

async function runOptional(sql) {
  try {
    await prisma.$executeRawUnsafe(sql);
  } catch {
    // skip missing tables/columns
  }
}

async function migrateOwnerId() {
  const oldOwner = await prisma.user.findUnique({ where: { id: OLD_OWNER_ID } });
  if (!oldOwner) {
    const current = await prisma.user.findUnique({ where: { id: NEW_OWNER_ID } });
    if (current?.email === OWNER_EMAIL) {
      console.log("Owner already at", NEW_OWNER_ID);
      return;
    }
    throw new Error("Owner row not found — run: npx prisma db seed");
  }

  for (const { table, column } of USER_FK_UPDATES) {
    await runOptional(
      `UPDATE "${table}" SET "${column}" = '${NEW_OWNER_ID}'::uuid WHERE "${column}" = '${OLD_OWNER_ID}'::uuid`,
    );
  }

  await prisma.$executeRawUnsafe(
    `UPDATE users SET id = '${NEW_OWNER_ID}'::uuid, email = '${OWNER_EMAIL}', full_name = 'RitmoKit Owner', role = 'OWNER' WHERE id = '${OLD_OWNER_ID}'::uuid`,
  );

  console.log(`Migrated owner ${OLD_OWNER_ID} → ${NEW_OWNER_ID}`);
}

async function ensureAuthUser() {
  const { data: byId } = await admin.auth.admin.getUserById(NEW_OWNER_ID);
  if (byId?.user) {
    const { error } = await admin.auth.admin.updateUserById(NEW_OWNER_ID, {
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "RitmoKit Owner" },
    });
    if (error) throw error;
    console.log("Auth user updated:", OWNER_EMAIL);
    return;
  }

  const { data, error } = await admin.auth.admin.createUser({
    id: NEW_OWNER_ID,
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "RitmoKit Owner" },
  });

  if (error) throw error;
  console.log("Auth user created:", data.user.email);
}

async function main() {
  await migrateOwnerId();
  await ensureAuthUser();
  console.log(`\nLogin (full OWNER access): ${OWNER_EMAIL} / ${OWNER_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
