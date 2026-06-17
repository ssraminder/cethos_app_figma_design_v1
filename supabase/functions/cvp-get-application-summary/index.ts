/**
 * cvp-get-application-summary
 *
 * Read-only convenience endpoint: returns the application row (selected
 * fields), the latest AI prescreen result, all staff flag-verdicts for this
 * app, and the full decision history — in one call. Useful for quick audits
 * and for the admin UI's future "what did I already say about this app?"
 * panel.
 *
 * Body: { applicationId?: string, applicationNumber?: string }
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

  let body: { applicationId?: string; applicationNumber?: string };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "invalid_json" }, 400);
  }
  if (!body.applicationId && !body.applicationNumber) {
    return json({ success: false, error: "applicationId_or_applicationNumber_required" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const appQuery = supabase
    .from("cvp_applications")
    .select(
      "id, application_number, full_name, email, country, city, role_type, status, assigned_tier, years_experience, education_level, rate_expectation, rate_currency, staff_review_notes, rejection_reason, ai_prescreening_score, ai_prescreening_result, ai_prescreening_at, cv_storage_path, created_at, updated_at",
    );
  const { data: app, error: appErr } = body.applicationId
    ? await appQuery.eq("id", body.applicationId).maybeSingle()
    : await appQuery.eq("application_number", body.applicationNumber).maybeSingle();
  if (appErr) return json({ success: false, error: appErr.message }, 500);
  if (!app) return json({ success: false, error: "application_not_found" }, 404);

  const appId = app.id as string;

  const [feedbackRes, decisionsRes] = await Promise.all([
    supabase
      .from("cvp_prescreen_flag_feedback")
      .select(
        "flag_kind, flag_text, verdict, staff_notes, prescreen_at, prompt_version, staff_user_id, created_at, updated_at",
      )
      .eq("application_id", appId)
      .order("created_at", { ascending: true }),
    supabase
      .from("cvp_application_decisions")
      .select(
        "action, staff_notes, ai_output, ai_error, message_sent_subject, staff_user_id, created_at",
      )
      .eq("application_id", appId)
      .order("created_at", { ascending: true }),
  ]);

  return json({
    success: true,
    data: {
      application: app,
      flag_feedback: feedbackRes.data ?? [],
      decisions: decisionsRes.data ?? [],
    },
  });
});
