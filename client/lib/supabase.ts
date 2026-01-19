import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables are not set. Database features will be disabled.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false, // We're not using auth in Phase 1
  },
});

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
