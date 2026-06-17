/**
 * cvp-get-cv-url
 */
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { requireStaff } from "../_shared/require-staff.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  const authed = await requireStaff(req);
  if (!authed.ok) return json({ success: false, error: authed.error }, authed.status);

  let body: { applicationId?: string; expirySeconds?: number };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "invalid_json" }, 400);
  }
  if (!body.applicationId) return json({ success: false, error: "applicationId_required" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: app, error: appErr } = await supabase
    .from("cvp_applications")
    .select("id, cv_storage_path, full_name")
    .eq("id", body.applicationId)
    .maybeSingle();
  if (appErr) return json({ success: false, error: appErr.message }, 500);
  if (!app) return json({ success: false, error: "application_not_found" }, 404);
  const path = (app.cv_storage_path as string | null) ?? null;
  if (!path) return json({ success: false, error: "no_cv_on_file" }, 404);

  const expiry = Math.min(Math.max(Number(body.expirySeconds ?? 300), 60), 3600);
  const { data, error } = await supabase.storage.from("cvp-applicant-cvs").createSignedUrl(path, expiry, {
    download: `CV-${String(app.full_name ?? "applicant").replace(/[^\w\-]+/g, "_")}.pdf`,
  });
  if (error || !data?.signedUrl) return json({ success: false, error: error?.message ?? "signed_url_failed" }, 500);
  const { data: inlineData } = await supabase.storage.from("cvp-applicant-cvs").createSignedUrl(path, expiry);

  return json({
    success: true,
    data: {
      signedUrl: data.signedUrl,
      previewUrl: inlineData?.signedUrl ?? data.signedUrl,
      path,
      filename: path.split("/").pop() ?? "cv.pdf",
      expiresInSeconds: expiry,
    },
  });
});
