// ============================================================================
// review-draft-file v2.1
// Handles the full draft review lifecycle:
//   - submit_for_review: Staff submits draft for customer review
//   - approve: Customer approves the draft
//   - request_changes: Customer requests changes on the draft
//   - override_approve: Staff approves without customer (Flow C — requires
//     override_reason; logs to staff_activity_log with actor_type='staff';
//     same downstream affidavit trigger as Flow A)
//   - deliver_final: Staff delivers final translation + creates invoice
//
// On `approve` (Flow A) and `override_approve` (Flow C) the function fires
// `apply-affidavit-and-finalize` for the just-approved file. Failure to fire
// the affidavit does NOT roll back the approval — the staff override modal
// can re-trigger from Step 3 if needed.
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  brevoPayload,
  callout,
  ctaButton,
  detailsTable,
  emailShell,
  esc,
  eyebrow,
  hint,
  lead,
  REPLY,
  statusBadge,
  strong,
  title,
  type TemplateMeta,
  C,
} from "../_shared/email-shell.ts";
import { prefixWithProject } from "../_shared/email-subject.ts";

const TPL_CUSTOMER_DRAFT: TemplateMeta = {
  name: "Customer — Draft for Review",
  version: "2.0",
  updatedAt: "2026-05-28",
};
const TPL_CUSTOMER_DELIVERY: TemplateMeta = {
  name: "Customer — Order Delivered",
  version: "2.0",
  updatedAt: "2026-05-28",
};
const TPL_STAFF_APPROVED: TemplateMeta = {
  name: "Staff — Customer Approved Draft",
  version: "2.0",
  updatedAt: "2026-05-28",
};
const TPL_STAFF_CHANGES: TemplateMeta = {
  name: "Staff — Customer Requested Changes",
  version: "2.0",
  updatedAt: "2026-05-28",
};

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

