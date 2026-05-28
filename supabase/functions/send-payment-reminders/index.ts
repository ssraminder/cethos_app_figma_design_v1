// ============================================================================
// send-payment-reminders v2.0
// Daily reminder cron for overdue customer invoices.
// HARD GATE: only emails customers where customers.auto_invoice_reminders_enabled = true.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  callout,
  ctaButton,
  emailShell,
  esc,
  hint,
  lead,
  REPLY,
  statusBadge,
  strong,
  title,
  C,
  type TemplateMeta,
} from "../_shared/email-shell.ts";

const TEMPLATE: TemplateMeta = {
  name: "Customer — Invoice Overdue",
  version: "2.0",
  updatedAt: "2026-05-28",
};

const THROTTLE_DAYS = 7;
const PAGE_SIZE = 500;

interface OverdueInvoice {
  id: string;
  customer_id: string;
  invoice_number: string | null;
  total_amount: number | null;
  balance_due: number | null;
  due_date: string | null;
  currency: string | null;
  last_reminder_sent_at: string | null;
  reminder_count: number | null;
  customers: {
    id: string;
    email: string | null;
    ar_contact_email: string | null;
    full_name: string | null;
    company_name: string | null;
    auto_invoice_reminders_enabled: boolean | null;
  } | null;
}

function fmtMoney(amount: number | null, currency: string | null): string {
  if (amount == null) return "—";
  try {
    return amount.toLocaleString("en-CA", {
      style: "currency",
      currency: currency || "CAD",
      minimumFractionDigits: 2,
    });
  } catch {
    return `${currency || ""} ${amount.toFixed(2)}`;
  }
}

function daysOverdue(dueDate: string | null): number {
  if (!dueDate) return 0;
  const due = new Date(dueDate).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - due) / 86_400_000));
}

function buildEmailHtml(
  contactName: string,
  invoices: OverdueInvoice[],
): { subject: string; html: string } {
  const total = invoices.reduce(
    (s, i) => s + Number(i.balance_due || 0),
    0,
  );
  const ccy = invoices[0]?.currency || "CAD";
  const rows = invoices
    .map(
      (i) => `<tr>
        <td style="padding:6px 12px;border-bottom:1px solid #eee">${i.invoice_number || "—"}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee">${i.due_date || "—"}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">${fmtMoney(i.balance_due, i.currency)}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">${daysOverdue(i.due_date)} d</td>
      </tr>`,
    )
    .join("");

  const subject =
    invoices.length === 1
      ? `Reminder: invoice ${invoices[0].invoice_number || ""} is overdue`
      : `Reminder: ${invoices.length} invoices outstanding (${fmtMoney(total, ccy)})`;

  const maxDaysLate = Math.max(...invoices.map((i) => daysOverdue(i.due_date)));

  // Invoice table in the shared visual language: muted header row, dividers,
  // total grand row in navy.
  const invoiceTable = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 22px;border:1px solid ${C.border};border-radius:8px;overflow:hidden;">
    <thead><tr style="background:${C.slate50};">
      <th style="padding:10px 14px;text-align:left;font-size:11px;color:${C.muted};text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">Invoice #</th>
      <th style="padding:10px 14px;text-align:left;font-size:11px;color:${C.muted};text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">Due</th>
      <th style="padding:10px 14px;text-align:right;font-size:11px;color:${C.muted};text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">Balance</th>
      <th style="padding:10px 14px;text-align:right;font-size:11px;color:${C.muted};text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">Overdue</th>
    </tr></thead>
    <tbody>${invoices.map((i) => `<tr style="border-top:1px solid ${C.border};">
      <td style="padding:10px 14px;font-size:13.5px;color:${C.navy};font-weight:500;">${esc(i.invoice_number || "—")}</td>
      <td style="padding:10px 14px;font-size:13.5px;color:${C.navy};">${esc(i.due_date || "—")}</td>
      <td style="padding:10px 14px;font-size:13.5px;color:${C.navy};text-align:right;font-weight:500;">${esc(fmtMoney(i.balance_due, i.currency))}</td>
      <td style="padding:10px 14px;font-size:13.5px;color:${C.errorText};text-align:right;font-weight:600;">${daysOverdue(i.due_date)} d</td>
    </tr>`).join("")}
    <tr style="background:${C.navy};border-top:1px solid ${C.navy};">
      <td colspan="2" style="padding:12px 14px;font-size:14px;color:${C.white};font-weight:700;">Total outstanding</td>
      <td style="padding:12px 14px;font-size:16px;color:${C.white};text-align:right;font-weight:700;">${esc(fmtMoney(total, ccy))}</td>
      <td style="padding:12px 14px;background:${C.navy};"></td>
    </tr></tbody></table>`;

  const html = emailShell(
    [
      statusBadge("warn", maxDaysLate > 30 ? `Overdue · ${maxDaysLate} days` : `Overdue · ${maxDaysLate} days`),
      title(
        invoices.length === 1
          ? `Invoice ${esc(invoices[0].invoice_number || "")} is past due`
          : `${invoices.length} invoices outstanding`,
      ),
      lead(
        `Hi ${esc(contactName)}, this is a friendly reminder that the following invoice${invoices.length > 1 ? "s remain" : " remains"} outstanding past the due date.`,
      ),
      invoiceTable,
      callout({
        tone: "warn",
        title: "Already paid?",
        body: `If payment is in flight, please reply with the date sent and reference number and we'll match it on our end — no further action required.`,
      }),
      ctaButton({
        label: `Pay ${esc(fmtMoney(total, ccy))} online`,
        url: "https://portal.cethos.com/dashboard",
        variant: "navy",
        align: "full",
      }),
      hint(
        `Questions about this invoice? Reply to this email and our AR team will pick it up within 2 business hours.`,
      ),
    ].join(""),
    {
      replyTo: REPLY.ar,
      template: TEMPLATE,
      preheader: `${invoices.length === 1 ? `Invoice ${invoices[0].invoice_number}` : `${invoices.length} invoices`} past due — ${fmtMoney(total, ccy)}.`,
    },
  );

  return { subject, html };
}

