// Approve a CVP application → create vendor + cvp_translator rows, issue a
// password-setup token, and send the V11 welcome email.
//
// Invoked by the CETHOS portal's RecruitmentDetail page via POST with body
// { applicationId, combinationIds? (optional; defaults to all pending) }.
// Auth: requires Authorization: Bearer <staff JWT>; staffId derived from
// auth context via `_shared/require-staff.ts`.
//
// Idempotent: re-calling on an already-approved application is a no-op.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendMailgunEmail } from "../_shared/mailgun.ts";
import { buildV11ApprovedWelcome } from "../_shared/email-templates.ts";
import {
  claudeRewrite,
  logDecision,
  APPROVE_NOTE_SYSTEM_PROMPT,
} from "../_shared/decision-ai.ts";
import { requireStaff } from "../_shared/require-staff.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface ApprovePayload {
  applicationId: string;
  combinationIds?: string[];
  /**
   * Per-combination rationale captured from the admin's domain-pick step.
   * Keyed by cvp_test_combinations.id. Required for any combination whose
   * status is not 'approved' or 'skip_manual_review' (i.e. staff is
   * overriding the normal validation gate). Persisted to the decision
   * audit log; not shown to the applicant.
   */
  combinationRationales?: Record<string, string>;
  /** Optional staff notes — captured + AI-rephrased for inclusion in V11. */
  staffNotes?: string;
  /**
   * Skip-testing onboarding (ISO 17100 §3.1.4). When true, approval does NOT
   * require a passed/validated test combination: ALL of the applicant's
   * declared combinations are approved on an experience/qualification basis.
   * `qualificationBasis` is then REQUIRED — onboarding without a recorded
   * §3.1.4 basis would leave the §3.1.1 evidence record empty (audit gap).
   */
  skipTesting?: boolean;
  /** One of the three ISO 17100 §3.1.4 routes. Required when skipTesting. */
  qualificationBasis?: "degree_translation" | "degree_other_plus_2y" | "experience_5y";
  /** Preview-only: runs AI + renders V11 with placeholder setup link. No
   *  vendor/translator row creation, no DB mutations, no email send. */
  dryRun?: boolean;
  /** Staff-edited welcome line (replaces AI output when sending). */
  editedWelcomeMessage?: string;
  /** Staff-edited subject line (replaces template default when sending). */
  editedSubject?: string;
  /** Trusted internal auto-approval (recruitment §3.1.4 scorer). Only honoured
   *  when the caller presents the service-role key — external callers can't.
   *  `actingStaffId` is the accountable human who enabled auto-approval. */
  internalAuto?: boolean;
  actingStaffId?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  try {

  const supabaseUrlEnv = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKeyEnv = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^bearer\s+/i, "").trim();

  // Auth: normal staff sessions go through requireStaff. A trusted internal
  // call (the auto-approve scorer, server-side) presents the service-role key
  // + internalAuto + an actingStaffId we verify is an active staff row.
  let staffId: string;
  {
    const peek = await req.clone().json().catch(() => ({} as Record<string, unknown>));
    const isInternalAuto = peek?.internalAuto === true && bearer && bearer === serviceKeyEnv;
    if (isInternalAuto) {
      const acting = String(peek?.actingStaffId ?? "");
      const probe = createClient(supabaseUrlEnv, serviceKeyEnv, { auth: { persistSession: false } });
      const { data: srow } = await probe.from("staff_users").select("id, is_active").eq("id", acting).maybeSingle();
      if (!srow || !srow.is_active) return json({ success: false, error: "invalid_acting_staff" }, 400);
      staffId = srow.id;
    } else {
      const authed = await requireStaff(req);
      if (!authed.ok) return json({ success: false, error: authed.error }, authed.status);
      staffId = authed.staff.staffId;
    }
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  let body: ApprovePayload;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "invalid_json" }, 400);
  }

  if (!body.applicationId) return json({ success: false, error: "applicationId_required" }, 400);

  const { data: app, error: appErr } = await supabase
    .from("cvp_applications")
    .select("*")
    .eq("id", body.applicationId)
    .single();
  if (appErr || !app) return json({ success: false, error: "application_not_found" }, 404);

  if (app.status === "approved" && app.translator_id) {
    return json({
      success: true,
      idempotent: true,
      data: { applicationId: app.id, translatorId: app.translator_id },
    });
  }

  // Audit-safe skip: onboarding without a test still needs a recorded §3.1.4
  // basis, so the §3.1.1 evidence record is never empty.
  if (body.skipTesting && !body.qualificationBasis) {
    return json({ success: false, error: "qualification_basis_required" }, 400);
  }

  // Include `status` so we can distinguish combos that passed a test
  // (pending/assessed/approved) from certified skip-review combos. The
  // distinction is written to cvp_translator_domains.approval_source.
  //
  // Selection rules:
  //   - When combinationIds is passed (the admin's domain-pick step), use
  //     exactly that subset. The UI is responsible for enforcing rationale.
  //   - When combinationIds is absent (legacy callers — e.g. the
  //     "skip testing → approve based on experience" flow which auto-
  //     promotes certified combos), default to combos already in a
  //     validated state. Pulling EVERY combo by default silently approved
  //     pending domains the applicant chose but never validated.
  const comboQuery = supabase
    .from("cvp_test_combinations")
    .select("id, source_language_id, target_language_id, domain, service_type, approved_rate, status, test_submission_id")
    .eq("application_id", body.applicationId);

  //   - When skipTesting is set (experience/degree onboarding), approve ALL
  //     of the applicant's declared combinations regardless of test status —
  //     this is the "no test required" path; the §3.1.4 basis is recorded
  //     separately on the application.
  const { data: combos, error: comboErr } = body.combinationIds && body.combinationIds.length > 0
    ? await comboQuery.in("id", body.combinationIds)
    : body.skipTesting
      ? await comboQuery
      : await comboQuery.in("status", ["approved", "skip_manual_review"]);
  if (comboErr) return json({ success: false, error: "combination_lookup_failed", detail: comboErr.message }, 500);

  // Validate: every requested ID belongs to this application. Foreign IDs
  // would silently drop from PostgREST's .in() filter, which would
  // under-approve without surfacing a clear error — better to fail loudly.
  if (body.combinationIds && body.combinationIds.length > 0) {
    const returnedIds = new Set((combos ?? []).map((c) => c.id));
    const missing = body.combinationIds.filter((id) => !returnedIds.has(id));
    if (missing.length > 0) {
      return json(
        {
          success: false,
          error: "combination_ids_not_on_application",
          detail: { missing },
        },
        400,
      );
    }
  }

  const approveIds = (combos ?? []).map((c) => c.id);

  // Per-combination rationale captured from the admin's domain-pick step.
  // Formatter is defined below after langMap + domainLabel are built.
  const rationaleMap = body.combinationRationales ?? {};

  // ---- Resolve language names once for the V11 email body (and future
  // logging). We fetch all distinct language IDs referenced by this app's
  // approved combos; the map is reused for the cvp_translator_domains
  // insert and the approvedCombinationsListHtml below.
  const langIds = Array.from(
    new Set(
      (combos ?? []).flatMap((c) => [c.source_language_id, c.target_language_id]),
    ),
  );
  const langMap = new Map<string, string>();
  if (langIds.length > 0) {
    const { data: langs } = await supabase
      .from("languages")
      .select("id, name")
      .in("id", langIds);
    for (const l of (langs ?? []) as { id: string; name: string }[]) {
      langMap.set(l.id, l.name);
    }
  }
  const pairLabel = (srcId: string, tgtId: string) =>
    `${langMap.get(srcId) ?? "?"} → ${langMap.get(tgtId) ?? "?"}`;

  // Human-readable domain labels for the applicant-facing welcome email.
  // Kept minimal — staff see the raw keys in admin; applicants see these.
  const DOMAIN_LABELS: Record<string, string> = {
    legal: "Legal",
    certified_official: "Certified / Official Documents",
    immigration: "Immigration",
    medical: "Medical",
    life_sciences: "Life Sciences",
    pharmaceutical: "Pharmaceutical",
    financial: "Financial",
    insurance: "Insurance",
    technical: "Technical",
    it_software: "IT & Software",
    automotive_engineering: "Automotive & Engineering",
    energy: "Energy",
    marketing_advertising: "Marketing & Advertising",
    literary_publishing: "Literary & Publishing",
    academic_scientific: "Academic & Scientific",
    government_public: "Government & Public Sector",
    business_corporate: "Business & Corporate",
    gaming_entertainment: "Gaming & Entertainment",
    media_journalism: "Media & Journalism",
    tourism_hospitality: "Tourism & Hospitality",
    general: "General",
    other: "Other",
  };
  const domainLabel = (d: string) => DOMAIN_LABELS[d] ?? d;

  // Per-combination rationale block — used for the audit log only. The
  // welcome email lists only the domains; reasons stay internal.
  const formatRationaleBlock = (): string | null => {
    if (!combos || combos.length === 0) return null;
    const lines = combos.map((c) => {
      const r = (rationaleMap[c.id] ?? "").trim();
      return `- ${domainLabel(c.domain)} — ${langMap.get(c.source_language_id) ?? "?"} → ${langMap.get(c.target_language_id) ?? "?"}: ${r || "(no rationale recorded)"}`;
    });
    return `[Domain approvals]\n${lines.join("\n")}`;
  };

  // ---- Preview mode: render V11 without any DB mutations or email send ----
  if (body.dryRun === true) {
    const staffNotesPreview = (body.staffNotes ?? "").trim();
    let aiPreviewOutput: string | null = null;
    let aiPreviewError: string | null = null;
    if (staffNotesPreview.length >= 5) {
      const ai = await claudeRewrite({
        systemPrompt: APPROVE_NOTE_SYSTEM_PROMPT,
        userMessage: `Applicant: ${app.full_name}\nApplication: ${app.application_number}\n\nStaff notes (internal):\n${staffNotesPreview}`,
        maxTokens: 250,
      });
      aiPreviewOutput = ai.ok ? ai.text : null;
      aiPreviewError = ai.ok ? null : ai.error;
    }
    const editedWelcomeMessagePreview = (body.editedWelcomeMessage ?? "").trim();
    const staffMessagePreview = editedWelcomeMessagePreview ||
      (aiPreviewOutput && aiPreviewOutput.trim().length > 0 ? aiPreviewOutput : null);

    const vendorPortalUrlPreview = Deno.env.get("VENDOR_PORTAL_URL") ?? "https://vendor.cethos.com";
    const approvedCombinationsListHtmlPreview = approveIds.length > 0
      ? `<ul>${(combos ?? [])
          .map((c) => `<li>${domainLabel(c.domain)} — ${pairLabel(c.source_language_id, c.target_language_id)}</li>`)
          .join("")}</ul>`
      : `<p><em>No combinations yet — staff has not approved any.</em></p>`;
    const tplPreview = buildV11ApprovedWelcome({
      fullName: app.full_name,
      applicationNumber: app.application_number,
      vendorPortalUrl: vendorPortalUrlPreview,
      passwordSetupLink: `${vendorPortalUrlPreview}/setup-password?token=__PREVIEW_TOKEN__`,
      passwordSetupExpiryHours: 72,
      approvedCombinationsList: approvedCombinationsListHtmlPreview,
      staffMessage: staffMessagePreview,
    });
    const subjectPreview = (body.editedSubject ?? "").trim() || tplPreview.subject;
    return json({
      success: true,
      data: {
        dryRun: true,
        aiOutput: aiPreviewOutput,
        aiError: aiPreviewError,
        subject: subjectPreview,
        html: tplPreview.html,
        text: tplPreview.text,
        combinationCount: approveIds.length,
      },
    });
  }

  const isAgencyApp = app.applicant_type === "agency" || app.role_type === "agency";

  // Agency applications never have test combinations at the agency level
  // (per-linguist qualifications live on the blinded roster). The "no
  // combinations" gate only applies to individual paths.
  if (!isAgencyApp && approveIds.length === 0) {
    return json({ success: false, error: "no_combinations_to_approve" }, 400);
  }

  // ISO 17100 §3.1.4 evidence gate — applies to EVERY approval path (auto or
  // HITL): experience-based bases (b: degree + 2y, c: 5y) require DOCUMENTED
  // experience, never a self-declared number. References that confirm the
  // start year are the documentary evidence. Without enough confirmed years
  // the approval is refused and the application stays pending until references
  // (or proof) arrive. §3.1.4(a) translation degree is exempt — the degree is
  // itself the documented evidence. Agencies qualify per-linguist on the roster.
  if (!isAgencyApp && body.skipTesting &&
      (body.qualificationBasis === "degree_other_plus_2y" || body.qualificationBasis === "experience_5y")) {
    const requiredYears = body.qualificationBasis === "experience_5y" ? 5 : 2;
    const { data: refs } = await supabase
      .from("cvp_application_references")
      .select("reference_confirmed_start_year")
      .eq("application_id", body.applicationId)
      .eq("status", "received")
      .not("reference_confirmed_start_year", "is", null);
    const startYears = (refs ?? [])
      .map((r) => Number(r.reference_confirmed_start_year))
      .filter((y) => Number.isFinite(y));
    const confirmedYears = startYears.length ? new Date().getUTCFullYear() - Math.min(...startYears) : 0;
    if (confirmedYears < requiredYears) {
      return json({
        success: false,
        error: "experience_evidence_required",
        detail: {
          required_years: requiredYears,
          references_confirm_years: confirmedYears,
          message: `ISO 17100 §3.1.4 requires documented experience, not a self-declared figure. References on file confirm ${confirmedYears} year(s); ${requiredYears} are needed. Request references (or experience-proof documents) first — the application stays pending until the evidence is on file.`,
        },
      }, 409);
    }
  }

  await supabase
    .from("cvp_test_combinations")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: staffId,
    })
    .in("id", approveIds);

  const approvedCombos = (combos ?? []).map((c) => ({
    source_language_id: c.source_language_id,
    target_language_id: c.target_language_id,
    domain: c.domain,
    service_type: c.service_type,
    approved_rate: c.approved_rate,
  }));

  let vendorId: string | null = null;
  const { data: existingVendor } = await supabase
    .from("vendors")
    .select("id")
    .eq("email", app.email)
    .maybeSingle();

  if (existingVendor?.id) {
    vendorId = existingVendor.id;
    // If we already had a vendor row (e.g. the same agency re-applied or
    // staff manually created a stub), make sure agency mirror fields and
    // the roster gate are brought up to date.
    if (isAgencyApp) {
      const agencyUpdate: Record<string, unknown> = {
        vendor_type: "agency",
        contractor_type: "business",
        business_name: app.agency_business_name ?? app.full_name ?? null,
        tax_id: app.agency_tax_id ?? null,
        agency_services_offered: app.agency_services_offered ?? null,
        agency_registration_country: app.agency_registration_country ?? null,
        agency_company_profile_path: app.agency_company_profile_path ?? null,
        agency_linguist_count: app.agency_linguist_count ?? null,
        agency_years_operating: app.agency_years_operating ?? null,
        agency_primary_contact_name: app.agency_primary_contact_name ?? null,
        agency_primary_contact_role: app.agency_primary_contact_role ?? null,
        roster_required: true,
      };
      const { error: vUpdErr } = await supabase
        .from("vendors")
        .update(agencyUpdate)
        .eq("id", vendorId);
      if (vUpdErr) {
        return json({ success: false, error: "vendor_agency_update_failed", detail: vUpdErr.message }, 500);
      }
    }
  } else if (isAgencyApp) {
    const vendorRow = {
      full_name: app.agency_business_name ?? app.full_name,
      email: app.email,
      additional_emails: [] as string[],
      phone: app.phone ?? null,
      country: app.country ?? null,
      city: app.city ?? null,
      vendor_type: "agency",
      contractor_type: "business",
      business_name: app.agency_business_name ?? app.full_name ?? null,
      tax_id: app.agency_tax_id ?? null,
      // Rate currency is not declared at the agency-application level — it is
      // negotiated later. Keep the legacy NOT-NULL columns happy with CAD.
      rate_currency: "CAD",
      preferred_rate_currency: "CAD",
      certifications: [],
      years_experience: null,
      status: "active",
      availability_status: "available",
      total_projects: 0,
      // Agency mirror columns
      agency_services_offered: app.agency_services_offered ?? null,
      agency_registration_country: app.agency_registration_country ?? null,
      agency_company_profile_path: app.agency_company_profile_path ?? null,
      agency_linguist_count: app.agency_linguist_count ?? null,
      agency_years_operating: app.agency_years_operating ?? null,
      agency_primary_contact_name: app.agency_primary_contact_name ?? null,
      agency_primary_contact_role: app.agency_primary_contact_role ?? null,
      // Roster gate: agency cannot accept jobs until roster has eligible
      // linguists (enforced in PR A5).
      roster_required: true,
    };
    const { data: newVendor, error: vErr } = await supabase
      .from("vendors")
      .insert(vendorRow)
      .select("id")
      .single();
    if (vErr || !newVendor) {
      return json({ success: false, error: "vendor_create_failed", detail: vErr?.message }, 500);
    }
    vendorId = newVendor.id;
  } else {
    const vendorRow = {
      full_name: app.full_name,
      email: app.email,
      // additional_emails is NOT NULL on vendors. The column has a default
      // (ARRAY[]::text[]) but PostgREST sends an explicit NULL for columns
      // omitted from the insert payload, which bypasses the default and
      // trips the constraint. Always pass an empty array.
      additional_emails: [] as string[],
      phone: app.phone ?? null,
      country: app.country ?? null,
      city: app.city ?? null,
      vendor_type: app.role_type,
      rate_currency: app.rate_currency ?? "CAD",
      // Seed preferred_rate_currency from the applicant's pick so the admin
      // assignment modals (which now default to vendors.preferred_rate_currency)
      // see the right currency on the very first job they hand out. Vendor
      // can change it later in their profile.
      preferred_rate_currency: app.rate_currency ?? "CAD",
      certifications: app.certifications ?? [],
      years_experience: app.years_experience ?? null,
      status: "active",
      availability_status: "available",
      total_projects: 0,
    };
    const { data: newVendor, error: vErr } = await supabase
      .from("vendors")
      .insert(vendorRow)
      .select("id")
      .single();
    if (vErr || !newVendor) {
      return json({ success: false, error: "vendor_create_failed", detail: vErr?.message }, 500);
    }
    vendorId = newVendor.id;
  }

  // Agencies don't get a cvp_translators row — that table represents the
  // *individual linguist* identity, which for agencies lives on the
  // blinded roster (PR A3). The vendor record IS the agency.
  let translatorId: string | null = null;
  if (!isAgencyApp) {
    const { data: existingTranslator } = await supabase
      .from("cvp_translators")
      .select("id")
      .eq("email", app.email)
      .maybeSingle();

    if (existingTranslator?.id) {
      translatorId = existingTranslator.id;
      await supabase
        .from("cvp_translators")
        .update({
          approved_combinations: approvedCombos,
          application_id: body.applicationId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", translatorId);
    } else {
      const trRow: Record<string, unknown> = {
        application_id: body.applicationId,
        email: app.email,
        full_name: app.full_name,
        phone: app.phone ?? null,
        country: app.country ?? null,
        linkedin_url: app.linkedin_url ?? null,
        role_type: app.role_type,
        tier: app.assigned_tier ?? "standard",
        approved_combinations: approvedCombos,
        certifications: app.certifications ?? [],
        cat_tools: app.cat_tools ?? [],
        default_rate_currency: app.rate_currency ?? "CAD",
        is_active: true,
        profile_completeness: 0,
        total_jobs_completed: 0,
        cog_instrument_types: app.cog_instrument_types ?? null,
        cog_therapy_areas: app.cog_therapy_areas ?? null,
        cog_ispor_familiarity: app.cog_ispor_familiarity ?? null,
        cog_fda_familiarity: app.cog_fda_familiarity ?? null,
      };
      const { data: newTr, error: trErr } = await supabase
        .from("cvp_translators")
        .insert(trRow)
        .select("id")
        .single();
      if (trErr || !newTr) {
        return json({ success: false, error: "translator_create_failed", detail: trErr?.message }, 500);
      }
      translatorId = newTr.id;
    }

    // Direct link from vendors back to the cvp_translators row (and through
    // it, to cvp_applications). Without this, the admin vendor profile has
    // no way to surface "the original application this vendor came from"
    // except by joining on email — fragile if the email ever changes.
    // Update is idempotent so re-approval just re-confirms the link.
    if (translatorId && vendorId) {
      const { error: vLinkErr } = await supabase
        .from("vendors")
        .update({ cvp_translator_id: translatorId })
        .eq("id", vendorId);
      if (vLinkErr) {
        // Non-fatal: the email/lower-case fallback still works.
        console.error("vendors.cvp_translator_id update failed:", vLinkErr.message);
      }
    }
  }

  const setupToken = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 72 * 3600 * 1000);

  const { data: existingAuth } = await supabase
    .from("vendor_auth")
    .select("vendor_id")
    .eq("vendor_id", vendorId)
    .maybeSingle();

  if (existingAuth) {
    await supabase
      .from("vendor_auth")
      .update({
        password_setup_token: setupToken,
        password_setup_expires_at: expiresAt.toISOString(),
        must_reset: true,
        updated_at: now.toISOString(),
      })
      .eq("vendor_id", vendorId);
  } else {
    await supabase.from("vendor_auth").insert({
      vendor_id: vendorId,
      password_setup_token: setupToken,
      password_setup_expires_at: expiresAt.toISOString(),
      must_reset: true,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });
  }

  const staffNotes = (body.staffNotes ?? "").trim();

  await supabase
    .from("cvp_applications")
    .update({
      status: "approved",
      translator_id: translatorId,
      staff_reviewed_by: staffId,
      staff_reviewed_at: now.toISOString(),
      staff_review_notes: staffNotes || null,
      updated_at: now.toISOString(),
      // ISO 17100 §3.1.4 basis, recorded when onboarding without a test so the
      // §3.1.1 evidence record is never empty.
      ...(body.skipTesting && body.qualificationBasis
        ? {
            qualification_basis: body.qualificationBasis,
            qualification_basis_notes: staffNotes || null,
            qualification_basis_recorded_at: now.toISOString(),
            qualification_basis_recorded_by: staffId,
          }
        : {}),
    })
    .eq("id", body.applicationId);

  // Optional AI-rewrite of staff notes into a warm welcome line for V11.
  let aiInputPrompt: string | null = null;
  let aiOutput: string | null = null;
  let aiError: string | null = null;
  let staffMessageForEmail: string | null = null;
  if (staffNotes.length >= 5) {
    aiInputPrompt = `Applicant: ${app.full_name}\nApplication: ${app.application_number}\n\nStaff notes (internal):\n${staffNotes}`;
    const ai = await claudeRewrite({
      systemPrompt: APPROVE_NOTE_SYSTEM_PROMPT,
      userMessage: aiInputPrompt,
      maxTokens: 250,
    });
    if (ai.ok) {
      aiOutput = ai.text;
      staffMessageForEmail = ai.text && ai.text.trim().length > 0 ? ai.text : null;
    } else {
      aiError = ai.error;
    }
  }

  // Staff-edited welcome line overrides the AI output at send-time.
  const editedWelcomeMessage = (body.editedWelcomeMessage ?? "").trim();
  if (editedWelcomeMessage) {
    staffMessageForEmail = editedWelcomeMessage;
  }

  const vendorPortalUrl = Deno.env.get("VENDOR_PORTAL_URL") ?? "https://vendor.cethos.com";
  const passwordSetupLink = `${vendorPortalUrl}/setup-password?token=${setupToken}`;
  const approvedCombinationsListHtml = `<ul>${approvedCombos
    .map((c) => `<li>${domainLabel(c.domain)} — ${pairLabel(c.source_language_id, c.target_language_id)}</li>`)
    .join("")}</ul>`;

  // Skip every individual-only seeding step for agency approvals:
  //   - cvp_translator_domains (per-linguist domain qualification rows)
  //   - vendor_language_pairs + vendor_rates (per-linguist rate book)
  // Agency-side, the equivalent live on the blinded roster (PR A3) and
  // on the per-job linguist picker (PR A5).
  if (!isAgencyApp) {
  // ---- Write cvp_translator_domains rows (T1) ----
  // One row per approved (pair × domain). This is the new durable source of
  // truth for "is vendor X approved for domain Y on pair Z?". The legacy
  // jsonb snapshot on cvp_translators.approved_combinations stays populated
  // for now (vendor-get-profile reads it).
  //
  // Approval source: combos that were in skip_manual_review before this
  // call (certified_official flow) get 'staff_manual'; everything else is
  // 'application' (first-time approval via the recruitment pipeline).
  const translatorDomainRows = (combos ?? []).map((c) => ({
    translator_id: translatorId,
    source_language_id: c.source_language_id,
    target_language_id: c.target_language_id,
    domain: c.domain,
    status: "approved",
    // skip-testing onboarding → 'experience' (degree/experience basis, no test);
    // certified skip_manual_review → 'staff_manual'; otherwise the test pipeline.
    approval_source: body.skipTesting
      ? "experience"
      : c.status === "skip_manual_review" ? "staff_manual" : "application",
    approved_at: now.toISOString(),
    approved_by: staffId,
    test_combination_id: c.id,
    last_submission_id: (c.test_submission_id as string | null) ?? null,
  }));
  if (translatorDomainRows.length > 0) {
    // Upsert so re-approval (edge case: staff approves again after revoke)
    // lands cleanly on the UNIQUE (translator_id, src, tgt, domain).
    const { error: tdErr } = await supabase
      .from("cvp_translator_domains")
      .upsert(translatorDomainRows, {
        onConflict: "translator_id,source_language_id,target_language_id,domain",
      });
    if (tdErr) {
      // Non-fatal: jsonb snapshot + email still go out. Log for ops.
      console.error("cvp_translator_domains upsert failed:", tdErr.message);
    }
  }

  // ---- Seed vendor_language_pairs + vendor_rates from the approved combos
  //      and the applicant's rate_card.
  //
  // The vendor profile UI (Languages, Rates tabs) reads from these vendor-*
  // tables, not from cvp_translator_domains, so without this step a freshly
  // approved vendor shows up with 0 languages / 0 rates and the portal
  // looks broken. Both inserts are non-fatal — they log on failure but
  // never block the welcome email.
  //
  // Conventions observed on existing rows:
  //   - source_language / target_language are uppercased language codes
  //     (e.g. "EN-US", "PT-BR"). We use UPPER(language.code).
  //   - vendor_rates.service_id is a FK to services(id); the rate_card
  //     stores serviceCode strings, so we resolve via a code → id map.
  //   - vendor_rates.calculation_unit mirrors the rate_card's `unit` field
  //     ("per_word", "per_minute", "per_hour"), and currency comes from
  //     the application-level rate_currency (rate_card entries don't carry
  //     a currency).

  // Resolve language codes for every src/tgt id used by the approved combos.
  const allLangIds = Array.from(
    new Set(
      (combos ?? []).flatMap((c) => [c.source_language_id, c.target_language_id]),
    ),
  );
  const langCodeMap = new Map<string, string>();
  if (allLangIds.length > 0) {
    const { data: langRows } = await supabase
      .from("languages")
      .select("id, code")
      .in("id", allLangIds);
    for (const l of (langRows ?? []) as { id: string; code: string }[]) {
      langCodeMap.set(l.id, (l.code ?? "").toUpperCase());
    }
  }

  // Distinct (src, tgt) pairs from approved combos.
  const pairKeySet = new Set<string>();
  const pairs: { src: string; tgt: string; srcId: string; tgtId: string }[] = [];
  for (const c of combos ?? []) {
    const src = langCodeMap.get(c.source_language_id as string) ?? "";
    const tgt = langCodeMap.get(c.target_language_id as string) ?? "";
    if (!src || !tgt) continue;
    const key = `${src}->${tgt}`;
    if (pairKeySet.has(key)) continue;
    pairKeySet.add(key);
    pairs.push({
      src,
      tgt,
      srcId: c.source_language_id as string,
      tgtId: c.target_language_id as string,
    });
  }

  // Insert vendor_language_pairs. Use upsert-ish behaviour by selecting
  // existing rows first so re-approval doesn't fail on the implicit unique
  // (vendor_id, source_language, target_language) — there's no formal
  // ON CONFLICT target on this table, but supabase-js .upsert needs one,
  // so we do a select-then-insert dance for the missing rows only.
  let langPairIdByKey = new Map<string, string>();
  if (pairs.length > 0) {
    const { data: existingPairs } = await supabase
      .from("vendor_language_pairs")
      .select("id, source_language, target_language")
      .eq("vendor_id", vendorId);
    for (const p of (existingPairs ?? []) as { id: string; source_language: string; target_language: string }[]) {
      langPairIdByKey.set(`${p.source_language}->${p.target_language}`, p.id);
    }
    const newPairRows = pairs
      .filter((p) => !langPairIdByKey.has(`${p.src}->${p.tgt}`))
      .map((p) => ({
        vendor_id: vendorId,
        source_language: p.src,
        target_language: p.tgt,
        is_active: true,
      }));
    if (newPairRows.length > 0) {
      const { data: inserted, error: lpErr } = await supabase
        .from("vendor_language_pairs")
        .insert(newPairRows)
        .select("id, source_language, target_language");
      if (lpErr) {
        console.error("vendor_language_pairs insert failed:", lpErr.message);
      }
      for (const p of (inserted ?? []) as { id: string; source_language: string; target_language: string }[]) {
        langPairIdByKey.set(`${p.source_language}->${p.target_language}`, p.id);
      }
    }
  }

  // Seed vendor_rates from rate_card entries that match the approved pairs.
  // rate_card shape: [{ sourceLanguageId, targetLanguageId, services: [{ serviceCode, rate, unit, minimumCharge }] }]
  const rateCard = (app.rate_card as Array<{
    sourceLanguageId?: string;
    targetLanguageId?: string;
    services?: Array<{ serviceCode?: string; rate?: string | number; unit?: string; minimumCharge?: string | number | null }>;
  }> | null) ?? [];
  const rateCurrency = (app.rate_currency as string | null) ?? "CAD";

  if (rateCard.length > 0 && pairs.length > 0) {
    // Resolve all serviceCode → service_id once.
    const allCodes = Array.from(
      new Set(
        rateCard.flatMap((rc) =>
          (rc.services ?? []).map((s) => s.serviceCode).filter((c): c is string => Boolean(c)),
        ),
      ),
    );
    const serviceIdByCode = new Map<string, string>();
    if (allCodes.length > 0) {
      const { data: svcRows } = await supabase
        .from("services")
        .select("id, code")
        .in("code", allCodes);
      for (const s of (svcRows ?? []) as { id: string; code: string }[]) {
        serviceIdByCode.set(s.code, s.id);
      }
    }

    // Avoid duplicate inserts on re-approval: pull existing (pair, service)
    // tuples for this vendor and skip them.
    const existingKey = new Set<string>();
    {
      const { data: existingRates } = await supabase
        .from("vendor_rates")
        .select("language_pair_id, service_id")
        .eq("vendor_id", vendorId);
      for (const r of (existingRates ?? []) as { language_pair_id: string | null; service_id: string }[]) {
        if (r.language_pair_id) existingKey.add(`${r.language_pair_id}::${r.service_id}`);
      }
    }

    const rateRows: Record<string, unknown>[] = [];
    for (const pair of pairs) {
      const card = rateCard.find(
        (rc) => rc.sourceLanguageId === pair.srcId && rc.targetLanguageId === pair.tgtId,
      );
      if (!card) continue;
      const pairId = langPairIdByKey.get(`${pair.src}->${pair.tgt}`);
      if (!pairId) continue;
      for (const s of card.services ?? []) {
        const code = s.serviceCode;
        if (!code) continue;
        const serviceId = serviceIdByCode.get(code);
        if (!serviceId) continue;
        const rateNum = typeof s.rate === "number" ? s.rate : Number(s.rate);
        if (!Number.isFinite(rateNum)) continue;
        if (existingKey.has(`${pairId}::${serviceId}`)) continue;
        const minNum = s.minimumCharge == null || s.minimumCharge === ""
          ? null
          : typeof s.minimumCharge === "number"
          ? s.minimumCharge
          : Number(s.minimumCharge);
        rateRows.push({
          vendor_id: vendorId,
          language_pair_id: pairId,
          service_id: serviceId,
          calculation_unit: s.unit ?? "per_word",
          rate: rateNum,
          currency: rateCurrency,
          minimum_charge: Number.isFinite(minNum as number) ? minNum : null,
          source: "self_reported",
          is_active: true,
          // vendor_rates.added_by has a CHECK constraint allowing only
          // 'vendor' | 'admin' | 'system'. The approve flow is an
          // automated copy from the application's rate_card, so 'system'
          // is the honest label.
          added_by: "system",
        });
      }
    }

    if (rateRows.length > 0) {
      const { error: vrErr } = await supabase.from("vendor_rates").insert(rateRows);
      if (vrErr) {
        console.error("vendor_rates insert failed:", vrErr.message);
      }
    }
  }
  } // end if (!isAgencyApp) — close the individual-only seeding block

  const tpl = buildV11ApprovedWelcome({
    fullName: app.full_name,
    applicationNumber: app.application_number,
    vendorPortalUrl,
    passwordSetupLink,
    passwordSetupExpiryHours: 72,
    approvedCombinationsList: approvedCombinationsListHtml,
    staffMessage: staffMessageForEmail,
  });
  const subject = (body.editedSubject ?? "").trim() || tpl.subject;
  await sendMailgunEmail({
    to: { email: app.email, name: app.full_name },
    subject,
    html: tpl.html,
    text: tpl.text,
    respectDoNotContactFor: app.email,
    tags: ["v11-approved-welcome", body.applicationId],
    trackContext: {
      applicationId: body.applicationId,
      templateTag: "v11-approved-welcome",
      staffUserId: staffId,
    },
  });

  // Persist combined audit: welcome-message notes + per-domain rationale.
  // The block stays out of the AI-rewrite input above so applicant-facing
  // copy never leaks internal reasoning.
  const rationaleBlock = formatRationaleBlock();
  const auditNotes = [rationaleBlock, staffNotes || null]
    .filter((s): s is string => Boolean(s))
    .join("\n\n");

  await logDecision({
    supabase,
    applicationId: body.applicationId,
    action: "approved",
    staffNotes: auditNotes || null,
    aiInputPrompt,
    aiOutput,
    aiError,
    messageSentSubject: subject,
    messageSentBody: tpl.html,
    staffUserId: staffId,
  });

  return json({
    success: true,
    data: {
      applicationId: body.applicationId,
      translatorId,
      vendorId,
      approvedCount: approveIds.length,
      aiProcessed: Boolean(aiOutput),
    },
  });

  } catch (err) {
    // Temporary instrumentation: surface unhandled errors with their message
    // + stack so we can see in the browser what actually went wrong instead
    // of a bare 500. Existing explicit json({...},5xx) returns above are
    // unaffected — only true throws hit this branch.
    const detail = err instanceof Error
      ? { name: err.name, message: err.message, stack: err.stack }
      : { value: String(err) };
    console.error("cvp-approve-application: unhandled error", detail);
    return json({ success: false, error: "unhandled_error", detail }, 500);
  }
});
