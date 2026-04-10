import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const accounts = [
    { email: "doctor@clinic.com", password: "demo123", name: "Dr. Ahmed Hassan" },
    { email: "patient@clinic.com", password: "demo123", name: "Sara Ali" },
  ];

  for (const account of accounts) {
    // Check if user already exists by trying to list users
    const { data, error } = await supabase.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true,
      user_metadata: { full_name: account.name },
    });

    if (error) {
      if (error.message.includes("already been registered") || error.message.includes("already exists")) {
        console.log(`✅ ${account.email} already exists in Supabase auth`);
      } else {
        console.error(`❌ Failed to create ${account.email}:`, error.message);
      }
    } else {
      console.log(`✅ Created ${account.email} — Supabase UID: ${data.user.id}`);
    }
  }
}

main().catch(console.error);
