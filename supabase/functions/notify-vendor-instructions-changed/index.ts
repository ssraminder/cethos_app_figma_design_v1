// ============================================================================
// notify-vendor-instructions-changed v1.0
// Sends an email to every vendor with an active workflow step on the order
// when admin approves an updated instruction set. Stamps vendor_notified_at
// on the order_ai_instructions row to prevent duplicate sends.
// Date: 2026-04-22
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { HTML_TEMPLATE, TEXT_TEMPLATE } from "./templates.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VENDOR_PORTAL_URL =
  Deno.env.get("VENDOR_PORTAL_URL") || "https://cethos-vendor.netlify.app";
const SUPPORT_EMAIL = Deno.env.get("SUPPORT_EMAIL") || "support@cethos.com";

const ACTIVE_STEP_STATUSES = [
  "pending",
  "offered",
  "accepted",
  "in_progress",
  "delivered",
];

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    if (!BREVO_API_KEY) throw new Error("BREVO_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { instructions_id } = await req.json();
    if (!instructions_id) throw new Error("instructions_id is required");

    const { data: row, error: rowErr } = await supabase
      .from("order_ai_instructions")
      .select(
        `id, order_id, change_summary, approved_at, vendor_notified_at,
         is_approved, is_current,
         approver:staff_users!order_ai_instructions_approved_by_fkey(full_name)`,
      )
      .eq("id", instructions_id)
      .single();
    if (rowErr || !row) throw new Error(`Instructions row not found: ${rowErr?.message}`);

    if (!row.is_approved) {
      throw new Error("Instructions are not yet approved; refusing to notify.");
    }
    if (row.vendor_notified_at) {
      return new Response(
        JSON.stringify({ success: true, skipped: "already_notified" }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, order_number, client_project_number")
      .eq("id", row.order_id)
      .single();
    if (orderErr || !order) throw new Error(`Order not found: ${orderErr?.message}`);

    const { data: steps, error: stepsErr } = await supabase
      .from("order_workflow_steps")
      .select(
        `id, status, vendor_id,
         vendor:vendors(id, full_name, email)`,
      )
      .eq("order_id", row.order_id)
      .in("status", ACTIVE_STEP_STATUSES)
      .not("vendor_id", "is", null);
    if (stepsErr) throw new Error(`Steps load failed: ${stepsErr.message}`);

    const vendorMap = new Map<
      string,
      { id: string; full_name: string; email: string }
    >();
    for (const s of steps || []) {
      const v = s.vendor as
        | { id: string; full_name: string; email: string }
        | null;
      if (v && v.email) vendorMap.set(v.email.toLowerCase(), v);
    }
    const recipients = Array.from(vendorMap.values());

    if (recipients.length === 0) {
      await supabase
        .from("order_ai_instructions")
        .update({ vendor_notified_at: new Date().toISOString() })
        .eq("id", row.id);
      return new Response(
        JSON.stringify({ success: true, sent: 0, note: "no_active_vendors" }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const updatedAtFormatted = formatDateTime(row.approved_at);
    const approverName = row.approver?.full_name || "the Cethos team";
    const summary =
      row.change_summary ||
      "The client instructions for this order have been updated. Open the portal to see the full revised brief.";

    const results: Array<{ email: string; ok: boolean; error?: string }> = [];
    for (const v of recipients) {
      const vendorFirstName = (v.full_name || "there").split(/\s+/)[0];
      const vars: Record<string, string> = {
        vendor_name: vendorFirstName,
        order_number: order.order_number,
        project_number: order.client_project_number || "",
        updated_by_staff_name: approverName,
        updated_at: updatedAtFormatted,
        change_summary: summary,
        vendor_portal_url: `${VENDOR_PORTAL_URL.replace(/\/$/, "")}/orders/${order.id}`,
        support_email: SUPPORT_EMAIL,
      };

      let html = HTML_TEMPLATE;
      let text = TEXT_TEMPLATE;

      // Conditional project_number block in HTML.
      if (!vars.project_number) {
        html = html.replace(
          /\{\{#if project_number\}\}[\s\S]*?\{\{\/if\}\}/g,
          "",
        );
        text = text.replace(/\n\s*Project:\s*\n?/g, "\n");
      } else {
        html = html
          .replace(/\{\{#if project_number\}\}/g, "")
          .replace(/\{\{\/if\}\}/g, "");
      }

      html = renderTemplate(html, vars);
      text = renderTemplate(text, vars);

      try {
        const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": BREVO_API_KEY,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            to: [{ email: v.email, name: v.full_name }],
            sender: {
              name: "Cethos Translation Services",
              email: "donotreply@cethos.com",
            },
            subject: `Updated instructions for ${order.order_number}`,
            htmlContent: html,
            textContent: text,
          }),
        });
        const brevoJson = await brevoRes.json();
        if (!brevoRes.ok) {
          results.push({
            email: v.email,
            ok: false,
            error: brevoJson?.message || brevoRes.statusText,
          });
        } else {
          results.push({ email: v.email, ok: true });
        }
      } catch (e) {
        results.push({
          email: v.email,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const sentCount = results.filter((r) => r.ok).length;

    if (sentCount > 0) {
      await supabase
        .from("order_ai_instructions")
        .update({ vendor_notified_at: new Date().toISOString() })
        .eq("id", row.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: sentCount,
        attempted: results.length,
        results,
      }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("notify-vendor-instructions-changed error:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_match, key) => {
    return vars[key] !== undefined ? vars[key] : "";
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
}
