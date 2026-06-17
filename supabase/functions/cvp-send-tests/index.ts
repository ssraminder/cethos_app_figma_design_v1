import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendMailgunEmail } from "../_shared/mailgun.ts";
import { buildV3TestInvitation } from "../_shared/email-templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface TestLibraryRow {
  id: string;
  title: string;
  source_language_id: string;
  target_language_id: string;
  domain: string;
  service_type: string;
  difficulty: string;
  source_text: string | null;
  source_file_path: string | null;
  instructions: string | null;
  times_used: number;
  last_used_at: string | null;
}

interface CombinationRow {
  id: string;
  application_id: string;
  source_language_id: string;
  target_language_id: string;
  domain: string;
  service_type: string;
  status: string;
}

interface ApplicationRow {
  id: string;
  email: string;
  full_name: string;
  application_number: string;
  ai_prescreening_result: {
    suggested_test_difficulty?: string;
  } | null;
}

interface LanguageJoin {
  id: string;
  name: string;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * cvp-send-tests
 *
 * Assigns tests from the test library to each pending combination for an application.
 * Creates cvp_test_submissions records with unique tokens (10-day expiry).
 * Sends batch test invitation email (V3).
 *
 * Triggered: automatically after pre-screen passes (score >= 70), or manually by staff.
 *
 * Payload: { applicationId: string }
 */
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

    const body = (await req.json()) as {
      applicationId?: string;
      /** Subset of combinations to send tests for. Default: all pending. */
      combinationIds?: string[];
      /**
       * Domain allowlist. When provided, only pending combinations whose
       * `domain` is in this list are eligible. Used by auto-send paths that
       * want to send the General test only and leave other domains for staff
       * or vendor-self-serve later. When omitted, all domains are eligible.
       */
      domainFilter?: string[];
      /**
       * Source-language allowlist (UUIDs). When provided, only pending
       * combinations whose `source_language_id` is in this list are eligible.
       * Used by the auto-send pipeline to restrict to EN→Target combinations
       * (Target→EN tests come from Phase 2 harvest, not auto-send).
       */
      sourceLanguageFilter?: string[];
      /** Override AI's suggested_test_difficulty for this send. */
      difficulty?: "beginner" | "intermediate" | "advanced";
      /** Staff who triggered (for audit + outbound tracking). */
      staffId?: string;
      /** CC the V3 invitation (visible to applicant). */
      cc?: string | string[];
      /**
       * BCC the V3 invitation to one or more email addresses (staff
       * oversight). Applicants don't see these recipients.
       */
      bcc?: string | string[];
      /**
       * When true, run the selection logic + return the chosen test per
       * combination WITHOUT inserting submissions, flipping combination
       * status, or sending the V3 invitation. Used by the admin "Preview
       * tests" button so staff can review the exact test text before
       * committing.
       */
      dryRun?: boolean;
      /**
       * Optional per-combination test overrides: { [combinationId]: testId }.
       * When a combination appears here, we use that test instead of the
       * auto-selection. Test must still match the combination's lang pair
       * + domain + service_type + be is_active=true (validated server-side).
       */
      overrides?: Record<string, string>;
    };
    const { applicationId } = body;
    if (!applicationId) {
      return jsonResponse(
        { success: false, error: "applicationId is required" },
        400
      );
    }

    // Fetch application
    const { data: application, error: appError } = await supabase
      .from("cvp_applications")
      .select("id, email, full_name, application_number, ai_prescreening_result, tm_user_id, tm_initial_password")
      .eq("id", applicationId)
      .single();

    if (appError || !application) {
      console.error("Error fetching application:", appError);
      return jsonResponse(
        { success: false, error: "Application not found" },
        404
      );
    }

    const app = application as unknown as ApplicationRow;
    // Default to intermediate for everyone — the AI's per-applicant
    // `suggested_test_difficulty` is intentionally ignored so we score the
    // whole pool against a consistent difficulty bar. Staff explicit override
    // (body.difficulty from the admin UI) still wins.
    const suggestedDifficulty = body.difficulty ?? "intermediate";

