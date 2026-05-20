// ============================================================================
// notify-staff-assignment
// Mirrors notify-vendor-assignment but for internal staff assigned to a
// workflow step (actor_type = internal_work or internal_review). Writes
// to notification_log with recipient_type='staff'. Failures are swallowed
// so the staff-assign DB write never rolls back on a Brevo hiccup.
// ============================================================================

interface NotifyArgs {
  supabase: any;
  staff_id: string;
  step: any;
  workflow: any;
  deadline?: string | null;
  instructions?: string | null;
}

async function logNotification(
  supabase: any,
  fields: {
    event_type: string;
    recipient_email: string;
    recipient_name?: string | null;
    recipient_id?: string | null;
    order_id?: string | null;
    step_id?: string | null;
    subject: string;
    status: "sent" | "failed";
    error_message?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await supabase.from("notification_log").insert({
      event_type: fields.event_type,
      recipient_type: "staff",
      recipient_email: fields.recipient_email,
      recipient_name: fields.recipient_name ?? null,
      recipient_id: fields.recipient_id ?? null,
      order_id: fields.order_id ?? null,
      step_id: fields.step_id ?? null,
      subject: fields.subject,
      status: fields.status,
      error_message: fields.error_message ?? null,
      metadata: fields.metadata ?? {},
    });
  } catch (e: any) {
    console.error("notify-staff-assignment notification_log insert failed:", e?.message || e);
  }
}

const ADMIN_PORTAL_URL =
  Deno.env.get("ADMIN_PORTAL_URL") || "https://portal.cethos.com";

const escapeHtml = (s: string | null | undefined): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return c;
    }
  });

const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-CA", {
      timeZone: "America/Edmonton",
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
};

export async function notifyStaffAssignment(args: NotifyArgs): Promise<void> {
  try {
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    if (!BREVO_API_KEY) {
      console.warn("notify-staff-assignment: BREVO_API_KEY not set, skipping");
      return;
    }

    const { supabase, staff_id, step, workflow } = args;

    const [{ data: staff }, { data: order }] = await Promise.all([
      supabase
        .from("staff_users")
        .select("id, full_name, email, is_active")
        .eq("id", staff_id)
        .maybeSingle(),
      supabase
        .from("orders")
        .select("id, order_number, internal_project_id")
        .eq("id", workflow?.order_id)
        .maybeSingle(),
    ]);

    if (!staff?.email) {
      console.warn(`notify-staff-assignment: staff ${staff_id} has no email`);
      return;
    }

    const subject = `Assigned: ${order?.order_number ?? "Order"} — ${step?.name ?? "step"}`;
    const adminLink = order?.id
      ? `${ADMIN_PORTAL_URL}/admin/orders/${order.id}`
      : `${ADMIN_PORTAL_URL}/admin`;

    const detailRows: Array<[string, string]> = [
      ["Order", order?.order_number ?? "—"],
      ["Step", step?.name ?? `Step ${step?.step_number ?? ""}`],
      ["Role", step?.actor_type === "internal_review" ? "Internal review" : "Internal work"],
    ];
    if (args.deadline) detailRows.push(["Deadline", fmtDate(args.deadline)]);

    const detailsHtml = detailRows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px;vertical-align:top;">${escapeHtml(k)}</td><td style="padding:4px 0;color:#111827;font-size:14px;">${escapeHtml(v)}</td></tr>`,
      )
      .join("");

    const instructionsBlock = args.instructions
      ? `<div style="margin-top:16px;padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;color:#374151;font-size:13px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(args.instructions)}</div>`
      : "";

    const htmlContent = `
<!doctype html>
<html><body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:20px 24px;background:#6d28d9;color:#ffffff;">
          <div style="font-size:18px;font-weight:600;">Cethos Translation Services</div>
          <div style="font-size:13px;opacity:0.9;margin-top:2px;">Internal step assigned to you</div>
        </td></tr>
        <tr><td style="padding:24px;color:#111827;">
          <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">Hello ${escapeHtml(staff.full_name || "team")},</p>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">You have been assigned to <strong>${escapeHtml(order?.order_number ?? "an order")}</strong>. Open it in the admin portal to start work, upload deliverables, and mark the step as delivered.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;">${detailsHtml}</table>
          ${instructionsBlock}
          <p style="margin:24px 0 0;text-align:center;">
            <a href="${escapeHtml(adminLink)}" style="display:inline-block;padding:10px 20px;background:#6d28d9;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">Open in admin portal</a>
          </p>
        </td></tr>
        <tr><td style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;">
          You're receiving this because you were assigned to an internal step on this order.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`.trim();

    const payload: Record<string, unknown> = {
      to: [{ email: staff.email, name: staff.full_name || staff.email }],
      sender: { name: "Cethos Translation Services", email: "donotreply@cethos.com" },
      replyTo: { email: "ops@cethos.com", name: "Cethos Ops" },
      subject,
      htmlContent,
      tags: ["staff-assignment", `order-${order?.order_number ?? "unknown"}`],
    };

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
      console.error("notify-staff-assignment Brevo error:", JSON.stringify(result));
      await logNotification(supabase, {
        event_type: "staff_assignment",
        recipient_email: staff.email,
        recipient_name: staff.full_name ?? null,
        recipient_id: staff_id,
        order_id: workflow?.order_id ?? null,
        step_id: step?.id ?? null,
        subject,
        status: "failed",
        error_message: `Brevo ${res.status}: ${JSON.stringify(result).slice(0, 500)}`,
        metadata: {
          order_number: order?.order_number ?? null,
          step_name: step?.name ?? null,
          actor_type: step?.actor_type ?? null,
        },
      });
      return;
    }

    console.log(
      `notify-staff-assignment sent to ${staff.email} (msg ${result?.messageId})`,
    );
    await logNotification(supabase, {
      event_type: "staff_assignment",
      recipient_email: staff.email,
      recipient_name: staff.full_name ?? null,
      recipient_id: staff_id,
      order_id: workflow?.order_id ?? null,
      step_id: step?.id ?? null,
      subject,
      status: "sent",
      metadata: {
        order_number: order?.order_number ?? null,
        step_name: step?.name ?? null,
        actor_type: step?.actor_type ?? null,
        brevo_message_id: result?.messageId ?? null,
      },
    });
  } catch (err: any) {
    console.error("notify-staff-assignment threw:", err?.message || err);
    try {
      const { data: staffRow } = await args.supabase
        .from("staff_users").select("email, full_name").eq("id", args.staff_id).maybeSingle();
      if (staffRow?.email) {
        await logNotification(args.supabase, {
          event_type: "staff_assignment",
          recipient_email: staffRow.email,
          recipient_name: staffRow.full_name ?? null,
          recipient_id: args.staff_id,
          order_id: args.workflow?.order_id ?? null,
          step_id: args.step?.id ?? null,
          subject: `(threw) staff_assignment for staff ${args.staff_id}`,
          status: "failed",
          error_message: err?.message || String(err),
        });
      }
    } catch {
      /* swallow */
    }
  }
}
