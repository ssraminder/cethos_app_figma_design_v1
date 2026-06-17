/**
 * cvp-get-my-domains
 *
 * Read-only helper for the vendor portal's Request-Test page (T3). Takes
 * a vendor session token, returns the authenticated translator's full
 * cvp_translator_domains set plus the language records needed to render
 * pair labels.
 *
 * Auth: dual-mode via body.session_token (preferred) or Authorization
 * header. verify_jwt is OFF at the gateway because the function does
 * its own auth (vendor_sessions lookup). This is required for the
 * new sb_publishable_* anon key format, which is not JWT-shaped and
 * cannot pass the gateway's verify_jwt check.
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  // Dual auth: prefer body.session_token, fall back to Authorization
  // header. Anon-key-shaped strings in Authorization are gateway
  // envelopes, not vendor sessions, so we ignore them. The vendor
  // session is a plain UUID; the legacy anon key is a JWT (eyJ...);
  // the new publishable key starts with sb_publishable_.
  let bodyToken = null;
  let parsedBody = {};
  try {
    parsedBody = await req.clone().json().catch(() => ({}));
    if (typeof parsedBody?.session_token === "string") bodyToken = parsedBody.session_token;
  } catch { /* ignore */ }
  const headerToken = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const headerIsEnvelope = headerToken.startsWith("eyJ") || headerToken.startsWith("sb_publishable_") || headerToken.startsWith("sb_secret_");
  const token = bodyToken ?? (headerIsEnvelope ? null : headerToken);
  if (!token) return json({ success: false, error: "no_token" }, 400);

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  const { data: session } = await supabase
    .from("vendor_sessions").select("vendor_id, expires_at")
    .eq("session_token", token).maybeSingle();
  if (!session) return json({ success: false, error: "session_not_found" }, 401);
  if (new Date(session.expires_at) <= new Date()) {
    return json({ success: false, error: "session_expired" }, 401);
  }

  const { data: vendor } = await supabase.from("vendors").select("id, email").eq("id", session.vendor_id).single();
  if (!vendor) return json({ success: false, error: "vendor_not_found" }, 404);

  const { data: translator } = await supabase.from("cvp_translators").select("id").eq("email", vendor.email).maybeSingle();
  if (!translator) {
    return json({ success: true, data: { translator_id: null, rows: [], languages: [], app_url: Deno.env.get("APP_URL") ?? "https://join.cethos.com" } });
  }

  const { data: rows } = await supabase
    .from("cvp_translator_domains")
    .select("id, source_language_id, target_language_id, domain, status, cooldown_until, approval_source, approved_at, rejected_at")
    .eq("translator_id", translator.id);
  const domainRows = rows ?? [];

  const ids = Array.from(new Set(domainRows.flatMap((r) => [r.source_language_id, r.target_language_id])));
  const { data: languages } = ids.length > 0
    ? await supabase.from("languages").select("id, name, code").in("id", ids)
    : { data: [] };

  const { data: app } = await supabase
    .from("cvp_applications").select("id")
    .eq("email", vendor.email)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  let rowsWithTests = domainRows.map((r) => ({ ...r, latest_submission: null }));

  if (app && domainRows.length > 0) {
    const { data: combos } = await supabase
      .from("cvp_test_combinations")
      .select("id, source_language_id, target_language_id, domain")
      .eq("application_id", app.id);

    const enriched = [];
    for (const r of rowsWithTests) {
      const matchingCombos = (combos ?? []).filter((c) =>
        c.source_language_id === r.source_language_id
        && c.target_language_id === r.target_language_id
        && c.domain === r.domain);
      if (matchingCombos.length === 0) { enriched.push(r); continue; }
      const { data: subs } = await supabase
        .from("cvp_test_submissions")
        .select("id, token, token_expires_at, status, ai_assessment_score, submitted_at, created_at, tm_job_id, tm_job_url")
        .in("combination_id", matchingCombos.map((c) => c.id))
        .order("created_at", { ascending: false }).limit(1);
      const submission = subs?.[0] ?? null;
      let feedback_token = null;
      if (submission?.id) {
        const { data: fr } = await supabase
          .from("cvp_test_feedback_rounds")
          .select("token")
          .eq("submission_id", submission.id)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        feedback_token = fr?.token ?? null;
      }
      enriched.push({ ...r, latest_submission: submission ? { ...submission, feedback_token } : null });
    }
    rowsWithTests = enriched;
  }

  return json({
    success: true,
    data: {
      translator_id: translator.id,
      rows: rowsWithTests,
      languages: languages ?? [],
      app_url: Deno.env.get("APP_URL") ?? "https://join.cethos.com",
    },
  });
});
