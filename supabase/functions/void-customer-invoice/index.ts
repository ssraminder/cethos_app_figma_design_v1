// supabase/functions/void-customer-invoice/index.ts
//
// Void a customer invoice. After voiding, the order's finance becomes
// editable again on the admin UI; staff can re-issue a fresh invoice
// (new number from the sequence, with reference_invoice_id pointing back
// to the voided one and replaced_by_invoice_id on the void pointing forward
// to the new one).
//
// Guardrails:
//   - Refuse if the invoice has any allocated customer_payments
//     (customer_payment_allocations.amount > 0).
//   - Refuse if the invoice is already voided.
//   - Reason code must be in the constrained set (see migration); reason
//     notes are required when code = 'other'.
//
// Body: { invoice_id, staff_id, reason_code, reason_notes? }
// Returns: { success, invoice }
//
// Auth: verify_jwt = true. Staff must be logged in via the portal client.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_REASON_CODES = new Set([
  "pricing_correction",
  "cancelled_order",
  "customer_request",
  "billing_error",
  "duplicate",
  "other",
]);

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(
      { success: false, error: "Missing Supabase configuration" },
      500,
    );
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const body = await req.json().catch(() => ({}));
    const {
      invoice_id,
      staff_id,
      reason_code,
      reason_notes,
    }: {
      invoice_id?: string;
      staff_id?: string;
      reason_code?: string;
      reason_notes?: string;
    } = body || {};

    if (!invoice_id) throw new Error("Missing required field: invoice_id");
    if (!staff_id) throw new Error("Missing required field: staff_id");
    if (!reason_code || !ALLOWED_REASON_CODES.has(reason_code)) {
      throw new Error(
        `reason_code must be one of: ${[...ALLOWED_REASON_CODES].join(", ")}`,
      );
    }
    if (reason_code === "other" && !(reason_notes || "").trim()) {
      throw new Error("reason_notes required when reason_code = 'other'");
    }

    // Validate staff
    const { data: staff } = await sb
      .from("staff_users")
      .select("id, full_name, is_active")
      .eq("id", staff_id)
      .maybeSingle();
    if (!staff || staff.is_active === false) {
      return jsonResponse(
        { success: false, error: "Invalid or inactive staff user" },
        403,
      );
    }

    // Load invoice
    const { data: invoice, error: invoiceErr } = await sb
      .from("customer_invoices")
      .select(
        "id, invoice_number, order_id, customer_id, status, voided_at, total_amount, amount_paid",
      )
      .eq("id", invoice_id)
      .maybeSingle();
    if (invoiceErr) throw new Error(`Failed to load invoice: ${invoiceErr.message}`);
    if (!invoice) throw new Error(`Invoice not found: ${invoice_id}`);
    if (invoice.voided_at) {
      throw new Error("Invoice is already voided");
    }

    // Block when any payment touches this invoice. We check
    // customer_payment_allocations because that is the canonical link
    // (one customer_payment can spread across multiple invoices, and an
    // invoice's amount_paid is derived from those allocations).
    const { count: allocCount, error: allocErr } = await sb
      .from("customer_payment_allocations")
      .select("id", { count: "exact", head: true })
      .eq("invoice_id", invoice_id)
      .gt("amount", 0);
    if (allocErr) {
      throw new Error(
        `Failed to check payment allocations: ${allocErr.message}`,
      );
    }
    if ((allocCount ?? 0) > 0) {
      return jsonResponse(
        {
          success: false,
          error:
            "Invoice has payments allocated to it. Reverse or refund the payment first, then retry.",
          payment_allocations: allocCount,
        },
        409,
      );
    }
    // Belt-and-suspenders: also block if amount_paid > 0 even when no
    // allocation row exists (e.g. legacy data).
    if (Number(invoice.amount_paid || 0) > 0) {
      return jsonResponse(
        {
          success: false,
          error:
            "Invoice has a non-zero amount_paid. Reverse or refund the payment first, then retry.",
          amount_paid: invoice.amount_paid,
        },
        409,
      );
    }

    const nowIso = new Date().toISOString();

    const { data: voided, error: updateErr } = await sb
      .from("customer_invoices")
      .update({
        status: "void",
        voided_at: nowIso,
        voided_by_staff_id: staff_id,
        void_reason_code: reason_code,
        void_reason_notes: (reason_notes || "").trim() || null,
        balance_due: 0,
        updated_at: nowIso,
      })
      .eq("id", invoice_id)
      .select(
        "id, invoice_number, order_id, status, voided_at, voided_by_staff_id, void_reason_code, void_reason_notes, replaced_by_invoice_id",
      )
      .single();

    if (updateErr || !voided) {
      throw new Error(
        `Failed to void invoice: ${updateErr?.message || "no row"}`,
      );
    }

    // Activity log — best-effort.
    try {
      await sb.from("staff_activity_log").insert({
        staff_id,
        action_type: "invoice_voided",
        entity_type: "customer_invoice",
        entity_id: invoice_id,
        details: {
          invoice_number: invoice.invoice_number,
          order_id: invoice.order_id,
          reason_code,
          reason_notes: (reason_notes || "").trim() || null,
          total_amount: invoice.total_amount,
        },
      });
    } catch (logErr) {
      console.warn("Non-fatal: failed to write activity log", logErr);
    }

    return jsonResponse({ success: true, invoice: voided });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("void-customer-invoice error:", err);
    return jsonResponse({ success: false, error: message }, 400);
  }
});
