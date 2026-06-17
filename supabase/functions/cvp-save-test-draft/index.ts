import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * cvp-save-test-draft
 *
 * Auto-saves draft content for a test submission without actually submitting.
 * Called every 60 seconds from the test page.
 *
 * Payload: { token: string, draftContent: string }
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

    const { token, draftContent } = await req.json();
    if (!token) {
      return jsonResponse(
        { success: false, error: "Token is required" },
        400
      );
    }

    if (typeof draftContent !== "string") {
      return jsonResponse(
        { success: false, error: "draftContent must be a string" },
        400
      );
    }

    // Fetch submission by token
    const { data: submission, error: subError } = await supabase
      .from("cvp_test_submissions")
      .select("id, status, token_expires_at")
      .eq("token", token)
      .single();

    if (subError || !submission) {
      return jsonResponse(
        { success: false, error: "Invalid token" },
        404
      );
    }

    // Cannot save draft for already submitted or expired tests
    if (submission.status === "submitted" || submission.status === "assessed") {
      return jsonResponse(
        { success: false, error: "Test already submitted" },
        400
      );
    }

    const now = new Date();
    if (now > new Date(submission.token_expires_at)) {
      return jsonResponse(
        { success: false, error: "Test token has expired" },
        400
      );
    }

    // Save draft
    const { error: updateError } = await supabase
      .from("cvp_test_submissions")
      .update({
        draft_content: draftContent,
        draft_last_saved_at: now.toISOString(),
        status: submission.status === "sent" || submission.status === "viewed"
          ? "draft_saved"
          : submission.status,
        updated_at: now.toISOString(),
      })
      .eq("id", submission.id);

    if (updateError) {
      console.error("Error saving draft:", updateError);
      return jsonResponse(
        { success: false, error: "Failed to save draft" },
        500
      );
    }

    return jsonResponse({
      success: true,
      data: {
        savedAt: now.toISOString(),
      },
    });
  } catch (err) {
    console.error("Unhandled error in cvp-save-test-draft:", err);
    return jsonResponse(
      { success: false, error: "An unexpected error occurred." },
      500
    );
  }
});
