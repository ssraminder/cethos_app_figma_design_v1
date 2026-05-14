// POST /functions/v1/customer-quote-attach-customer
// Body: {
//   quote_id: string,
//   customer: { email, full_name, phone?, customer_type?, company_name? }
// }
// Returns: { success: true, customer: { id }, quote: { quote_number } }
//
// Replaces the anon `customers.upsert` + `quotes.update({ customer_id, status: 'lead' })`
// pair in client/components/quote/Step3Contact.tsx, blocked by the RLS lockdown.
//
// Service-role upsert by email; transitions the quote status to 'lead'.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  ALLOWED_STATUS_TRANSITIONS,
  getAdminClient,
  jsonResponse,
  loadMutableQuote,
  preflight,
} from "../_shared/customer-quote.ts";

interface CustomerInput {
  email?: string;
  full_name?: string;
  phone?: string;
  customer_type?: "individual" | "business";
  company_name?: string | null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const quoteId = body?.quote_id;
    const customer: CustomerInput = body?.customer ?? {};

    if (typeof quoteId !== "string" || quoteId.length === 0) {
      return jsonResponse({ success: false, error: "Missing quote_id" }, 400);
    }
    const email = String(customer.email ?? "").trim().toLowerCase();
    const fullName = String(customer.full_name ?? "").trim();
    if (!email || !fullName) {
      return jsonResponse(
        { success: false, error: "customer.email and customer.full_name are required" },
        400,
      );
    }

    const admin = await getAdminClient();
    const currentQuote = await loadMutableQuote(admin, quoteId);

    const customerRow: Record<string, unknown> = {
      email,
      full_name: fullName,
      updated_at: new Date().toISOString(),
    };
    if (customer.phone !== undefined) customerRow.phone = customer.phone;
    if (customer.customer_type !== undefined) customerRow.customer_type = customer.customer_type;
    if (customer.company_name !== undefined) customerRow.company_name = customer.company_name;

    const { data: customerData, error: customerErr } = await admin
      .from("customers")
      .upsert(customerRow, { onConflict: "email" })
      .select("id")
      .single();

    if (customerErr || !customerData) {
      console.error("attach-customer upsert failed:", customerErr);
      return jsonResponse(
        { success: false, error: customerErr?.message ?? "Customer upsert failed" },
        500,
      );
    }

    // Link customer to quote and (if allowed) flip status to 'lead'.
    const updateRow: Record<string, unknown> = {
      customer_id: customerData.id,
      updated_at: new Date().toISOString(),
    };
    const allowedTo = ALLOWED_STATUS_TRANSITIONS[currentQuote.status ?? ""];
    if (allowedTo?.has("lead")) {
      updateRow.status = "lead";
    }

    const { data: updatedQuote, error: quoteErr } = await admin
      .from("quotes")
      .update(updateRow)
      .eq("id", quoteId)
      .select("quote_number")
      .single();

    if (quoteErr) {
      console.error("attach-customer quote link failed:", quoteErr);
      return jsonResponse(
        { success: false, error: quoteErr.message ?? "Quote link failed" },
        500,
      );
    }

    return jsonResponse({
      success: true,
      customer: { id: customerData.id },
      quote: { quote_number: updatedQuote?.quote_number ?? null },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("customer-quote-attach-customer error:", message);
    return jsonResponse({ success: false, error: message }, 500);
  }
});
