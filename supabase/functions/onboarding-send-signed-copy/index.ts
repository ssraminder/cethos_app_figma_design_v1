// ============================================================================
// onboarding-send-signed-copy
//
// For each external contractor who has a current onboarding signature, this:
//   1. renders a PDF of the signing audit + the exact signed agreement snapshot,
//   2. stores it in the contractor's profile (vendor-declarations bucket +
//      vendor_nda_signatures.signed_pdf_storage_path),
//   3. emails the PDF to the contractor via Brevo.
// It only ever uses the contractor's own signed_html_snapshot — never a substitute.
//
// POST /functions/v1/onboarding-send-signed-copy
// Body:
//   dry_run?: boolean        — report recipients, generate/store/send nothing
//   vendor_ids?: string[]    — limit to specific vendors (else all signed)
//   test_email?: string      — email the FIRST matching contractor's REAL copy to
//                              this address (preview); still stores the PDF on file
//   force_resend?: boolean   — ignore the 30-day dedup window
// Deploy with --no-verify-jwt.
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { renderAgreementPdf, type AuditField } from "../_shared/agreement-pdf.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const EVENT_TYPE = "onboarding_signed_copy";
const DEDUP_DAYS = 30;
const BUCKET = "vendor-declarations";

function json(b: Record<string, unknown>, s = 200): Response {
  return new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
}
function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

