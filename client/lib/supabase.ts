import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

// Validate environment variables
const hasCredentials = Boolean(supabaseUrl && supabaseAnonKey);

if (!hasCredentials) {
  console.error("=== SUPABASE CLIENT ERROR ===");
  console.error("Missing Supabase environment variables!");
  console.error("VITE_SUPABASE_URL:", supabaseUrl ? "SET" : "MISSING");
  console.error("VITE_SUPABASE_ANON_KEY:", supabaseAnonKey ? "SET" : "MISSING");
}

// Log initialization (only once)
console.log("=== SUPABASE CLIENT INITIALIZATION ===");
console.log("VITE_SUPABASE_URL:", supabaseUrl);
console.log("VITE_SUPABASE_ANON_KEY (first 20 chars):", supabaseAnonKey?.substring(0, 20) + "...");
console.log("URL is valid:", Boolean(supabaseUrl?.startsWith("https://")));
console.log("Key is valid:", Boolean(supabaseAnonKey?.startsWith("eyJ")));
console.log("hasCredentials:", hasCredentials);

// CREATE CLIENT ONCE AT MODULE LEVEL
// This runs exactly once when the module is first imported
// No function wrapper = no race condition
const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storageKey: "cethos-auth",
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
  global: {
    headers: {
      "x-client-info": "cethos-web",
    },
  },
  db: {
    schema: "public",
  },
});

console.log("Supabase client created: SUCCESS");
console.log("=== END SUPABASE INIT ===");

// Export the single instance
export { supabase };

// Type export for use in other files
export type { SupabaseClient };
