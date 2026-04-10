import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const accounts = ["doctor@clinic.com", "patient@clinic.com"];

  // List all users to find by email
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) { console.error("Failed to list users:", listError.message); return; }

  for (const email of accounts) {
    const user = users.find((u) => u.email === email);
    if (!user) {
      console.log(`⚠️  ${email} not found — creating...`);
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: "demo123",
        email_confirm: true,
      });
      if (error) console.error(`❌ Create failed for ${email}:`, error.message);
      else console.log(`✅ Created ${email} — UID: ${data.user.id}`);
      continue;
    }

    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password: "demo123",
      email_confirm: true,
    });

    if (error) console.error(`❌ Reset failed for ${email}:`, error.message);
    else console.log(`✅ Password reset for ${email} (UID: ${user.id})`);
  }
}

main().catch(console.error);
