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

// Suppress AbortError from Supabase's Web Locks API during auth initialization
// This is a known issue with Supabase Auth v2.x when the page reloads or navigates
// quickly, causing the lock acquisition to be aborted. These errors are harmless.
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    if (
      event.reason?.name === "AbortError" &&
      event.reason?.message?.includes("aborted")
    ) {
      // Suppress the error - it's expected during rapid page transitions
      event.preventDefault();
    }
  });
}

// Log initialization (only once)
console.log("=== SUPABASE CLIENT INITIALIZATION ===");
console.log("VITE_SUPABASE_URL:", supabaseUrl);
console.log(
  "VITE_SUPABASE_ANON_KEY (first 20 chars):",
  supabaseAnonKey?.substring(0, 20) + "...",
);
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
    detectSessionInUrl: false,
    // PKCE flow is handled manually in the ResetPassword page
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

// Helper to check if Supabase is available
export const isSupabaseEnabled = (): boolean => {
  return supabase !== null;
};

// Detect if an error is a network/connectivity failure
export const isNetworkError = (error: unknown): boolean => {
  if (error instanceof TypeError && error.message === "Failed to fetch") {
    return true;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("failed to fetch") ||
      msg.includes("network") ||
      msg.includes("timeout") ||
      msg.includes("err_connection") ||
      msg.includes("load failed")
    );
  }
  return false;
};

// Return a user-friendly message for network errors
export const getNetworkErrorMessage = (): string => {
  return "Unable to connect to the server. The service may be temporarily unavailable. Please check your internet connection and try again.";
};

// Database types
export interface Quote {
  id: string;
  quote_number: string;
  status:
    | "draft"
    | "details_pending"
    | "quote_ready"
    | "awaiting_payment"
    | "paid"
    | "in_progress"
    | "completed";
  customer_id?: string;
  source_language_id?: string;
  target_language_id?: string;
  intended_use_id?: string;
  country_of_issue?: string;
  special_instructions?: string;
  subtotal?: number;
  certification_total?: number;
  tax_rate?: number;
  tax_amount?: number;
  total?: number;
  created_at: string;
  updated_at: string;
}

export interface QuoteFile {
  id: string;
  quote_id: string;
  original_filename: string;
  storage_path: string;
  file_size: number;
  mime_type: string;
  upload_status: "pending" | "uploaded" | "failed";
  created_at: string;
}

export interface Customer {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  customer_type: "individual" | "business";
  company_name?: string;
  created_at: string;
  updated_at: string;
}

export interface Language {
  id: string;
  name: string;
  code: string;
}

export interface IntendedUse {
  id: string;
  name: string;
  description?: string;
}
