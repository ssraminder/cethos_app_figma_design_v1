// ============================================================================
// cvp-request-documents v1.0
// Sends an applicant a "please send us these documents" email and logs it.
// Phase 1: templated email body assembled on the client side. The function
// just validates, sends via Brevo, and records to cvp_outbound_messages.
//
// Body: {
//   application_id: string,
//   subject: string,
//   body_html: string,         // pre-assembled by the admin UI
//   missing_doc_types: string[] // for the audit log
// }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendBrevoRawEmail } from "../_shared/brevo.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const {
      application_id,
      subject,
      body_html,
      missing_doc_types,
    }: {
      application_id?: string;
      subject?: string;
      body_html?: string;
      missing_doc_types?: string[];
    } = body;

    if (!application_id) return json({ error: "application_id required" }, 400);
    if (!subject?.trim()) return json({ error: "subject required" }, 400);
    if (!body_html?.trim()) return json({ error: "body_html required" }, 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: app, error: appErr } = await sb
      .from("cvp_applications")
      .select("id, email, full_name")
      .eq("id", application_id)
      .maybeSingle();
    if (appErr || !app) return json({ error: "application not found" }, 404);
    if (!app.email) return json({ error: "applicant has no email" }, 400);

    const ok = await sendBrevoRawEmail({
      to: [{ email: app.email, name: app.full_name ?? app.email }],
      subject: subject.trim(),
      htmlContent: body_html,
    });

    // Audit log — cvp_outbound_messages tracks every email we send to
    // applicants. template_tag stores the kind so we can filter later.
    if (ok) {
      await sb.from("cvp_outbound_messages").insert({
        application_id,
        recipient_email: app.email,
        subject: subject.trim(),
        body_html,
        template_tag: `document_request:${(missing_doc_types ?? []).join(",")}`.slice(0, 255),
        sent_at: new Date().toISOString(),
      });
    }

    if (!ok) return json({ error: "Brevo send failed" }, 502);
    return json({ success: true });
  } catch (err: any) {
    console.error("cvp-request-documents error:", err);
    return json({ error: err.message || "Internal error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
