// Shared helpers for the customer-quote-* edge functions.
//
// The customer-facing quote flow is unauthenticated: the quote_id (and the
// session id stored in the wizard's local state) acts as the only capability.
// These helpers centralize:
//   - CORS response shape
//   - service-role Supabase client construction
//   - whitelists of fields the customer is allowed to update during the
//     pre-payment phase of the wizard.

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export function preflight(): Response {
  return new Response("ok", { headers: CORS_HEADERS });
}

// ---------------------------------------------------------------------------
// Whitelist of fields the customer-side wizard may write to a quote.
//
// Anything not in this list is silently dropped at the edge — the frontend
// can never set arbitrary columns (e.g. price overrides, partner_id, staff
// notes, processing_status, hitl_required without a corresponding status).
// ---------------------------------------------------------------------------
export const QUOTE_CUSTOMER_UPDATABLE_FIELDS = new Set<string>([
  // language selection (Step 1)
  "source_language_id",
  "target_language_id",

  // translation details (Step 2)
  "intended_use_id",
  "country_of_issue",
  "special_instructions",

  // checkout: turnaround
  "turnaround_type",
  "rush_fee",
  "estimated_delivery_date",

  // checkout: delivery
  "physical_delivery_option_id",
  "selected_pickup_location_id",
  "delivery_fee",

  // checkout: addresses (jsonb)
  "billing_address",
  "shipping_address",

  // checkout: totals
  "subtotal",
  "certification_total",
  "tax_rate",
  "tax_amount",
  "total",
  "calculated_totals",

  // checkout: explanatory note
  "customer_note",

  // saved-and-emailed timestamp
  "saved_at",
]);

// Status transitions the customer flow is allowed to perform.
// status_from -> set of valid status_to.
export const ALLOWED_STATUS_TRANSITIONS: Record<string, Set<string>> = {
  draft: new Set(["details_pending", "lead", "pending_payment", "in_review"]),
  details_pending: new Set(["lead", "pending_payment", "in_review"]),
  lead: new Set(["pending_payment", "in_review", "checkout_started"]),
  processing: new Set(["pending_payment", "in_review", "lead"]),
  analyzing: new Set(["pending_payment", "in_review", "lead"]),
  in_review: new Set(["pending_payment"]),
  pending_payment: new Set(["pending_payment", "in_review"]),
  checkout_started: new Set(["pending_payment", "in_review", "lead"]),
  revision_needed: new Set(["processing"]),
};

export function sanitizeQuotePatch(
  patch: Record<string, unknown>,
): {
  fields: Record<string, unknown>;
  hitl: { required?: boolean; reasons?: unknown };
  status?: string;
} {
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (QUOTE_CUSTOMER_UPDATABLE_FIELDS.has(k)) {
      fields[k] = v;
    }
  }
  const hitl: { required?: boolean; reasons?: unknown } = {};
  if (typeof patch.hitl_required === "boolean") hitl.required = patch.hitl_required;
  if (patch.hitl_reasons !== undefined) hitl.reasons = patch.hitl_reasons;
  const status =
    typeof patch.status === "string" ? patch.status : undefined;
  return { fields, hitl, status };
}

export function isAllowedStatusTransition(from: string | null, to: string) {
  if (!from) return false;
  const allowed = ALLOWED_STATUS_TRANSITIONS[from];
  return !!allowed?.has(to);
}

// ---------------------------------------------------------------------------
// Supabase admin client (service role). Throws if env is missing.
// ---------------------------------------------------------------------------
export async function getAdminClient() {
  const { createClient } = await import(
    "https://esm.sh/@supabase/supabase-js@2.39.3"
  );
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in edge function env",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------------------------------------------------------------------------
// Verify that a quote exists and is in a state the customer can still mutate.
// Returns the row, or throws.
// ---------------------------------------------------------------------------
export async function loadMutableQuote(
  admin: { from: (table: string) => any },
  quoteId: string,
): Promise<{ id: string; status: string | null; customer_id: string | null }> {
  if (!quoteId || typeof quoteId !== "string") {
    throw new Error("Missing quote_id");
  }
  const { data, error } = await admin
    .from("quotes")
    .select("id, status, customer_id")
    .eq("id", quoteId)
    .maybeSingle();
  if (error) throw new Error(`Quote lookup failed: ${error.message}`);
  if (!data) throw new Error("Quote not found");
  return data;
}
