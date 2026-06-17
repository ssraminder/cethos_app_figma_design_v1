/**
 * cvp-submit-reference-contacts
 *
 * Applicant-facing endpoint: validates a request_token, accepts 1–3
 * reference contacts, creates per-reference rows + tokens, fires V19 to
 * each reference. No auth needed — token IS the auth.
 *
 * Body: {
 *   requestToken: string,
 *   references: [{
 *     name: string,
 *     email: string,
 *     company?: string,
 *     relationship?: string
 *   }]  // 1-3 entries
 * }
 *
 * Also supports GET-style preview via { requestToken } only — returns
 * the applicant's name + application_number so the public page can
 * confirm what they're being asked to do.
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendMailgunEmail } from "../_shared/mailgun.ts";
import { buildV19ReferenceFeedbackRequest } from "../_shared/email-templates.ts";
import { isPublicEmailDomain } from "../_shared/public-email-domains.ts";

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

interface ContactInput {
  name?: string;
  email?: string;
  company?: string;
  relationship?: string;
  /** Approximate year the applicant began working with this reference.
   *  Optional — applicant may pick "I don't remember" instead. Stored
   *  for verification against what the reference says on the questionnaire. */
  startYear?: number | string | null;
  /** True when the applicant ticked "I don't remember the year". When true,
   *  startYear is ignored and the reference's questionnaire skips the
   *  year-verification block. */
  startYearUnknown?: boolean;
  /** Domains the applicant says they worked with this reference in.
   *  Codes from DOMAIN_CODES below. Optional — applicant may pick
   *  domainsUnknown instead. When 'other' is in the list, otherDomainText
   *  may carry a free-text custom domain. */
  domains?: string[];
  /** Free-text custom domain. Only stored when 'other' is in `domains`. */
  otherDomainText?: string | null;
  /** True when applicant ticked "I don't remember the domains". When true,
   *  domains/otherDomainText are ignored and the reference's questionnaire
   *  skips the domain-verification block. */
  domainsUnknown?: boolean;
}

/** The 8 domain codes shared with apps/recruitment/src/data/referenceMcqs.ts */
const DOMAIN_CODES = new Set<string>([
  "legal",
  "medical_pharma",
  "marketing_transcreation",
  "technical_it",
  "financial_banking",
  "literary_publishing",
  "government_ngo",
  "other",
]);

function normaliseDomains(
  raw: unknown,
  otherText: unknown,
  unknown: boolean,
): { ok: true; domains: string[] | null; otherText: string | null; unknown: boolean }
  | { ok: false; error: string } {
  if (unknown) return { ok: true, domains: null, otherText: null, unknown: true };
  if (raw == null) return { ok: true, domains: null, otherText: null, unknown: false };
  if (!Array.isArray(raw)) {
    return { ok: false, error: "domains must be an array of strings" };
  }
  const seen = new Set<string>();
  for (const d of raw) {
    if (typeof d !== "string") {
      return { ok: false, error: "domains entries must be strings" };
    }
    const code = d.trim().toLowerCase();
    if (!DOMAIN_CODES.has(code)) {
      return { ok: false, error: `invalid domain code: ${code}` };
    }
    seen.add(code);
  }
  if (seen.size === 0) return { ok: true, domains: null, otherText: null, unknown: false };
  const cleanedOther = seen.has("other") && typeof otherText === "string"
    ? otherText.trim().slice(0, 200) || null
    : null;
  return {
    ok: true,
    domains: Array.from(seen).sort(),
    otherText: cleanedOther,
    unknown: false,
  };
}

const YEAR_MIN = 1980;
const YEAR_MAX_FUTURE_OFFSET = 1; // accept current year + 1 for end-of-year edge

function normaliseStartYear(raw: unknown, unknown: boolean): {
  ok: true;
  year: number | null;
  yearUnknown: boolean;
} | { ok: false; error: string } {
  if (unknown) return { ok: true, year: null, yearUnknown: true };
  if (raw == null || raw === "") return { ok: true, year: null, yearUnknown: false };
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isInteger(n)) return { ok: false, error: "startYear must be an integer" };
  const maxYear = new Date().getUTCFullYear() + YEAR_MAX_FUTURE_OFFSET;
  if (n < YEAR_MIN || n > maxYear) {
    return { ok: false, error: `startYear must be between ${YEAR_MIN} and ${maxYear}` };
  }
  return { ok: true, year: n, yearUnknown: false };
}

