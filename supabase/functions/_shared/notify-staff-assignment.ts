// ============================================================================
// notify-staff-assignment
// Mirrors notify-vendor-assignment but for internal staff assigned to a
// workflow step (actor_type = internal_work or internal_review).
//
// Renders through `_shared/email-shell.ts`.
// ============================================================================

import {
  brevoPayload,
  callout,
  ctaButton,
  detailsTable,
  emailShell,
  esc,
  eyebrow,
  lead,
  REPLY,
  title,
  type TemplateMeta,
} from "./email-shell.ts";

const TEMPLATE: TemplateMeta = {
  name: "Staff — Internal Assignment",
  version: "2.0",
  updatedAt: "2026-05-28",
};

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

function firstName(full: string | null | undefined): string {
  if (!full) return "team";
  const trimmed = full.trim();
  if (!trimmed) return "team";
  return trimmed.split(/\s+/)[0];
}

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

    const rows: Array<[string, string]> = [
      ["Order", order?.order_number ?? "—"],
      ["Step", step?.name ?? `Step ${step?.step_number ?? ""}`],
      ["Role", step?.actor_type === "internal_review" ? "Internal review" : "Internal work"],
    ];
    if (args.deadline) rows.push(["Deadline", fmtDate(args.deadline)]);

    const instructionsCallout = args.instructions
      ? callout({
          tone: "info",
          title: "Instructions",
          body: esc(args.instructions).replace(/\n/g, "<br />"),
        })
      : "";

    const body = [
      eyebrow("Internal assignment", "teal"),
      title("Internal step assigned to you"),
      lead(
        `Hi ${esc(firstName(staff.full_name))}, you have been assigned to <strong>${esc(order?.order_number ?? "an order")}</strong>. Open it in the admin portal to start work, upload deliverables, and mark the step as delivered.`,
      ),
      detailsTable(rows),
      instructionsCallout,
      ctaButton({ label: "Open in admin portal", url: adminLink }),
    ].join("");

    const htmlContent = emailShell(body, { replyTo: REPLY.ops, template: TEMPLATE });
    const payload = brevoPayload({
      to: [{ email: staff.email, name: staff.full_name || staff.email }],
      subject,
      html: htmlContent,
      replyTo: REPLY.ops,
      tags: ["staff-assignment", `order-${order?.order_number ?? "unknown"}`],
    });

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
