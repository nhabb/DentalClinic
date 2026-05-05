import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// credentials: "omit" prevents the browser from processing Set-Cookie headers
// from Supabase/Cloudflare responses, eliminating the "__cf_bm rejected for
// invalid domain" warning. Auth works via JWT in response bodies (localStorage),
// so no cookies are needed.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: (url, options = {}) =>
      fetch(url, { ...options, credentials: "omit" }),
  },
});
