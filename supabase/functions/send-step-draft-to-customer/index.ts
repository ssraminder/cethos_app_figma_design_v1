// ============================================================================
// send-step-draft-to-customer — sends the watermarked DRAFT PDF for a
// workflow step to the customer via Brevo (attached, not link). Logs to
// step_draft_sends so admin can see who/when/what.
//
// Two-phase usage:
//   1. Admin calls /generate-step-draft-pdf to produce the PDF (stored in
//      quote-files under workflows/<order>/<step>/drafts/).
//   2. Admin previews subject/body in the UI, then calls this fn with
//      the storage path the generator returned.
//
// Input:
//   { step_id, pdf_storage_path, subject, body_html?, body_text?,
//     recipient_email, recipient_name?, cc_emails?, attachment_filename? }
// Output: { sent_id, email_status, brevo_message_id?, error? }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  callout,
  emailShell,
  esc as escShell,
  hint,
  lead,
  REPLY,
  title,
  type TemplateMeta,
} from "../_shared/email-shell.ts";

const TEMPLATE: TemplateMeta = {
  name: "Customer — Step Draft (PDF attached)",
  version: "2.0",
  updatedAt: "2026-05-28",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const BUCKET = "quote-files";

const esc = (s: string | null | undefined): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );

// DEPRECATED 2026-05-20: superseded by the existing draft_translation flow
// in AdminOrderDetail (promote-step-delivery-to-draft → "Send Selected to
// Customer" → review-draft-file). That path emails a branded notification
// with a customer-dashboard review link instead of a raw PDF attachment,
// and records customer responses in file_review_history. Left here in
// case anything still calls it; new code should not.

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const body = await req.json();
    const step_id = body.step_id as string;
    const pdf_storage_path = body.pdf_storage_path as string;
    const subject = (body.subject as string | undefined)?.trim();
    const body_html = (body.body_html as string | undefined) || null;
    const body_text = (body.body_text as string | undefined) || null;
    const recipient_email = (body.recipient_email as string | undefined)?.trim().toLowerCase();
    const recipient_name = (body.recipient_name as string | undefined)?.trim() || null;
    const ccRaw = body.cc_emails;
    const ccCandidates: string[] = Array.isArray(ccRaw)
      ? ccRaw
      : typeof ccRaw === "string"
        ? ccRaw.split(/[,;\s]+/)
        : [];
    const cc_emails = Array.from(
      new Set(
        ccCandidates
          .map((s) => String(s || "").trim().toLowerCase())
          .filter((s) => s && s !== recipient_email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)),
      ),
    );
    const attachment_filename = (body.attachment_filename as string | undefined)?.trim() || "DRAFT.pdf";

    if (!step_id || !pdf_storage_path || !subject || !recipient_email) {
      return json({ error: "step_id, pdf_storage_path, subject, recipient_email required" }, 400);
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Identify the calling staff for sent_by / replyTo.
    let staff: { id: string | null; full_name: string | null; email: string | null } = {
      id: null, full_name: null, email: null,
    };
    try {
      const auth = req.headers.get("authorization") || "";
      const token = auth.replace(/^Bearer\s+/i, "");
      if (token) {
        const { data: userData } = await sb.auth.getUser(token);
        if (userData?.user?.id) {
          const { data: st } = await sb
            .from("staff_users")
            .select("id, full_name, email")
            .eq("auth_user_id", userData.user.id)
            .maybeSingle();
          if (st) staff = { id: st.id, full_name: st.full_name ?? null, email: st.email ?? null };
        }
      }
    } catch {
      /* best-effort */
    }

    // Verify the step exists.
    const { data: step } = await sb
      .from("order_workflow_steps")
      .select("id, order_id, name, final_delivery_id")
      .eq("id", step_id)
      .maybeSingle();
    if (!step) return json({ error: "step not found" }, 404);

    // Download the PDF for the Brevo attachment payload.
    const { data: pdfBlob, error: downloadErr } = await sb.storage.from(BUCKET).download(pdf_storage_path);
    if (downloadErr || !pdfBlob) {
      return json({ error: `failed to read PDF: ${downloadErr?.message || "empty"}` }, 500);
    }
    const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());

    // base64 encode the bytes — Brevo expects content as base64.
    let bin = "";
    for (let i = 0; i < pdfBytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, Array.from(pdfBytes.subarray(i, i + 0x8000)));
    }
    const pdfBase64 = btoa(bin);

    // Staff can override with body_html (eg. from a template editor). Otherwise
    // we render the default shell with optional body_text in an info Callout.
    const firstName = (recipient_name || recipient_email || "").trim().split(/\s+/)[0] || "there";
    const noteCallout = body_text
      ? callout({ tone: "info", title: "Note from our team", body: escShell(body_text).replace(/\n/g, "<br />") })
      : "";
    const htmlContent = body_html
      ? body_html
      : emailShell(
        [
          title("Draft translation for your review"),
          lead(
            `Hi ${escShell(firstName)}, please find the draft translation attached. The watermark on each page indicates it is a draft pending your sign-off — once approved we will finalize and remove the watermark.`,
          ),
          noteCallout,
          hint(`Reply to this email with any corrections, or confirm to proceed.`),
        ].join(""),
        { replyTo: REPLY.customer, template: TEMPLATE, preheader: `Draft translation attached — please review.` },
      );

    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    let emailStatus: "sent" | "failed" = "failed";
    let brevoMsgId: string | null = null;
    let emailError: string | null = null;

    if (!BREVO_API_KEY) {
      emailError = "BREVO_API_KEY not configured";
    } else {
      const payload: Record<string, unknown> = {
        to: [{ email: recipient_email, name: recipient_name || recipient_email }],
        sender: { name: "Cethos Translation Services", email: "donotreply@cethos.com" },
        replyTo: { email: staff.email ?? "ops@cethos.com", name: staff.full_name ?? "Cethos Ops" },
        subject,
        htmlContent,
        attachment: [{ content: pdfBase64, name: attachment_filename }],
        tags: ["step-draft-to-customer", `step-${step_id}`],
      };
      if (cc_emails.length > 0) payload.cc = cc_emails.map((e) => ({ email: e }));

      try {
        const res = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": BREVO_API_KEY,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        });
        const result = await res.json().catch(() => ({} as any));
        if (!res.ok) {
          emailStatus = "failed";
          emailError = `Brevo ${res.status}: ${JSON.stringify(result).slice(0, 400)}`;
        } else {
          emailStatus = "sent";
          brevoMsgId = (result as any)?.messageId ?? null;
        }
      } catch (e: any) {
        emailStatus = "failed";
        emailError = e?.message || String(e);
      }
    }

    // Log to step_draft_sends regardless of outcome.
    const { data: sendRow } = await sb
      .from("step_draft_sends")
      .insert({
        step_id,
        delivery_id: step.final_delivery_id,
        pdf_storage_path,
        pdf_bytes: pdfBytes.byteLength,
        recipient_email,
        recipient_name,
        cc_emails,
        subject,
        body_html: htmlContent,
        email_status: emailStatus,
        brevo_message_id: brevoMsgId,
        error_message: emailError,
        sent_by: staff.id,
        sent_by_name: staff.full_name,
      })
      .select("id")
      .single();

    return json({
      sent_id: sendRow?.id ?? null,
      email_status: emailStatus,
      brevo_message_id: brevoMsgId,
      error: emailError,
    }, emailStatus === "sent" ? 201 : 500);
  } catch (err: any) {
    console.error("[send-step-draft-to-customer] fatal:", err);
    return json({ error: err?.message || String(err) }, 500);
  }
});
