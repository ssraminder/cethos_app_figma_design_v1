// Shared types for Vendor Detail tabbed layout

export interface Vendor {
  id: string;
  xtrf_vendor_id: number | null;
  xtrf_account_name: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  status: string;
  vendor_type: string | null;
  country: string | null;
  province_state: string | null;
  city: string | null;
  source_languages: string[] | null;
  target_languages: string[] | null;
  language_pairs: { source: string; target: string }[] | null;
  specializations: string[] | null;
  certifications: string[] | null;
  years_experience: number | null;
  preferred_rate_currency: string | null;
  rate_per_page: number | null;
  rate_currency: string;
  tax_id: string | null;
  tax_rate: number | null;
  minimum_rate: number | null;
  payment_method: string | null;
  payment_details: Record<string, unknown> | null;
  notes: string | null;
  rating: number | null;
  total_projects: number;
  last_project_date: string | null;
  availability_status: string;
  auth_user_id: string | null;
  invitation_sent_at: string | null;
  last_reminder_sent_at: string | null;
  invitation_reminder_count: number;
  native_languages: string[] | null;
  invitation_accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VendorLanguagePair {
  id: string;
  vendor_id: string;
  source_language: string;
  target_language: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export interface VendorRate {
  id: string;
  vendor_id: string;
  service_id: string;
  service_name: string;
  service_code: string | null;
  service_category: string | null;
  language_pair_id: string | null;
  source_language: string | null;
  target_language: string | null;
  calculation_unit: string;
  rate: number;
  currency: string;
  rate_cad: number | null;
  minimum_charge: number | null;
  source: string;
  is_active: boolean;
  notes: string | null;
  added_by: string | null;
}

export interface VendorPaymentInfo {
  id: string;
  vendor_id: string;
  payment_currency: string | null;
  payment_method: string | null;
  payment_details: Record<string, string> | null;
  invoice_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface VendorAuth {
  vendor_id: string;
  password_set_at: string | null;
  must_reset: boolean;
}

export interface ActiveJob {
  order_id: string;
  order_number: string;
  step_number: number;
  step_name: string;
  status: string;
  source_language: string | null;
  target_language: string | null;
  deadline: string | null;
  rate: number | null;
  currency: string | null;
}

export interface VendorSummary {
  language_pairs_active: number;
  language_pairs_total: number;
  rates_active: number;
  rates_total: number;
  has_payment_info: boolean;
  has_portal_access: boolean;
  active_job_count: number;
}

export interface VendorPageData {
  vendor: Vendor;
  languagePairs: VendorLanguagePair[];
  rates: VendorRate[];
  paymentInfo: VendorPaymentInfo | null;
  auth: VendorAuth | null;
  activeSessions: number;
  activeJobs: ActiveJob[];
  summary: VendorSummary;
}

export interface Currency {
  code: string;
  name: string;
  symbol: string | null;
}

export interface Service {
  id: string;
  code: string;
  name: string;
  category: string;
  default_calculation_units: string[] | null;
  sort_order: number;
}

export interface TabProps {
  vendorData: VendorPageData;
  onRefresh: () => Promise<void>;
}

export interface TabPropsWithCurrencies extends TabProps {
  currencies: Currency[];
}

export interface TabPropsWithServices extends TabProps {
  currencies: Currency[];
  services: Service[];
}
