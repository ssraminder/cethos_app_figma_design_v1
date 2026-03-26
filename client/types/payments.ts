export interface CustomerPayment {
  id: string;
  customer_id: string;
  amount: number;
  currency: string;
  payment_date: string;
  payment_method: string;
  payment_method_id: string | null;
  payment_method_code: string | null;
  payment_method_name: string | null;
  reference_number: string | null;
  notes: string | null;
  source: 'manual' | 'stripe';
  stripe_payment_intent_id: string | null;
  allocated_amount: number;
  unallocated_amount: number;
  status: 'unallocated' | 'partially_allocated' | 'fully_allocated' | 'completed';
  confirmed_by_staff_id: string | null;
  created_at: string;
  customer?: {
    id: string;
    full_name: string;
    company_name: string | null;
    email: string;
  };
}

export interface PaymentAllocation {
  id: string;
  payment_id: string;
  invoice_id: string;
  allocated_amount: number;
  created_at: string;
  invoice?: {
    id: string;
    invoice_number: string;
    total_amount: number;
    balance_due: number;
    status: string;
    due_date: string;
  };
}

export interface PaymentMethod {
  id: string;
  name: string;
  code: string;
  is_online: boolean;
  is_active: boolean;
}

export interface UnpaidInvoice {
  id: string;
  invoice_number: string;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  status: string;
  due_date: string;
  invoice_date: string;
  po_number: string | null;
}

export interface AgingRow {
  customer_id: string;
  full_name: string;
  company_name: string | null;
  customer_type: string | null;
  payment_terms: string | null;
  total_invoices: number;
  total_outstanding: number;
  current_amount: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  days_90_plus: number;
}

export interface ARDashboardStats {
  total_outstanding: number;
  outstanding_count: number;
  total_overdue: number;
  overdue_count: number;
  unallocated_credits: number;
  unallocated_count: number;
  payments_last_30_days: number;
  payments_last_30_count: number;
}
