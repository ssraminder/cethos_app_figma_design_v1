import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface TestSubmissionRow {
  id: string;
  combination_id: string;
  test_id: string;
  application_id: string;
  token: string;
  token_expires_at: string;
  status: string;
  draft_content: string | null;
  draft_last_saved_at: string | null;
  first_viewed_at: string | null;
  view_count: number;
  submitted_at: string | null;
}

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
  lqa_source_translation: string | null;
  mqm_dimensions_enabled: string[];
}

interface LanguageRow {
  name: string;
  code: string | null;
}

const RTL_CODES = new Set([
  "ar", "ar-EG", "ar-SA", "ar-LB", "ar-MA",
  "he", "fa", "prs", "ps", "ur", "ckb", "yi",
]);

function isRtlCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return RTL_CODES.has(code) || code.startsWith("ar-");
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * cvp-get-test
 *
 * Validates a test token and returns the test content for the applicant.
 * Called when the applicant visits join.cethos.com/test/{token}.
 *
 * Payload: { token: string }
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

    const { token } = await req.json();
    if (!token) {
      return jsonResponse(
        { success: false, error: "Token is required" },
        400
      );
    }

    // Fetch test submission by token
    const { data: submission, error: subError } = await supabase
      .from("cvp_test_submissions")
      .select("*")
      .eq("token", token)
      .single();

    if (subError || !submission) {
      return jsonResponse(
        { success: false, error: "Invalid test link. Please check your email for the correct link." },
        404
      );
    }

    const sub = submission as unknown as TestSubmissionRow;

    // Check if already submitted
    if (sub.status === "submitted" || sub.status === "assessed") {
      return jsonResponse(
        {
          success: false,
          error: "already_submitted",
          message: "This test has already been submitted. You can only submit once per test.",
        },
        400
      );
    }

    // Check if expired
    const now = new Date();
    const expiresAt = new Date(sub.token_expires_at);
    if (now > expiresAt || sub.status === "expired") {
      // Mark as expired if not already
      if (sub.status !== "expired") {
        await supabase
          .from("cvp_test_submissions")
          .update({ status: "expired", updated_at: now.toISOString() })
          .eq("id", sub.id);
      }
      return jsonResponse(
        {
          success: false,
          error: "token_expired",
          message: "This test link has expired. Please contact us if you need a new link.",
        },
        400
      );
    }

    // Fetch the test content from library
    const { data: test, error: testError } = await supabase
      .from("cvp_test_library")
      .select(
        "id, title, source_language_id, target_language_id, domain, service_type, difficulty, source_text, source_file_path, instructions, lqa_source_translation, mqm_dimensions_enabled"
      )
      .eq("id", sub.test_id)
      .single();

    if (testError || !test) {
      console.error("Error fetching test from library:", testError);
      return jsonResponse(
        { success: false, error: "Test content not found. Please contact support." },
        500
      );
    }

    const testData = test as unknown as TestLibraryRow;

    // Fetch language names
    const { data: srcLang } = await supabase
      .from("languages")
      .select("name, code")
      .eq("id", testData.source_language_id)
      .single();
    const { data: tgtLang } = await supabase
      .from("languages")
      .select("name, code")
      .eq("id", testData.target_language_id)
      .single();

    const sourceLangRow = srcLang as unknown as LanguageRow | null;
    const targetLangRow = tgtLang as unknown as LanguageRow | null;
    const sourceLangName = sourceLangRow?.name ?? "Unknown";
    const targetLangName = targetLangRow?.name ?? "Unknown";
    const sourceLangCode = sourceLangRow?.code ?? null;
    const targetLangCode = targetLangRow?.code ?? null;

    // Fetch applicant name for the page
    const { data: appData } = await supabase
      .from("cvp_applications")
      .select("full_name")
      .eq("id", sub.application_id)
      .single();

    const applicantName = (appData as Record<string, unknown> | null)?.full_name as string ?? "";

    // Track view: update first_viewed_at if first visit, increment view_count
    const updateData: Record<string, unknown> = {
      view_count: sub.view_count + 1,
      updated_at: now.toISOString(),
    };
    if (!sub.first_viewed_at) {
      updateData.first_viewed_at = now.toISOString();
      updateData.status = "viewed";
    }
    await supabase
      .from("cvp_test_submissions")
      .update(updateData)
      .eq("id", sub.id);

    // Calculate remaining time
    const remainingMs = expiresAt.getTime() - now.getTime();
    const remainingHours = Math.max(0, Math.floor(remainingMs / (1000 * 60 * 60)));
    const remainingMinutes = Math.max(
      0,
      Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60))
    );

    // Build response — never expose reference_translation or lqa_answer_key
    const responseData: Record<string, unknown> = {
      submissionId: sub.id,
      token: sub.token,
      serviceType: testData.service_type,
      domain: testData.domain,
      difficulty: testData.difficulty,
      sourceLanguage: sourceLangName,
      targetLanguage: targetLangName,
      sourceLanguageCode: sourceLangCode,
      targetLanguageCode: targetLangCode,
      sourceLanguageRtl: isRtlCode(sourceLangCode),
      targetLanguageRtl: isRtlCode(targetLangCode),
      sourceText: testData.source_text,
      sourceFilePath: testData.source_file_path,
      instructions: testData.instructions,
      applicantName,
      expiresAt: sub.token_expires_at,
      remainingHours,
      remainingMinutes,
      draftContent: sub.draft_content,
      draftLastSavedAt: sub.draft_last_saved_at,
    };

    // LQA tests get the flawed translation to review + MQM dimensions
    if (testData.service_type === "lqa_review") {
      responseData.lqaSourceTranslation = testData.lqa_source_translation;
      responseData.mqmDimensionsEnabled = testData.mqm_dimensions_enabled;
    }

    return jsonResponse({
      success: true,
      data: responseData,
    });
  } catch (err) {
    console.error("Unhandled error in cvp-get-test:", err);
    return jsonResponse(
      { success: false, error: "An unexpected error occurred." },
      500
    );
  }
});
