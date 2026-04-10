import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const accounts = [
  { email: "doctor@clinic.com",  password: "demo123" },
  { email: "patient@clinic.com", password: "demo123" },
];

async function main() {
  const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) { console.error("Cannot list users:", listErr.message); return; }

  for (const account of accounts) {
    const existing = users.find((u) => u.email === account.email);

    // Delete if exists so we start fresh
    if (existing) {
      const { error: delErr } = await supabase.auth.admin.deleteUser(existing.id);
      if (delErr) { console.error(`❌ Delete failed for ${account.email}:`, delErr.message); continue; }
      console.log(`🗑  Deleted existing ${account.email}`);
    }

    // Create fresh with confirmed email
    const { data, error: createErr } = await supabase.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true,
    });
    if (createErr) { console.error(`❌ Create failed for ${account.email}:`, createErr.message); continue; }
    console.log(`✅ Created ${account.email} — UID: ${data.user.id}`);

    // Verify login works
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: account.email,
      password: account.password,
    });
    if (signInErr) console.error(`⚠️  Login test failed for ${account.email}:`, signInErr.message);
    else console.log(`✅ Login verified for ${account.email}`);
  }
}

main().catch(console.error);
