// ============================================================================
// send-final-deliverable
// Ships the Final Deliverable step to the customer:
//   - Marks the chosen step_deliveries row as the final version
//   - Sets the workflow step to 'approved' + final_marked_at/by
//   - Cascades: workflow → completed; order → completed
//   - Emails the customer with 7-day signed download links for each file
//
// Called from the admin "Send to Client" button on the Final Deliverable step
// card. Idempotency: if the step is already approved this returns success
// without re-emailing (so a double-click doesn't double-send).
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { triggerDropboxSync } from "../_shared/dropbox-trigger.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ADMIN_PORTAL_URL = Deno.env.get("ADMIN_PORTAL_URL") || "https://portal.cethos.com";
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return c;
    }
  });
}

function fileNameFromPath(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx >= 0 ? p.slice(idx + 1) : p;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  try {
    const { step_id, staff_id, delivery_id, message } = await req.json();
    if (!step_id) return json({ success: false, error: "Missing step_id" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Load step + workflow + order + customer in one trip
    const { data: step, error: stepErr } = await supabase
      .from("order_workflow_steps")
      .select("id, workflow_id, order_id, step_number, name, status, final_delivery_id")
      .eq("id", step_id)
      .single();
    if (stepErr || !step) return json({ success: false, error: "Step not found" }, 404);

    if (step.name !== "Final Deliverable") {
      return json({ success: false, error: "This action is only valid on the Final Deliverable step" }, 400);
    }

    // Idempotency: already shipped → no-op
    if (step.status === "approved" && step.final_delivery_id) {
      return json({ success: true, already_sent: true });
    }

    // 2) Pick delivery: explicit delivery_id, or latest if not provided
    let chosenDelivery: { id: string; version: number; file_paths: string[] | null } | null = null;
    if (delivery_id) {
      const { data: d } = await supabase
        .from("step_deliveries")
        .select("id, version, file_paths")
        .eq("id", delivery_id)
        .eq("step_id", step_id)
        .maybeSingle();
      if (!d) return json({ success: false, error: "Specified delivery not found on this step" }, 404);
      chosenDelivery = d;
    } else {
      const { data: latest } = await supabase
        .from("step_deliveries")
        .select("id, version, file_paths")
        .eq("step_id", step_id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      chosenDelivery = latest ?? null;
    }

    if (!chosenDelivery) {
      return json({
        success: false,
        error: "Upload at least one version of the final deliverable before sending to the client.",
      }, 400);
    }

    const filePaths = (chosenDelivery.file_paths ?? []).filter(Boolean);
    if (!filePaths.length) {
      return json({ success: false, error: "The selected version has no files attached." }, 400);
    }

    // 3) Mark the delivery as final + approve the step
    const nowIso = new Date().toISOString();
    const { error: stepUpdErr } = await supabase
      .from("order_workflow_steps")
      .update({
        status: "approved",
        approved_at: nowIso,
        final_delivery_id: chosenDelivery.id,
        final_marked_at: nowIso,
        final_marked_by: staff_id || null,
      })
      .eq("id", step_id);
    if (stepUpdErr) return json({ success: false, error: `Step update failed: ${stepUpdErr.message}` }, 500);

    await supabase
      .from("step_deliveries")
      .update({ review_status: "approved", reviewed_by: staff_id || null, reviewed_at: nowIso })
      .eq("id", chosenDelivery.id);

    // 4) Cascade: complete workflow if every step is done
    const { data: siblingSteps } = await supabase
      .from("order_workflow_steps")
      .select("status")
      .eq("workflow_id", step.workflow_id);
    const allDone = siblingSteps?.every((s: any) => s.status === "approved" || s.status === "skipped");
    if (allDone) {
      await supabase
        .from("order_workflows")
        .update({ status: "completed", completed_at: nowIso })
        .eq("id", step.workflow_id);
    }

    // 5) Cascade: complete order
    await supabase
      .from("orders")
      .update({ status: "completed", completed_at: nowIso })
      .eq("id", step.order_id);

    // 6) Load order + customer for the email
    const { data: order } = await supabase
      .from("orders")
      .select("id, order_number, customer_id")
      .eq("id", step.order_id)
      .single();

    let customer: { id: string; full_name: string | null; email: string | null } | null = null;
    if (order?.customer_id) {
      const { data: c } = await supabase
        .from("customers")
        .select("id, full_name, email")
        .eq("id", order.customer_id)
        .single();
      customer = c ?? null;
    }

    // 7) Build signed download URLs for each file
    const downloads: Array<{ name: string; url: string }> = [];
    for (const path of filePaths) {
      const { data: signed } = await supabase.storage
        .from("quote-files")
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (signed?.signedUrl) {
        downloads.push({ name: fileNameFromPath(path), url: signed.signedUrl });
      }
    }

    // 8) Fire customer email + Dropbox sync to Final Deliverable folder
    if (customer?.email && order) {
      await sendCustomerEmail({
        supabase,
        customerEmail: customer.email,
        customerName: customer.full_name,
        customerId: customer.id,
        orderId: order.id,
        orderNumber: order.order_number,
        stepId: step.id,
        downloads,
        message: typeof message === "string" ? message.trim() || null : null,
        version: chosenDelivery.version,
      });
    } else {
      console.warn(`send-final-deliverable: no customer email for order ${step.order_id}`);
    }

    // Push files to Dropbox /Final Deliverable folder (fire-and-forget)
    for (const path of filePaths) {
      triggerDropboxSync({
        order_id: step.order_id,
        file_path: path,
        sync_trigger: "final_delivery",
      });
    }

    return json({
      success: true,
      workflow_completed: !!allDone,
      delivery_id: chosenDelivery.id,
      version: chosenDelivery.version,
      files_sent: downloads.length,
    });
  } catch (err) {
    console.error("send-final-deliverable error:", err);
    return json({ success: false, error: (err as Error).message }, 500);
  }
});

interface CustomerEmailArgs {
  supabase: any;
  customerEmail: string;
  customerName: string | null;
  customerId: string;
  orderId: string;
  orderNumber: string;
  stepId: string;
  downloads: Array<{ name: string; url: string }>;
  message: string | null;
  version: number;
}

async function sendCustomerEmail(args: CustomerEmailArgs): Promise<void> {
  const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
  if (!BREVO_API_KEY) {
    console.warn("send-final-deliverable: BREVO_API_KEY not set, skipping send");
    return;
  }

  const firstName = args.customerName?.split(" ")[0] || "";
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "Hi,";
  const subject = `Your final translation is ready — ${args.orderNumber}`;

  const downloadRows = args.downloads
    .map(
      (d) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">
          <a href="${escapeHtml(d.url)}" style="color:#0f766e;text-decoration:none;font-weight:500;">${escapeHtml(d.name)}</a>
          <div style="font-size:12px;color:#6b7280;margin-top:2px;">Download link valid for 7 days</div>
        </td></tr>`,
    )
    .join("");

  const customMessageBlock = args.message
    ? `<div style="margin:16px 0;padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;color:#374151;font-size:13px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(args.message)}</div>`
    : "";

  const html = `
<!doctype html>
<html><body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:20px 24px;background:#0f766e;color:#ffffff;">
          <div style="font-size:18px;font-weight:600;">Cethos Translation Services</div>
          <div style="font-size:13px;opacity:0.85;margin-top:2px;">Your final deliverable</div>
        </td></tr>
        <tr><td style="padding:24px;color:#111827;">
          <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">${greeting}</p>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">Your translation is complete. The final files for order <strong>${escapeHtml(args.orderNumber)}</strong> are ready for download below.</p>
          ${customMessageBlock}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
            ${downloadRows}
          </table>
          <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">Need anything else? Just reply to this email and we'll be in touch.</p>
        </td></tr>
        <tr><td style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;">
          Thank you for choosing Cethos. Replies go to support@cethos.com.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`.trim();

  const payload = {
    to: [{ email: args.customerEmail, name: args.customerName || args.customerEmail }],
    sender: { name: "Cethos Translation Services", email: "donotreply@cethos.com" },
    replyTo: { email: "support@cethos.com", name: "Cethos Support" },
    subject,
    htmlContent: html,
    tags: ["final_deliverable_sent"],
  };

  let status: "sent" | "failed" = "sent";
  let errorMsg: string | null = null;
  let brevoMessageId: string | null = null;

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
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      status = "failed";
      errorMsg = `Brevo ${res.status}: ${JSON.stringify(result).slice(0, 500)}`;
      console.error("send-final-deliverable Brevo error:", errorMsg);
    } else {
      brevoMessageId = result?.messageId ?? null;
    }
  } catch (err: any) {
    status = "failed";
    errorMsg = err?.message || String(err);
    console.error("send-final-deliverable threw:", errorMsg);
  }

  try {
    await args.supabase.from("notification_log").insert({
      event_type: "final_deliverable_sent",
      recipient_type: "customer",
      recipient_email: args.customerEmail,
      recipient_name: args.customerName ?? null,
      recipient_id: args.customerId,
      order_id: args.orderId,
      step_id: args.stepId,
      subject,
      status,
      error_message: errorMsg,
      metadata: {
        brevo_message_id: brevoMessageId,
        version: args.version,
        file_count: args.downloads.length,
        custom_message: args.message,
      },
    });
  } catch (e: any) {
    console.error("send-final-deliverable notification_log insert failed:", e?.message || e);
  }
}
