// ============================================================================
// negotiation-hitl-reminder v1.0
// Cron-driven sweep that emails staff about HITL negotiation decisions sitting
// undecided for >1h. Designed to be wired to pg_cron / Supabase Scheduled
// Functions at hourly cadence; safe to invoke manually.
//
// Sends one rollup email to negotiation_settings.notify_staff_email with the
// list of pending decisions (offer #, vendor, age, AI action). Uses a "remind
// once" flag (notification_log entry) to avoid spamming when a decision sits
// for days — re-reminds after 8h if still untouched.
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ONE_HOUR = 60 * 60 * 1000;
const REREMIND_AFTER = 8 * ONE_HOUR;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: settings } = await sb
      .from("negotiation_settings")
      .select("notify_staff_email, paused")
      .eq("id", 1)
      .maybeSingle();
    const email = settings?.notify_staff_email;
    if (!email || settings?.paused) {
      return json({ success: true, skipped: true, reason: "no email or paused" });
    }

    const now = Date.now();
    const cutoff = new Date(now - ONE_HOUR).toISOString();

    // Pending HITL recommendations older than 1h
    const { data: pending } = await sb
      .from("vendor_negotiation_decisions")
      .select(
        "id, offer_id, vendor_id, step_id, ai_action, ai_confidence, ai_proposed_rate, counter_rate, original_rate, created_at",
      )
      .eq("mode", "hitl")
      .is("decided_at", null)
      .is("superseded_by_id", null)
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true });

    if (!pending || pending.length === 0) {
      return json({ success: true, sent: false, pending_count: 0 });
    }

    // Filter out items already reminded recently
    const ids = pending.map((d: any) => d.id);
    const sinceRemind = new Date(now - REREMIND_AFTER).toISOString();
    const { data: alreadyReminded } = await sb
      .from("notification_log")
      .select("metadata")
      .gte("sent_at", sinceRemind)
      .eq("kind", "negotiation_hitl_reminder");
    const remindedSet = new Set<string>();
    for (const row of alreadyReminded || []) {
      const metaIds = (row.metadata as any)?.decision_ids || [];
      for (const id of metaIds) remindedSet.add(id);
    }
    const fresh = pending.filter((d: any) => !remindedSet.has(d.id));
    if (fresh.length === 0) {
      return json({ success: true, sent: false, pending_count: pending.length, all_reminded_already: true });
    }

    // Resolve vendor names
    const vendorIds = Array.from(new Set(fresh.map((d: any) => d.vendor_id).filter(Boolean)));
    const { data: vendors } = vendorIds.length > 0
      ? await sb.from("vendors").select("id, full_name").in("id", vendorIds)
      : { data: [] as any[] };
    const vMap = new Map((vendors || []).map((v: any) => [v.id, v.full_name]));

    // Build email body
    const rows = fresh.map((d: any) => {
      const ageHours = Math.floor((now - new Date(d.created_at).getTime()) / ONE_HOUR);
      const vname = vMap.get(d.vendor_id) || "Unknown vendor";
      const action = String(d.ai_action).toUpperCase();
      const conf = Math.round(Number(d.ai_confidence) * 100);
      return `<tr>
        <td style="padding:6px 12px;border-bottom:1px solid #eee">${vname}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee">$${Number(d.counter_rate).toFixed(2)} (was $${Number(d.original_rate).toFixed(2)})</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee"><strong>${action}</strong> · ${conf}%</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee">${ageHours}h ago</td>
      </tr>`;
    }).join("");

    const html = `
      <p>Hi,</p>
      <p>The AI negotiator has <strong>${fresh.length}</strong> pending counter-offer recommendation${fresh.length === 1 ? "" : "s"} awaiting your review.</p>
      <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;width:100%">
        <thead>
          <tr style="background:#f7f7f7">
            <th style="text-align:left;padding:6px 12px;border-bottom:2px solid #ddd">Vendor</th>
            <th style="text-align:left;padding:6px 12px;border-bottom:2px solid #ddd">Counter rate</th>
            <th style="text-align:left;padding:6px 12px;border-bottom:2px solid #ddd">AI rec</th>
            <th style="text-align:left;padding:6px 12px;border-bottom:2px solid #ddd">Pending</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:18px"><a href="https://portal.cethos.com/admin/tasks">Open Tasks dashboard →</a></p>
      <p style="color:#888;font-size:12px">Re-reminders fire every 8h until you decide or supersede.</p>
    `;

    // Send via Brevo (raw email)
    const sent = await sendBrevoRaw(email, `${fresh.length} pending AI negotiation rec${fresh.length === 1 ? "" : "s"}`, html);

    // Log so we don't re-spam within the rebrazepd window
    await sb.from("notification_log").insert({
      kind: "negotiation_hitl_reminder",
      recipient_email: email,
      status: sent ? "sent" : "failed",
      metadata: { decision_ids: fresh.map((d: any) => d.id), count: fresh.length },
      sent_at: new Date().toISOString(),
    });

    return json({
      success: true,
      sent,
      reminded: fresh.length,
      pending_total: pending.length,
    });
  } catch (err: any) {
    console.error("negotiation-hitl-reminder error:", err);
    return json({ success: false, error: err.message || "Internal error" }, 500);
  }
});

async function sendBrevoRaw(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  if (!apiKey) return false;
  try {
    const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        to: [{ email: to, name: "Cethos staff" }],
        subject,
        htmlContent: html,
        sender: {
          email: Deno.env.get("BREVO_SENDER_EMAIL") ?? "noreply@cethos.com",
          name: "Cethos Negotiator",
        },
      }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
