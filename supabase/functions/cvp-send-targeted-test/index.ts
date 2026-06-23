// ============================================================================
// cvp-send-targeted-test  (2026-06-23)
//
// Staff-facing: send ONE specific test for a chosen (domain × language pair),
// instead of the bulk "send all pending combos" / chooser-invitation flow. Used
// from the recruitment detail page so an admin can, e.g., send a COA test for
// EN→es-419 directly. Finds the matching cvp_test_combinations row (or creates
// it if the applicant declared the domain + pair but no combo exists), makes it
// eligible, then delegates to cvp-send-tests for the actual library pick + TM
// provisioning + V3 email.
//
// POST { applicationId, domain, sourceLanguageId, targetLanguageId, difficulty?, staffId? }
// Returns { success, data: { combinationId } } | { success:false, error }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  let body: {
    applicationId?: string; domain?: string;
    sourceLanguageId?: string; targetLanguageId?: string;
    difficulty?: "beginner" | "intermediate" | "advanced"; staffId?: string;
  };
  try { body = await req.json(); } catch { return json({ success: false, error: "invalid_json" }, 400); }

  const applicationId = (body.applicationId ?? "").trim();
  const domain = (body.domain ?? "").trim();
  const sourceLanguageId = (body.sourceLanguageId ?? "").trim();
  const targetLanguageId = (body.targetLanguageId ?? "").trim();
  const difficulty = body.difficulty ?? "intermediate";
  if (!applicationId || !domain || !sourceLanguageId || !targetLanguageId) {
    return json({ success: false, error: "applicationId, domain, sourceLanguageId and targetLanguageId are required" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // 1. Find the existing combo for this exact (domain, src, tgt).
  const { data: existing } = await supabase
    .from("cvp_test_combinations")
    .select("id, status")
    .eq("application_id", applicationId)
    .eq("source_language_id", sourceLanguageId)
    .eq("target_language_id", targetLanguageId)
    .eq("domain", domain)
    .maybeSingle();

  let combinationId = (existing as { id?: string; status?: string } | null)?.id ?? null;
  const status = (existing as { status?: string } | null)?.status ?? null;

  if (combinationId && status === "approved") {
    return json({ success: false, error: "This domain + language pair is already approved — no test to send." }, 400);
  }

  // 2. Create it if the applicant declared the pair/domain but no combo exists.
  if (!combinationId) {
    const { data: created, error: createErr } = await supabase
      .from("cvp_test_combinations")
      .insert({
        application_id: applicationId,
        source_language_id: sourceLanguageId,
        target_language_id: targetLanguageId,
        domain,
        service_type: null,
        status: "pending",
        is_baseline_general: domain === "general",
      })
      .select("id")
      .single();
    if (createErr || !created) {
      return json({ success: false, error: "Failed to create the combination.", detail: createErr?.message }, 500);
    }
    combinationId = (created as { id: string }).id;
  } else if (status !== "pending") {
    // Make a settled/sent combo eligible for a fresh send.
    await supabase
      .from("cvp_test_combinations")
      .update({ status: "pending", updated_at: new Date().toISOString() })
      .eq("id", combinationId);
  }

  // 3. Delegate to cvp-send-tests for the library pick + TM provisioning + email.
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const url = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "") + "/functions/v1/cvp-send-tests";
  let out: Record<string, unknown> = {};
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ applicationId, combinationIds: [combinationId], difficulty, staffId: body.staffId ?? null }),
    });
    out = await resp.json().catch(() => ({}));
    if (!resp.ok || (out as { success?: boolean }).success === false) {
      return json({ success: false, error: (out as { error?: string }).error ?? `cvp-send-tests failed (http ${resp.status})`, detail: out }, 502);
    }
  } catch (e) {
    return json({ success: false, error: "Failed to dispatch the test send.", detail: String(e) }, 502);
  }

  return json({ success: true, data: { combinationId, send: (out as { data?: unknown }).data ?? out } });
});
