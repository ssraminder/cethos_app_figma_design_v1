// =============================================================================
// vendor-iso17100-assess v1
// Runs an LLM assessment of a vendor against ISO 17100:2015 §6.1.2 translator
// competence + qualifications criteria. Stores the result in
// vendor_iso17100_assessments and returns it. Re-runnable; each run is its
// own row so admins can see history and (Phase C) feed corrections back.
//
// POST /functions/v1/vendor-iso17100-assess
// Body: { vendor_id: uuid, staff_id?: uuid, model?: string }
// =============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PROMPT_VERSION = "v1-2026-05-12";

const SYSTEM_PROMPT = `You are an ISO 17100:2015 lead assessor evaluating a translator vendor against the §6.1.2 professional competences and §6.1.4 qualifications evidence. You return a strict JSON verdict per the schema below.

ISO 17100 §6.1.2 Translator competences (all must be demonstrated):
  - translation_competence:        ability to translate while maintaining content and register, addressing linguistic and textual issues, and to justify results.
  - linguistic_textual_competence: ability to understand the source language and produce target language at native-speaker level; mastery of text-type conventions for source and target.
  - research_competence:           ability to efficiently acquire the additional linguistic and specialised knowledge needed; experience with research tools and reference materials; awareness of which sources to trust.
  - cultural_competence:           ability to make use of locale-specific behavioural standards, value systems, and information.
  - technical_competence:          knowledge, ability, and skill to use the technical resources to perform translation (CAT tools, file formats, terminology databases, project workflow).
  - domain_competence:             ability to understand source-language content and reproduce it in target language using appropriate style and terminology of the requested specialisation.

ISO 17100 §6.1.4 Qualifications evidence — at least ONE of:
  (a) a recognised graduate qualification in translation from an institution of higher education;
  (b) a recognised graduate qualification in any other field from an institution of higher education plus the equivalent of two years of full-time professional experience in translating;
  (c) the equivalent of five years of full-time professional experience in translating.

For each criterion you must judge:
  - verdict: "pass" | "partial" | "fail" | "insufficient_evidence"
  - evidence: [list of short strings citing the actual data fields that informed the verdict]
  - reasoning: 1-2 sentence explanation

Overall verdict is "pass" only if qualifications are pass AND no competence is "fail" (partial is OK for ramp-up). Overall is "insufficient_evidence" if too many criteria are evidence-poor. Otherwise "partial" or "fail".

You MUST output ONLY valid JSON, no commentary, matching exactly:
{
  "overall": "pass" | "fail" | "partial" | "insufficient_evidence",
  "overall_reasoning": "string (3-5 sentences)",
  "criteria": {
    "qualifications":                { "verdict": "...", "evidence": [...], "reasoning": "..." },
    "translation_competence":        { "verdict": "...", "evidence": [...], "reasoning": "..." },
    "linguistic_textual_competence": { "verdict": "...", "evidence": [...], "reasoning": "..." },
    "research_competence":           { "verdict": "...", "evidence": [...], "reasoning": "..." },
    "cultural_competence":           { "verdict": "...", "evidence": [...], "reasoning": "..." },
    "technical_competence":          { "verdict": "...", "evidence": [...], "reasoning": "..." },
    "domain_competence":             { "verdict": "...", "evidence": [...], "reasoning": "..." }
  }
}

When the snapshot includes "competence_quizzes_passed", each entry is a vendor-completed MCQ quiz that scored at or above the threshold (default 80%) for the named competence. Treat a passed quiz as STRONG primary evidence for that competence: at least "partial", lean "pass" without contradicting signal. Cite the score in evidence, e.g. "competence quiz: cultural_competence passed at 87.5%".

When the snapshot includes a "reference_competence_aggregate", it is anchored-MCQ data from professional references — primary evidence. Use the aggregation:
 - 2+ references at level (a) or (b) on a competence → strong evidence; verdict should be at least "partial", lean "pass" when no contradicting signal.
 - Any reference at (d) → negative signal; verdict at most "partial", "fail" if multiple refs are at (d).
 - All references at (e) → no signal from references; fall back to other evidence.
 - Cite the aggregated count in the evidence array, e.g. "reference MCQ: 2 of 2 rated translation_competence at (a) or (b)".

The snapshot includes "qms_record" — the FORMAL, authoritative QMS qualification state (this is what an ISO auditor relies on). Treat it as primary:
 - A role_qualification with status="qualified" backed by at least one evidence item with tier="verified" means the TSP has formally qualified this translator against documented, staff-verified evidence → §6.1.4 qualifications verdict should be "pass" (cite the basis + verified evidence type, e.g. "QMS: Translator qualified on verified degree_translation").
 - Verified evidence (tier="verified": degrees, references_verified, documented_translation_experience via first-party records) is authoritative primary evidence for the relevant competence/qualification. Cite it.
 - tier="screened" evidence is supporting but NOT sufficient alone for a "pass" — it lends "partial".
 - subject_matter entries support domain_competence for those domains.
 - has_active_nda is contractual context, not a competence.
Prefer qms_record over raw certification file-names: an unverified file with an odd name is weak signal, but a QMS-verified credential is strong.

Be honest about gaps. "insufficient_evidence" is the correct verdict when the input doesn't support a confident judgment — do not infer competence from absence of negative signals.`;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const vendorId: string | undefined = body?.vendor_id;
    const staffId: string | null = body?.staff_id ?? null;
    if (!vendorId) return json({ success: false, error: "vendor_id is required" }, 400);

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ success: false, error: "ANTHROPIC_API_KEY not configured" }, 500);

    const model = body?.model || Deno.env.get("ISO17100_MODEL") || "claude-sonnet-4-6";

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: vendor, error: vendorErr } = await sb
      .from("vendors")
      .select("id, full_name, email, country, years_experience, specializations, certifications, native_languages, contractor_type, status")
      .eq("id", vendorId)
      .maybeSingle();
    if (vendorErr || !vendor) return json({ success: false, error: "Vendor not found" }, 404);

    const { data: apps } = await sb
      .from("cvp_applications")
      .select("id, application_number, full_name, cv_storage_path, education_level, years_experience, certifications, cat_tools, specializations, domains_offered, linkedin_url, status, ai_prescreening_result, notes")
      .ilike("email", vendor.email)
      .order("created_at", { ascending: false })
      .limit(1);
    const application = apps?.[0] ?? null;

    let referenceRows: Array<Record<string, unknown>> = [];
    if (application) {
      const { data: r } = await sb
        .from("cvp_application_references")
        .select("id, reference_name, reference_company, reference_relationship, feedback_text, feedback_rating, feedback_received_at, declined_at, ai_analysis, competence_responses")
        .eq("application_id", application.id)
        .order("created_at", { ascending: false });
      referenceRows = r ?? [];
    }

    // Phase 5a — also pull vendor-side references (post-onboarding asks).
    // The MCQ structure is identical, so we merge into the same array.
    const { data: vendorRefRows } = await sb
      .from("vendor_references")
      .select("id, reference_name, reference_company, reference_relationship, feedback_text, feedback_rating, feedback_received_at, declined_at, ai_analysis, competence_responses")
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false });
    if (vendorRefRows && vendorRefRows.length > 0) {
      referenceRows = [...referenceRows, ...vendorRefRows];
    }

    // Phase 5b Slice 1 — pull the most-recent PASSED quiz submission per
    // competence so the assessment can use the score as primary evidence.
    // Failed attempts are visible in the table but not surfaced here
    // (they'd be noise in the snapshot).
    const { data: quizRows } = await sb
      .from("iso_competence_quiz_submissions")
      .select("competence_slug, domain, score_pct, threshold_pct, submitted_at, attempt_number")
      .eq("vendor_id", vendorId)
      .eq("passed", true)
      .order("submitted_at", { ascending: false });
    const latestPassedQuizzes: Record<string, Record<string, unknown>> = {};
    for (const r of quizRows ?? []) {
      const key = r.domain ? `${r.competence_slug}::${r.domain}` : r.competence_slug;
      if (!latestPassedQuizzes[key]) {
        latestPassedQuizzes[key] = {
          competence_slug: r.competence_slug,
          domain: r.domain,
          score_pct: r.score_pct,
          threshold_pct: r.threshold_pct,
          submitted_at: r.submitted_at,
          attempt_number: r.attempt_number,
        };
      }
    }

    const { data: pairs } = await sb
      .from("vendor_language_pairs")
      .select("source_language, target_language, is_active")
      .eq("vendor_id", vendorId);

    const { data: rates } = await sb
      .from("vendor_rates")
      .select("service_id, rate, currency, calculation_unit")
      .eq("vendor_id", vendorId)
      .eq("is_active", true);

    // Formal QMS record — the authoritative qualification state (role
    // qualifications + verified competence evidence + NDA). This is what an
    // ISO auditor actually relies on; the assessment should reflect it, not
    // just raw profile/cert file-names.
    const { data: qmsData } = await sb.rpc("qms_list_vendor_qualifications", { p_vendor_id: vendorId });
    const qmsRecord = (qmsData ?? {}) as {
      qualifications?: Array<Record<string, unknown>>;
      ndas?: Array<Record<string, unknown>>;
    };
    const qmsSummary = {
      role_qualifications: (qmsRecord.qualifications ?? []).map((q) => ({
        role: (q.role_type as { name?: string } | null)?.name ?? null,
        status: q.status,
        basis: (q.competence_basis as { short_label?: string } | null)?.short_label ?? null,
        subject_matter: (q.subject_matter_qualifications as Array<{ subject_matter?: { name?: string } }> | null ?? [])
          .map((s) => s.subject_matter?.name).filter(Boolean),
        evidence: (q.evidence as Array<{ evidence_type?: string; tier?: string; verification_method?: string }> | null ?? [])
          .map((e) => ({ type: e.evidence_type, tier: e.tier, method: e.verification_method })),
      })),
      has_active_nda: (qmsRecord.ndas ?? []).some((n) => n.status === "active"),
    };

    const snapshot = {
      qms_record: qmsSummary,
      vendor: {
        full_name: vendor.full_name,
        email: vendor.email,
        country: vendor.country,
        years_experience: vendor.years_experience,
        specializations: vendor.specializations,
        certifications: vendor.certifications,
        native_languages: vendor.native_languages,
        contractor_type: vendor.contractor_type,
        status: vendor.status,
      },
      application: application
        ? {
            application_number: application.application_number,
            education_level: application.education_level,
            years_experience: application.years_experience,
            certifications: application.certifications,
            cat_tools: application.cat_tools,
            specializations: application.specializations,
            domains_offered: application.domains_offered,
            linkedin_url: application.linkedin_url,
            status: application.status,
            has_cv: !!application.cv_storage_path,
            ai_prescreening_result: application.ai_prescreening_result,
            notes: application.notes,
          }
        : null,
      references: referenceRows.map((r) => ({
        name: r.reference_name,
        company: r.reference_company,
        relationship: r.reference_relationship,
        feedback_text: r.feedback_text,
        feedback_rating: r.feedback_rating,
        feedback_received: !!r.feedback_received_at,
        declined: !!r.declined_at,
        ai_analysis: r.ai_analysis,
        competence_responses: r.competence_responses,
      })),
      // Per-competence MCQ aggregate across all received references.
      // Deterministic counts so the LLM doesn't have to do the math
      // (and the audit trail shows the exact aggregation). a/b = pass
      // signal, c = partial, d = fail signal, e = no signal.
      reference_competence_aggregate: aggregateReferenceCompetence(referenceRows),
      // Phase 5b Slice 1 — passed competence quiz scores per slug.
      // Treat as primary evidence: a quiz passed at the threshold is
      // a strong pass signal for that §6.1.2 competence.
      competence_quizzes_passed: Object.values(latestPassedQuizzes),
      language_pairs: (pairs ?? []).map((p) => ({
        source: p.source_language,
        target: p.target_language,
        active: p.is_active,
      })),
      rates_configured: (rates?.length ?? 0) > 0,
      rates_count: rates?.length ?? 0,
    };

    const userMessage = `Assess the following translator vendor against ISO 17100 §6.1.2 and §6.1.4. Return only the JSON.

VENDOR EVIDENCE:
${JSON.stringify(snapshot, null, 2)}`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2400,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      return json(
        { success: false, error: `LLM call failed`, detail: `${claudeRes.status}: ${errText.slice(0, 400)}` },
        502,
      );
    }
    const claudeData = await claudeRes.json();
    const rawText: string = (claudeData?.content?.[0]?.text ?? "").trim();
    if (!rawText) return json({ success: false, error: "LLM returned empty content" }, 502);

    let parsed: Record<string, unknown> | null = null;
    try {
      const cleaned = rawText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return json(
        { success: false, error: "LLM output was not valid JSON", detail: rawText.slice(0, 400) },
        502,
      );
    }

    const overall = String((parsed as { overall?: string } | null)?.overall ?? "");
    const validOverall = ["pass", "fail", "partial", "insufficient_evidence"].includes(overall) ? overall : null;

    const { data: inserted, error: insertErr } = await sb
      .from("vendor_iso17100_assessments")
      .insert({
        vendor_id: vendorId,
        model,
        prompt_version: PROMPT_VERSION,
        input_snapshot: snapshot,
        result: parsed,
        overall_verdict: validOverall,
        created_by: staffId,
      })
      .select("id, created_at")
      .single();

    if (insertErr) {
      return json(
        { success: false, error: "Failed to record assessment", detail: insertErr.message },
        500,
      );
    }

    // Surface received references on the QMS tab as competence evidence.
    // No staff actor here → recorded Tier-1 (screened), pending a human
    // Verify on the QMS tab. Fire-and-forget; never blocks the assessment.
    try {
      await sb.rpc("qms_ingest_vendor_references", { p_vendor_id: vendorId, p_acting_user_id: null });
    } catch (e) {
      console.error("qms_ingest_vendor_references failed:", e);
    }

    // Phase 3 — auto-create a *draft* doc-request when the verdict is
    // insufficient_evidence and no open request already exists. Admin
    // sees a banner on the Documents tab; one click to send.
    let autoDraftId: string | null = null;
    if (validOverall === "insufficient_evidence") {
      const { data: existing } = await sb
        .from("vendor_document_requests")
        .select("id, status")
        .eq("vendor_id", vendorId)
        .in("status", ["draft", "sent", "partial"])
        .limit(1)
        .maybeSingle();

      if (!existing) {
        let items = pickDraftItems(snapshot.vendor, snapshot.application !== null);
        // C — don't re-request what the vendor already resolved (uploaded or
        // declined-with-reason) on their most recent request.
        const { data: lastReq } = await sb
          .from("vendor_document_requests")
          .select("requested_items")
          .eq("vendor_id", vendorId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const resolvedSlugs = new Set(
          ((lastReq?.requested_items as Array<Record<string, unknown>>) ?? [])
            .filter((it) => it.completed_at || it.declined_at)
            .map((it) => String(it.slug)),
        );
        items = items.filter((it) => !resolvedSlugs.has(it.slug));
        if (items.length > 0) {
          const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
          const itemsForStorage = items.map((it) => ({
            slug: it.slug,
            label: it.label,
            kind: it.kind,
            profile_column: it.profile_column ?? null,
            rationale: it.rationale,
            completed_at: null,
          }));
          const { data: draft, error: draftErr } = await sb
            .from("vendor_document_requests")
            .insert({
              vendor_id: vendorId,
              request_token_expires_at: expiresAt,
              staff_id: null,
              staff_message: null,
              subject: null,
              body_html: null,
              requested_items: itemsForStorage,
              source_assessment_id: inserted!.id,
              status: "draft",
            })
            .select("id")
            .maybeSingle();
          if (!draftErr && draft) autoDraftId = draft.id;
        }
      }
    }

    return json({
      success: true,
      assessment_id: inserted!.id,
      created_at: inserted!.created_at,
      overall_verdict: validOverall,
      model,
      prompt_version: PROMPT_VERSION,
      result: parsed,
      input_snapshot: snapshot,
      auto_draft_id: autoDraftId,
    });
  } catch (err) {
    console.error("vendor-iso17100-assess error:", err);
    return json({ success: false, error: (err as Error).message || "Internal error" }, 500);
  }
});

