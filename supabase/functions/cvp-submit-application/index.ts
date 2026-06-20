import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendMailgunEmail } from "../_shared/mailgun.ts";
import { buildV1ApplicationReceived } from "../_shared/email-templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface PairServiceRate {
  serviceCode: string;
  unit: string;
  rate?: string;
  minimumCharge?: string;
}

interface TranslatorPayload {
  roleType: "translator";
  fullName: string;
  email: string;
  phone?: string;
  city?: string;
  country: string;
  linkedinUrl?: string;
  yearsExperience: string;
  educationLevel: string;
  certifications?: { name: string; customName?: string; expiryDate?: string }[];
  catTools?: string[];
  languagePairs: {
    sourceLanguageId: string;
    targetLanguageId: string;
    services: PairServiceRate[];
  }[];
  domainsOffered: string[];
  rateCurrency: string;
  referralSource?: string;
  notes?: string;
  cvStoragePath?: string;
}

interface CognitiveDebriefingPayload {
  roleType: "cognitive_debriefing";
  fullName: string;
  email: string;
  phone?: string;
  city?: string;
  country: string;
  linkedinUrl?: string;
  cogYearsExperience: string;
  educationLevel: string;
  cogDegreeField: string;
  cogCredentials?: string;
  cogNativeLanguages: string[];
  cogAdditionalLanguages?: string[];
  cogInstrumentTypes: string[];
  cogTherapyAreas: string[];
  cogPharmaClients?: string;
  cogIsporFamiliarity: string;
  cogFdaFamiliarity: string;
  cogPriorDebriefReports: boolean;
  cogInterviewsConducted: string;
  cogConductsDirectPatientInterviews: boolean;
  cogInterviewModes: string[];
  cogEcoaPlatforms?: string[];
  cogAvailability: string;
  cogRateExpectation: string;
  cogRateCurrency: string;
  cogSampleReportPath?: string | null;
  cogEmaFamiliarity: string;
  cogConceptElicitationYears: string;
  cogSpecialPopulations?: string[];
  cogGcpTrained: boolean;
  cogGcpYear?: string;
  cogLicenseType?: string;
  cogLicenseJurisdiction?: string;
  cogLicenseNumber?: string;
  cogLicenseActive?: boolean;
  cogTimezone: string;
  referralSource?: string;
  notes?: string;
  cvStoragePath?: string;
}

interface AgencyLanguagePair {
  sourceLanguageId: string;
  targetLanguageId: string;
}

interface AgencyPayload {
  roleType: "agency";
  applicantType: "agency";
  servicesOffered: ("translation" | "interpretation" | "transcription" | "cognitive_debriefing")[];
  email: string;
  phone?: string;
  country: string;
  linkedinUrl?: string;
  agencyPrimaryContactName: string;
  agencyPrimaryContactRole: string;
  agencyBusinessName: string;
  agencyRegistrationCountry: string;
  agencyTaxId: string;
  agencyLinguistCount: string;
  agencyYearsOperating: string;
  agencyCompanyProfilePath: string;
  languagePairs?: AgencyLanguagePair[];
  domainsOffered?: string[];
  interpreterModes?: string[];
  interpreterSettings?: string[];
  transcriberLanguages?: string[];
  transcriberSpecializations?: string[];
  cogInstrumentTypes?: string[];
  cogTherapyAreas?: string[];
  referralSource?: string;
  notes?: string;
}

interface CdClinicianConsultantPayload {
  roleType: "cd_clinician_consultant";
  fullName: string;
  email: string;
  phone?: string;
  city?: string;
  country: string;
  linkedinUrl?: string;
  educationLevel: string;
  consultantYearsExperience: string;
  consultantServices: string[];
  canRecruitParticipants?: boolean;
  canRecruitClinicians?: boolean;
  clinicianTypesSourced?: string[];
  consultantTherapyAreas: string[];
  consultantRegionsCovered: string;
  consultantWorkingLanguages: string[];
  consultantIsporFamiliarity: string;
  consultantFdaFamiliarity: string;
  consultantEmaFamiliarity: string;
  consultantGcpTrained?: boolean;
  consultantAvailability: string;
  consultantRateExpectation: string;
  rateCurrency: string;
  referralSource?: string;
  notes?: string;
  cvStoragePath?: string;
}

type ApplicationPayload =
  | TranslatorPayload
  | CognitiveDebriefingPayload
  | CdClinicianConsultantPayload
  | AgencyPayload;

