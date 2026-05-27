import { createClient } from "@supabase/supabase-js";

const supabaseUrl = requiredEnv("SUPABASE_URL");
const supabaseServiceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

console.log(`Supabase URL: ${supabaseUrl}`);
console.log(`Supabase service role key set: ${supabaseServiceRoleKey ? "yes" : "no"}`);

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value || value.startsWith("your-")) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