    // Fetch pending combinations for this application (optionally filtered to
    // the subset staff explicitly selected).
    let comboQ = supabase
      .from("cvp_test_combinations")
      .select("id, application_id, source_language_id, target_language_id, domain, service_type, status")
      .eq("application_id", applicationId)
      .eq("status", "pending");
    if (body.combinationIds && body.combinationIds.length > 0) {
      comboQ = comboQ.in("id", body.combinationIds);
    }
    if (body.domainFilter && body.domainFilter.length > 0) {
      comboQ = comboQ.in("domain", body.domainFilter);
    }
    if (body.sourceLanguageFilter && body.sourceLanguageFilter.length > 0) {
      comboQ = comboQ.in("source_language_id", body.sourceLanguageFilter);
    }
    const { data: combinations, error: combError } = await comboQ;

    if (combError) {
      console.error("Error fetching combinations:", combError);
      return jsonResponse(
        { success: false, error: "Failed to fetch test combinations" },
        500
      );
    }

    const combs = (combinations ?? []) as unknown as CombinationRow[];
    if (combs.length === 0) {
      return jsonResponse(
        { success: false, error: "No pending test combinations found" },
        400
      );
    }

    // Build a language-variant equivalence map. Library rows historically use
    // the generic root language (e.g. "English", id=fde091d2…), but
    // applicants pick locale variants like "English (US)", "English (UK)",
    // "Spanish (Spain)" etc. when filling the application form. Without
    // grouping, an "English (US) → Persian" combination finds no match
    // even though plenty of "English → Persian" library rows exist.
    //
    // Equivalence rule: same root name (text before " (" if present) →
    // same group. Expansion is one-hop (no transitivity tricks). The
    // group always contains the language itself.
    const { data: allLangs } = await supabase
      .from("languages")
      .select("id, name");
    const variantRoot = (name: string): string => {
      const i = name.indexOf(" (");
      return i === -1 ? name : name.slice(0, i);
    };
    const langGroups = new Map<string, string[]>(); // langId → [equivalent langIds]
    {
      const byRoot = new Map<string, string[]>();
      for (const l of (allLangs ?? []) as { id: string; name: string }[]) {
        const r = variantRoot(l.name);
        const arr = byRoot.get(r) ?? [];
        arr.push(l.id);
        byRoot.set(r, arr);
      }
      for (const l of (allLangs ?? []) as { id: string; name: string }[]) {
        const r = variantRoot(l.name);
        langGroups.set(l.id, byRoot.get(r) ?? [l.id]);
      }
    }
    const equivIds = (langId: string): string[] =>
      langGroups.get(langId) ?? [langId];

    // Phase 1 — selection only. This runs for BOTH dryRun (preview) and real
    // send so the admin sees exactly the same tests they're about to send.
    type Pick = {
      combo: CombinationRow;
      test: TestLibraryRow;
      /** "override" when staff explicitly chose this test in the UI,
       *  "difficulty-match" when we found one at the preferred difficulty,
       *  "fallback" when we used any available match,
       *  "wildcard-fallback" when no language-specific test existed and we
       *    used a target-language-agnostic wildcard row (target_language_id
       *    IS NULL in the library). */
      selectionReason:
        | "override"
        | "difficulty-match"
        | "fallback"
        | "wildcard-fallback";
      /** Alternative tests for the combo, in the order they'd be considered
       *  after this pick. Useful for the preview UI's "swap" dropdown. */
      alternatives: TestLibraryRow[];
    };
    const picks: Pick[] = [];
    const noTestAvailable: string[] = [];

