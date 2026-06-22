// send-vendor-po
// VERSION: 1.0.0 — Emails a vendor Purchase Order PDF (from the vendor-pos bucket)
// to the vendor via Brevo. Mirrors the send-invoice-email pattern.
//
// POST { po_id }  OR  { workflow_step_id, vendor_id }
//   -> downloads the stored PO PDF, emails it to vendors.email (+ additional_emails;
//      agency contact name in the greeting), marks the PO status='sent'.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (d: Record<string, unknown>, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const fmtDate = (d: unknown) => { if (!d) return "-"; try { return new Date(d as string).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }); } catch { return "-"; } };
const money = (n: unknown, c = "USD") => `${c === "CAD" ? "C$" : c === "EUR" ? "€" : "$"}${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json();

    // ── Locate the PO ──
    let q = sb.from("vendor_purchase_orders").select("*");
    if (body.po_id) q = q.eq("id", body.po_id);
    else if (body.workflow_step_id && body.vendor_id) q = q.eq("workflow_step_id", body.workflow_step_id).eq("vendor_id", body.vendor_id);
    else throw new Error("po_id, or workflow_step_id + vendor_id, required");
    const { data: po } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!po) throw new Error("PO not found — generate it first");
    if (!po.pdf_storage_path) throw new Error("PO has no PDF — generate it first");

    // ── Recipient(s) ──
    const { data: vendor } = await sb.from("vendors")
      .select("full_name, business_name, email, additional_emails, vendor_type, agency_primary_contact_name").eq("id", po.vendor_id).single();
    if (!vendor?.email) throw new Error("Vendor has no email on file");
    const to = [{ email: vendor.email, name: vendor.business_name || vendor.full_name || vendor.email }];
    const extras: string[] = Array.isArray(vendor.additional_emails) ? vendor.additional_emails : (typeof vendor.additional_emails === "string" && vendor.additional_emails ? [vendor.additional_emails] : []);
    for (const e of extras) if (e && e !== vendor.email) to.push({ email: e, name: vendor.business_name || vendor.full_name || e });
    const greetName = vendor.vendor_type === "agency" ? (vendor.agency_primary_contact_name || vendor.business_name || "Partner") : (vendor.full_name || "Partner");

    // ── PDF ──
    const { data: pdfData, error: dErr } = await sb.storage.from("vendor-pos").download(po.pdf_storage_path);
    if (dErr || !pdfData) throw new Error(`Failed to fetch PO PDF: ${dErr?.message}`);
    const buf = new Uint8Array(await pdfData.arrayBuffer());
    let bin = ""; for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
    const pdfBase64 = btoa(bin);

    // ── Email body ──
    const langPair = po.source_language && po.target_language ? `${esc(po.source_language)} &gt; ${esc(po.target_language)}` : "";
    const html = `<!DOCTYPE html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <div style="background:#0C2340;padding:24px 32px;"><span style="color:#ffffff;font-size:18px;font-weight:700;">CETHOS</span>
      <span style="color:#0891B2;font-size:13px;font-weight:600;float:right;padding-top:4px;">PURCHASE ORDER</span></div>
    <div style="padding:28px 32px;color:#1e293b;">
      <p style="font-size:15px;margin:0 0 16px;">Hi ${esc(greetName)},</p>
      <p style="font-size:14px;color:#475569;margin:0 0 20px;">Thank you for accepting this assignment. Your Purchase Order is attached. Please quote the PO number on your invoice.</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
        <tr><td style="color:#64748b;padding:5px 0;">PO Number</td><td style="text-align:right;font-weight:700;color:#0C2340;">${esc(po.po_number)}</td></tr>
        <tr><td style="color:#64748b;padding:5px 0;">Assignment</td><td style="text-align:right;">${esc(po.step_name || "")}${po.service ? " &middot; " + esc(po.service) : ""}</td></tr>
        ${langPair ? `<tr><td style="color:#64748b;padding:5px 0;">Languages</td><td style="text-align:right;">${langPair}</td></tr>` : ""}
        <tr><td style="color:#64748b;padding:5px 0;">Deadline</td><td style="text-align:right;">${fmtDate(po.deadline)}</td></tr>
        <tr><td style="color:#64748b;padding:8px 0;border-top:1px solid #e2e8f0;">Amount Payable</td><td style="text-align:right;font-weight:700;color:#0e7490;border-top:1px solid #e2e8f0;padding-top:8px;">${money(po.total, po.currency)}</td></tr>
      </table>
      <p style="font-size:13px;color:#64748b;margin:0;">Please deliver via the Cethos vendor portal. Questions? <a href="mailto:accounts@cethos.com" style="color:#0891B2;">accounts@cethos.com</a></p>
    </div>
    <div style="background:#f1f5f9;padding:14px 32px;text-align:center;"><p style="margin:0;font-size:11px;color:#94a3b8;">Cethos Translation Services &middot; www.cethos.com</p></div>
  </div></body></html>`;

    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    if (!BREVO_API_KEY) throw new Error("BREVO_API_KEY not configured");
    const payload = {
      sender: { name: "CETHOS Translation Services", email: "donotreply@cethos.com" },
      to, replyTo: { email: "accounts@cethos.com" },
      subject: `Purchase Order ${po.po_number} — ${money(po.total, po.currency)} — ${po.step_name || "Assignment"}`,
      htmlContent: html,
      attachment: [{ content: pdfBase64, name: `${po.po_number}.pdf`, type: "application/pdf" }],
    };
    const res = await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const sentTo = to.map((t) => t.email).join(", ");
    if (!res.ok) {
      const errText = await res.text();
      await sb.from("vendor_purchase_orders").update({ status: "error", error: errText, updated_at: new Date().toISOString() }).eq("id", po.id);
      throw new Error(`Brevo send failed: ${errText}`);
    }
    await sb.from("vendor_purchase_orders").update({ status: "sent", sent_at: new Date().toISOString(), emailed_to: sentTo, error: null, updated_at: new Date().toISOString() }).eq("id", po.id);

    return json({ success: true, po_number: po.po_number, sent_to: sentTo });
  } catch (e) {
    console.error("send-vendor-po error:", (e as Error).message);
    return json({ success: false, error: (e as Error).message }, 400);
  }
});