const REFERENCE_FEEDBACK_EXPIRY_DAYS = 21;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  let body: {
    requestToken?: string;
    references?: ContactInput[];
    /** When true (or references absent), return token-validation info only. */
    validateOnly?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "invalid_json" }, 400);
  }

  if (!body.requestToken) {
    return json({ success: false, error: "requestToken_required" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Validate token + load context.
  const { data: requestRow } = await supabase
    .from("cvp_application_reference_requests")
    .select("id, application_id, request_token_expires_at, status")
    .eq("request_token", body.requestToken)
    .maybeSingle();
  if (!requestRow) {
    return json({ success: false, error: "invalid_token" }, 404);
  }
  if (new Date(requestRow.request_token_expires_at).getTime() < Date.now()) {
    return json({ success: false, error: "token_expired" }, 410);
  }
  if (requestRow.status === "cancelled") {
    return json({ success: false, error: "request_cancelled" }, 410);
  }

  const { data: app } = await supabase
    .from("cvp_applications")
    .select("id, full_name, application_number, email")
    .eq("id", requestRow.application_id)
    .single();
  if (!app) return json({ success: false, error: "application_not_found" }, 404);

  // ---- Validation-only / preview path ----
  if (body.validateOnly || !body.references) {
    const { data: existing } = await supabase
      .from("cvp_application_references")
      .select("id, reference_name, reference_email, status, applicant_stated_start_year, applicant_year_unknown")
      .eq("request_id", requestRow.id);
    return json({
      success: true,
      data: {
        applicantName: app.full_name,
        applicationNumber: app.application_number,
        alreadyContactsSubmitted: requestRow.status === "contacts_received",
        existingReferences: existing ?? [],
      },
    });
  }

  // ---- Submit path ----
  if (requestRow.status === "contacts_received") {
    return json({ success: false, error: "contacts_already_submitted" }, 409);
  }

  // Validate inputs (incl. optional year- and domain-verification fields).
  const cleanedRefs: Array<{
    name: string;
    email: string;
    company: string | null;
    relationship: string | null;
    startYear: number | null;
    startYearUnknown: boolean;
    domains: string[] | null;
    otherDomainText: string | null;
    domainsUnknown: boolean;
  }> = [];
  const publicEmailRejections: string[] = [];
  for (const r of body.references ?? []) {
    const name = (r.name ?? "").trim();
    const email = (r.email ?? "").trim().toLowerCase();
    if (name.length < 2 || !/\S+@\S+\.\S+/.test(email)) continue;
    if (isPublicEmailDomain(email)) {
      publicEmailRejections.push(email);
      continue;
    }
    const yearResult = normaliseStartYear(r.startYear, r.startYearUnknown === true);
    if (!yearResult.ok) {
      return json(
        { success: false, error: "invalid_start_year", detail: yearResult.error },
        400,
      );
    }
    const domainsResult = normaliseDomains(
      r.domains,
      r.otherDomainText,
      r.domainsUnknown === true,
    );
    if (!domainsResult.ok) {
      return json(
        { success: false, error: "invalid_domains", detail: domainsResult.error },
        400,
      );
    }
    cleanedRefs.push({
      name,
      email,
      company: (r.company ?? "").trim() || null,
      relationship: (r.relationship ?? "").trim() || null,
      startYear: yearResult.year,
      startYearUnknown: yearResult.yearUnknown,
      domains: domainsResult.domains,
      otherDomainText: domainsResult.otherText,
      domainsUnknown: domainsResult.unknown,
    });
  }
  if (publicEmailRejections.length > 0) {
    return json(
      {
        success: false,
        error: "public_email_not_allowed",
        detail:
          `Reference contacts must use a business email (e.g. firstname@company.com). We can't accept consumer providers like Gmail, Outlook, Yahoo, iCloud, etc. — they make it impossible to verify the working relationship you described. Please ask each reference for their work address. Rejected: ${publicEmailRejections.join(", ")}`,
        rejectedEmails: publicEmailRejections,
      },
      400,
    );
  }
  if (cleanedRefs.length < 1 || cleanedRefs.length > 3) {
    return json(
      {
        success: false,
        error: "reference_count_invalid",
        detail: "Submit between 1 and 3 references with name + email.",
      },
      400,
    );
  }

  const feedbackExpiresAt = new Date(
    Date.now() + REFERENCE_FEEDBACK_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const rowsToInsert = cleanedRefs.map((r) => ({
    request_id: requestRow.id,
    application_id: requestRow.application_id,
    reference_name: r.name,
    reference_email: r.email,
    reference_company: r.company,
    reference_relationship: r.relationship,
    feedback_token_expires_at: feedbackExpiresAt,
    status: "requested",
    applicant_stated_start_year: r.startYear,
    applicant_year_unknown: r.startYearUnknown,
    applicant_stated_domains: r.domains,
    applicant_other_domain_text: r.otherDomainText,
    applicant_domains_unknown: r.domainsUnknown,
  }));

  const { data: inserted, error: insErr } = await supabase
    .from("cvp_application_references")
    .insert(rowsToInsert)
    .select("id, reference_name, reference_email, feedback_token");
  if (insErr || !inserted) {
    return json(
      { success: false, error: "reference_create_failed", detail: insErr?.message },
      500,
    );
  }

  await supabase
    .from("cvp_application_reference_requests")
    .update({
      status: "contacts_received",
      contacts_submitted_at: new Date().toISOString(),
    })
    .eq("id", requestRow.id);

  // Fire V19 to each reference.
  const appUrl = Deno.env.get("APP_URL") ?? "https://join.cethos.com";
  const sendResults: { reference_email: string; sent: boolean }[] = [];

  for (const r of inserted) {
    const tpl = buildV19ReferenceFeedbackRequest({
      referenceName: r.reference_name,
      applicantName: app.full_name,
      applicantApplicationNumber: app.application_number,
      feedbackLinkUrl: `${appUrl}/reference-feedback/${r.feedback_token}`,
      expiryDays: REFERENCE_FEEDBACK_EXPIRY_DAYS,
    });
    const sendResult = await sendMailgunEmail({
      to: { email: r.reference_email, name: r.reference_name },
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      tags: ["v19-reference-feedback-request", String(requestRow.application_id)],
      trackContext: {
        applicationId: String(requestRow.application_id),
        templateTag: "v19-reference-feedback-request",
      },
    });
    sendResults.push({
      reference_email: r.reference_email,
      sent: sendResult.sent,
    });
  }

  return json({
    success: true,
    data: {
      referencesCreated: inserted.length,
      sendResults,
    },
  });
});
