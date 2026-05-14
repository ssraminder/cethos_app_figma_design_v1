// POST /functions/v1/customer-quote-update
// Body: { quote_id: string, patch: Record<string, unknown> }
// Returns: { success: true }
//
// Whitelisted update for the customer-facing wizard. Allowed fields are
// defined in _shared/customer-quote.ts (QUOTE_CUSTOMER_UPDATABLE_FIELDS).
// Status changes are gated by ALLOWED_STATUS_TRANSITIONS to prevent a caller
// from forcing a quote into 'paid' or 'completed' from the customer side.
//
// Replaces the anon `supabase.from('quotes').update(...)` calls in
// client/components/quote/Step4ReviewCheckout.tsx and Step1Upload.tsx
// blocked by 20260514_emergency_rls_lockdown.sql.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  getAdminClient,
  isAllowedStatusTransition,
  jsonResponse,
  loadMutableQuote,
  preflight,
  sanitizeQuotePatch,
} from "../_shared/customer-quote.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const quoteId = body?.quote_id;
    const patch = body?.patch ?? {};
    if (typeof quoteId !== "string" || quoteId.length === 0) {
      return jsonResponse({ success: false, error: "Missing quote_id" }, 400);
    }
    if (typeof patch !== "object" || patch === null) {
      return jsonResponse({ success: false, error: "patch must be an object" }, 400);
    }

    const admin = await getAdminClient();
    const current = await loadMutableQuote(admin, quoteId);

    const { fields, hitl, status } = sanitizeQuotePatch(
      patch as Record<string, unknown>,
    );

    const writes: Record<string, unknown> = { ...fields };

    // HITL fields move together with a status change to in_review.
    if (hitl.required === true) {
      writes.hitl_required = true;
      if (hitl.reasons !== undefined) writes.hitl_reasons = hitl.reasons;
    } else if (hitl.required === false) {
      // We do not let the customer clear hitl once set — only staff can.
    }

    if (status && status !== current.status) {
      if (!isAllowedStatusTransition(current.status, status)) {
        return jsonResponse(
          {
            success: false,
            error: `Status transition not permitted: ${current.status} -> ${status}`,
          },
          403,
        );
      }
      writes.status = status;
    }

    if (Object.keys(writes).length === 0) {
      return jsonResponse({ success: true, noop: true });
    }
    writes.updated_at = new Date().toISOString();

    const { error: updateError } = await admin
      .from("quotes")
      .update(writes)
      .eq("id", quoteId);

    if (updateError) {
      console.error("customer-quote-update failed:", updateError);
      return jsonResponse(
        { success: false, error: updateError.message ?? "Update failed" },
        500,
      );
    }

    return jsonResponse({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("customer-quote-update error:", message);
    return jsonResponse({ success: false, error: message }, 500);
  }
});
