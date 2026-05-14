// Thin wrappers around the customer-quote-* edge functions, used by the
// anonymous quote wizard (Step1Upload, Step4ReviewCheckout, etc.) so the
// browser no longer writes directly to RLS-locked tables.
//
// Edge functions: supabase/functions/customer-quote-{create,get,update,finalize-files}/

import { supabase } from "./supabase";

type CreateQuoteInput = {
  source_language_id?: string | null;
  target_language_id?: string | null;
  partner_id?: string | null;
  partner_code?: string | null;
  partner_rate?: string | number | null;
  referral_url?: string | null;
};

type FinalizeFileInput = {
  temp_path: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  is_reference?: boolean;
  is_replacement?: boolean;
};

type AttachCustomerInput = {
  email: string;
  full_name: string;
  phone?: string;
  customer_type?: "individual" | "business";
  company_name?: string | null;
};

async function invoke<T>(fn: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw new Error(error.message || `${fn} failed`);
  if (data && typeof data === "object" && "success" in data && !data.success) {
    throw new Error(
      ((data as { error?: string }).error ?? `${fn} failed`) as string,
    );
  }
  return data as T;
}

export async function createCustomerQuote(
  input: CreateQuoteInput,
): Promise<{ id: string; quote_number: string }> {
  const data = await invoke<{
    success: true;
    quote: { id: string; quote_number: string };
  }>("customer-quote-create", input);
  return data.quote;
}

export type CustomerQuoteSnapshot = {
  quote: Record<string, any>;
  analysis: Array<Record<string, any>>;
  files: Array<{
    id: string;
    original_filename: string;
    storage_path: string;
    file_size?: number;
    mime_type?: string;
    upload_status?: string;
    ai_processing_status?: string;
    file_category_id?: string;
    created_at?: string;
  }>;
  adjustments: Array<Record<string, any>>;
};

export async function getCustomerQuoteData(
  quoteId: string,
): Promise<CustomerQuoteSnapshot> {
  const data = await invoke<{
    success: true;
    quote: Record<string, any>;
    analysis: Array<Record<string, any>>;
    files: CustomerQuoteSnapshot["files"];
    adjustments?: Array<Record<string, any>>;
  }>("customer-quote-get", { quote_id: quoteId });
  return {
    quote: data.quote,
    analysis: data.analysis,
    files: data.files,
    adjustments: data.adjustments ?? [],
  };
}

export async function updateCustomerQuote(
  quoteId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await invoke<{ success: true }>("customer-quote-update", {
    quote_id: quoteId,
    patch,
  });
}

export async function attachCustomerToQuote(
  quoteId: string,
  customer: AttachCustomerInput,
): Promise<{ customer_id: string; quote_number: string | null }> {
  const data = await invoke<{
    success: true;
    customer: { id: string };
    quote: { quote_number: string | null };
  }>("customer-quote-attach-customer", { quote_id: quoteId, customer });
  return {
    customer_id: data.customer.id,
    quote_number: data.quote.quote_number,
  };
}

export async function finalizeCustomerQuoteFiles(
  quoteId: string,
  files: FinalizeFileInput[],
): Promise<{
  files: Array<{ original_filename: string; storage_path: string; quote_files_id: string }>;
  errors: Array<{ original_filename: string; error: string }>;
}> {
  const data = await invoke<{
    success: boolean;
    files: Array<{ original_filename: string; storage_path: string; quote_files_id: string }>;
    errors: Array<{ original_filename: string; error: string }>;
  }>("customer-quote-finalize-files", { quote_id: quoteId, files });
  return { files: data.files ?? [], errors: data.errors ?? [] };
}
