/**
 * cvp-save-flag-feedback
 *
 * Upsert a staff verdict + notes on a single AI-generated flag (red or green).
 * Used by the admin RecruitmentDetail page; one POST per flag the staff member
 * verdicts. Idempotent — re-clicking a verdict overwrites the previous one.
 *
 * Body:
 *   {
 *     applicationId: string  (uuid),
 *     flagKind: 'red_flag' | 'green_flag',
 *     flagText: string,
 *     verdict: 'valid' | 'invalid' | 'low_weight' | 'context_dependent',
 *     staffNotes?: string,
 *     staffUserId?: string  (uuid; preferred — caller's staff_users.id),
 *     prescreenAt?: string  (iso timestamp from ai_prescreening_at),
 *     promptVersion?: string  (e.g. 'v2-cv-aware'),
 *   }
 *
 * Service role used for writes — RLS still enforces select/update/delete
 * for any direct admin reads.
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VERDICTS = new Set([
  "valid",
  "invalid",
  "low_weight",
  "context_dependent",
]);
const KINDS = new Set(["red_flag", "green_flag"]);

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface Body {
  applicationId?: string;
  flagKind?: string;
  flagText?: string;
  verdict?: string;
  staffNotes?: string;
  staffUserId?: string;
  prescreenAt?: string;
  promptVersion?: string;
  /** When true, deletes the verdict for this (applicationId, flagKind, flagText). */
  remove?: boolean;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "Invalid JSON" }, 400);
  }

  if (!body.applicationId) {
    return json({ success: false, error: "applicationId required" }, 400);
  }
  if (!body.flagKind || !KINDS.has(body.flagKind)) {
    return json(
      { success: false, error: "flagKind must be red_flag or green_flag" },
      400,
    );
  }
  if (!body.flagText || body.flagText.trim().length === 0) {
    return json({ success: false, error: "flagText required" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  if (body.remove === true) {
    const { error } = await supabase
      .from("cvp_prescreen_flag_feedback")
      .delete()
      .eq("application_id", body.applicationId)
      .eq("flag_kind", body.flagKind)
      .eq("flag_text", body.flagText);
    if (error) {
      console.error("Failed to delete flag feedback:", error.message);
      return json({ success: false, error: error.message }, 500);
    }
    return json({ success: true, data: { removed: true } });
  }

  if (!body.verdict || !VERDICTS.has(body.verdict)) {
    return json(
      {
        success: false,
        error:
          "verdict must be one of: valid, invalid, low_weight, context_dependent",
      },
      400,
    );
  }

  const row = {
    application_id: body.applicationId,
    flag_kind: body.flagKind,
    flag_text: body.flagText,
    verdict: body.verdict,
    staff_notes: body.staffNotes ?? null,
    staff_user_id: body.staffUserId ?? null,
    prescreen_at: body.prescreenAt ?? null,
    prompt_version: body.promptVersion ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("cvp_prescreen_flag_feedback")
    .upsert(row, { onConflict: "application_id,flag_kind,flag_text" })
    .select("id, verdict, staff_notes, updated_at")
    .single();

  if (error) {
    console.error("Failed to save flag feedback:", error.message);
    return json({ success: false, error: error.message }, 500);
  }

  return json({ success: true, data });
});
