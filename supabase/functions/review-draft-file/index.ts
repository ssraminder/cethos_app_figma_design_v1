// ============================================================================
// review-draft-file v2.0
// Handles the full draft review lifecycle:
//   - submit_for_review: Staff submits draft for customer review
//   - approve: Customer approves the draft
//   - request_changes: Customer requests changes on the draft
//   - deliver_final: Staff delivers final translation + creates invoice
// Date: February 15, 2026
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    );
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    const SITE_URL =
      Deno.env.get("SITE_URL") ||
      Deno.env.get("FRONTEND_URL") ||
      "https://portal.cethos.com";

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json();
    const { file_id, order_id, action, actor_type, actor_id, comment, actingAsStaff, staffId } = body;

    console.log("review-draft-file v2 called:", {
      file_id,
      order_id,
      action,
      actor_type,
    });

    if (!action) {
      throw new Error("Missing required field: action");
    }

    // ================================================================
    // ACTION: submit_for_review
    // Staff uploads a draft and submits it for customer review
    // ================================================================
    if (action === "submit_for_review") {
      if (!file_id) throw new Error("Missing required field: file_id");
      if (!actor_id) throw new Error("Missing required field: actor_id");

      // Get file details
      const { data: file, error: fileError } = await supabase
        .from("quote_files")
        .select("id, quote_id, file_name, review_status, review_version")
        .eq("id", file_id)
        .single();

      if (fileError || !file) {
        throw new Error("File not found");
      }

      const previousStatus = file.review_status;

      // Update file review status
      const { error: updateError } = await supabase
        .from("quote_files")
        .update({
          review_status: "pending_review",
          review_comment: null,
          reviewed_at: null,
        })
        .eq("id", file_id);

      if (updateError) {
        console.error("File update error:", updateError);
        throw new Error("Failed to update file review status");
      }

      // Log to review history
      await supabase.from("file_review_history").insert({
        file_id,
        action: "submit_for_review",
        actor_type,
        actor_id,
        review_version: file.review_version,
        previous_status: previousStatus,
        new_status: "pending_review",
      });

      // Update order status to draft_review
      const { data: quote } = await supabase
        .from("quotes")
        .select("id")
        .eq("id", file.quote_id)
        .single();

      if (quote) {
        const { data: orderData } = await supabase
          .from("orders")
          .select("id, status, customer_id")
          .eq("quote_id", quote.id)
          .single();

        if (orderData) {
          await supabase
            .from("orders")
            .update({ status: "draft_review" })
            .eq("id", orderData.id);

          // Send email notification to customer with download links
          if (BREVO_API_KEY) {
            // Fetch all pending_review draft files for this quote
            const { data: draftFiles } = await supabase
              .from("quote_files")
              .select("id, original_filename, file_size, storage_path, staff_notes")
              .eq("quote_id", file.quote_id)
              .eq("review_status", "pending_review")
              .is("deleted_at", null);

            // Generate signed URLs (7 days) for each draft file
            const filesWithUrls: { name: string; size: number; url: string; staffNotes: string | null }[] = [];
            for (const df of draftFiles || []) {
              const { data: signedData } = await supabase.storage
                .from("quote-files")
                .createSignedUrl(df.storage_path, 7 * 24 * 60 * 60); // 7 days

              filesWithUrls.push({
                name: df.original_filename,
                size: df.file_size || 0,
                url: signedData?.signedUrl || "",
                staffNotes: df.staff_notes || null,
              });
            }

            // Collect staff_notes from any file (same note applies to batch)
            const staffNotes = filesWithUrls.find(f => f.staffNotes)?.staffNotes || null;

            await notifyCustomerDraftReady(
              supabase,
              BREVO_API_KEY,
              SITE_URL,
              orderData.customer_id,
              orderData.id,
              file.file_name,
              filesWithUrls,
              staffNotes,
            );
          }
        }
      }

      return jsonResponse({
        success: true,
        message: "Draft submitted for customer review",
        review_status: "pending_review",
        order_status: "draft_review",
      });
    }

    // ================================================================
    // ACTION: approve
    // Customer approves the draft translation
    // ================================================================
    if (action === "approve") {
      if (!file_id) throw new Error("Missing required field: file_id");
      if (!actor_id) throw new Error("Missing required field: actor_id");

      const { data: file, error: fileError } = await supabase
        .from("quote_files")
        .select("id, quote_id, review_status, review_version")
        .eq("id", file_id)
        .single();

      if (fileError || !file) {
        throw new Error("File not found");
      }

      const previousStatus = file.review_status;

      // Update file
      const { error: updateError } = await supabase
        .from("quote_files")
        .update({
          review_status: "approved",
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", file_id);

      if (updateError) {
        throw new Error("Failed to update file review status");
      }

      // Log to review history
      await supabase.from("file_review_history").insert({
        file_id,
        action: "approve",
        actor_type: actingAsStaff ? "staff" : actor_type,
        actor_id,
        comment: comment || null,
        review_version: file.review_version,
        previous_status: previousStatus,
        new_status: "approved",
      });

      // Update order status back to in_production (staff can now finalize)
      const { data: quote } = await supabase
        .from("quotes")
        .select("id")
        .eq("id", file.quote_id)
        .single();

      if (quote) {
        const { data: orderData } = await supabase
          .from("orders")
          .select("id, status")
          .eq("quote_id", quote.id)
          .single();

        if (orderData && orderData.status === "draft_review") {
          await supabase
            .from("orders")
            .update({ status: "in_production" })
            .eq("id", orderData.id);
        }

        // Log to staff_activity_log when acting on behalf
        if (actingAsStaff && staffId) {
          await supabase.from("staff_activity_log").insert({
            staff_id: staffId,
            activity_type: "draft_approved_on_behalf",
            entity_type: "quote_file",
            entity_id: file_id,
            details: {
              order_id: orderData?.id,
              file_id,
              action: "approve",
            },
          });
        }

        // Skip notifications when staff is acting on behalf
        if (!actingAsStaff && BREVO_API_KEY) {
          await notifyStaffDraftApproved(
            supabase,
            BREVO_API_KEY,
            SITE_URL,
            orderData?.id,
            actor_id,
          );
        }
      }

      return jsonResponse({
        success: true,
        message: actingAsStaff ? "Draft approved on behalf of customer" : "Draft approved by customer",
        review_status: "approved",
      });
    }

    // ================================================================
    // ACTION: request_changes
    // Customer requests changes on the draft
    // ================================================================
    if (action === "request_changes") {
      if (!file_id) throw new Error("Missing required field: file_id");
      if (!actor_id) throw new Error("Missing required field: actor_id");

      const { data: file, error: fileError } = await supabase
        .from("quote_files")
        .select("id, quote_id, review_status, review_version")
        .eq("id", file_id)
        .single();

      if (fileError || !file) {
        throw new Error("File not found");
      }

      const previousStatus = file.review_status;

      // Update file
      const { error: updateError } = await supabase
        .from("quote_files")
        .update({
          review_status: "changes_requested",
          review_comment: comment || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", file_id);

      if (updateError) {
        throw new Error("Failed to update file review status");
      }

      // Log to review history
      await supabase.from("file_review_history").insert({
        file_id,
        action: "request_changes",
        actor_type: actingAsStaff ? "staff" : actor_type,
        actor_id,
        comment: comment || null,
        review_version: file.review_version,
        previous_status: previousStatus,
        new_status: "changes_requested",
      });

      // Update order status back to in_production
      const { data: quote } = await supabase
        .from("quotes")
        .select("id")
        .eq("id", file.quote_id)
        .single();

      if (quote) {
        const { data: orderData } = await supabase
          .from("orders")
          .select("id, status")
          .eq("quote_id", quote.id)
          .single();

        if (orderData && orderData.status === "draft_review") {
          await supabase
            .from("orders")
            .update({ status: "in_production" })
            .eq("id", orderData.id);
        }

        // Log to staff_activity_log when acting on behalf
        if (actingAsStaff && staffId) {
          await supabase.from("staff_activity_log").insert({
            staff_id: staffId,
            activity_type: "changes_requested_on_behalf",
            entity_type: "quote_file",
            entity_id: file_id,
            details: {
              order_id: orderData?.id,
              file_id,
              action: "request_changes",
              comment: comment || null,
            },
          });
        }

        // Skip notifications when staff is acting on behalf
        if (!actingAsStaff && BREVO_API_KEY) {
          await notifyStaffChangesRequested(
            supabase,
            BREVO_API_KEY,
            SITE_URL,
            orderData?.id,
            actor_id,
            comment,
          );
        }
      }

      return jsonResponse({
        success: true,
        message: actingAsStaff ? "Change request submitted on behalf of customer" : "Change request submitted",
        review_status: "changes_requested",
      });
    }

    // ================================================================
    // ACTION: deliver_final
    // Staff delivers final translation and creates invoice
    // ================================================================
    if (action === "deliver_final") {
      const resolvedOrderId = order_id;
      if (!resolvedOrderId) {
        throw new Error("Missing required field: order_id");
      }
      if (!actor_id) throw new Error("Missing required field: actor_id");

      // Get order with details
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select(
          "id, order_number, quote_id, customer_id, subtotal, certification_total, rush_fee, delivery_fee, tax_rate, tax_amount, total_amount, amount_paid, balance_due, status",
        )
        .eq("id", resolvedOrderId)
        .single();

      if (orderError || !order) {
        throw new Error("Order not found");
      }

      // Create invoice using database function
      const { data: invoiceId, error: invoiceError } = await supabase.rpc(
        "create_invoice_from_order",
        { p_order_id: order.id },
      );

      if (invoiceError) {
        console.error("Invoice creation error:", invoiceError);
        throw new Error("Failed to create invoice");
      }

      // Get the created invoice details
      const { data: invoice } = await supabase
        .from("customer_invoices")
        .select("id, invoice_number, status, total_amount, balance_due")
        .eq("id", invoiceId)
        .single();

      // Update order status based on balance
      const newOrderStatus =
        order.balance_due <= 0 ? "invoiced" : "delivered";

      await supabase
        .from("orders")
        .update({
          status: newOrderStatus,
          actual_delivery_date: new Date().toISOString(),
        })
        .eq("id", order.id);

      // Generate PDF (call generate-invoice-pdf function internally)
      try {
        const pdfResponse = await fetch(
          `${SUPABASE_URL}/functions/v1/generate-invoice-pdf`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ invoice_id: invoiceId }),
          },
        );

        if (!pdfResponse.ok) {
          console.error(
            "PDF generation failed:",
            await pdfResponse.text(),
          );
        } else {
          console.log("Invoice PDF generated successfully");
        }
      } catch (pdfErr) {
        console.error("PDF generation error:", pdfErr);
        // Non-blocking — invoice was already created
      }

      // Log to review history
      await supabase.from("file_review_history").insert({
        file_id: file_id || null,
        action: "deliver_final",
        actor_type,
        actor_id,
        new_status: newOrderStatus,
        metadata: {
          order_id: order.id,
          invoice_id: invoiceId,
          invoice_number: invoice?.invoice_number,
        },
      });

      // Notify customer of delivery
      if (BREVO_API_KEY) {
        await notifyCustomerDelivery(
          supabase,
          BREVO_API_KEY,
          SITE_URL,
          order.customer_id,
          order.id,
          order.order_number,
          invoice?.invoice_number,
        );
      }

      return jsonResponse({
        success: true,
        message: "Final translation delivered and invoice created",
        order_status: newOrderStatus,
        invoice_number: invoice?.invoice_number || null,
        invoice_status: invoice?.status || null,
        balance_due: invoice?.balance_due || 0,
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    console.error("review-draft-file error:", error.message);
    return jsonResponse({ success: false, error: error.message }, 400);
  }
});

// ============================================================================
// Email notification helpers
// ============================================================================

async function notifyCustomerDraftReady(
  supabase: any,
  brevoKey: string,
  siteUrl: string,
  customerId: string,
  orderId: string,
  fileName: string,
  filesWithUrls?: { name: string; size: number; url: string; staffNotes: string | null }[],
  staffNotes?: string | null,
) {
  try {
    const { data: customer } = await supabase
      .from("customers")
      .select("email, full_name")
      .eq("id", customerId)
      .single();

    if (!customer?.email) return;

    const reviewUrl = `${siteUrl}/dashboard/orders/${orderId}`;

    // Build file list HTML if we have files with URLs
    let fileListHtml = "";
    if (filesWithUrls && filesWithUrls.length > 0) {
      const fileRows = filesWithUrls.map(f => {
        const sizeStr = f.size > 0
          ? f.size > 1024 * 1024
            ? `${(f.size / 1024 / 1024).toFixed(1)} MB`
            : `${(f.size / 1024).toFixed(0)} KB`
          : "";
        const downloadBtn = f.url
          ? `<a href="${f.url}" style="display:inline-block;padding:6px 14px;background-color:#1e40af;color:#ffffff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:500;">Download</a>`
          : "";
        return `<tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">
            <span style="font-size:14px;color:#374151;font-weight:500;">${f.name}</span>
            ${sizeStr ? `<span style="font-size:12px;color:#9ca3af;margin-left:8px;">(${sizeStr})</span>` : ""}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">
            ${downloadBtn}
          </td>
        </tr>`;
      }).join("");

      fileListHtml = `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <tr style="background-color:#f9fafb;">
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">File</th>
            <th style="padding:10px 12px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Action</th>
          </tr>
          ${fileRows}
        </table>
        <p style="margin:0 0 8px;color:#9ca3af;font-size:12px;">Download links expire in 7 days.</p>`;
    }

    // Build staff notes section
    let staffNotesHtml = "";
    if (staffNotes) {
      staffNotesHtml = `
        <div style="margin:20px 0;padding:16px;background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;">
          <p style="margin:0 0 6px;color:#1e40af;font-size:13px;font-weight:600;">Note from our team:</p>
          <p style="margin:0;color:#374151;font-size:14px;line-height:1.5;">${staffNotes}</p>
        </div>`;
    }

    const fileCount = filesWithUrls?.length || 1;
    const introText = fileCount > 1
      ? `Your draft translations (${fileCount} files) are ready for review. Please review the drafts and either approve them or request changes.`
      : `Your draft translation <strong>${fileName || filesWithUrls?.[0]?.name || "file"}</strong> is ready for review. Please review the draft and either approve it or request changes.`;

    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": brevoKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        to: [{ email: customer.email, name: customer.full_name || customer.email }],
        sender: {
          name: "CETHOS Translation Services",
          email: "donotreply@cethos.com",
        },
        subject: fileCount > 1
          ? `Your draft translations (${fileCount} files) are ready for review`
          : "Your draft translation is ready for review",
        htmlContent: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background-color:#1e40af;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">CETHOS Translation Services</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:1.5;">
            Hi ${customer.full_name || "there"},
          </p>
          <p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:1.5;">
            ${introText}
          </p>
          ${fileListHtml}
          ${staffNotesHtml}
          <table cellpadding="0" cellspacing="0" style="margin:24px 0;">
            <tr><td style="background-color:#1e40af;border-radius:8px;">
              <a href="${reviewUrl}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;">
                Review Draft${fileCount > 1 ? "s" : ""}
              </a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
            CETHOS Translation Services &bull; Professional Document Translation
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
      }),
    });

    console.log("Draft review notification sent to:", customer.email);
  } catch (err) {
    console.error("Email notification error:", err);
  }
}

