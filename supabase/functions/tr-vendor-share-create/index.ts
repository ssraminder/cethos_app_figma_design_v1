// ============================================================================
// tr-vendor-share-create — staff creates a tokenized share link for a
// translator (or other recipient) to view the QM job, read comments, post
// replies, and upload a new version of the target file. Emails the link
// via Brevo and logs to notification_log.
//
// Input: { job_id, recipient_email, recipient_name?, recipient_kind?,
//          expires_in_days?, message? }
// Output: { token_id, token, share_url, expires_at }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { CORS, json, serviceClient, actorFromRequest, writeAudit, tr } from "../_shared/tr.ts";
import {
  callout,
  ctaButton,
  emailShell,
  esc as escShell,
  eyebrow,
  hint,
  lead,
  REPLY,
  title,
  type TemplateMeta,
} from "../_shared/email-shell.ts";

const TEMPLATE: TemplateMeta = {
  name: "Translation Review — Share",
  version: "2.0",
  updatedAt: "2026-05-28",
};

const ADMIN_PORTAL_URL = Deno.env.get("ADMIN_PORTAL_URL") || "https://portal.cethos.com";

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const esc = (s: string | null | undefined): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const body = await req.json();
    const job_id = body.job_id as string;
    const recipient_email = (body.recipient_email as string | undefined)?.trim().toLowerCase();
    const recipient_name = (body.recipient_name as string | undefined)?.trim() || null;
    const recipient_kind = (body.recipient_kind as string | undefined) || "vendor";
    const message = (body.message as string | undefined)?.trim() || null;
    const expires_in_days = Math.max(1, Math.min(90, Number(body.expires_in_days ?? 30)));
    // Optional CCs — accept array of strings or comma-separated string.
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
    if (!job_id || !recipient_email) return json({ error: "job_id and recipient_email required" }, 400);

    const sb = serviceClient();
    const actor = await actorFromRequest(req, sb);
    if (!actor.id) return json({ error: "authenticated session required" }, 401);

    const { data: staff } = await sb
      .from("staff_users")
      .select("id, full_name, email")
      .eq("auth_user_id", actor.id)
      .maybeSingle();
    if (!staff) return json({ error: "staff record not found" }, 403);

    const { data: job } = await tr(sb)
      .from("review_jobs")
      .select("id, title, client_name, status")
      .eq("id", job_id)
      .maybeSingle();
    if (!job) return json({ error: "job not found" }, 404);

    const token = randomToken();
    const expires_at = new Date(Date.now() + expires_in_days * 86400 * 1000).toISOString();

    const { data: row, error: insertErr } = await tr(sb)
      .from("job_share_tokens")
      .insert({
        job_id,
        token,
        recipient_email,
        recipient_name,
        recipient_kind,
        expires_at,
        created_by: staff.id,
        created_by_name: staff.full_name ?? staff.email,
      })
      .select("id")
      .single();
    if (insertErr || !row) return json({ error: insertErr?.message ?? "token insert failed" }, 500);

    const share_url = `${ADMIN_PORTAL_URL}/tr/share/${token}`;
    const jobLabel = job.title || job.client_name || `QM job ${job_id.slice(0, 8)}`;

    // Best-effort email send. Audit + log regardless of outcome.
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    let emailStatus: "sent" | "failed" | "skipped" = "skipped";
    let brevoMsgId: string | null = null;
    let emailError: string | null = null;

    if (BREVO_API_KEY) {
      const subject = `Translation review: ${jobLabel}`;
      const firstName = (recipient_name || recipient_email || "there").trim().split(/\s+/)[0];
      const messageCallout = message
        ? callout({ tone: "info", title: "Message from the reviewer", body: escShell(message).replace(/\n/g, "<br />") })
        : "";
      const htmlContent = emailShell(
        [
          eyebrow("Translation review"),
          title(`${escShell(staff.full_name ?? "Cethos")} shared a translation review with you`),
          lead(
            `Hi ${escShell(firstName)}, this is a review request for <strong>${escShell(jobLabel)}</strong>. You can read the reviewer's comments, reply, and upload a new version of the file using the link below.`,
          ),
          messageCallout,
          ctaButton({ label: "Open review", url: share_url }),
          hint(`Link expires in ${expires_in_days} day${expires_in_days === 1 ? "" : "s"}. You received this because a Cethos reviewer shared a QM job with you — if you didn't expect it, you can ignore this email.`),
        ].join(""),
        { replyTo: REPLY.vendor, template: TEMPLATE, preheader: `Translation review for ${escShell(jobLabel)} — your input requested.` },
      );

      try {
        const res = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": BREVO_API_KEY,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            to: [{ email: recipient_email, name: recipient_name || recipient_email }],
            ...(cc_emails.length > 0 ? { cc: cc_emails.map((e) => ({ email: e })) } : {}),
            sender: { name: "Cethos Translation Services", email: "donotreply@cethos.com" },
            replyTo: { email: staff.email ?? "ops@cethos.com", name: staff.full_name ?? "Cethos Ops" },
            subject,
            htmlContent,
            tags: ["tr-vendor-share", `job-${job_id}`],
          }),
        });
        const result = await res.json().catch(() => ({} as any));
        if (!res.ok) {
          emailStatus = "failed";
          emailError = `Brevo ${res.status}: ${JSON.stringify(result).slice(0, 300)}`;
        } else {
          emailStatus = "sent";
          brevoMsgId = (result as any)?.messageId ?? null;
        }
      } catch (e: any) {
        emailStatus = "failed";
        emailError = e?.message || String(e);
      }
    }

    // Mirror the vendor-assignment pattern: log to public.notification_log.
    try {
      await sb.from("notification_log").insert({
        event_type: "tr_vendor_share",
        recipient_type: recipient_kind === "customer" ? "customer" : "vendor",
        recipient_email,
        recipient_name,
        order_id: null,
        step_id: null,
        subject: `Translation review: ${jobLabel}`,
        status: emailStatus === "sent" ? "sent" : "failed",
        error_message: emailError,
        metadata: {
          job_id,
          token_id: row.id,
          expires_at,
          brevo_message_id: brevoMsgId,
          cc_emails,
          via: "tr-vendor-share-create",
        },
      });
    } catch (e: any) {
      console.error("notification_log insert failed:", e?.message || e);
    }

    await writeAudit(sb, {
      job_id,
      action: "vendor_share_created",
      actor_id: actor.id,
      actor_email: actor.email,
      payload: {
        token_id: row.id,
        recipient_email,
        recipient_kind,
        cc_emails,
        expires_at,
        email_status: emailStatus,
      },
    });

    return json({ token_id: row.id, token, share_url, expires_at, email_status: emailStatus, cc_emails }, 201);
  } catch (err) {
    console.error("[tr-vendor-share-create] fatal:", err);
    return json({ error: String(err) }, 500);
  }
});