// Smart pre-selection: build a draft request from the same vendor
// snapshot Claude saw. Same shape as client/lib/iso17100.ts.
interface DraftItem {
  slug: string;
  label: string;
  rationale: string;
  kind: "file" | "profile_field";
  profile_column?: string;
}

// Phase 5a — deterministic aggregate of reference MCQ answers per
// §6.1.2 competence. Used both as input to Claude and as audit-grade
// evidence the assessment row can be traced back to.
function aggregateReferenceCompetence(refs: Array<Record<string, unknown>>) {
  const competences = [
    "translation_competence",
    "linguistic_textual_competence",
    "research_competence",
    "cultural_competence",
    "technical_competence",
    "domain_competence",
  ];
  const result: Record<string, { a: number; b: number; c: number; d: number; e: number; total: number }> = {};
  for (const c of competences) result[c] = { a: 0, b: 0, c: 0, d: 0, e: 0, total: 0 };

  let receivedCount = 0;
  for (const r of refs) {
    if (!r.feedback_received_at) continue;
    receivedCount++;
    const cr = r.competence_responses as Record<string, string> | null;
    if (!cr) continue;
    for (const c of competences) {
      const v = cr[c];
      if (v === "a" || v === "b" || v === "c" || v === "d" || v === "e") {
        result[c][v]++;
        result[c].total++;
      }
    }
  }

  return {
    received_count: receivedCount,
    per_competence: result,
    // Roll-up: per competence, "pass_signals" = a+b count, "fail_signals" = d count.
    summary: Object.fromEntries(
      competences.map((c) => [
        c,
        {
          pass_signals: result[c].a + result[c].b,
          partial_signals: result[c].c,
          fail_signals: result[c].d,
          no_signal: result[c].e,
        },
      ]),
    ),
  };
}