async function notifyStaffDraftApproved(
  supabase: any,
  brevoKey: string,
  siteUrl: string,
  orderId: string | undefined,
  customerId: string,
) {
  try {
    const { data: customer } = await supabase
      .from("customers")
      .select("full_name")
      .eq("id", customerId)
      .single();

    // Get admin staff to notify
    const { data: staffList } = await supabase
      .from("staff_users")
      .select("email, full_name")
      .eq("is_active", true)
      .limit(5);

    if (!staffList?.length) return;

    const orderUrl = orderId
      ? `${siteUrl}/admin/orders/${orderId}`
      : `${siteUrl}/admin/orders`;

    for (const staff of staffList) {
      await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": brevoKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          to: [{ email: staff.email, name: staff.full_name }],
          sender: {
            name: "CETHOS Translation Services",
            email: "donotreply@cethos.com",
          },
          subject: `Draft approved by ${customer?.full_name || "customer"}`,
          htmlContent: `<p>${customer?.full_name || "A customer"} has approved the draft translation.</p><p><a href="${orderUrl}">View Order</a></p>`,
        }),
      });
    }
  } catch (err) {
    console.error("Staff notification error:", err);
  }
}

async function notifyStaffChangesRequested(
  supabase: any,
  brevoKey: string,
  siteUrl: string,
  orderId: string | undefined,
  customerId: string,
  feedback?: string,
) {
  try {
    const { data: customer } = await supabase
      .from("customers")
      .select("full_name")
      .eq("id", customerId)
      .single();

    const { data: staffList } = await supabase
      .from("staff_users")
      .select("email, full_name")
      .eq("is_active", true)
      .limit(5);

    if (!staffList?.length) return;

    const orderUrl = orderId
      ? `${siteUrl}/admin/orders/${orderId}`
      : `${siteUrl}/admin/orders`;

    for (const staff of staffList) {
      await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": brevoKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          to: [{ email: staff.email, name: staff.full_name }],
          sender: {
            name: "CETHOS Translation Services",
            email: "donotreply@cethos.com",
          },
          subject: `Changes requested by ${customer?.full_name || "customer"}`,
          htmlContent: `<p>${customer?.full_name || "A customer"} has requested changes on the draft translation.</p>${feedback ? `<blockquote style="border-left:4px solid #3b82f6;padding:12px;margin:16px 0;background:#eff6ff;">${feedback}</blockquote>` : ""}<p><a href="${orderUrl}">View Order</a></p>`,
        }),
      });
    }
  } catch (err) {
    console.error("Staff notification error:", err);
  }
}