Deno.serve(async (req) => {
  const startedAt = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: { dryRun?: boolean } = {};
  try {
    body = await req.json();
  } catch (_) {
    /* ok */
  }
  const dryRun = !!body.dryRun;

  const todayIso = new Date().toISOString().split("T")[0];
  const throttleCutoff = new Date(
    Date.now() - THROTTLE_DAYS * 86_400_000,
  ).toISOString();

  // Pull overdue invoices for opted-in customers
  const overdue: OverdueInvoice[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("customer_invoices")
      .select(
        `id, customer_id, invoice_number, total_amount, balance_due, due_date,
         currency, last_reminder_sent_at, reminder_count,
         customers:customer_id!inner(
           id, email, ar_contact_email, full_name, company_name,
           auto_invoice_reminders_enabled
         )`,
      )
      .eq("customers.auto_invoice_reminders_enabled", true)
      .in("status", ["sent", "issued", "overdue"])
      .gt("balance_due", 0)
      .lt("due_date", todayIso)
      .is("voided_at", null)
      .or(
        `last_reminder_sent_at.is.null,last_reminder_sent_at.lt.${throttleCutoff}`,
      )
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("query error", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
      });
    }
    if (!data || data.length === 0) break;
    overdue.push(...(data as unknown as OverdueInvoice[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  // Group by customer
  const byCustomer = new Map<string, OverdueInvoice[]>();
  for (const inv of overdue) {
    if (!inv.customers?.auto_invoice_reminders_enabled) continue; // belt + braces
    const key = inv.customer_id;
    if (!byCustomer.has(key)) byCustomer.set(key, []);
    byCustomer.get(key)!.push(inv);
  }

  if (dryRun) {
    return new Response(
      JSON.stringify(
        {
          dryRun: true,
          opted_in_customers_with_overdue: byCustomer.size,
          total_overdue_invoices: overdue.length,
          sample: Array.from(byCustomer.entries())
            .slice(0, 5)
            .map(([cid, invs]) => ({
              customer_id: cid,
              email:
                invs[0]?.customers?.ar_contact_email ||
                invs[0]?.customers?.email,
              invoice_count: invs.length,
              balance: invs.reduce(
                (s, i) => s + Number(i.balance_due || 0),
                0,
              ),
            })),
        },
        null,
        2,
      ),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  let emailsSent = 0;
  let emailsFailed = 0;
  const errors: string[] = [];
  const idsToStamp: string[] = [];

  for (const [customerId, invoices] of byCustomer) {
    const c = invoices[0].customers!;
    const to = c.ar_contact_email || c.email;
    if (!to) {
      errors.push(`customer ${customerId}: no email`);
      continue;
    }
    if (
      to.endsWith("@no-email.cethos.local") ||
      to.includes("@no-email.cethos.")
    ) {
      // Skip placeholder emails from XTRF imports without real contact
      errors.push(`customer ${customerId}: placeholder email skipped`);
      continue;
    }
    const contactName = c.full_name || c.company_name || "there";
    const { subject, html } = buildEmailHtml(contactName, invoices);

    try {
      const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          to,
          toName: contactName,
          subject,
          htmlContent: html,
        }),
      });
      if (!res.ok) {
        emailsFailed += 1;
        errors.push(
          `customer ${customerId} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
        );
        continue;
      }
      emailsSent += 1;
      for (const inv of invoices) idsToStamp.push(inv.id);
    } catch (err) {
      emailsFailed += 1;
      errors.push(`customer ${customerId}: ${String(err)}`);
    }
  }

  // Stamp last_reminder_sent_at + reminder_count for invoices we successfully sent on
  if (idsToStamp.length > 0) {
    const stamp = new Date().toISOString();
    for (let i = 0; i < idsToStamp.length; i += 200) {
      const chunk = idsToStamp.slice(i, i + 200);
      const { error } = await supabase.rpc("bump_invoice_reminder_count", {
        invoice_ids: chunk,
        stamp_at: stamp,
      });
      if (error) {
        // Fallback: update directly without RPC if function missing
        const { error: e2 } = await supabase
          .from("customer_invoices")
          .update({
            last_reminder_sent_at: stamp,
            reminder_count: (supabase as unknown as { from: (t: string) => unknown }) // typing satisfaction
              ? undefined
              : undefined,
          } as Record<string, unknown>)
          .in("id", chunk);
        if (e2) errors.push(`stamp chunk ${i}: ${e2.message}`);
        // Increment reminder_count via raw SQL via execute? Not available; do a separate per-id pass.
        for (const id of chunk) {
          const { data: inv } = await supabase
            .from("customer_invoices")
            .select("reminder_count")
            .eq("id", id)
            .single();
          await supabase
            .from("customer_invoices")
            .update({
              reminder_count: (inv?.reminder_count ?? 0) + 1,
              last_reminder_sent_at: stamp,
            })
            .eq("id", id);
        }
      }
    }
  }

  return new Response(
    JSON.stringify(
      {
        opted_in_customers_with_overdue: byCustomer.size,
        total_overdue_invoices: overdue.length,
        emails_sent: emailsSent,
        emails_failed: emailsFailed,
        invoices_stamped: idsToStamp.length,
        errors: errors.slice(0, 20),
        elapsed_ms: Date.now() - startedAt,
      },
      null,
      2,
    ),
    { headers: { "Content-Type": "application/json" } },
  );
});
