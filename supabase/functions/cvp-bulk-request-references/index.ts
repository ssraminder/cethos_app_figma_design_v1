/**
 * cvp-bulk-request-references
 *
 * One-shot bulk-trigger of the references-request flow for applicants who
 * have at least one passed test combo and don't yet have a reference
 * request on file.
 *
 * Mirrors the logic in `cvp-request-references` per application so each
 * applicant gets an Opus-drafted message + the V18 email + the
 * cvp_application_reference_requests row + a status advance to
 * `references_requested`. Runs serially so Mailgun + Anthropic don't
 * see a burst.
 *
 * Auth: cron-shared-secret (admin-owned). This is an audit-trail-aware
 * bulk action — never expose without the secret.
 *
 * POST {
 *   applicationIds?: string[]   // optional. Defaults to server-derived eligible set.
 *   useAIDraft?: boolean         // defaults true
 *   dryRun?: boolean             // when true, returns count + first 5 picks; no emails sent
 * }
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { requireCronSecret } from "../_shared/require-cron-secret.ts";
import { sendMailgunEmail } from "../_shared/mailgun.ts";
import { buildV18ReferencesRequest } from "../_shared/email-templates.ts";
import { MODEL_QUALITY } from "../_shared/ai-models.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const APPLICANT_URL_FALLBACK = "https://join.cethos.com";

const AI_DRAFT_SYSTEM_PROMPT = `You are drafting the body of a CETHOS email asking an applicant to share 2–3 professional references. Audience: a translator who has cleared early steps of our recruitment pipeline; warm, respectful, professional.

Hard rules:
- Output only the body text. No salutation ("Hi Name,"), no signoff — the email template wraps these.
- 2–4 short paragraphs. No bullets unless the user's instructions specifically call for them.
- Mention what kinds of references are useful (former clients, project managers, peer translators) and the timing — "no rush, but the sooner the better".
- Do NOT promise outcomes. Do NOT state when the application will be decided.

Output: plain text only.`;

const ADVANCEABLE_FROM = new Set([
  "submitted",
  "prescreening",
  "prescreened",
  "staff_review",
  "info_requested",
  "test_pending",
  "test_sent",
  "test_in_progress",
  "test_submitted",
  "test_assessed",
  "negotiation",
]);

async function draftWithOpus(args: {
  applicantName: string;
  applicationNumber: string;
}): Promise<{ ok: boolean; text: string | null; error: string | null }> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return { ok: false, text: null, error: "ANTHROPIC_API_KEY not configured" };

  const userMessage = `Applicant: ${args.applicantName}
Application: ${args.applicationNumber}

Staff instructions for this draft (optional):
(none — use your professional judgement)`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_QUALITY,
        max_tokens: 600,
        system: AI_DRAFT_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      return { ok: false, text: null, error: `${resp.status}: ${body.slice(0, 400)}` };
    }
    const data = (await resp.json()) as { content: { type: string; text?: string }[] };
    const text =
      (data.content ?? []).find((c) => c.type === "text")?.text?.trim() ?? "";
    return text
      ? { ok: true, text, error: null }
      : { ok: false, text: null, error: "empty draft" };
  } catch (err) {
    return { ok: false, text: null, error: err instanceof Error ? err.message : String(err) };
  }
}

interface AppRow {
  id: string;
  email: string;
  full_name: string;
  application_number: string;
  status: string;
}

interface Result {
  applicationId: string;
  applicationNumber?: string;
  fullName?: string;
  ok: boolean;
  error?: string;
  emailSent?: boolean;
  suppressed?: boolean;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  const authed = await requireCronSecret(req);
  if (!authed.ok) return json({ success: false, error: authed.error }, authed.status);

  let body: {
    applicationIds?: string[];
    useAIDraft?: boolean;
    dryRun?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Resolve the candidate set. If caller passes explicit IDs, use those
  // verbatim. Otherwise, server-derive the eligible set: applicants who
  // have at least one passing combo AND no reference request yet AND are
  // not in a terminal status. This matches the query the operator ran
  // before triggering the bulk send.
  let candidateIds: string[];
  if (Array.isArray(body.applicationIds) && body.applicationIds.length > 0) {
    candidateIds = body.applicationIds;
  } else {
    const { data, error } = await supabase.rpc("cvp_eligible_for_reference_request");
    if (error) {
      return json({ success: false, error: "candidate_query_failed", detail: error.message }, 500);
    }
    candidateIds = (data ?? []).map((r: { application_id: string }) => r.application_id);
  }

  if (candidateIds.length === 0) {
    return json({ success: true, total: 0, sent: 0, failed: 0, results: [] });
  }

  const { data: apps, error: appsErr } = await supabase
    .from("cvp_applications")
    .select("id, email, full_name, application_number, status")
    .in("id", candidateIds);
  if (appsErr) {
    return json({ success: false, error: "apps_fetch_failed", detail: appsErr.message }, 500);
  }
  const appRows = (apps ?? []) as AppRow[];

  if (body.dryRun === true) {
    return json({
      success: true,
      dryRun: true,
      total: appRows.length,
      preview: appRows.slice(0, 10).map((a) => ({
        id: a.id,
        application_number: a.application_number,
        full_name: a.full_name,
        email: a.email,
        status: a.status,
      })),
    });
  }

  const useAIDraft = body.useAIDraft !== false; // default true
  const appUrl = Deno.env.get("APP_URL") ?? APPLICANT_URL_FALLBACK;
  const expiryDays = 14;
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();

  const results: Result[] = [];
  let sentCount = 0;
  let failedCount = 0;

  for (const app of appRows) {
    try {
      // Skip if a reference request already exists for this application
      // (defensive — the eligibility filter should have caught this, but
      // a race could allow a duplicate insert).
      const { data: existing } = await supabase
        .from("cvp_application_reference_requests")
        .select("id")
        .eq("application_id", app.id)
        .maybeSingle();
      if (existing) {
        results.push({
          applicationId: app.id,
          applicationNumber: app.application_number,
          fullName: app.full_name,
          ok: false,
          error: "request_already_exists",
        });
        failedCount++;
        continue;
      }

      let aiDraft: string | null = null;
      if (useAIDraft) {
        const d = await draftWithOpus({
          applicantName: app.full_name,
          applicationNumber: app.application_number,
        });
        aiDraft = d.ok ? d.text : null;
      }

      const { data: requestRow, error: insErr } = await supabase
        .from("cvp_application_reference_requests")
        .insert({
          application_id: app.id,
          request_token_expires_at: expiresAt,
          // staff_id intentionally null — this is a system-initiated bulk
          // send. Audit-wise the trail lives in this function's logs +
          // the notification_log row keyed by application_id.
          staff_id: null,
          staff_message: aiDraft,
          ai_drafted_message: aiDraft,
          status: "sent",
        })
        .select("id, request_token")
        .single();
      if (insErr || !requestRow) {
        results.push({
          applicationId: app.id,
          applicationNumber: app.application_number,
          fullName: app.full_name,
          ok: false,
          error: `request_create_failed: ${insErr?.message ?? "unknown"}`,
        });
        failedCount++;
        continue;
      }

      const tpl = buildV18ReferencesRequest({
        fullName: app.full_name,
        applicationNumber: app.application_number,
        staffMessage: aiDraft,
        contactsLinkUrl: `${appUrl}/references/${requestRow.request_token}`,
        expiryDays,
      });

      const sendResult = await sendMailgunEmail({
        to: { email: app.email, name: app.full_name },
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        respectDoNotContactFor: app.email,
        tags: ["v18-references-request", app.id, "bulk-send"],
        trackContext: {
          applicationId: app.id,
          templateTag: "v18-references-request",
          staffUserId: null,
        },
      });

      if (ADVANCEABLE_FROM.has(app.status)) {
        await supabase
          .from("cvp_applications")
          .update({ status: "references_requested", updated_at: new Date().toISOString() })
          .eq("id", app.id);
      }

      results.push({
        applicationId: app.id,
        applicationNumber: app.application_number,
        fullName: app.full_name,
        ok: true,
        emailSent: sendResult.sent,
        suppressed: sendResult.suppressed,
      });
      if (sendResult.sent) sentCount++;
      else failedCount++;

      // Small spacing between sends so Mailgun + Anthropic see steady
      // traffic, not a burst.
      await new Promise((r) => setTimeout(r, 400));
    } catch (err) {
      results.push({
        applicationId: app.id,
        applicationNumber: app.application_number,
        fullName: app.full_name,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
      failedCount++;
    }
  }

  return json({
    success: true,
    total: appRows.length,
    sent: sentCount,
    failed: failedCount,
    results,
  });
});
