// notify-roster-guide-email — one-off announcement to agency vendors about the
// new Linguist Roster + training guide. Sends via Brevo to a SMALL, explicit
// recipient list (staff-supplied), throttled. Staff-gated.
//
// Body: { recipients: [{email, name?}], staff_id }
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendBrevoRawEmail } from "../_shared/brevo.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (d: Record<string, unknown>, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const SUBJECT = "New: build your Linguist Roster on the Cethos vendor portal";

function htmlBody(name: string | null): string {
  const hi = name ? `Hello ${name},` : "Hello,";
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;font-size:15px;line-height:1.6;max-width:560px">
    <div style="border-bottom:2px solid #0F9DA0;padding-bottom:10px;margin-bottom:18px">
      <img src="https://lmzoyezvsjgsxveoakdr.supabase.co/storage/v1/object/public/web-assets/png_logo_cethos_light_bg.png" alt="CETHOS" style="height:28px"/>
    </div>
    <p>${hi}</p>
    <p>We&rsquo;ve added a <strong>Linguist Roster</strong> to the Cethos vendor portal. As an agency, you can now record the subcontractor linguists you assign to our projects &mdash; their language pairs, specializations and competence basis &mdash; and simply <strong>select the linguist who performed each step when you deliver</strong>. This keeps our work compliant with ISO 17100 competence traceability.</p>
    <p>Your roster is private: Cethos only ever sees an opaque handle and readiness flag &mdash; never the real name, CV, or evidence files.</p>
    <p>We&rsquo;ve published a short step-by-step guide. To read it:</p>
    <ul>
      <li>Sign in to the vendor portal and open <strong>Profile &rarr; Guides &amp; Manuals</strong>, or</li>
      <li>Open your <strong>Linguist Roster</strong> page and click the guide link at the top.</li>
    </ul>
    <p style="margin:22px 0">
      <a href="https://vendor.cethos.com/profile" style="background:#0F9DA0;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;display:inline-block">Open the vendor portal &rarr;</a>
    </p>
    <p style="color:#6b7280;font-size:13px">Don&rsquo;t have portal access yet? Reply to this email or contact <a href="mailto:support@cethos.com">support@cethos.com</a>.</p>
    <p>Thank you,<br/>The Cethos Team</p>
  </div>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { recipients, staff_id } = await req.json().catch(() => ({}));
    if (!staff_id) return json({ success: false, error: "staff_id required" }, 401);
    if (!Array.isArray(recipients) || recipients.length === 0) return json({ success: false, error: "recipients required" }, 400);
    if (recipients.length > 50) return json({ success: false, error: "too_many_recipients" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: staff } = await sb.from("staff_users").select("id, is_active").eq("id", staff_id).maybeSingle();
    if (!staff || staff.is_active === false) return json({ success: false, error: "not authorised" }, 401);

    const results: Array<{ email: string; ok: boolean }> = [];
    for (const r of recipients) {
      const email = String(r?.email ?? "").trim();
      if (!email) continue;
      const ok = await sendBrevoRawEmail({
        to: [{ email, name: r?.name ?? undefined }],
        subject: SUBJECT,
        htmlContent: htmlBody(r?.name ?? null),
      });
      results.push({ email, ok });
      await new Promise((res) => setTimeout(res, 350)); // throttle
    }
    return json({ success: true, sent: results.filter((x) => x.ok).length, failed: results.filter((x) => !x.ok), results });
  } catch (err) {
    console.error("notify-roster-guide-email error:", err);
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