    for (const combo of combs) {
      // Find every eligible test in the library for this combination.
      // As of the domain-unit rework, `combo.service_type` is NULL for
      // domain-based combinations — in that case we match on (pair × domain)
      // only and accept any service_type in the library. Legacy combos that
      // still carry a service_type keep the stricter match.
      // Source and target are matched against ANY equivalent language variant
      // (e.g. an "English (US)" combo matches "English" library rows). See
      // langGroups setup above.
      const srcEquiv = equivIds(combo.source_language_id);
      const tgtEquiv = equivIds(combo.target_language_id);
      let libraryQ = supabase
        .from("cvp_test_library")
        .select("id, title, source_language_id, target_language_id, domain, service_type, difficulty, source_text, source_file_path, instructions, times_used, last_used_at")
        .in("source_language_id", srcEquiv)
        .in("target_language_id", tgtEquiv)
        .eq("domain", combo.domain)
        .eq("is_active", true);
      if (combo.service_type) {
        libraryQ = libraryQ.eq("service_type", combo.service_type);
      }
      const { data: tests } = await libraryQ
        .order("times_used", { ascending: true })
        .order("last_used_at", { ascending: true, nullsFirst: true });

      let availableTests = (tests ?? []) as unknown as TestLibraryRow[];
      let usedWildcardFallback = false;

      // Wildcard fallback: when no language-specific row matches, look for
      // a target-language-agnostic row (target_language_id IS NULL) at the
      // same source language + domain. These are the EN→Target seed rows
      // (one English source serves any target). Same rotation order applies.
      // Source language matching also uses the equivalence group so
      // English (US) combos pick up wildcards seeded under generic English.
      if (availableTests.length === 0) {
        let wildcardQ = supabase
          .from("cvp_test_library")
          .select("id, title, source_language_id, target_language_id, domain, service_type, difficulty, source_text, source_file_path, instructions, times_used, last_used_at")
          .in("source_language_id", srcEquiv)
          .is("target_language_id", null)
          .eq("domain", combo.domain)
          .eq("is_active", true);
        if (combo.service_type) {
          wildcardQ = wildcardQ.eq("service_type", combo.service_type);
        }
        const { data: wildTests } = await wildcardQ
          .order("times_used", { ascending: true })
          .order("last_used_at", { ascending: true, nullsFirst: true });
        availableTests = (wildTests ?? []) as unknown as TestLibraryRow[];
        usedWildcardFallback = availableTests.length > 0;
      }

      const overrideId = body.overrides?.[combo.id];
      let selectedTest: TestLibraryRow | undefined;
      let selectionReason: Pick["selectionReason"] = "fallback";

      if (overrideId) {
        // Explicit staff pick — must be in the eligible list (guards against
        // stale UI state or mismatched lang pairs).
        const match = availableTests.find((t) => t.id === overrideId);
        if (match) {
          selectedTest = match;
          selectionReason = "override";
        }
      }
      if (!selectedTest) {
        const byDifficulty = availableTests.find(
          (t) => t.difficulty === suggestedDifficulty,
        );
        if (byDifficulty) {
          selectedTest = byDifficulty;
          selectionReason = usedWildcardFallback
            ? "wildcard-fallback"
            : "difficulty-match";
        } else if (availableTests.length > 0) {
          selectedTest = availableTests[0];
          selectionReason = usedWildcardFallback
            ? "wildcard-fallback"
            : "fallback";
        }
      }

      if (!selectedTest) {
        noTestAvailable.push(combo.id);
        continue;
      }

      picks.push({
        combo,
        test: selectedTest,
        selectionReason,
        alternatives: availableTests.filter((t) => t.id !== selectedTest!.id),
      });
    }

