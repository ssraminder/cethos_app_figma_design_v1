// ============================================================================
// send-invoice-email v1.1
// Mar 27, 2026
// Sends a customer invoice by email via Brevo with:
//   - Branch logo in HTML header
//   - Invoice summary (number, date, due date, total, balance due)
//   - Payment instructions based on customer's preferred_payment_method
//   - Stripe Pay Online link (always offered for convenience)
//   - PDF invoice as base64 attachment
//   - Updates customer_invoices.last_emailed_at, email_sent_count, status
//   - Stores Stripe payment link in payment_requests table
//   - Supports multiple recipient emails via recipient_emails array
// ============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function jsonResp(d: any, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function fmt(n: any): string {
  if (n == null) return '$0.00';
  return `$${parseFloat(String(n)).toFixed(2)} CAD`;
}
function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json();
    const { invoice_id, recipient_email, recipient_emails, staff_note, custom_message, staff_id } = body;

    if (!invoice_id) return jsonResp({ success: false, error: 'invoice_id required' }, 400);

    // Resolve staff_note or custom_message (frontend may send either)
    const noteText = staff_note || custom_message || '';

    // ── 1. Load invoice ───────────────────────────────────────────────────
    const { data: invoice, error: invErr } = await sb
      .from('customer_invoices')
      .select('*')
      .eq('id', invoice_id)
      .single();
    if (invErr || !invoice) return jsonResp({ success: false, error: 'Invoice not found' }, 404);
    if (['void', 'paid'].includes(invoice.status)) {
      return jsonResp({ success: false, error: `Cannot send a ${invoice.status} invoice` }, 400);
    }
    if (!invoice.pdf_storage_path) {
      return jsonResp({ success: false, error: 'Invoice PDF not yet generated. Generate PDF first.' }, 400);
    }

    // ── 2. Load customer + branch + preferred payment method ────────────────
    const { data: customer } = await sb.from('customers').select(`
      id, full_name, company_name, email, ar_contact_email, payment_terms,
      preferred_payment_method_id, backup_payment_method_id
    `).eq('id', invoice.customer_id).single();
    if (!customer) return jsonResp({ success: false, error: 'Customer not found' }, 404);

    const { data: branch } = await sb.from('branches').select('*').eq('id', invoice.invoicing_branch_id).single();
    if (!branch) return jsonResp({ success: false, error: 'Branch not found' }, 404);

    // Load invoice lines for summary
    const { data: lines } = await sb.from('customer_invoice_lines')
      .select('*').eq('invoice_id', invoice_id).order('sort_order');

    let preferredMethod: any = null, backupMethod: any = null;
    if (customer.preferred_payment_method_id) {
      const { data: pm } = await sb.from('payment_methods').select('code, name').eq('id', customer.preferred_payment_method_id).single();
      preferredMethod = pm;
    }
    if (customer.backup_payment_method_id) {
      const { data: pm } = await sb.from('payment_methods').select('code, name').eq('id', customer.backup_payment_method_id).single();
      backupMethod = pm;
    }

    // ── 3. Determine recipient email(s) ─────────────────────────────────────
    const recipientName = customer.company_name || customer.full_name || 'Valued Customer';
    const toRecipients: Array<{ email: string; name: string }> = [];

    // Support recipient_emails array (from modal with multiple emails)
    if (Array.isArray(recipient_emails) && recipient_emails.length > 0) {
      for (const addr of recipient_emails) {
        if (typeof addr === "string" && addr.includes("@")) {
          const name = addr.toLowerCase() === (customer.email || '').toLowerCase()
            ? recipientName
            : addr;
          toRecipients.push({ email: addr, name });
        }
      }
    }

    // Fallback: single recipient_email, then ar_contact_email, then customer email
    if (toRecipients.length === 0) {
      const fallbackEmail = recipient_email || customer.ar_contact_email || customer.email;
      if (!fallbackEmail) return jsonResp({ success: false, error: 'No recipient email on customer' }, 400);
      toRecipients.push({ email: fallbackEmail, name: recipientName });
    }

    const primaryToEmail = toRecipients[0].email;

    // ── 4. Fetch PDF bytes from storage ─────────────────────────────────
    const { data: pdfData, error: pdfErr } = await sb.storage
      .from('invoices')
      .download(invoice.pdf_storage_path);
    if (pdfErr || !pdfData) return jsonResp({ success: false, error: `Failed to fetch PDF: ${pdfErr?.message}` }, 500);
    const pdfBuffer = await pdfData.arrayBuffer();
    const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)));

    // ── 5. Create Stripe Checkout Session (always, as a convenience option) ──
    let stripePaymentUrl: string | null = null;
    let paymentRequestId: string | null = null;
    const balanceDue = parseFloat(invoice.balance_due || 0);

    if (balanceDue > 0) {
      try {
        const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
        if (stripeKey) {
          const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });
          const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer_email: primaryToEmail,
            line_items: [{
              price_data: {
                currency: 'cad',
                product_data: { name: `Invoice ${invoice.invoice_number}`, description: `Payment for ${customer.company_name || customer.full_name}` },
                unit_amount: Math.round(balanceDue * 100),
              },
              quantity: 1,
            }],
            success_url: `https://portal.cethos.com/customer/invoices?payment=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `https://portal.cethos.com/customer/invoices?payment=cancelled`,
            metadata: { invoice_id, customer_id: customer.id, invoice_number: invoice.invoice_number },
          });
          stripePaymentUrl = session.url;

          // Store in payment_requests
          const { data: pr } = await sb.from('payment_requests').insert({
            customer_id: customer.id,
            invoice_id,
            amount: balanceDue,
            reason: 'invoice_payment',
            stripe_payment_link_url: session.url,
            stripe_payment_link_id: session.id,
            status: 'pending',
            email_sent_at: new Date().toISOString(),
            email_sent_to: primaryToEmail,
            created_by_staff_id: staff_id || null,
          }).select('id').single();
          paymentRequestId = pr?.id || null;
        }
      } catch (stripeErr: any) {
        console.warn('⚠️ Stripe link creation failed (non-fatal):', stripeErr.message);
      }
    }

    // ── 6. Build payment instructions HTML ────────────────────────────────
    const branchAddress = `${branch.address_line1}${branch.address_line2 ? ', ' + branch.address_line2 : ''}, ${branch.city}, ${branch.province} ${branch.postal_code}`;

    function getPaymentInstructionHtml(methodCode: string | null, methodName: string, isPrimary: boolean): string {
      const label = isPrimary ? `<strong>${methodName}</strong> (preferred)` : `<strong>${methodName}</strong> (backup)`;
      switch (methodCode) {
        case 'etransfer':
          return `
            <div style="margin-bottom:16px;padding:14px 16px;background:#f0f9ff;border-left:3px solid #0284c7;border-radius:4px;">
              <p style="margin:0 0 6px 0;font-size:14px;">💳 ${label}</p>
              <p style="margin:0 0 4px 0;font-size:13px;">Send Interac e-Transfer to: <strong>${branch.email}</strong></p>
              <p style="margin:0 0 4px 0;font-size:13px;">Reference / message: <strong>${invoice.invoice_number}</strong></p>
              <p style="margin:0;font-size:12px;color:#64748b;">Auto-deposit is enabled — no security question needed.</p>
            </div>`;
        case 'cheque':
          return `
            <div style="margin-bottom:16px;padding:14px 16px;background:#f0f9ff;border-left:3px solid #0284c7;border-radius:4px;">
              <p style="margin:0 0 6px 0;font-size:14px;">📝 ${label}</p>
              <p style="margin:0 0 4px 0;font-size:13px;">Make cheque payable to: <strong>${branch.legal_name}</strong></p>
              <p style="margin:0 0 4px 0;font-size:13px;">Mail or deliver to: ${branchAddress}</p>
              <p style="margin:0;font-size:12px;color:#64748b;">Please write invoice #${invoice.invoice_number} on the memo line.</p>
            </div>`;
        case 'wire':
        case 'direct_deposit':
          return `
            <div style="margin-bottom:16px;padding:14px 16px;background:#f0f9ff;border-left:3px solid #0284c7;border-radius:4px;">
              <p style="margin:0 0 6px 0;font-size:14px;">🏦 ${label}</p>
              <p style="margin:0 0 4px 0;font-size:13px;">Please contact us for wire transfer / direct deposit details.</p>
              <p style="margin:0;font-size:13px;">Email: <a href="mailto:${branch.email}" style="color:#2563eb;">${branch.email}</a> · Phone: ${branch.phone || 'N/A'}</p>
            </div>`;
        case 'cash':
        case 'terminal':
          return `
            <div style="margin-bottom:16px;padding:14px 16px;background:#f0f9ff;border-left:3px solid #0284c7;border-radius:4px;">
              <p style="margin:0 0 6px 0;font-size:14px;">🏢 ${label}</p>
              <p style="margin:0 0 4px 0;font-size:13px;">Visit our office: ${branchAddress}</p>
              <p style="margin:0;font-size:13px;">Phone: ${branch.phone || 'N/A'} · Hours: Mon–Fri 9am–5pm MT</p>
            </div>`;
        case 'account':
        case 'invoice':
          return `
            <div style="margin-bottom:16px;padding:14px 16px;background:#f0f9ff;border-left:3px solid #0284c7;border-radius:4px;">
              <p style="margin:0 0 6px 0;font-size:14px;">📄 ${label}</p>
              <p style="margin:0;font-size:13px;">Payment is due by <strong>${fmtDate(invoice.due_date)}</strong> per your ${(customer.payment_terms || 'net_30').replace('_', ' ').toUpperCase()} terms.</p>
            </div>`;
        default:
          return '';
      }
    }

    const primaryInstructions = preferredMethod
      ? getPaymentInstructionHtml(preferredMethod.code, preferredMethod.name, true) : '';
    const backupInstructions = backupMethod && backupMethod.code !== preferredMethod?.code
      ? getPaymentInstructionHtml(backupMethod.code, backupMethod.name, false) : '';

    const stripeButtonHtml = stripePaymentUrl ? `
      <div style="margin:24px 0;text-align:center;">
        <a href="${stripePaymentUrl}" style="display:inline-block;padding:14px 32px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:600;">
          💳 Pay Online Now — ${fmt(balanceDue)}
        </a>
        <p style="margin:8px 0 0 0;font-size:11px;color:#94a3b8;">Secure payment via Stripe · Visa, Mastercard, Amex accepted</p>
      </div>` : '';

    // Build lines summary HTML
    const linesSummaryHtml = (lines || []).map((l: any) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;">${l.description || 'Translation services'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;text-align:right;">${fmt(l.line_total)}</td>
      </tr>`).join('');

    const staffNoteHtml = noteText ? `
      <div style="margin:20px 0;padding:12px 16px;background:#fefce8;border-left:3px solid #ca8a04;border-radius:4px;">
        <p style="margin:0;font-size:13px;color:#713f12;"><strong>Note from CETHOS:</strong> ${noteText.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
      </div>` : '';

    // ── 7. Build full HTML email ───────────────────────────────────────────
    const tradeName = branch.trade_name || branch.legal_name;
    const htmlContent = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#fff;">

  <!-- Header with logo -->
  <div style="background:#1e1b4b;padding:24px 32px;text-align:center;">
    <img src="${branch.logo_url}" alt="CETHOS" style="height:44px;max-width:200px;" />
  </div>

  <!-- Invoice badge -->
  <div style="background:#2563eb;padding:12px 32px;">
    <p style="margin:0;color:#fff;font-size:18px;font-weight:700;">Invoice ${invoice.invoice_number}</p>
    <p style="margin:4px 0 0 0;color:#bfdbfe;font-size:13px;">From ${tradeName}</p>
  </div>

  <!-- Body -->
  <div style="padding:28px 32px;">
    <p style="margin:0 0 20px 0;font-size:15px;color:#1e293b;">Dear ${recipientName},</p>
    <p style="margin:0 0 20px 0;font-size:14px;color:#475569;">Please find your invoice attached to this email. A summary is included below for your reference.</p>

    ${staffNoteHtml}

    <!-- Invoice summary table -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="padding:10px 12px;text-align:left;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Description</th>
          <th style="padding:10px 12px;text-align:right;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${linesSummaryHtml}
      </tbody>
      <tfoot>
        <tr style="background:#f8fafc;">
          <td style="padding:8px 12px;font-size:13px;color:#64748b;">GST (${(parseFloat(invoice.tax_rate || 0.05) * 100).toFixed(0)}%)</td>
          <td style="padding:8px 12px;font-size:13px;text-align:right;color:#64748b;">${fmt(invoice.tax_amount)}</td>
        </tr>
        <tr style="background:#eff6ff;">
          <td style="padding:10px 12px;font-size:15px;font-weight:700;color:#1e293b;">Total</td>
          <td style="padding:10px 12px;font-size:15px;font-weight:700;text-align:right;color:#1e293b;">${fmt(invoice.total_amount)}</td>
        </tr>
        ${parseFloat(invoice.amount_paid || 0) > 0 ? `
        <tr>
          <td style="padding:8px 12px;font-size:13px;color:#16a34a;">Amount Paid</td>
          <td style="padding:8px 12px;font-size:13px;text-align:right;color:#16a34a;">${fmt(invoice.amount_paid)}</td>
        </tr>` : ''}
        <tr style="background:#fef2f2;">
          <td style="padding:10px 12px;font-size:15px;font-weight:700;color:#dc2626;">Balance Due</td>
          <td style="padding:10px 12px;font-size:15px;font-weight:700;text-align:right;color:#dc2626;">${fmt(invoice.balance_due)}</td>
        </tr>
      </tfoot>
    </table>

    <!-- Key dates -->
    <table style="width:100%;margin-bottom:24px;">
      <tr>
        <td style="font-size:13px;color:#64748b;padding:4px 0;">Invoice Date:</td>
        <td style="font-size:13px;font-weight:600;color:#1e293b;text-align:right;">${fmtDate(invoice.invoice_date)}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#64748b;padding:4px 0;">Due Date:</td>
        <td style="font-size:14px;font-weight:700;color:${parseFloat(invoice.balance_due) > 0 ? '#dc2626' : '#16a34a'};text-align:right;">${fmtDate(invoice.due_date)}</td>
      </tr>
      ${invoice.po_number ? `<tr><td style="font-size:13px;color:#64748b;padding:4px 0;">PO Number:</td><td style="font-size:13px;font-weight:600;text-align:right;">${invoice.po_number}</td></tr>` : ''}
    </table>

    ${parseFloat(invoice.balance_due) > 0 ? `
    <!-- Payment section -->
    <div style="border-top:1px solid #e2e8f0;padding-top:24px;margin-top:8px;">
      <h3 style="margin:0 0 16px 0;font-size:15px;color:#1e293b;">How to Pay</h3>
      ${stripeButtonHtml}
      ${primaryInstructions}
      ${backupInstructions}
      ${!primaryInstructions && !stripeButtonHtml ? `<p style="font-size:13px;color:#475569;">Please contact us at <a href="mailto:${branch.email}" style="color:#2563eb;">${branch.email}</a> or ${branch.phone || 'N/A'} to arrange payment.</p>` : ''}
    </div>` : `
    <div style="padding:14px 16px;background:#f0fdf4;border-left:3px solid #16a34a;border-radius:4px;margin-bottom:16px;">
      <p style="margin:0;font-size:14px;color:#166534;"><strong>✅ This invoice has been paid. Thank you!</strong></p>
    </div>`}

    <p style="margin:24px 0 0 0;font-size:13px;color:#64748b;">The full invoice PDF is attached to this email. If you have any questions, please contact us at <a href="mailto:${branch.email}" style="color:#2563eb;">${branch.email}</a>.</p>
  </div>

  <!-- Footer -->
  <div style="background:#f1f5f9;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="margin:0;font-size:12px;color:#94a3b8;">${branch.legal_name} · ${branchAddress}</p>
    ${branch.tax_number ? `<p style="margin:4px 0 0 0;font-size:11px;color:#94a3b8;">GST #: ${branch.tax_number}</p>` : ''}
    <p style="margin:4px 0 0 0;font-size:11px;color:#94a3b8;">CETHOS Translation Services · <a href="mailto:support@cethos.com" style="color:#94a3b8;">support@cethos.com</a></p>
  </div>
</div>
</body></html>`;

    // ── 8. Send via Brevo with PDF attachment ─────────────────────────────
    const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');
    if (!BREVO_API_KEY) return jsonResp({ success: false, error: 'BREVO_API_KEY not configured' }, 500);

    const emailPayload: any = {
      sender: { name: 'CETHOS Translation Services', email: 'donotreply@cethos.com' },
      to: toRecipients,
      replyTo: { email: branch.email || 'support@cethos.com' },
      subject: `Invoice ${invoice.invoice_number} — ${fmt(invoice.balance_due)} Due ${fmtDate(invoice.due_date)}`,
      htmlContent,
      attachment: [{
        content: pdfBase64,
        name: `${invoice.invoice_number}.pdf`,
        type: 'application/pdf',
      }],
    };

    const sentToList = toRecipients.map((t) => t.email).join(", ");
    console.log(`Sending invoice ${invoice.invoice_number} to ${sentToList}`);

    const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(emailPayload),
    });
    if (!brevoRes.ok) {
      const errText = await brevoRes.text();
      console.error('Brevo send failed:', errText);
      return jsonResp({ success: false, error: `Email send failed: ${errText}` }, 500);
    }

    // ── 9. Update invoice ──────────────────────────────────────────────────
    const now = new Date().toISOString();
    const newEmailCount = (invoice.email_sent_count || 0) + 1;
    const newStatus = invoice.status === 'issued' || invoice.status === 'draft' ? 'sent' : invoice.status;
    await sb.from('customer_invoices').update({
      last_emailed_at: now,
      last_emailed_to: sentToList,
      email_sent_count: newEmailCount,
      status: newStatus,
      updated_at: now,
    }).eq('id', invoice_id);

    // Log staff activity
    if (staff_id) {
      await sb.from('staff_activity_log').insert({
        staff_id,
        action_type: 'invoice_email_sent',
        entity_type: 'invoice',
        entity_id: invoice_id,
        details: { invoice_number: invoice.invoice_number, sent_to: sentToList, stripe_link: !!stripePaymentUrl, payment_request_id: paymentRequestId },
      });
    }

    console.log(`✅ Invoice ${invoice.invoice_number} emailed to ${sentToList} (send #${newEmailCount})`);
    return jsonResp({
      success: true,
      invoice_number: invoice.invoice_number,
      sent_to: sentToList,
      email_count: newEmailCount,
      stripe_payment_url: stripePaymentUrl,
      payment_request_id: paymentRequestId,
      new_status: newStatus,
    });

  } catch (error: any) {
    console.error('send-invoice-email error:', error);
    return jsonResp({ success: false, error: error.message }, 500);
  }
});