interface Sig {
  id: string;
  vendor_id: string;
  signed_full_name: string;
  signed_email: string | null;
  signed_at: string;
  signer_ip: string | null;
  signer_user_agent: string | null;
  signed_html_snapshot: string;
  verification_log: Record<string, unknown> | null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);
  try {

  let body: { dry_run?: boolean; vendor_ids?: string[]; test_email?: string; force_resend?: boolean; store_only?: boolean } = {};
  try { body = await req.json(); } catch { /* */ }

  const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const BREVO = Deno.env.get("BREVO_API_KEY");

  let q = sb.from("vendor_nda_signatures")
    .select("id, vendor_id, signed_full_name, signed_email, signed_at, signer_ip, signer_user_agent, signed_html_snapshot, verification_log")
    .eq("is_current", true).eq("agreement_type", "onboarding");
  if (body.vendor_ids && body.vendor_ids.length > 0) q = q.in("vendor_id", body.vendor_ids);
  const { data: sigs, error } = await q;
  if (error) return json({ success: false, error: error.message }, 500);
  const signatures = (sigs ?? []) as Sig[];
  if (signatures.length === 0) return json({ success: true, data: { recipients: 0, sent: 0, note: "no signed onboarding packages match" } });

  const vids = signatures.map((s) => s.vendor_id);
  const { data: pkgs } = await sb.from("vendor_onboarding_packages")
    .select("vendor_id, reference_code").eq("is_current", true).in("vendor_id", vids);
  const refByVendor = new Map<string, string | null>();
  for (const p of pkgs ?? []) refByVendor.set((p as { vendor_id: string }).vendor_id, (p as { reference_code: string | null }).reference_code);

  const recently = new Set<string>();
  if (!body.force_resend && !body.test_email) {
    const since = new Date(Date.now() - DEDUP_DAYS * 864e5).toISOString();
    const { data: rec } = await sb.from("notification_log").select("recipient_id")
      .eq("event_type", EVENT_TYPE).gte("created_at", since).not("recipient_id", "is", null);
    for (const r of rec ?? []) { const id = (r as { recipient_id: string | null }).recipient_id; if (id) recently.add(id); }
  }

  if (body.dry_run) {
    return json({ success: true, data: { dry_run: true, recipients: signatures.length,
      sample: signatures.slice(0, 25).map((s) => ({ ref: refByVendor.get(s.vendor_id), email: s.signed_email, already_sent: recently.has(s.vendor_id) })) } });
  }
  if (!BREVO) return json({ success: false, error: "BREVO_API_KEY not configured" }, 500);

  function auditFields(sig: Sig, ref: string | null): AuditField[] {
    const method = String((sig.verification_log ?? {}).method ?? "portal_clickwrap");
    return [
      { label: "Signed by", value: sig.signed_full_name },
      { label: "Email", value: sig.signed_email ?? "-" },
      { label: "Reference", value: ref ?? "-" },
      { label: "Signed at (UTC)", value: new Date(sig.signed_at).toUTCString() },
      { label: "Signature ID", value: sig.id },
      { label: "IP address", value: sig.signer_ip ?? "-" },
      { label: "Device", value: sig.signer_user_agent ?? "-" },
      { label: "Method", value: method },
    ];
  }

  // Render PDF + store on the contractor's profile. Returns the storage path.
  async function buildAndStore(sig: Sig, ref: string | null): Promise<{ pdf: Uint8Array; path: string | null }> {
    const pdf = await renderAgreementPdf({
      docTitle: "Onboarding & Compliance Package - Signed Copy",
      referenceCode: ref,
      auditFields: auditFields(sig, ref),
      snapshotHtml: sig.signed_html_snapshot,
    });
    const path = `${sig.vendor_id}/onboarding-signed-${sig.id}.pdf`;
    const { error: upErr } = await sb.storage.from(BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: true });
    let storedPath: string | null = null;
    if (!upErr) {
      storedPath = path;
      const { error: updErr } = await sb.from("vendor_nda_signatures").update({ signed_pdf_storage_path: path }).eq("id", sig.id);
      if (updErr) console.error("signed_pdf_storage_path update failed", sig.id, updErr.message);
    } else {
      console.error("signed-copy upload failed", sig.id, upErr.message);
    }
    return { pdf, path: storedPath };
  }

  async function emailPdf(sig: Sig, ref: string | null, pdf: Uint8Array, toEmail: string): Promise<boolean> {
    const fname = `Cethos-Onboarding-Signed-${ref ?? "package"}-${sig.signed_at.slice(0, 10)}.pdf`;
    const firstName = (sig.signed_full_name || "").split(" ")[0] || "there";
    const cover = `<!doctype html><html><body style="font-family:Arial,sans-serif;font-size:14px;color:#111827;line-height:1.6">
<p>Hi ${esc(firstName)},</p>
<p>Thank you - your <strong>Onboarding &amp; Compliance Package</strong> with Cethos is now signed and on file.</p>
<p>Attached (PDF) is your <strong>signed copy together with the signing audit log</strong> - signatory, timestamp, IP,
device and method - for your records.</p>
<p>If anything looks incorrect, reply to this email or write to <a href="mailto:vm@cethos.com">vm@cethos.com</a>.</p>
<p>Thank you,<br/>Vendor Management<br/>Cethos Solutions Inc.</p></body></html>`;
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": BREVO!, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        to: [{ email: toEmail, name: sig.signed_full_name }],
        sender: { name: "Cethos Vendor Management", email: "donotreply@cethos.com" },
        replyTo: { email: "vm@cethos.com", name: "Cethos Vendor Manager" },
        subject: "Your signed Cethos onboarding package + audit log",
        htmlContent: cover,
        attachment: [{ name: fname, content: bytesToB64(pdf) }],
        tags: ["onboarding-signed-copy"],
      }),
    });
    return res.ok;
  }

  // Test mode: build + store the first contractor's real PDF, email the preview.
  if (body.test_email) {
    const sig = signatures[0];
    const ref = refByVendor.get(sig.vendor_id) ?? null;
    const { pdf, path } = await buildAndStore(sig, ref);
    const ok = await emailPdf(sig, ref, pdf, body.test_email);
    return json({ success: ok, data: { test: true, sent_to: body.test_email, contractor: ref, stored_path: path, pdf_bytes: pdf.length } });
  }

  let sent = 0, stored = 0; const errors: string[] = [];
  for (const sig of signatures) {
    const ref = refByVendor.get(sig.vendor_id) ?? null;
    try {
      const { pdf, path } = await buildAndStore(sig, ref);
      if (path) stored++;
      if (body.store_only) {
        await sb.from("notification_log").insert({
          event_type: EVENT_TYPE, recipient_type: "vendor", recipient_email: sig.signed_email,
          recipient_name: sig.signed_full_name, recipient_id: sig.vendor_id,
          subject: "Signed copy stored on file (not emailed)",
          status: "stored",
          metadata: { reference_code: ref, signature_id: sig.id, stored_path: path },
        });
        continue;
      }
      if (recently.has(sig.vendor_id)) continue;
      if (!sig.signed_email) { errors.push(`${ref}: no email`); continue; }
      const ok = await emailPdf(sig, ref, pdf, sig.signed_email);
      await sb.from("notification_log").insert({
        event_type: EVENT_TYPE, recipient_type: "vendor", recipient_email: sig.signed_email,
        recipient_name: sig.signed_full_name, recipient_id: sig.vendor_id,
        subject: "Your signed Cethos onboarding package + audit log",
        status: ok ? "sent" : "failed",
        metadata: { reference_code: ref, signature_id: sig.id, stored_path: path },
      });
      if (ok) sent++; else errors.push(`${sig.signed_email}: send failed`);
    } catch (e) {
      errors.push(`${ref}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return json({ success: true, data: { recipients: signatures.length, sent, stored, failed: errors.length, errors: errors.slice(0, 20) } });
  } catch (e) {
    console.error("onboarding-send-signed-copy error:", e);
    return json({ success: false, error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? (e.stack || "").slice(0, 1000) : undefined }, 500);
  }
});
