/**
 * cvp-request-test
 *
 * Vendor-portal self-service: a logged-in translator requests a new
 * test for a (lang_pair × domain) combination they aren't approved for
 * yet. On success we:
 *   1. Create a cvp_test_combinations row (status=pending)
 *   2. Create a cvp_translator_domains row (status=pending, source=self_request)
 *   3. Trigger cvp-send-tests internally → Mailgun sends V3 to the
 *      translator's applicant email with a 48h token.
 *
 * Auth: requires an `Authorization: Bearer <session_token>` header that
 * validates against vendor_sessions. The translator_id is derived server-
 * side from the authenticated vendor's email — NOT trusted from the body.
 *
 * Guardrails (all server-side):
 *   G1. The translator must already have `status=approved` in
 *       cvp_translator_domains for the same (src, tgt) pair (any domain).
 *       Proves the pair is active — we're just adding a new domain to it.
 *   G2. No row in cvp_translator_domains with `status IN ('pending',
 *       'in_review')` for this translator — one pending request at a time.
 *   G3. If a row exists for the exact (src, tgt, domain) with
 *       `status='rejected' AND cooldown_until > now()`, reject with the
 *       cooldown end date.
 *   G4. domain cannot be 'certified_official' — cert is staff-only.
 *   G5. A library test must exist for (src, tgt, domain) with is_active=true.
 *       Otherwise 409 with actionable error so the UI can hide the option.
 *
 * Body: { sourceLanguageId, targetLanguageId, domain }
 *
 * Response:
 *   200 { success: true, data: { combinationId, domainRowId, testSent } }
 *   400 { success: false, error, detail? }  — guard violation
 *   409 { success: false, error: "no_library_test", detail: {...} }
 *   401 { success: false, error: "unauthenticated" }
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const sessionToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
  if (!sessionToken) {
    return json({ success: false, error: "unauthenticated" }, 401);
  }

  let body: {
    sourceLanguageId?: string;
    targetLanguageId?: string;
    domain?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "invalid_json" }, 400);
  }
  const { sourceLanguageId, targetLanguageId, domain } = body;
  if (!sourceLanguageId || !targetLanguageId || !domain) {
    return json({ success: false, error: "missing_fields" }, 400);
  }

  // G4 — certified is staff-only.
  if (domain === "certified_official") {
    return json(
      { success: false, error: "certified_not_self_serviceable" },
      400,
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // ---- Session → vendor → translator ----
  const { data: session, error: sessionErr } = await supabase
    .from("vendor_sessions")
    .select("vendor_id, expires_at")
    .eq("session_token", sessionToken)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (sessionErr || !session) {
    return json({ success: false, error: "unauthenticated" }, 401);
  }

  const { data: vendor, error: vendorErr } = await supabase
    .from("vendors")
    .select("id, email, full_name")
    .eq("id", session.vendor_id)
    .single();
  if (vendorErr || !vendor) {
    return json({ success: false, error: "vendor_not_found" }, 404);
  }

  const { data: translator, error: trErr } = await supabase
    .from("cvp_translators")
    .select("id, application_id, email, full_name")
    .eq("email", vendor.email)
    .maybeSingle();
  if (trErr || !translator) {
    return json({ success: false, error: "translator_not_found" }, 404);
  }

  // ---- G1: translator must have ≥1 approved domain on this exact pair ----
  const { data: approvedOnPair } = await supabase
    .from("cvp_translator_domains")
    .select("id")
    .eq("translator_id", translator.id)
    .eq("source_language_id", sourceLanguageId)
    .eq("target_language_id", targetLanguageId)
    .eq("status", "approved")
    .limit(1);
  if (!approvedOnPair || approvedOnPair.length === 0) {
    return json(
      {
        success: false,
        error: "pair_not_approved",
        detail: "You don't have an approved domain on this language pair yet. Contact support if this seems wrong.",
      },
      400,
    );
  }

  // ---- G2: no other pending/in_review request ----
  const { data: openRequests } = await supabase
    .from("cvp_translator_domains")
    .select("id, domain, source_language_id, target_language_id, status")
    .eq("translator_id", translator.id)
    .in("status", ["pending", "in_review"]);
  if (openRequests && openRequests.length > 0) {
    return json(
      {
        success: false,
        error: "pending_request_exists",
        detail: "You already have a pending test. Wait for it to complete before requesting another.",
      },
      400,
    );
  }

  // ---- G3: cooldown check on an exact (pair, domain) rejection ----
  const { data: rejectedRow } = await supabase
    .from("cvp_translator_domains")
    .select("id, cooldown_until, status")
    .eq("translator_id", translator.id)
    .eq("source_language_id", sourceLanguageId)
    .eq("target_language_id", targetLanguageId)
    .eq("domain", domain)
    .eq("status", "rejected")
    .maybeSingle();
  if (
    rejectedRow &&
    rejectedRow.cooldown_until &&
    new Date(rejectedRow.cooldown_until).getTime() > Date.now()
  ) {
    return json(
      {
        success: false,
        error: "cooldown_active",
        detail: `You can try this domain again on ${new Date(rejectedRow.cooldown_until).toISOString().slice(0, 10)}.`,
        cooldown_until: rejectedRow.cooldown_until,
      },
      400,
    );
  }

  // Idempotency: if an approved row already exists for this (pair, domain),
  // nothing to do.
  const { data: alreadyApproved } = await supabase
    .from("cvp_translator_domains")
    .select("id")
    .eq("translator_id", translator.id)
    .eq("source_language_id", sourceLanguageId)
    .eq("target_language_id", targetLanguageId)
    .eq("domain", domain)
    .eq("status", "approved")
    .maybeSingle();
  if (alreadyApproved) {
    return json(
      {
        success: false,
        error: "already_approved",
        detail: "You're already approved for this domain on this language pair.",
      },
      400,
    );
  }

  // ---- G5: library has an active test for (pair, domain) ----
  const { data: libraryRows } = await supabase
    .from("cvp_test_library")
    .select("id")
    .eq("source_language_id", sourceLanguageId)
    .eq("target_language_id", targetLanguageId)
    .eq("domain", domain)
    .eq("is_active", true)
    .limit(1);
  if (!libraryRows || libraryRows.length === 0) {
    return json(
      {
        success: false,
        error: "no_library_test",
        detail: "No active test in the library for this combination. Please contact support.",
      },
      409,
    );
  }

  // ---- Create combination + translator_domain rows ----
  // application_id is inherited from the translator's original application —
  // cvp-send-tests' existing queries scope by application_id, so we attach
  // the new combo to that same application for simplicity.
  if (!translator.application_id) {
    return json(
      { success: false, error: "translator_has_no_application" },
      500,
    );
  }

  const { data: newCombo, error: comboErr } = await supabase
    .from("cvp_test_combinations")
    .insert({
      application_id: translator.application_id,
      source_language_id: sourceLanguageId,
      target_language_id: targetLanguageId,
      domain,
      service_type: null,
      status: "pending",
      is_baseline_general: false,
    })
    .select("id")
    .single();
  if (comboErr || !newCombo) {
    return json(
      { success: false, error: "combination_create_failed", detail: comboErr?.message },
      500,
    );
  }

  // Upsert in case an older revoked/rejected row exists (we reset it to
  // pending on self-request).
  const { data: domainRow, error: domainErr } = await supabase
    .from("cvp_translator_domains")
    .upsert(
      {
        translator_id: translator.id,
        source_language_id: sourceLanguageId,
        target_language_id: targetLanguageId,
        domain,
        status: "pending",
        approval_source: "self_request",
        test_combination_id: newCombo.id,
        cooldown_until: null,
        rejected_at: null,
        approved_at: null,
      },
      {
        onConflict: "translator_id,source_language_id,target_language_id,domain",
      },
    )
    .select("id")
    .single();
  if (domainErr) {
    console.error("cvp_translator_domains upsert failed:", domainErr.message);
    // Continue — send-tests will still fire and staff can reconcile.
  }

  // ---- Trigger cvp-send-tests internally ----
  // We pass combinationIds so it only processes the new combo (not other
  // pending combos on the translator's original application, which may
  // already be approved but could still linger if the application is old).
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  let testSent = false;
  try {
    const sendResp = await fetch(`${supabaseUrl}/functions/v1/cvp-send-tests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        applicationId: translator.application_id,
        combinationIds: [newCombo.id],
        staffId: null,
      }),
    });
    if (sendResp.ok) {
      const sendJson = await sendResp.json();
      testSent = Boolean(sendJson?.data?.testsAssigned);
    } else {
      console.error(
        "cvp-send-tests failed for self-request:",
        await sendResp.text(),
      );
    }
  } catch (err) {
    console.error("cvp-send-tests fetch error:", err);
  }

  return json({
    success: true,
    data: {
      combinationId: newCombo.id,
      domainRowId: domainRow?.id ?? null,
      testSent,
    },
  });
});