    // ---- Preview (dryRun) — no writes, no email ----
    if (body.dryRun === true) {
      // Fetch language names once so the preview UI doesn't have to
      // re-resolve them client-side.
      const langIds = Array.from(
        new Set(
          combs.flatMap((c) => [c.source_language_id, c.target_language_id]),
        ),
      );
      const { data: langs } = await supabase
        .from("languages")
        .select("id, name")
        .in("id", langIds);
      const langMap = new Map<string, string>(
        (langs ?? []).map((l) => [String(l.id), String(l.name)]),
      );

      return jsonResponse({
        success: true,
        data: {
          dryRun: true,
          applicationId,
          suggestedDifficulty,
          picks: picks.map((p) => ({
            combinationId: p.combo.id,
            sourceLanguage: langMap.get(p.combo.source_language_id) ?? "Unknown",
            targetLanguage: langMap.get(p.combo.target_language_id) ?? "Unknown",
            domain: p.combo.domain,
            serviceType: p.combo.service_type,
            test: {
              id: p.test.id,
              title: p.test.title,
              difficulty: p.test.difficulty,
              instructions: p.test.instructions,
              sourceText: p.test.source_text,
              sourceFilePath: p.test.source_file_path,
              timesUsed: p.test.times_used,
              lastUsedAt: p.test.last_used_at,
            },
            selectionReason: p.selectionReason,
            alternatives: p.alternatives.map((t) => ({
              id: t.id,
              title: t.title,
              difficulty: t.difficulty,
              timesUsed: t.times_used,
              lastUsedAt: t.last_used_at,
            })),
          })),
          noTestAvailable: noTestAvailable.map((id) => {
            const c = combs.find((cc) => cc.id === id)!;
            return {
              combinationId: id,
              sourceLanguage: langMap.get(c.source_language_id) ?? "Unknown",
              targetLanguage: langMap.get(c.target_language_id) ?? "Unknown",
              domain: c.domain,
              serviceType: c.service_type,
            };
          }),
        },
      });
    }

    // ---- Real send — write submissions, mark combos, update stats ----
    interface AssignedRow {
      combinationId: string;
      testId: string;
      submissionId: string;
      token: string;
      tmEmail: string;
      tmJobUrl: string;
      tmSigninUrl: string | null;
      sourceLangName: string;
      targetLangName: string;
      domain: string;
      difficulty: string;
    }
    const assigned: AssignedRow[] = [];
    // Surface TM-side failures in the response so staff (and Claude) can
    // see exactly what went wrong without needing Edge Function log access.
    const tmFailures: Array<{
      combinationId: string;
      submissionId: string;
      reason: string;
    }> = [];

    // Flag any combinations with no available test so staff sees them in the UI.
    for (const noTestComboId of noTestAvailable) {
      await supabase
        .from("cvp_test_combinations")
        .update({
          status: "no_test_available",
          updated_at: new Date().toISOString(),
        })
        .eq("id", noTestComboId);
    }

    // Resolve language codes/names once so per-pick provisioning doesn't repeat
    // the lookup. Codes are passed to TM (which expects "en-US" / "fa-IR" style
    // tags); names are used for the email body.
    const allLangIds = Array.from(
      new Set(picks.flatMap((p) => [
        p.combo.source_language_id,
        p.combo.target_language_id,
      ])),
    );
    const { data: langRows } = await supabase
      .from("languages")
      .select("id, name, code")
      .in("id", allLangIds);
    const langInfo = new Map<
      string,
      { name: string; code: string; rtl: boolean }
    >(
      ((langRows ?? []) as { id: string; name: string; code: string }[]).map(
        (l) => [
          l.id,
          {
            name: l.name,
            code: l.code,
            // Conservative RTL detection by language name. TM only uses this
            // for first-time language upserts; ongoing entries keep whatever
            // value was set initially.
            rtl: /persian|farsi|arabic|hebrew|urdu|pashto|dari|kurdish/i.test(
              l.name ?? "",
            ),
          },
        ],
      ),
    );

    const TM_BASE_URL = Deno.env.get("TM_BASE_URL") ?? "https://tm.cethos.com";
    const TM_API_KEY = Deno.env.get("TM_API_KEY") ?? "";
    if (!TM_API_KEY) {
      // Hard-fail instead of silently letting every combo fall through the
      // `!TM_API_KEY` guards below as `pending`. Without this we can't
      // provision a vendor account or create a test job, so there's
      // literally nothing to send. Mark every selected combo so staff sees
      // the issue, then surface a 500 to the caller (the prescreen hook)
      // so it logs the failure instead of swallowing it.
      console.error(
        "TM_API_KEY not configured — aborting test send. Set TM_API_KEY in the vendor portal Supabase function secrets.",
      );
      for (const p of picks) {
        await supabase
          .from("cvp_test_combinations")
          .update({
            status: "no_test_available",
            updated_at: new Date().toISOString(),
            failure_reason:
              "TM_API_KEY missing in vendor-portal Supabase secrets — set it and re-run cvp-send-tests for this application.",
          })
          .eq("id", p.combo.id);
      }
      return jsonResponse(
        {
          success: false,
          error: "TM_API_KEY not configured",
          combosMarked: picks.length,
        },
        500,
      );
    }