function isAgencyPayload(p: ApplicationPayload): p is AgencyPayload {
  return (p as AgencyPayload).applicantType === "agency";
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function generateApplicationNumber(
  supabase: ReturnType<typeof createClient>
): Promise<string> {
  // Atomic, collision-proof via a Postgres sequence (RPC). The old count(*)+1
  // approach collided once deletions/dummy rows made count < the real max
  // number, breaking ALL submissions. nextval() can never collide.
  const { data, error } = await supabase.rpc("cvp_next_application_number");
  if (!error && typeof data === "string" && data) {
    return data;
  }
  console.error("cvp_next_application_number RPC failed, using fallback:", error);
  // Emergency fallback: a high, unique-by-time number so a transient RPC error
  // never blocks a submission (stays out of the normal 0001-8999 range).
  const year = new Date().getFullYear().toString().slice(-2);
  return `APP-${year}-9${(Date.now() % 100000).toString().padStart(5, "0")}`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const payload: ApplicationPayload = await req.json();
    const isAgency = isAgencyPayload(payload);

    // Agency path: role_type is always 'agency'; the services the agency
    // covers are declared in agency_services_offered.
    // Individual path: translator + cognitive_debriefing today;
    // interpreter / transcriber / clinician_reviewer individual flows are
    // a separate (out-of-scope) workstream.
    const validRoles = isAgency
      ? ["agency"]
      : ["translator", "cognitive_debriefing", "cd_clinician_consultant"];
    if (!payload.roleType || !validRoles.includes(payload.roleType)) {
      return jsonResponse({ success: false, error: "Invalid role type for this applicant type" }, 400);
    }

    if (isAgency) {
      const ap = payload as AgencyPayload;
      if (!ap.email || !ap.country || !ap.agencyBusinessName || !ap.agencyPrimaryContactName) {
        return jsonResponse(
          { success: false, error: "Missing required agency fields." },
          400,
        );
      }
      if (!Array.isArray(ap.servicesOffered) || ap.servicesOffered.length === 0) {
        return jsonResponse(
          { success: false, error: "Select at least one service your agency offers." },
          400,
        );
      }
      const validServices = ["translation", "interpretation", "transcription", "cognitive_debriefing"];
      if (!ap.servicesOffered.every((s) => validServices.includes(s))) {
        return jsonResponse(
          { success: false, error: "Invalid service in servicesOffered." },
          400,
        );
      }
      if (!ap.agencyCompanyProfilePath || !ap.agencyCompanyProfilePath.toLowerCase().endsWith(".pdf")) {
        return jsonResponse(
          { success: false, error: "Company profile is required (PDF, max 10MB)." },
          400,
        );
      }
    } else {
      const ip = payload as TranslatorPayload | CognitiveDebriefingPayload;
      if (!ip.fullName || !ip.email || !ip.country) {
        return jsonResponse(
          { success: false, error: "Missing required fields: fullName, email, country" },
          400,
        );
      }
      // CV is required and must be a PDF (Anthropic document input requirement).
      if (!ip.cvStoragePath || typeof ip.cvStoragePath !== "string") {
        return jsonResponse(
          { success: false, error: "CV is required (PDF, max 10MB)." },
          400,
        );
      }
      if (!ip.cvStoragePath.toLowerCase().endsWith(".pdf")) {
        return jsonResponse(
          {
            success: false,
            error:
              "Only PDF format is accepted for CVs. Please export your DOCX to PDF and resubmit.",
          },
          400,
        );
      }
    }

    // Duplicate-email guard (existence-based, not a cooldown). If this email
    // already belongs to a Cethos vendor or a prior application, block re-entry
    // and point them to their existing account / status instead.
    const emailLc = payload.email.trim().toLowerCase();
    const { data: existingVendor } = await supabase
      .from("vendors").select("id").ilike("email", emailLc).maybeSingle();
    if (existingVendor) {
      return jsonResponse({
        success: false,
        code: "vendor_exists",
        error: "You already have a Cethos vendor account with this email. Please log in at https://vendor.cethos.com to manage your profile and check your status — there's no need to apply again.",
      }, 409);
    }
    const { data: existingApp } = await supabase
      .from("cvp_applications").select("id, application_number")
      .ilike("email", emailLc).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existingApp) {
      return jsonResponse({
        success: false,
        code: "application_exists",
        error: `We already have an application on file for this email (${(existingApp as { application_number: string }).application_number}). Please watch your inbox for updates from our recruitment team — you don't need to submit again. If you applied with the wrong details or need help, just reply to your application confirmation email.`,
      }, 409);
    }

    const applicationNumber = await generateApplicationNumber(supabase);

    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("cf-connecting-ip") ?? "";
    const userAgent = req.headers.get("user-agent") ?? "";

    const applicationRow: Record<string, unknown> = {
      application_number: applicationNumber,
      role_type: payload.roleType,
      email: payload.email,
      country: payload.country,
      linkedin_url: payload.linkedinUrl ?? null,
      referral_source: payload.referralSource ?? null,
      notes: payload.notes ?? null,
      phone: payload.phone ?? null,
      ip_address: ipAddress,
      user_agent: userAgent,
      status: "submitted",
      applicant_type: isAgency ? "agency" : "individual",
    };

    if (isAgency) {
      const ap = payload as AgencyPayload;
      // Agency rows: full_name carries the business name so list views stay
      // consistent; primary contact lives in dedicated columns.
      applicationRow.full_name = ap.agencyBusinessName;
      applicationRow.agency_services_offered = ap.servicesOffered;
      applicationRow.agency_business_name = ap.agencyBusinessName;
      applicationRow.agency_registration_country = ap.agencyRegistrationCountry;
      applicationRow.agency_tax_id = ap.agencyTaxId;
      applicationRow.agency_company_profile_path = ap.agencyCompanyProfilePath;
      applicationRow.agency_primary_contact_name = ap.agencyPrimaryContactName;
      applicationRow.agency_primary_contact_role = ap.agencyPrimaryContactRole;
      applicationRow.agency_linguist_count = parseInt(ap.agencyLinguistCount, 10);
      applicationRow.agency_years_operating = parseInt(ap.agencyYearsOperating, 10);
      applicationRow.agency_language_pairs = ap.languagePairs ?? null;
      // Per-service extras stored in the existing columns where they line up.
      if (ap.servicesOffered.includes("translation")) {
        applicationRow.domains_offered = ap.domainsOffered ?? [];
      }
      if (ap.servicesOffered.includes("interpretation")) {
        applicationRow.interpreter_modes = ap.interpreterModes ?? [];
        applicationRow.interpreter_settings = ap.interpreterSettings ?? [];
      }
      if (ap.servicesOffered.includes("transcription")) {
        applicationRow.transcriber_languages = ap.transcriberLanguages ?? [];
        applicationRow.transcriber_specializations = ap.transcriberSpecializations ?? [];
      }
      if (ap.servicesOffered.includes("cognitive_debriefing")) {
        applicationRow.cog_instrument_types = ap.cogInstrumentTypes ?? [];
        applicationRow.cog_therapy_areas = ap.cogTherapyAreas ?? [];
      }
    } else if (payload.roleType === "translator") {
      const ip = payload as TranslatorPayload | CognitiveDebriefingPayload;
      applicationRow.full_name = ip.fullName;
      applicationRow.city = (payload as TranslatorPayload).city ?? null;
      applicationRow.cv_storage_path = ip.cvStoragePath;
    } else {
      const ip = payload as CognitiveDebriefingPayload;
      applicationRow.full_name = ip.fullName;
      applicationRow.city = (payload as CognitiveDebriefingPayload).city ?? null;
      applicationRow.cv_storage_path = ip.cvStoragePath;
    }

    if (isAgency) {
      // Agency: no per-applicant CV / rate / certifications / years.
      // Roster + per-job picker fills those in post-approval.
    } else if (payload.roleType === "translator") {
      const tp = payload as TranslatorPayload;
      applicationRow.years_experience = parseInt(tp.yearsExperience, 10);
      applicationRow.education_level = tp.educationLevel;
      applicationRow.certifications = tp.certifications ?? [];
      applicationRow.cat_tools = tp.catTools ?? [];
      applicationRow.domains_offered = tp.domainsOffered ?? [];
      applicationRow.rate_currency = tp.rateCurrency ?? null;
      // services_offered column kept populated with aggregated service codes
      // across all pairs for simple queryability; full detail is in rate_card.
      const aggregatedServiceCodes = Array.from(
        new Set(
          (tp.languagePairs ?? []).flatMap((p) =>
            (p.services ?? []).map((s) => s.serviceCode)
          )
        )
      );
      applicationRow.services_offered = aggregatedServiceCodes;
      applicationRow.rate_card = tp.languagePairs ?? [];
    } else if (payload.roleType === "cd_clinician_consultant") {
      const cc = payload as CdClinicianConsultantPayload;
      applicationRow.education_level = cc.educationLevel;
      // All consultant-specific detail lives in the jsonb (no role-specific columns).
      applicationRow.consultant_profile = {
        yearsExperience: cc.consultantYearsExperience,
        services: cc.consultantServices ?? [],
        canRecruitParticipants: cc.canRecruitParticipants ?? false,
        canRecruitClinicians: cc.canRecruitClinicians ?? false,
        clinicianTypesSourced: cc.clinicianTypesSourced ?? [],
        therapyAreas: cc.consultantTherapyAreas ?? [],
        regionsCovered: cc.consultantRegionsCovered ?? null,
        workingLanguages: cc.consultantWorkingLanguages ?? [],
        isporFamiliarity: cc.consultantIsporFamiliarity ?? null,
        fdaFamiliarity: cc.consultantFdaFamiliarity ?? null,
        emaFamiliarity: cc.consultantEmaFamiliarity ?? null,
        gcpTrained: cc.consultantGcpTrained ?? false,
        availability: cc.consultantAvailability ?? null,
        rateExpectation: cc.consultantRateExpectation ?? null,
        rateCurrency: cc.rateCurrency ?? null,
      };
    } else {
      const cp = payload as CognitiveDebriefingPayload;
      applicationRow.cog_years_experience = parseInt(cp.cogYearsExperience, 10);
      applicationRow.education_level = cp.educationLevel;
      applicationRow.cog_degree_field = cp.cogDegreeField;
      applicationRow.cog_credentials = cp.cogCredentials ?? null;
      applicationRow.cog_native_languages = cp.cogNativeLanguages ?? [];
      applicationRow.cog_additional_languages = cp.cogAdditionalLanguages ?? [];
      applicationRow.cog_instrument_types = cp.cogInstrumentTypes;
      applicationRow.cog_therapy_areas = cp.cogTherapyAreas;
      applicationRow.cog_pharma_clients = cp.cogPharmaClients ?? null;
      applicationRow.cog_ispor_familiarity = cp.cogIsporFamiliarity;
      applicationRow.cog_fda_familiarity = cp.cogFdaFamiliarity;
      applicationRow.cog_prior_debrief_reports = cp.cogPriorDebriefReports;
      applicationRow.cog_sample_report_path = cp.cogSampleReportPath ?? null;
      applicationRow.cog_interviews_conducted = cp.cogInterviewsConducted;
      applicationRow.cog_conducts_direct_patient_interviews =
        cp.cogConductsDirectPatientInterviews;
      applicationRow.cog_interview_modes = cp.cogInterviewModes ?? [];
      applicationRow.cog_ecoa_platforms = cp.cogEcoaPlatforms ?? [];
      applicationRow.cog_availability = cp.cogAvailability;
      applicationRow.cog_rate_expectation = parseFloat(cp.cogRateExpectation);
      applicationRow.cog_rate_currency = cp.cogRateCurrency;
      applicationRow.cog_ema_familiarity = cp.cogEmaFamiliarity;
      applicationRow.cog_concept_elicitation_years = cp.cogConceptElicitationYears;
      applicationRow.cog_special_populations = cp.cogSpecialPopulations ?? [];
      applicationRow.cog_gcp_trained = cp.cogGcpTrained;
      applicationRow.cog_gcp_year = cp.cogGcpYear
        ? parseInt(cp.cogGcpYear, 10)
        : null;
      applicationRow.cog_license_type = cp.cogLicenseType ?? null;
      applicationRow.cog_license_jurisdiction = cp.cogLicenseJurisdiction ?? null;
      applicationRow.cog_license_number = cp.cogLicenseNumber ?? null;
      applicationRow.cog_license_active = cp.cogLicenseActive ?? null;
      applicationRow.cog_timezone = cp.cogTimezone;
    }

    const { data: application, error: insertError } = await supabase
      .from("cvp_applications")
      .insert(applicationRow)
      .select("id, application_number")
      .single();

    if (insertError) {
      console.error("Error inserting application:", insertError);
      return jsonResponse(
        { success: false, error: "Failed to submit application. Please try again." },
        500
      );
    }

    // Phase 1 of applicant-login (FEATURE-FLAGGED, default OFF). When enabled,
    // create the applicant's vendor record in 'applicant' status at submit so
    // they can log into the existing vendor portal (same OTP auth) from day 1 to
    // check status + sign their NDA. 'applicant' status is excluded from
    // assignment/VendorFinder (status='active' filter), so this never affects
    // work allocation. Non-fatal: a failure here must never block the submission.
    // Flip APPLICANT_LOGIN_ENABLED=true only at the coordinated cutover.
    if (Deno.env.get("APPLICANT_LOGIN_ENABLED") === "true") {
      try {
        const { data: existingV } = await supabase
          .from("vendors").select("id").ilike("email", emailLc).maybeSingle();
        if (!existingV) {
          await supabase.from("vendors").insert({
            full_name: applicationRow.full_name as string,
            email: payload.email,
            additional_emails: [],
            phone: payload.phone ?? null,
            country: payload.country ?? null,
            city: (applicationRow.city as string | null) ?? null,
            vendor_type: payload.roleType,
            rate_currency: "CAD",
            preferred_rate_currency: "CAD",
            certifications: [],
            years_experience: null,
            status: "applicant",
            availability_status: "available",
            total_projects: 0,
          });
        }
      } catch (e) {
        console.error("applicant-vendor creation failed (non-fatal):", e instanceof Error ? e.message : String(e));
      }
    }

    // Create test combinations for translators.
    // Post domain-unit rework: one combo per (language_pair × domain). Every
    // translator also gets a mandatory General baseline test per pair,
    // whether or not they picked "general" in the domains field. Certified
    // combos land with status 'skip_manual_review' and never receive a test —
    // staff approves them on CV + references alone.
    // Rate info is NOT written to approved_rate here; it's owned by
    // cvp_applications.rate_card at the (pair × service) level.
    if (!isAgency && payload.roleType === "translator") {
      const tp = payload as TranslatorPayload;

      const domainsToTest = new Set<string>(tp.domainsOffered ?? []);
      domainsToTest.add("general"); // baseline — always

      const combinationRows: Record<string, unknown>[] = [];
      for (const pair of tp.languagePairs ?? []) {
        for (const domain of domainsToTest) {
          const isCertified = domain === "certified_official";
          combinationRows.push({
            application_id: application.id,
            source_language_id: pair.sourceLanguageId,
            target_language_id: pair.targetLanguageId,
            domain,
            service_type: null,
            status: isCertified ? "skip_manual_review" : "pending",
            approved_rate: null,
            is_baseline_general: domain === "general",
          });
        }
      }

      if (combinationRows.length > 0) {
        const { error: combError } = await supabase
          .from("cvp_test_combinations")
          .insert(combinationRows);

        if (combError) {
          console.error("Error inserting test combinations:", combError);
          // Non-fatal — application is already created
        }
      }
    }

    // Send V1 confirmation email via Mailgun.
    try {
      const recipientName = isAgency
        ? (payload as AgencyPayload).agencyPrimaryContactName
        : (payload as TranslatorPayload | CognitiveDebriefingPayload).fullName;
      const tpl = buildV1ApplicationReceived({
        fullName: recipientName,
        applicationNumber,
        // Applicant-login cutover: include the log-in + sign-NDA CTA only when
        // the feature is enabled. Off = original email, unchanged.
        loginUrl: Deno.env.get("APPLICANT_LOGIN_ENABLED") === "true"
          ? "https://vendor.cethos.com"
          : undefined,
      });
      await sendMailgunEmail({
        to: { email: payload.email, name: recipientName },
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        respectDoNotContactFor: payload.email,
        tags: ["v1-application-received", applicationNumber],
      });
    } catch (emailError) {
      console.error("Error sending V1 confirmation email:", emailError);
    }

    // Fire and forget: trigger pre-screening. CD & Clinician Review Consultants
    // take no skills test and are auto-approved to a parked vendor by
    // cvp-auto-advance, so they skip the prescreen pipeline.
    if (payload.roleType !== "cd_clinician_consultant") {
      try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      fetch(`${supabaseUrl}/functions/v1/cvp-prescreen-application`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ applicationId: application.id }),
      }).catch((err) => {
        console.error("Error triggering prescreen:", err);
      });
    } catch (prescreenError) {
      console.error("Error triggering prescreen:", prescreenError);
    }
    }

    return jsonResponse({
      success: true,
      data: {
        applicationNumber: application.application_number,
        applicationId: application.id,
      },
    });
  } catch (err) {
    console.error("Unhandled error in cvp-submit-application:", err);
    return jsonResponse(
      { success: false, error: "An unexpected error occurred. Please try again." },
      500
    );
  }
});
