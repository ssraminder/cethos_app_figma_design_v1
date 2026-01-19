import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Check if credentials are provided
const hasCredentials = supabaseUrl && supabaseAnonKey &&
  supabaseUrl !== 'your_supabase_url_here' &&
  supabaseAnonKey !== 'your_supabase_anon_key_here';

if (!hasCredentials) {
  console.warn('⚠️ Supabase credentials not configured. Database features disabled. App will use localStorage only.');
  console.warn('To enable Supabase: Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file');
}

// Only create client if we have valid credentials
export const supabase: SupabaseClient | null = hasCredentials
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false, // We're not using auth in Phase 1
      },
    })
  : null;

// Helper to check if Supabase is available
export const isSupabaseEnabled = (): boolean => {
  return supabase !== null;
};

// Database types
export interface Quote {
  id: string;
  quote_number: string;
  status: 'draft' | 'details_pending' | 'quote_ready' | 'awaiting_payment' | 'paid' | 'in_progress' | 'completed';
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
  upload_status: 'pending' | 'uploaded' | 'failed';
  created_at: string;
}

export interface Customer {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  customer_type: 'individual' | 'business';
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
