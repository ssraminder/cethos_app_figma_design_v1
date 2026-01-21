import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase environment variables");
  console.error("VITE_SUPABASE_URL:", supabaseUrl ? "SET" : "MISSING");
  console.error("VITE_SUPABASE_ANON_KEY:", supabaseAnonKey ? "SET" : "MISSING");
}

// Extend Window interface for singleton storage
declare global {
  interface Window {
    __SUPABASE_CLIENT__?: SupabaseClient;
  }
}

// Create a single instance (singleton pattern using window object)
// This ensures only ONE instance exists even across HMR reloads
function getSupabaseClient(): SupabaseClient | null {
  // Check if credentials are valid
  const hasCredentials =
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl !== "your_supabase_url_here" &&
    supabaseAnonKey !== "your_supabase_anon_key_here";

  if (!hasCredentials) {
    console.warn(
      "⚠️ Supabase credentials not configured. Database features disabled.",
    );
    return null;
  }

  // Return existing instance if available (prevents multiple instances)
  if (typeof window !== "undefined" && window.__SUPABASE_CLIENT__) {
    return window.__SUPABASE_CLIENT__;
  }

  console.log("Creating Supabase client (singleton)...");

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      storageKey: "cethos-auth",
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
    global: {
      headers: {
        "X-Client-Info": "cethos-staff-portal",
      },
    },
    realtime: {
      params: {
        eventsPerSecond: 2,
      },
    },
  });

  // Store in window to ensure singleton across module reloads
  if (typeof window !== "undefined") {
    window.__SUPABASE_CLIENT__ = client;
  }

  console.log("✅ Supabase client created successfully");

  return client;
}

// Export the singleton instance
export const supabase = getSupabaseClient();

// Helper to check if Supabase is available
export const isSupabaseEnabled = (): boolean => {
  return supabase !== null;
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