    // ---- Vendor account: one TM profile per applicant, reused across tests ----
    // TM signs in via email OTP only — no password is ever exchanged or
    // emailed. The upsert is purely "do you have a profile for this email,
    // and if not, mint one." Once we have tm_user_id we cache it on
    // cvp_applications so subsequent sends skip the upsert call.
    let vendorUserId: string | null =
      (app as Record<string, unknown>).tm_user_id as string | null ?? null;
    let vendorIsNew = false;

    if (!vendorUserId && TM_API_KEY) {
      try {
        const upsertResp = await fetch(
          `${TM_BASE_URL}/api/admin/vendor-accounts/upsert`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${TM_API_KEY}`,
            },
            body: JSON.stringify({
              applicant_email: app.email,
              applicant_full_name: app.full_name,
            }),
          },
        );
        if (!upsertResp.ok) {
          const errBody = await upsertResp.text();
          throw new Error(`TM ${upsertResp.status}: ${errBody.slice(0, 500)}`);
        }
        const upsertResult = (await upsertResp.json()) as {
          idempotent: boolean;
          user_id: string;
        };
        vendorUserId = upsertResult.user_id;
        vendorIsNew = !upsertResult.idempotent;
        await supabase
          .from("cvp_applications")
          .update({
            tm_user_id: vendorUserId,
            tm_account_created_at: vendorIsNew ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", applicationId);
      } catch (vendorErr) {
        console.error(
          `Vendor-account upsert failed for app ${applicationId}:`,
          vendorErr instanceof Error ? vendorErr.message : String(vendorErr),
        );
        // Without a vendor user_id we can't create jobs. Mark every pending
        // combination as no_test_available so staff sees it.
        const reason = `Vendor-account upsert failed: ${vendorErr instanceof Error ? vendorErr.message : "unknown"}`;
        for (const p of picks) {
          await supabase
            .from("cvp_test_combinations")
            .update({
              status: "no_test_available",
              updated_at: new Date().toISOString(),
              failure_reason: reason,
            })
            .eq("id", p.combo.id);
        }
        return jsonResponse({
          success: false,
          error: `Could not provision vendor account: ${vendorErr instanceof Error ? vendorErr.message : "unknown"}`,
        }, 500);
      }
    }

    for (const p of picks) {
      // 10-day window: 3 reminders at +3 / +6 / +9 days, then expiry.
      const tokenExpiresAt = new Date(
        Date.now() + 10 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const { data: submission, error: subError } = await supabase
        .from("cvp_test_submissions")
        .insert({
          combination_id: p.combo.id,
          test_id: p.test.id,
          application_id: applicationId,
          token_expires_at: tokenExpiresAt,
          status: "sent",
        })
        .select("id, token")
        .single();

      if (subError || !submission) {
        console.error(
          `Error creating test submission for combination ${p.combo.id}:`,
          subError,
        );
        continue;
      }

      // ---- Provision TM-Cethos account + job for this submission ----
      const srcInfo = langInfo.get(p.combo.source_language_id);
      const tgtInfo = langInfo.get(p.combo.target_language_id);
      if (!TM_API_KEY || !srcInfo || !tgtInfo || !p.test.source_text) {
        const reason =
          `prerequisites missing: ` +
          `${!TM_API_KEY ? "no TM_API_KEY; " : ""}` +
          `${!srcInfo ? "missing src lang; " : ""}` +
          `${!tgtInfo ? "missing tgt lang; " : ""}` +
          `${!p.test.source_text ? "no source_text on library row; " : ""}`;
        console.error(
          `Cannot provision TM job for submission ${submission.id}: ${reason}`,
        );
        tmFailures.push({
          combinationId: p.combo.id,
          submissionId: submission.id,
          reason,
        });
        // Mark the combination so staff sees the failure rather than a silent
        // skip. Don't push into `assigned` — no email goes out for this combo.
        await supabase
          .from("cvp_test_combinations")
          .update({
            status: "no_test_available",
            updated_at: new Date().toISOString(),
          })
          .eq("id", p.combo.id);
        continue;
      }

      if (!vendorUserId) {
        // Vendor account never provisioned (TM_API_KEY missing or upsert
        // failed earlier). Mark this combo so staff can retry.
        await supabase
          .from("cvp_test_combinations")
          .update({
            status: "no_test_available",
            updated_at: new Date().toISOString(),
          })
          .eq("id", p.combo.id);
        continue;
      }

      let tmResult: {
        signin_url: string | null;
        job_id: string;
        job_reference?: string;
      } | null = null;
      try {
        const tmResp = await fetch(
          `${TM_BASE_URL}/api/admin/test-jobs/create`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${TM_API_KEY}`,
            },
            body: JSON.stringify({
              test_submission_id: submission.id,
              user_id: vendorUserId,
              source_text: p.test.source_text,
              source_lang: srcInfo.code,
              target_lang: tgtInfo.code,
              source_lang_name: srcInfo.name,
              target_lang_name: tgtInfo.name,
              source_lang_rtl: srcInfo.rtl,
              target_lang_rtl: tgtInfo.rtl,
              instructions: p.test.instructions ?? undefined,
            }),
          },
        );
        if (!tmResp.ok) {
          const errBody = await tmResp.text();
          throw new Error(`TM ${tmResp.status}: ${errBody.slice(0, 500)}`);
        }
        tmResult = await tmResp.json();
      } catch (tmErr) {
        const reason = tmErr instanceof Error ? tmErr.message : String(tmErr);
        console.error(
          `TM provisioning failed for submission ${submission.id}:`,
          reason,
        );
        tmFailures.push({
          combinationId: p.combo.id,
          submissionId: submission.id,
          reason,
        });
        // Don't email the applicant if TM didn't provision — they'd get
        // unusable credentials. Mark for staff retry.
        await supabase
          .from("cvp_test_combinations")
          .update({
            status: "no_test_available",
            updated_at: new Date().toISOString(),
          })
          .eq("id", p.combo.id);
        continue;
      }

      const tmJobUrl = `${TM_BASE_URL}/translator/editor/${tmResult!.job_id}`;

      // Persist TM provisioning data on the submission for admin visibility
      // and idempotency on retries. tm_user_password column is left NULL —
      // sign-in is by email OTP only, no password is ever exchanged.
      await supabase
        .from("cvp_test_submissions")
        .update({
          tm_user_email: app.email,
          tm_user_password: null,
          tm_job_id: tmResult!.job_id,
          tm_job_url: tmJobUrl,
          tm_provisioned_at: new Date().toISOString(),
        })
        .eq("id", submission.id);

      await supabase
        .from("cvp_test_combinations")
        .update({
          test_id: p.test.id,
          test_submission_id: submission.id,
          status: "test_sent",
          updated_at: new Date().toISOString(),
        })
        .eq("id", p.combo.id);

      await supabase
        .from("cvp_test_library")
        .update({
          times_used: p.test.times_used + 1,
          last_used_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", p.test.id);

      assigned.push({
        combinationId: p.combo.id,
        testId: p.test.id,
        submissionId: submission.id,
        token: submission.token,
        tmEmail: app.email,
        tmJobUrl,
        tmSigninUrl: tmResult!.signin_url,
        sourceLangName: srcInfo.name,
        targetLangName: tgtInfo.name,
        domain: p.combo.domain,
        difficulty: p.test.difficulty,
      });
    }

    // Update application status
    if (assigned.length > 0) {
      await supabase
        .from("cvp_applications")
        .update({
          status: "test_sent",
          updated_at: new Date().toISOString(),
        })
        .eq("id", applicationId);
    }

    // ---- Send batch test invitation email (V3) ----
    // Each assigned test got a fresh TM-Cethos account + job. The email lists
    // one block per test with: pair + domain, sign-in URL, direct job URL,
    // login email, single-use password.
    if (assigned.length > 0) {
      const escHtml = (s: string): string =>
        s.replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;");

      const testLinksHtml = assigned
        .map((a) => {
          // Primary path: one-click magic link (no password to copy). The
          // password block stays as a backup in case the magic link
          // misbehaves — see /t/[token] in tm-cethos.
          const ctaUrl = a.tmSigninUrl ?? a.tmJobUrl;
          return `
            <div style="margin: 16px 0; padding: 14px 16px; border-left: 3px solid #0891B2; background: #F9FAFB;">
              <div style="font-weight: 600; margin-bottom: 10px;">
                ${escHtml(a.sourceLangName)} → ${escHtml(a.targetLangName)} · ${escHtml(a.domain)} · ${escHtml(a.difficulty)}
              </div>
              <div style="margin: 6px 0 12px;">
                <a href="${escHtml(ctaUrl)}"
                   style="display: inline-block; background: #0891B2; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-weight: 600;">
                  Open my test
                </a>
              </div>
              <div style="font-size: 12px; color: #6B7280; margin-top: 8px;">
                One-click link expires in 48 hours and can only be used once. To sign in manually:
              </div>
              <div style="font-size: 12px; margin: 4px 0;">
                <span style="color: #6B7280;">Editor URL:</span>
                <a href="${escHtml(a.tmJobUrl)}" style="color: #0891B2;">${escHtml(a.tmJobUrl)}</a>
              </div>
            </div>`;
        })
        .join("");

      // Account block (shown once at the top, not per test). Auth is by
      // email OTP only — no passwords. Different copy for first-time vs
      // returning vendors.
      const accountBlockHtml = vendorIsNew
        ? `
          <div style="margin: 0 0 20px; padding: 14px 16px; background: #ECFDF5; border-left: 3px solid #10B981;">
            <div style="font-weight: 600; margin-bottom: 6px;">Your CETHOS translator account</div>
            <div style="font-size: 13px; color: #374151; margin-bottom: 10px;">
              We've set up an account for you at <a href="https://tm.cethos.com" style="color: #0891B2;">tm.cethos.com</a>. There's no password — when you sign in, we'll email a 6-digit code to <code style="background: #fff; padding: 2px 6px; border: 1px solid #E5E7EB; border-radius: 3px;">${escHtml(app.email)}</code>. The "Open my test" button below uses a one-click link so you don't have to type the code today.
            </div>
          </div>`
        : `
          <div style="margin: 0 0 16px; font-size: 13px; color: #6B7280;">
            Sign in at <a href="https://tm.cethos.com" style="color: #0891B2;">tm.cethos.com</a> with <code style="background: #fff; padding: 2px 6px; border: 1px solid #E5E7EB; border-radius: 3px;">${escHtml(app.email)}</code> — we'll email you a 6-digit code. Or use the one-click "Open my test" button below.
          </div>`;

      const fullBodyHtml = accountBlockHtml + testLinksHtml;

      const tpl = buildV3TestInvitation({
        fullName: app.full_name,
        applicationNumber: app.application_number,
        testCount: assigned.length,
        testLinksHtml: fullBodyHtml,
        // Token actually lives 10 days (see tokenExpiresAt above). The
        // template text reads "expires in X hours" — render as 240h so the
        // applicant isn't misled into thinking they have 2 days.
        expiryHours: 240,
      });
      await sendMailgunEmail({
        to: { email: app.email, name: app.full_name },
        cc: body.cc,
        bcc: body.bcc,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        respectDoNotContactFor: app.email,
        tags: ["v3-test-invitation", applicationId],
        trackContext: {
          applicationId,
          templateTag: "v3-test-invitation",
          staffUserId: body.staffId,
        },
      });
    }

    return jsonResponse({
      success: true,
      data: {
        applicationId,
        testsAssigned: assigned.length,
        noTestAvailable: noTestAvailable.length,
        tokens: assigned.map((a) => a.token),
        tmFailures,
      },
    });
  } catch (err) {
    console.error("Unhandled error in cvp-send-tests:", err);
    return jsonResponse(
      { success: false, error: "An unexpected error occurred." },
      500
    );
  }
});