function pickDraftItems(
  vendor: { native_languages?: unknown; years_experience?: unknown; specializations?: unknown; certifications?: unknown },
  hasApplication: boolean,
): DraftItem[] {
  const items: DraftItem[] = [];
  const arr = (v: unknown) => (Array.isArray(v) ? (v as unknown[]) : []);

  if (arr(vendor.native_languages).length === 0) {
    items.push({ slug: "profile_native_languages", label: "Native language(s) declaration", rationale: "ISO 17100 § 6.1.2 — target-language production at native level", kind: "profile_field", profile_column: "native_languages" });
  }
  if (vendor.years_experience == null) {
    items.push({ slug: "profile_years_experience", label: "Total years of professional translation experience", rationale: "Feeds the §6.1.4 qualifications route assessment", kind: "profile_field", profile_column: "years_experience" });
  }
  if (arr(vendor.specializations).length === 0) {
    items.push({ slug: "profile_specializations", label: "Subject specializations / domains", rationale: "ISO 17100 § 6.1.6 — vendor must declare the domains they work in", kind: "profile_field", profile_column: "specializations" });
  }
  if (arr(vendor.certifications).length === 0) {
    items.push({ slug: "professional_translation_cert", label: "Professional translation certificate (ATA / CTTIC / ITI / NAATI / etc.)", rationale: "Strengthens competence file", kind: "file" });
  }
  if (!hasApplication) {
    // No recruitment record on file — ask for the qualifying-route docs
    // so the admin has at least one §6.1.4 route they can validate.
    items.push(
      { slug: "degree_translation_studies", label: "Translation / linguistics degree", rationale: "ISO 17100 § 3.1.4 route (a)", kind: "file" },
      { slug: "degree_other_field", label: "Other-field degree (paired with 2y experience)", rationale: "ISO 17100 § 3.1.4 route (b)", kind: "file" },
      { slug: "experience_evidence_5y", label: "Evidence of 5 years professional translation experience", rationale: "ISO 17100 § 3.1.4 route (c)", kind: "file" },
      { slug: "language_proficiency", label: "Language proficiency proof (C2 / native attestation)", rationale: "Target-language competence evidence", kind: "file" },
    );
  }
  return items;
}