// Fire-and-await the affidavit pipeline. Captures success/error so the caller
// can include it in the response without rolling back the approval itself.
async function triggerAffidavit(
  supabaseUrl: string,
  serviceRoleKey: string,
  orderId: string,
  fileId: string,
  triggeredBy: "customer_approval" | "staff_override",
): Promise<{ ok: boolean; status: number; body: any }> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/apply-affidavit-and-finalize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({
        order_id: orderId,
        quote_file_id: fileId,
        triggered_by: triggeredBy,
      }),
    });
    const parsed = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn("[review-draft-file] affidavit trigger non-2xx:", res.status, parsed);
    }
    return { ok: res.ok, status: res.status, body: parsed };
  } catch (err: any) {
    console.error("[review-draft-file] affidavit trigger threw:", err);
    return { ok: false, status: 0, body: { error: err?.message || String(err) } };
  }
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
    const {
      file_id,
      file_ids,
      order_id,
      action,
      actor_type,
      actor_id,
      comment,
      actingAsStaff,
      staffId,
      recipient_override,
      override_reason,
      staff_notes,
      skip_notification,
    } = body;

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
      // Accept either file_ids (array — batch send from the modal) or
      // legacy single file_id. Normalize to a non-empty list.
      const idList: string[] = Array.isArray(file_ids) && file_ids.length > 0
        ? file_ids.filter((v: any) => typeof v === "string" && v.length > 0)
        : (typeof file_id === "string" && file_id.length > 0 ? [file_id] : []);
      if (idList.length === 0) throw new Error("Missing required field: file_id");
      if (!actor_id) throw new Error("Missing required field: actor_id");

      // Get all files in the batch
      const { data: files, error: filesError } = await supabase
        .from("quote_files")
        .select("id, quote_id, original_filename, review_status, review_version")
        .in("id", idList);

      if (filesError || !files || files.length === 0) {
        throw new Error("File not found");
      }

      // All files must belong to the same quote
      const quoteId = files[0].quote_id;
      if (files.some(f => f.quote_id !== quoteId)) {
        throw new Error("All files must belong to the same quote");
      }

      // Optional batch note from the send modal — apply to each selected file
      // so the existing email-builder (which reads quote_files.staff_notes)
      // picks it up. Empty/whitespace input leaves prior notes untouched.
      const batchNote = typeof staff_notes === "string" && staff_notes.trim().length > 0
        ? staff_notes.trim()
        : null;

      const updatePayload: Record<string, unknown> = {
        review_status: "pending_review",
        review_comment: null,
        reviewed_at: null,
      };
      if (batchNote !== null) updatePayload.staff_notes = batchNote;

      const { error: updateError } = await supabase
        .from("quote_files")
        .update(updatePayload)
        .in("id", idList);

      if (updateError) {
        console.error("File update error:", updateError);
        throw new Error("Failed to update file review status");
      }

      // Log to review history — one row per file
      const historyRows = files.map(f => ({
        file_id: f.id,
        action: "submit_for_review",
        actor_type,
        actor_id,
        review_version: f.review_version,
        previous_status: f.review_status,
        new_status: "pending_review",
      }));
      await supabase.from("file_review_history").insert(historyRows);

      // Update order status to draft_review
      const { data: quote } = await supabase
        .from("quotes")
        .select("id")
        .eq("id", quoteId)
        .single();

      let filesInEmail = 0;
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

          // Send one email per batch with all pending_review files attached
          if (BREVO_API_KEY && !skip_notification) {
            const { data: draftFiles } = await supabase
              .from("quote_files")
              .select("id, original_filename, file_size, storage_path, staff_notes")
              .eq("quote_id", quoteId)
              .eq("review_status", "pending_review")
              .is("deleted_at", null);

            const filesWithUrls: { name: string; size: number; url: string; staffNotes: string | null }[] = [];
            for (const df of draftFiles || []) {
              const { data: signedData } = await supabase.storage
                .from("quote-files")
                .createSignedUrl(df.storage_path, 7 * 24 * 60 * 60);

              filesWithUrls.push({
                name: df.original_filename,
                size: df.file_size || 0,
                url: signedData?.signedUrl || "",
                staffNotes: df.staff_notes || null,
              });
            }

            const emailNote = batchNote
              ?? (filesWithUrls.find(f => f.staffNotes)?.staffNotes || null);

            await notifyCustomerDraftReady(
              supabase,
              BREVO_API_KEY,
              SITE_URL,
              orderData.customer_id,
              orderData.id,
              files[0].original_filename,
              filesWithUrls,
              emailNote,
              recipient_override ?? null,
            );

            filesInEmail = filesWithUrls.length;
          }
        }
      }

      return jsonResponse({
        success: true,
        message: "Draft submitted for customer review",
        review_status: "pending_review",
        order_status: "draft_review",
        files_in_email: filesInEmail,
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

        // Flow A trigger: fire the affidavit pipeline. Failure here does NOT
        // roll back the approval — staff can re-trigger from the step-3 card.
        if (orderData?.id) {
          const affidavit = await triggerAffidavit(
            SUPABASE_URL!,
            SUPABASE_SERVICE_ROLE_KEY!,
            orderData.id,
            file_id,
            "customer_approval",
          );
          return jsonResponse({
            success: true,
            message: actingAsStaff ? "Draft approved on behalf of customer" : "Draft approved by customer",
            review_status: "approved",
            affidavit_triggered: affidavit.ok,
            affidavit: affidavit.body,
          });
        }
      }

      return jsonResponse({
        success: true,
        message: actingAsStaff ? "Draft approved on behalf of customer" : "Draft approved by customer",
        review_status: "approved",
      });
    }

    // ================================================================
    // ACTION: override_approve (Flow C)
    // Staff approves without customer — bypasses the customer review entirely.
    // Distinct from `actingAsStaff` (which is impersonation under the
    // customer's identity). Requires a non-empty override_reason and is
    // attributed to the acting staff member in staff_activity_log.
    // ================================================================
    if (action === "override_approve") {
      if (!file_id) throw new Error("Missing required field: file_id");
      if (!staffId) throw new Error("Missing required field: staffId");
      const reason = (override_reason ?? "").trim();
      if (!reason) throw new Error("Missing required field: override_reason");

      const { data: file, error: fileError } = await supabase
        .from("quote_files")
        .select("id, quote_id, review_status, review_version")
        .eq("id", file_id)
        .single();
      if (fileError || !file) throw new Error("File not found");

      const previousStatus = file.review_status;

      const { error: updateError } = await supabase
        .from("quote_files")
        .update({
          review_status: "override_approved",
          review_comment: reason,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", file_id);
      if (updateError) throw new Error("Failed to update file review status");

      // file_review_history schema is: file_id, action, comment, actor_type,
      // actor_id, metadata, created_at. The extra columns (review_version /
      // previous_status / new_status) used by the existing v2 actions don't
      // exist on the table and silently fail the insert — caught during the
      // 2026-05-21 e2e smoke test. Use the working pattern (everything
      // adjacent goes into metadata).
      await supabase.from("file_review_history").insert({
        file_id,
        action: "override_approved",
        actor_type: "staff",
        actor_id: staffId,
        comment: reason,
        metadata: {
          version: file.review_version,
          previous_status: previousStatus,
          new_status: "override_approved",
          acting_on_behalf: false,
        },
      });

      const { data: quote } = await supabase
        .from("quotes")
        .select("id")
        .eq("id", file.quote_id)
        .single();

      let orderId: string | null = null;
      if (quote) {
        const { data: orderData } = await supabase
          .from("orders")
          .select("id, status")
          .eq("quote_id", quote.id)
          .single();
        orderId = orderData?.id ?? null;
        if (orderData && orderData.status === "draft_review") {
          await supabase
            .from("orders")
            .update({ status: "in_production" })
            .eq("id", orderData.id);
        }
      }

      // Staff-attributed audit row — distinguishable from `draft_approved_on_behalf`.
      // Column is `action_type` (not `activity_type`); the wrong-column bug
      // was caught during the 2026-05-21 e2e smoke test.
      await supabase.from("staff_activity_log").insert({
        staff_id: staffId,
        action_type: "draft_override_approved",
        entity_type: "quote_file",
        entity_id: file_id,
        details: {
          order_id: orderId,
          file_id,
          action: "override_approve",
          override_reason: reason,
        },
      });

      let affidavitResult: { ok: boolean; status: number; body: any } | null = null;
      if (orderId) {
        affidavitResult = await triggerAffidavit(
          SUPABASE_URL!,
          SUPABASE_SERVICE_ROLE_KEY!,
          orderId,
          file_id,
          "staff_override",
        );
      }

      return jsonResponse({
        success: true,
        message: "Draft override-approved by staff",
        review_status: "override_approved",
        affidavit_triggered: affidavitResult?.ok ?? false,
        affidavit: affidavitResult?.body ?? null,
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

      // Fetch ALL final_deliverable files for this order
      let deliveryFilesWithUrls: { name: string; size: number; url: string }[] = [];
      try {
        const { data: finalCat } = await supabase
          .from("file_categories")
          .select("id")
          .eq("slug", "final_deliverable")
          .single();

        if (finalCat) {
          const { data: finalFiles } = await supabase
            .from("quote_files")
            .select("id, original_filename, storage_path, file_size, file_category_id")
            .eq("quote_id", order.quote_id)
            .is("deleted_at", null)
            .order("created_at", { ascending: true });

          const deliverableFiles = (finalFiles || []).filter(
            (f: any) => f.file_category_id === finalCat.id,
          );

          for (const df of deliverableFiles) {
            const { data: signedData } = await supabase.storage
              .from("quote-files")
              .createSignedUrl(df.storage_path, 7 * 24 * 60 * 60); // 7 days

            deliveryFilesWithUrls.push({
              name: df.original_filename,
              size: df.file_size || 0,
              url: signedData?.signedUrl || "",
            });
          }
        }
      } catch (fileErr) {
        console.error("Error fetching delivery files:", fileErr);
      }

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
          deliveryFilesWithUrls,
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

    // ================================================================
    // ACTION: send_delivery_email
    // Re-send (or first-send) the delivery email to the customer with a
    // selected subset of finalized files attached. Does NOT create an
    // invoice — that is owned by deliver_final. This is the staff
    // "Send delivery" button from the order page.
    // ================================================================
    if (action === "send_delivery_email") {
      const resolvedOrderId = order_id;
      if (!resolvedOrderId) throw new Error("Missing required field: order_id");
      if (!actor_id) throw new Error("Missing required field: actor_id");

      const { data: ord, error: ordErr } = await supabase
        .from("orders")
        .select("id, order_number, quote_id, customer_id")
        .eq("id", resolvedOrderId)
        .single();
      if (ordErr || !ord) throw new Error("Order not found");

      // Choose files: explicit file_ids if provided, otherwise all
      // final_deliverable files for the quote.
      const filterIds: string[] = Array.isArray(file_ids) && file_ids.length > 0
        ? (file_ids as string[]).filter((v: any) => typeof v === "string" && v.length > 0)
        : [];

      let filesQuery = supabase
        .from("quote_files")
        .select("id, original_filename, storage_path, file_size, file_category_id, staff_notes")
        .eq("quote_id", ord.quote_id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });

      if (filterIds.length > 0) {
        filesQuery = filesQuery.in("id", filterIds);
      } else {
        // Fallback to final_deliverable category
        const { data: finalCat } = await supabase
          .from("file_categories")
          .select("id")
          .eq("slug", "final_deliverable")
          .single();
        if (finalCat) filesQuery = filesQuery.eq("file_category_id", finalCat.id);
      }

      const { data: rawFiles } = await filesQuery;
      const files = (rawFiles ?? []) as Array<{
        id: string;
        original_filename: string;
        storage_path: string;
        file_size: number | null;
        staff_notes: string | null;
      }>;
      if (files.length === 0) {
        return jsonResponse({ success: false, error: "No deliverable files found" }, 400);
      }

      // Persist the batch note onto the selected rows so any subsequent
      // re-send picks it up too (mirrors submit_for_review behavior).
      const batchNote = typeof staff_notes === "string" && staff_notes.trim().length > 0
        ? staff_notes.trim() : null;
      if (batchNote !== null && files.length > 0) {
        await supabase
          .from("quote_files")
          .update({ staff_notes: batchNote })
          .in("id", files.map(f => f.id));
      }

      const deliveryFilesWithUrls: { name: string; size: number; url: string; staffNotes: string | null }[] = [];
      for (const f of files) {
        const { data: signed } = await supabase.storage
          .from("quote-files")
          .createSignedUrl(f.storage_path, 7 * 24 * 60 * 60);
        deliveryFilesWithUrls.push({
          name: f.original_filename,
          size: f.file_size || 0,
          url: signed?.signedUrl || "",
          staffNotes: batchNote ?? f.staff_notes ?? null,
        });
      }

      // Reuse the existing customer delivery notifier. invoice_number is
      // best-effort: most-recent non-void invoice for this order, if any.
      let invoiceNumber: string | null = null;
      try {
        const { data: inv } = await supabase
          .from("customer_invoices")
          .select("invoice_number, status, created_at")
          .eq("order_id", ord.id)
          .neq("status", "void")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        invoiceNumber = inv?.invoice_number ?? null;
      } catch (_) { /* non-blocking */ }

      const simpleFiles = deliveryFilesWithUrls.map(({ name, size, url }) => ({ name, size, url }));

      if (BREVO_API_KEY && !skip_notification) {
        await notifyCustomerDelivery(
          supabase,
          BREVO_API_KEY,
          SITE_URL,
          ord.customer_id,
          ord.id,
          ord.order_number,
          invoiceNumber,
          simpleFiles,
        );
      }

      // History row per file
      await supabase.from("file_review_history").insert(
        files.map(f => ({
          file_id: f.id,
          action: "send_delivery_email",
          actor_type,
          actor_id,
          metadata: { order_id: ord.id, batch_size: files.length, notes: batchNote },
        })),
      );

      return jsonResponse({
        success: true,
        message: "Delivery email sent",
        files_sent: files.length,
        invoice_number: invoiceNumber,
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
  recipientOverride?: { email: string; name?: string } | null,
) {
  try {
    const { data: customer } = await supabase
      .from("customers")
      .select("email, full_name, company_name")
      .eq("id", customerId)
      .single();

    // #2.1 Tier 4 — resolve project number via order for business-customer prefix.
    // PostgREST embed alias returned undefined at runtime (see other Tier 4
    // fixes 2026-06-02); use direct two-step lookup instead.
    let projectNumber: string | null = null;
    const { data: orderForPrj } = await supabase
      .from("orders")
      .select("internal_project_id")
      .eq("id", orderId)
      .maybeSingle();
    if ((orderForPrj as any)?.internal_project_id) {
      const { data: ip } = await supabase
        .from("internal_projects")
        .select("project_number")
        .eq("id", (orderForPrj as any).internal_project_id)
        .maybeSingle();
      projectNumber = (ip as any)?.project_number ?? null;
    }
    const companyName: string | null = (customer as any)?.company_name ?? null;

    // When staff is running a smoke test, recipientOverride redirects the
    // delivery without mutating the customer record. Body still says
    // 'Hi <customer name>' so the template is identical to what the real
    // recipient would see.
    const toEmail = recipientOverride?.email ?? customer?.email;
    const toName = recipientOverride?.name ?? customer?.full_name ?? null;
    if (!toEmail) return;

    const reviewUrl = `${siteUrl}/dashboard/orders/${orderId}`;

    // Build file list as a small bordered card.
    let fileListHtml = "";
    if (filesWithUrls && filesWithUrls.length > 0) {
      const fileRows = filesWithUrls.map((f) => {
        const sizeStr = f.size > 0
          ? f.size > 1024 * 1024
            ? `${(f.size / 1024 / 1024).toFixed(1)} MB`
            : `${(f.size / 1024).toFixed(0)} KB`
          : "";
        const downloadBtn = f.url
          ? `<a href="${esc(f.url)}" target="_blank" style="display:inline-block;padding:6px 14px;background-color:${C.teal};color:#ffffff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;">Download</a>`
          : "";
        return `<tr>
          <td style="padding:10px 12px;border-bottom:1px solid ${C.border};">
            <span style="font-size:14px;color:${C.navy};font-weight:500;">${esc(f.name)}</span>
            ${sizeStr ? `<span style="font-size:12px;color:${C.muted};margin-left:8px;">(${sizeStr})</span>` : ""}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid ${C.border};text-align:right;">${downloadBtn}</td>
        </tr>`;
      }).join("");

      fileListHtml = `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;border:1px solid ${C.border};border-radius:8px;overflow:hidden;background:${C.white};">${fileRows}</table>
        <p style="margin:0 0 18px;color:${C.muted};font-size:12px;">Download links expire in 7 days.</p>`;
    }

    const staffNotesCallout = staffNotes
      ? callout({ tone: "info", title: "Note from our team", body: esc(staffNotes).replace(/\n/g, "<br />") })
      : "";

    const fileCount = filesWithUrls?.length || 1;
    const introText = fileCount > 1
      ? `Your draft translations (${fileCount} files) are ready for review. Please look them over and either approve or request changes — one revision pass is included.`
      : `Your draft translation ${strong(esc(fileName || filesWithUrls?.[0]?.name || "file"))} is ready for review. Please look it over and either approve or request changes — one revision pass is included.`;

    const subject = prefixWithProject(
      fileCount > 1
        ? `Your draft translations (${fileCount} files) are ready for review`
        : "Your draft translation is ready for review",
      { companyName, projectNumber },
    );

    const customerFirstName = (toName || customer?.full_name || "").trim().split(/\s+/)[0] || "there";

    const html = emailShell(
      [
        eyebrow("Ready for your review"),
        title(fileCount > 1 ? "Your draft translations are ready" : "Your draft translation is ready"),
        lead(`Hi ${esc(customerFirstName)}, ${introText}`),
        fileListHtml,
        staffNotesCallout,
        callout({
          tone: "info",
          title: "Watermarked draft",
          body: "Each page is marked DRAFT — once you approve, we'll finalize and remove the watermark. One free revision round is included.",
        }),
        ctaButton({
          label: fileCount > 1 ? "Review drafts" : "Review draft",
          url: reviewUrl,
          align: "left",
        }),
      ].join(""),
      { replyTo: REPLY.customer, template: TPL_CUSTOMER_DRAFT, preheader: `Your draft for order ${esc(orderId)} is ready for review.` },
    );

    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": brevoKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(brevoPayload({
        to: [{ email: toEmail, name: toName || toEmail }],
        subject,
        html,
        replyTo: REPLY.customer,
        senderName: "Cethos Translation Services",
        tags: ["customer-draft-review"],
      })),
    });

    console.log("Draft review notification sent to:", toEmail, recipientOverride ? "(override)" : "");
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
      const html = emailShell(
        [
          statusBadge("success", "Customer approved"),
          title("Draft approved — ready to finalize"),
          lead(
            `${strong(esc(customer?.full_name || "A customer"))} has approved the draft translation. You can now run the affidavit / finalize step and ship the final deliverable.`,
          ),
          ctaButton({ label: "Open order", url: orderUrl }),
        ].join(""),
        { replyTo: REPLY.ops, template: TPL_STAFF_APPROVED, preheader: `Draft approved by ${esc(customer?.full_name || "customer")}` },
      );
      await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": brevoKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(brevoPayload({
          to: [{ email: staff.email, name: staff.full_name }],
          subject: `Draft approved by ${customer?.full_name || "customer"}`,
          html,
          replyTo: REPLY.ops,
          tags: ["staff-draft-approved"],
        })),
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
      const feedbackCallout = feedback
        ? callout({ tone: "warn", title: "Customer feedback", body: esc(feedback).replace(/\n/g, "<br />") })
        : "";
      const html = emailShell(
        [
          statusBadge("warn", "Changes requested"),
          title(`Changes requested by ${esc(customer?.full_name || "customer")}`),
          lead(
            `The customer has reviewed the draft translation and requested changes. Open the order to see their feedback and route the revision back to the translator.`,
          ),
          feedbackCallout,
          ctaButton({ label: "Open order", url: orderUrl }),
        ].join(""),
        { replyTo: REPLY.ops, template: TPL_STAFF_CHANGES, preheader: `Changes requested by ${esc(customer?.full_name || "customer")}` },
      );
      await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": brevoKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(brevoPayload({
          to: [{ email: staff.email, name: staff.full_name }],
          subject: `Changes requested by ${customer?.full_name || "customer"}`,
          html,
          replyTo: REPLY.ops,
          tags: ["staff-changes-requested"],
        })),
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
  filesWithUrls?: { name: string; size: number; url: string }[],
) {
  try {
    const { data: customer } = await supabase
      .from("customers")
      .select("email, full_name, company_name")
      .eq("id", customerId)
      .single();

    if (!customer?.email) return;

    // #2.1 Tier 4 — direct lookup (embed alias returned undefined at runtime)
    let projectNumber: string | null = null;
    const { data: orderForPrj } = await supabase
      .from("orders")
      .select("internal_project_id")
      .eq("id", orderId)
      .maybeSingle();
    if ((orderForPrj as any)?.internal_project_id) {
      const { data: ip } = await supabase
        .from("internal_projects")
        .select("project_number")
        .eq("id", (orderForPrj as any).internal_project_id)
        .maybeSingle();
      projectNumber = (ip as any)?.project_number ?? null;
    }
    const companyName: string | null = (customer as any)?.company_name ?? null;

    const orderUrl = `${siteUrl}/dashboard/orders/${orderId}`;

    // File download list — bordered card with per-file Download buttons.
    let fileListHtml = "";
    if (filesWithUrls && filesWithUrls.length > 0) {
      const fileRows = filesWithUrls.map((f) => {
        const sizeStr = f.size > 0
          ? f.size > 1024 * 1024
            ? `${(f.size / 1024 / 1024).toFixed(1)} MB`
            : `${(f.size / 1024).toFixed(0)} KB`
          : "";
        const downloadBtn = f.url
          ? `<a href="${esc(f.url)}" target="_blank" style="display:inline-block;padding:6px 14px;background-color:${C.teal};color:#ffffff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;">Download</a>`
          : "";
        return `<tr>
          <td style="padding:10px 12px;border-bottom:1px solid ${C.border};">
            <span style="font-size:14px;color:${C.navy};font-weight:500;">${esc(f.name)}</span>
            ${sizeStr ? `<span style="font-size:12px;color:${C.muted};margin-left:8px;">(${sizeStr})</span>` : ""}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid ${C.border};text-align:right;">${downloadBtn}</td>
        </tr>`;
      }).join("");
      fileListHtml = `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;border:1px solid ${C.border};border-radius:8px;overflow:hidden;background:${C.white};">${fileRows}</table>
        <p style="margin:0 0 18px;color:${C.muted};font-size:12px;">Download links expire in 7 days.</p>`;
    }

    const invoiceLine = invoiceNumber
      ? `<p style="margin:0 0 16px;color:${C.gray};font-size:14.5px;">Invoice ${strong(esc(invoiceNumber))} has been generated and is available in your dashboard.</p>`
      : "";

    const customerFirstName = (customer.full_name || "").trim().split(/\s+/)[0] || "there";

    const html = emailShell(
      [
        statusBadge("success", "Delivered"),
        title(`Your translation for ${esc(orderNumber)} is ready`),
        lead(
          `Hi ${esc(customerFirstName)}, your final translation has been delivered. Download below — ${strong("links expire in 7 days")}, so save copies locally if you need long-term access.`,
        ),
        fileListHtml,
        invoiceLine,
        ctaButton({ label: "View order & download files", url: orderUrl }),
        hint(
          `Need a revision? Reply to this email within the included revision window — one free pass is included with every order.`,
        ),
      ].join(""),
      { replyTo: REPLY.customer, template: TPL_CUSTOMER_DELIVERY, preheader: `Order ${orderNumber} delivered — download files below (valid 7 days).` },
    );

    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": brevoKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(brevoPayload({
        to: [{ email: customer.email, name: customer.full_name || customer.email }],
        subject: prefixWithProject(
          `Your translation for order ${orderNumber} has been delivered`,
          { companyName, projectNumber },
        ),
        html,
        replyTo: REPLY.customer,
        senderName: "Cethos Translation Services",
        tags: ["customer-order-delivered"],
      })),
    });

    console.log("Delivery notification sent to:", customer.email);
  } catch (err) {
    console.error("Email notification error:", err);
  }
}
