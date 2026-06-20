// notify-application-fix-recovery
// One-off sender: notifies applicants whose submissions failed during the
// 2026-06-19/20 apply-form outage (application_number collision + jsonb ""),
// asking them to re-submit (their data was never saved). Omotola's note was a
// separate vendor-portal profile-photo fix, handled with its own message.
// Sends via Brevo directly from recruitment@cethos.com; best-effort audit log
// to cvp_outbound_messages. Body: { confirm: true } to actually send.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendBrevoRawEmail } from "../_shared/brevo.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: Record<string, unknown>, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SENDER = { email: "recruitment@cethos.com", name: "Cethos Recruitment Team" };
const APPLY_URL = "https://join.cethos.com/apply";

function resubmitHtml(greeting: string, middle: string, closing: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1f2937;line-height:1.55;max-width:560px;">
<p>${greeting}</p>
${middle}
<p>It's now fixed and the form is working normally. When you have a few minutes, could you please submit your application again here:</p>
<p><a href="${APPLY_URL}" style="color:#0F9DA0;font-weight:600;">${APPLY_URL}</a></p>
${closing}
<p style="margin-top:18px;">Warm regards,<br>The Cethos Recruitment Team</p>
</div>`;
}

const FAILED_SUBMIT_MIDDLE =
  `<p>If you saw a "Failed to submit application" error, that was a technical fault on our end — the form was rejecting some submissions before they were saved. It was nothing to do with the details you entered, but unfortunately it means your application didn't reach us.</p>`;

interface Msg { email: string; name: string; subject: string; html: string; tag: string; }

const MESSAGES: Msg[] = [
  {
    email: "ceciliapinnola@yahoo.com.ar",
    name: "Cecilia Pinnola",
    subject: "Your Cethos application — form issue fixed, please re-submit",
    tag: "application_fix_recovery",
    html: resubmitHtml(
      "Dear Cecilia,",
      `<p>Thank you for reaching out, and our apologies for the trouble with the application form. You did nothing wrong — we had a technical fault on our end that was causing the form to reject submissions before they were saved, which is why you kept seeing "Failed to submit application." Unfortunately it also means your application didn't reach us.</p>`,
      `<p>We're glad Amrita pointed you our way, and we're looking forward to reviewing your application for our English&#8596;Spanish COA and clinical work. If anything gives you trouble, just reply to this email and I'll help you directly.</p>`,
    ),
  },
  {
    email: "mvfconde@gmail.com",
    name: "Mariza Conde",
    subject: "Your Cethos application — form issue fixed, please re-submit",
    tag: "application_fix_recovery",
    html: resubmitHtml(
      "Dear Mariza,",
      `<p>Thank you for letting us know (via Amrita) about the error on our application form — and our apologies for the frustration.</p>${FAILED_SUBMIT_MIDDLE}`,
      `<p>Thank you for your patience — we're looking forward to receiving your application. If you hit any snag, just reply and I'll assist you directly.</p>`,
    ),
  },
  {
    email: "fionn.mackillop@icloud.com",
    name: "Fionn MacKillop",
    subject: "Your Cethos application — form issue fixed, please re-submit",
    tag: "application_fix_recovery",
    html: resubmitHtml(
      "Dear Fionn,",
      `<p>Thank you for trying to apply to join Cethos, and our apologies for the trouble.</p>${FAILED_SUBMIT_MIDDLE}`,
      `<p>We'd genuinely welcome your application for our translation &amp; review work. If anything doesn't work as expected, just reply to this email and I'll sort it out with you.</p>`,
    ),
  },
  {
    email: "omotola@elitelanguagecraft.com",
    name: "Omotola",
    subject: "Your profile setup — profile photo no longer required",
    tag: "profile_photo_fix",
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1f2937;line-height:1.55;max-width:560px;">
<p>Dear Omotola,</p>
<p>Thank you for flagging that the profile page was asking for a profile picture without giving you a way to upload one. You were right — that was our mistake.</p>
<p>We've corrected it: <strong>a profile photo is no longer part of completing your profile.</strong> When you log back in, that item will be gone, and you can finish the remaining steps (availability, language pairs, services &amp; rates, and your supporting documents) without it.</p>
<p>Apologies for the confusion, and thank you for taking the time to report it. If anything else looks off, just reply and I'll take a look.</p>
<p style="margin-top:18px;">Warm regards,<br>The Cethos Team</p>
</div>`,
  },
];

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  let body: { confirm?: boolean };
  try { body = await req.json(); } catch { body = {}; }

  if (!body.confirm) {
    return json({
      success: true,
      action: "preview",
      sender: SENDER,
      recipients: MESSAGES.map((m) => ({ email: m.email, name: m.name, subject: m.subject })),
      note: "Pass { confirm: true } to send.",
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const results: Array<Record<string, unknown>> = [];
  for (const m of MESSAGES) {
    let ok = false;
    try {
      ok = await sendBrevoRawEmail({
        to: [{ email: m.email, name: m.name }],
        subject: m.subject,
        htmlContent: m.html,
        sender: SENDER,
      });
    } catch (e) {
      results.push({ email: m.email, ok: false, error: String(e) });
      continue;
    }
    if (ok) {
      // Best-effort audit log. message_id is NOT NULL; application_id may be
      // null (these applicants have no saved application). Non-fatal on failure.
      try {
        await supabase.from("cvp_outbound_messages").insert({
          message_id: `app-fix-recovery:${m.tag}:${m.email}`,
          recipient_email: m.email,
          subject: m.subject,
          body_html: m.html,
          template_tag: m.tag,
          sent_at: new Date().toISOString(),
        });
      } catch (logErr) {
        console.error("audit log insert failed (non-fatal):", m.email, String(logErr));
      }
    }
    results.push({ email: m.email, ok, error: ok ? null : "brevo_send_failed" });
    await sleep(200);
  }

  return json({
    success: true,
    action: "send",
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
});
