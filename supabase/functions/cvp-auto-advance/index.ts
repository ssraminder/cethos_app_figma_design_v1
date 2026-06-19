// ============================================================================
// cvp-auto-advance  (Phase A of "no human until final approval")
//
// Cron-driven, idempotent sweep that advances applicants through the recruitment
// pipeline WITHOUT a human in the middle. The only human gate is final approval.
//
// Phase A scope — prescreen → assessment for TRANSLATORS:
//   - HARD JUNK (test-data / spam / placeholder entries) → auto-reject (silent).
//     Deliberately NARROW + high-precision: a real-but-weak applicant (e.g. a
//     software engineer with no translation history) is NOT junk — they get the
//     assessment and the AI-graded test/quiz (the real ISO §6.1.2 gate) decides.
//   - EVERYONE ELSE in staff_review/prescreened with no instrument choice yet →
//     bump staff_review→prescreened + send the test/quiz choice invitation.
//
// Re-spam guard: only invite when there is no LIVE instrument_choice_token, so
// repeated cron runs never re-email the same applicant.
//
// Cognitive-debriefing (COA) and agency applicants are intentionally skipped
// here — COA needs the cog-debrief quiz (Phase B); agencies have their own
// onboarding path.
//
// POST /functions/v1/cvp-auto-advance
// Body: { dry_run?: boolean, limit?: number }
// Returns: { success, data: { considered, advanced, rejected, skipped, actions } }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Acting "system" staff user (Raminder) — stamped on automated transitions so
// the audit trail shows who the automation ran as.
const SYSTEM_STAFF_ID = "a8b2d97e-4832-41d4-9334-4d6a58558154";
const DEFAULT_LIMIT = 25;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// HARD-JUNK detection — high precision, low recall on purpose. Only unambiguous
// test/spam/placeholder entries. Real-but-weak applicants must NOT match.
function isHardJunk(fullName: string | null, email: string | null): string | null {
  const name = (fullName ?? "").trim().toLowerCase();
  const mail = (email ?? "").trim().toLowerCase();
  if (!mail || !mail.includes("@")) return "missing/invalid email";
  const domain = mail.split("@")[1] ?? "";
  if (domain.endsWith(".invalid") || ["example.com", "test.com", "test.test", "mailinator.com"].includes(domain)) {
    return `test/disposable email domain (${domain})`;
  }
  // Test-pattern names: pure placeholder / keyboard-mash / contains '=='.
  if (
    name === "" ||
    name.includes("==") ||
    /^(test|asdf|qwerty|aaa+|n\/?a|xxx+|abc|sample|demo|dummy)\b/.test(name) ||
    /\btest\s+test\b/.test(name)
  ) {
    return `test-pattern name ("${fullName}")`;
  }
  return null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  let body: { dry_run?: boolean; limit?: number } = {};
  try { body = await req.json(); } catch { /* empty body ok for cron */ }
  const dryRun = body.dry_run === true;
  const limit = Math.min(Math.max(body.limit ?? DEFAULT_LIMIT, 1), 100);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey);

  const nowIso = new Date().toISOString();

  // Candidates: translators parked at prescreen with no choice yet and no live
  // invite token (so we never re-spam).
  // Re-spam guard lives IN the query (not a post-fetch JS filter) so a backlog
  // of already-invited-but-not-yet-chosen applicants can't fill the fetch window
  // and starve newer applicants. Eligible = no invite token OR an expired one.
  const { data: rows, error } = await supabase
    .from("cvp_applications")
    .select("id, full_name, email, status")
    .eq("role_type", "translator")
    .in("status", ["staff_review", "prescreened"])
    .is("instrument_choice", null)
    .or(`instrument_choice_token.is.null,instrument_choice_token_expires_at.lt.${nowIso}`)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) return json({ success: false, error: error.message }, 500);

  const candidates = rows ?? [];

  const actions: Array<Record<string, unknown>> = [];
  let advanced = 0, rejected = 0, skipped = 0;

  for (const a of candidates as any[]) {
    const junkReason = isHardJunk(a.full_name, a.email);

    if (junkReason) {
      if (!dryRun) {
        const { error: rErr } = await supabase
          .from("cvp_applications")
          .update({
            status: "rejected",
            staff_reviewed_by: SYSTEM_STAFF_ID,
            staff_reviewed_at: nowIso,
            staff_review_notes: `[auto] Hard-junk auto-reject: ${junkReason}. (cvp-auto-advance)`,
            updated_at: nowIso,
          })
          .eq("id", a.id)
          .eq("status", a.status); // optimistic guard
        if (rErr) { skipped++; actions.push({ id: a.id, action: "reject_failed", error: rErr.message }); continue; }
      }
      rejected++;
      actions.push({ id: a.id, name: a.full_name, action: "reject", reason: junkReason });
      continue;
    }

    // Advance: bump staff_review→prescreened, then send the choice invite.
    if (!dryRun) {
      if (a.status === "staff_review") {
        await supabase
          .from("cvp_applications")
          .update({
            status: "prescreened",
            staff_reviewed_by: SYSTEM_STAFF_ID,
            staff_reviewed_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", a.id);
      }
      const resp = await fetch(`${supabaseUrl}/functions/v1/cvp-send-instrument-choice-invitation`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ applicationId: a.id }),
      });
      const out = await resp.json().catch(() => ({}));
      if (!resp.ok || out?.success === false) {
        skipped++;
        actions.push({ id: a.id, name: a.full_name, action: "invite_failed", detail: out?.error ?? `http ${resp.status}` });
        continue;
      }
    }
    advanced++;
    actions.push({ id: a.id, name: a.full_name, action: "advance_to_assessment" });
  }

  // ── Phase C: assessment passed (test_assessed) → auto-request references.
  // Any role. References are collected automatically; the human reads them at
  // the single final approval gate. Skip anyone who already has a request.
  let referencesRequested = 0;
  const { data: passed } = await supabase
    .from("cvp_applications")
    .select("id, full_name")
    .eq("status", "test_assessed")
    .order("created_at", { ascending: true })
    .limit(limit);
  for (const p of (passed ?? []) as any[]) {
    const { count } = await supabase
      .from("cvp_application_reference_requests")
      .select("id", { count: "exact", head: true })
      .eq("application_id", p.id);
    if ((count ?? 0) > 0) { skipped++; continue; }
    if (!dryRun) {
      const resp = await fetch(`${supabaseUrl}/functions/v1/cvp-request-references`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ applicationId: p.id, internalAuto: true, actingStaffId: SYSTEM_STAFF_ID }),
      });
      const out = await resp.json().catch(() => ({}));
      if (!resp.ok || out?.success === false) {
        skipped++;
        actions.push({ id: p.id, name: p.full_name, action: "references_request_failed", detail: out?.error ?? `http ${resp.status}` });
        continue;
      }
      await supabase
        .from("cvp_applications")
        .update({ status: "references_requested", updated_at: nowIso })
        .eq("id", p.id)
        .eq("status", "test_assessed");
    }
    referencesRequested++;
    actions.push({ id: p.id, name: p.full_name, action: "request_references" });
  }

  // ── Phase D: borderline General test parked in staff_review → auto-offer the
  // quiz as a second instrument (once), instead of leaving it for a human. Reset
  // the general combos so the quiz dispatch picks them up; the quiz then settles
  // the application. Guard: skip anyone who already has a quiz (offer once).
  let quizOffered = 0;
  const { data: blCombos } = await supabase
    .from("cvp_test_combinations")
    .select("application_id")
    .eq("status", "assessed")
    .eq("domain", "general");
  const blAppIds = Array.from(new Set((blCombos ?? []).map((r: any) => r.application_id))).slice(0, limit);
  for (const appId of blAppIds) {
    const { data: app } = await supabase
      .from("cvp_applications").select("id, full_name, status").eq("id", appId).maybeSingle();
    if (!app || (app as any).status !== "staff_review") continue;
    const { count: qCount } = await supabase
      .from("cvp_quiz_submissions").select("id", { count: "exact", head: true }).eq("application_id", appId);
    if ((qCount ?? 0) > 0) continue; // already offered a quiz — borderline stands
    if (!dryRun) {
      await supabase
        .from("cvp_test_combinations")
        .update({ status: "pending", updated_at: nowIso })
        .eq("application_id", appId).eq("domain", "general").eq("status", "assessed");
      const resp = await fetch(`${supabaseUrl}/functions/v1/cvp-record-instrument-choice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ applicationId: appId, choice: "quiz", staffId: SYSTEM_STAFF_ID }),
      });
      const out = await resp.json().catch(() => ({}));
      if (!resp.ok || out?.success === false) {
        skipped++;
        actions.push({ id: appId, name: (app as any).full_name, action: "quiz_offer_failed", detail: out?.error ?? `http ${resp.status}` });
        continue;
      }
      await supabase
        .from("cvp_applications")
        .update({ status: "test_in_progress", updated_at: nowIso })
        .eq("id", appId).eq("status", "staff_review");
    }
    quizOffered++;
    actions.push({ id: appId, name: (app as any).full_name, action: "offer_quiz_after_borderline" });
  }

  return json({
    success: true,
    data: { dry_run: dryRun, considered: candidates.length, advanced, rejected, referencesRequested, quizOffered, skipped, actions },
  });
});
