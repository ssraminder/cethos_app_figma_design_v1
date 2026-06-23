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

  let body: { dry_run?: boolean; limit?: number; domains?: string[] } = {};
  try { body = await req.json(); } catch { /* empty body ok for cron */ }
  const dryRun = body.dry_run === true;
  const limit = Math.min(Math.max(body.limit ?? DEFAULT_LIMIT, 1), 100);
  // Optional domain scope (declared domains_offered). When set, only applicants
  // offering one of these domains are advanced — used to prioritise a cohort
  // (e.g. COA / life sciences / pharmaceutical) without changing the default
  // global sweep.
  const domainsFilter = Array.isArray(body.domains) ? body.domains.filter(Boolean) : null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey);

  const nowIso = new Date().toISOString();

  // Candidates: translators parked at prescreen with no choice yet and no live
  // invite token (so we never re-spam).
  // Re-spam guard lives IN the query (not a post-fetch JS filter) so a backlog
  // of already-invited-but-not-yet-chosen applicants can't fill the fetch window
  // and starve newer applicants. Eligible = no invite token OR an expired one.
  let candidateQuery = supabase
    .from("cvp_applications")
    .select("id, full_name, email, status")
    .in("role_type", ["translator", "cognitive_debriefing"])
    .in("status", ["staff_review", "prescreened"])
    .is("instrument_choice", null)
    .or(`instrument_choice_token.is.null,instrument_choice_token_expires_at.lt.${nowIso}`);
  if (domainsFilter && domainsFilter.length > 0) {
    candidateQuery = candidateQuery.overlaps("domains_offered", domainsFilter);
  }
  const { data: rows, error } = await candidateQuery
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

    // NDA gate moved from SEND to ACCESS (2026-06-22). We no longer hold the
    // assessment invitation for a missing NDA — the confidentiality agreement is
    // enforced (clickwrap) when the applicant opens the quiz/test
    // (cvp-get-quiz / cvp-get-test). Holding here was leaving prescreened
    // applicants stuck and starving the roster.

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
  // the single final approval gate.
  // Repair path: if a reference request exists but status is still test_assessed
  // (race condition on a previous run), just advance the status — don't re-send.
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
    const hasRefRequest = (count ?? 0) > 0;
    if (!dryRun) {
      if (!hasRefRequest) {
        // Normal path: send reference request then advance status.
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
      }
      // Advance status — covers both the normal path and the repair-of-stuck case.
      await supabase
        .from("cvp_applications")
        .update({ status: "references_requested", updated_at: nowIso })
        .eq("id", p.id)
        .eq("status", "test_assessed");
    }
    referencesRequested++;
    actions.push({ id: p.id, name: p.full_name, action: hasRefRequest ? "repair_references_requested" : "request_references" });
  }

  // ── Phase C2: DURABLE EVIDENCE SWEEP (references). Phase C above only catches
  // status='test_assessed'. Many applicants pass competence while parked in
  // staff_review / prescreened / etc. and are NEVER asked for references, so
  // they never reach the Ready-for-Approval queue (assessment + >=1 reference).
  // This sweeps EVERY assessment-passed applicant with no reference request
  // (source view cvp_pipeline_needs_reference_request), CLINICAL-FIRST, throttled
  // by `limit` (drains the backlog over a few cron cycles, no rate-limit blast).
  // Gated behind the auto_evidence_sweep toggle (fail-closed) for safe rollout.
  let evidenceSweepRequested = 0;
  {
    let sweepOn = false;
    try {
      const { data: cfg } = await supabase
        .from("cvp_system_config")
        .select("value")
        .eq("key", "auto_evidence_sweep")
        .maybeSingle();
      sweepOn = (cfg?.value as any)?.enabled === true;
    } catch {
      sweepOn = false; // fail-closed
    }

    if (sweepOn) {
      const { data: needRefs } = await supabase
        .from("cvp_pipeline_needs_reference_request")
        .select("application_id, is_clinical")
        .order("is_clinical", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(limit);
      for (const p of (needRefs ?? []) as any[]) {
        if (!dryRun) {
          const resp = await fetch(`${supabaseUrl}/functions/v1/cvp-request-references`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({ applicationId: p.application_id, internalAuto: true, actingStaffId: SYSTEM_STAFF_ID }),
          });
          const out = await resp.json().catch(() => ({}));
          if (!resp.ok || out?.success === false) {
            skipped++;
            actions.push({ id: p.application_id, action: "evidence_sweep_ref_failed", detail: out?.error ?? `http ${resp.status}` });
            continue;
          }
          // Reflect the new wait-state; never clobber a terminal status.
          await supabase
            .from("cvp_applications")
            .update({ status: "references_requested", updated_at: nowIso })
            .eq("id", p.application_id)
            .not("status", "in", "(approved,rejected,archived,waitlisted)");
        }
        evidenceSweepRequested++;
        actions.push({ id: p.application_id, action: "evidence_sweep_request_references", clinical: p.is_clinical });
      }
    }
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

  // ── Phase E: agency applicants don't take a test/quiz. Hard-junk → reject;
  // legitimate agencies advance to references_requested → the single final
  // approval gate (credential/reference-assessed, not tested).
  let agenciesAdvanced = 0;
  const { data: agencies } = await supabase
    .from("cvp_applications")
    .select("id, full_name, email")
    .eq("role_type", "agency")
    .in("status", ["staff_review", "prescreened"])
    .is("instrument_choice", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  for (const ag of (agencies ?? []) as any[]) {
    const junk = isHardJunk(ag.full_name, ag.email);
    if (junk) {
      if (!dryRun) {
        await supabase.from("cvp_applications")
          .update({ status: "rejected", staff_reviewed_by: SYSTEM_STAFF_ID, staff_reviewed_at: nowIso, staff_review_notes: `[auto] Hard-junk auto-reject: ${junk}.`, updated_at: nowIso })
          .eq("id", ag.id).in("status", ["staff_review", "prescreened"]);
      }
      rejected++;
      actions.push({ id: ag.id, name: ag.full_name, action: "reject", reason: junk });
      continue;
    }
    if (!dryRun) {
      const resp = await fetch(`${supabaseUrl}/functions/v1/cvp-request-references`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ applicationId: ag.id, internalAuto: true, actingStaffId: SYSTEM_STAFF_ID }),
      });
      const out = await resp.json().catch(() => ({}));
      if (!resp.ok || out?.success === false) {
        skipped++; actions.push({ id: ag.id, name: ag.full_name, action: "agency_advance_failed", detail: out?.error ?? `http ${resp.status}` }); continue;
      }
      await supabase.from("cvp_applications").update({ status: "references_requested", updated_at: nowIso }).eq("id", ag.id).in("status", ["staff_review", "prescreened"]);
    }
    agenciesAdvanced++;
    actions.push({ id: ag.id, name: ag.full_name, action: "agency_to_references" });
  }

  // ── Phase F: applicants who already chose an instrument but are still flagged
  // staff_review are mid-assessment (waiting on them), not needing review. Move
  // to test_in_progress so nothing sits in the human queue. Runs after Phase D,
  // so genuine borderline apps (already moved to test_in_progress there) are
  // unaffected; this only catches the "chose, not yet graded" stragglers.
  let unparked = 0;
  if (!dryRun) {
    const { data: midRows } = await supabase
      .from("cvp_applications")
      .update({ status: "test_in_progress", updated_at: nowIso })
      .eq("status", "staff_review")
      .not("instrument_choice", "is", null)
      .select("id");
    unparked = (midRows ?? []).length;
  }

  // ── Phase G: CD & Clinician Review Consultants take NO test/quiz/human review.
  // Auto-approve each to a PARKED vendor record (vendors.status='applicant' — a
  // captured pool that does NOT surface in active assignment) and mark the
  // application approved. No QMS bridge, no welcome email — passive pool for
  // later outreach.
  let consultantsParked = 0;
  const { data: consultants } = await supabase
    .from("cvp_applications")
    .select("id, full_name, email, phone, country, city")
    .eq("role_type", "cd_clinician_consultant")
    .in("status", ["submitted", "prescreened", "staff_review", "info_requested"])
    .order("created_at", { ascending: true })
    .limit(limit);
  for (const c of (consultants ?? []) as any[]) {
    if (dryRun) { consultantsParked++; actions.push({ id: c.id, name: c.full_name, action: "consultant_park (dry)" }); continue; }
    let vendorId: string | null = null;
    if (c.email) {
      const { data: ev } = await supabase.from("vendors").select("id").ilike("email", c.email).maybeSingle();
      vendorId = (ev as any)?.id ?? null;
    }
    if (!vendorId) {
      const { data: nv, error: vErr } = await supabase.from("vendors").insert({
        full_name: c.full_name, email: c.email, additional_emails: [], phone: c.phone ?? null,
        country: c.country ?? null, city: c.city ?? null, vendor_type: "cd_clinician_consultant",
        rate_currency: "CAD", preferred_rate_currency: "CAD", certifications: [], years_experience: null,
        status: "applicant", availability_status: "available", total_projects: 0,
      }).select("id").single();
      if (vErr) { skipped++; actions.push({ id: c.id, name: c.full_name, action: "consultant_park_failed", detail: vErr.message }); continue; }
      vendorId = (nv as any)?.id ?? null;
    }
    await supabase.from("cvp_applications").update({
      status: "approved", staff_reviewed_by: SYSTEM_STAFF_ID, staff_reviewed_at: nowIso,
      staff_review_notes: "[auto] CD & Clinician Review Consultant — parked vendor (no assessment; passive pool for later outreach).",
      updated_at: nowIso,
    }).eq("id", c.id);
    consultantsParked++;
    actions.push({ id: c.id, name: c.full_name, action: "consultant_parked", vendor_id: vendorId });
  }

  return json({
    success: true,
    data: { dry_run: dryRun, considered: candidates.length, advanced, rejected, referencesRequested, evidenceSweepRequested, quizOffered, agenciesAdvanced, unparked, consultantsParked, skipped, actions },
  });
});