async function notifyCustomerDelivery(
  supabase: any,
  brevoKey: string,
  siteUrl: string,
  customerId: string,
  orderId: string,
  orderNumber: string,
  invoiceNumber?: string,
) {
  try {
    const { data: customer } = await supabase
      .from("customers")
      .select("email, full_name")
      .eq("id", customerId)
      .single();

    if (!customer?.email) return;

    const orderUrl = `${siteUrl}/dashboard/orders/${orderId}`;

    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": brevoKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        to: [{ email: customer.email, name: customer.full_name || customer.email }],
        sender: {
          name: "CETHOS Translation Services",
          email: "donotreply@cethos.com",
        },
        subject: `Your translation for order ${orderNumber} has been delivered`,
        htmlContent: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background-color:#1e40af;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">CETHOS Translation Services</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:1.5;">
            Hi ${customer.full_name || "there"},
          </p>
          <p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:1.5;">
            Your final translation for order <strong>${orderNumber}</strong> has been delivered!
          </p>
          ${invoiceNumber ? `<p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:1.5;">Invoice <strong>${invoiceNumber}</strong> has been generated and is available in your dashboard.</p>` : ""}
          <table cellpadding="0" cellspacing="0" style="margin:24px 0;">
            <tr><td style="background-color:#1e40af;border-radius:8px;">
              <a href="${orderUrl}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;">
                View Order & Download Files
              </a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
            CETHOS Translation Services &bull; Professional Document Translation
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
      }),
    });

    console.log("Delivery notification sent to:", customer.email);
  } catch (err) {
    console.error("Email notification error:", err);
  }
}
