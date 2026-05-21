// ============================================================================
// apply-affidavit-and-finalize
//
// Triggered after a customer approves a draft translation (Flow A) or staff
// applies an override approval (Flow C). Produces the affidavit page as a
// standalone .docx, stores it in the quote-files bucket, attaches it to step 3
// as a working delivery, and moves step 3 to `in_progress`.
//
// The affidavit is NOT the final deliverable. PM still needs to print it +
// the translation, get them signed/stamped by the commissioner of oaths,
// scan the signed copy back in, and upload that as the actual final delivery.
// Only that PM action completes step 3.
//
// Phase A scope: English-target only. Non-English target fails LOUD with
// AFFIDAVIT_TEMPLATE_MISSING — do not silently fall back to English.
//
// Inputs:
//   { order_id, quote_file_id, triggered_by: 'customer_approval'|'staff_override',
//     override_field_values?: Record<string,string>,
//     override_affidavit_text?: string }
//
// Phase A also intentionally OMITS splicing the translated body into a single
// .docx — that lands in Phase A.2. Today the customer receives:
//   - the approved translation (already in quote_files)
//   - the affidavit page as a separate certified .docx file
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { buildAffidavitDocx, type AffidavitFields } from "../_shared/affidavit-docx.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(d: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const BUCKET = "quote-files";

// English ordinal: 1st, 2nd, 3rd, 4th–20th, 21st, 22nd, 23rd, 24th–30th, 31st.
function englishOrdinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

// Date formatter for America/Edmonton in "DD Month YYYY" form.
function formatAffidavitDate(d: Date): { displayDate: string; dayOrdinal: string; monthYear: string } {
  const dt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    year: "numeric", month: "long", day: "2-digit",
  }).formatToParts(d);
  const day = Number(dt.find(p => p.type === "day")?.value ?? "0");
  const month = dt.find(p => p.type === "month")?.value ?? "";
  const year = dt.find(p => p.type === "year")?.value ?? "";
  return {
    displayDate: `${String(day).padStart(2, "0")} ${month} ${year}`,
    dayOrdinal: englishOrdinal(day),
    monthYear: `${month} ${year}`,
  };
}

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k) => vars[k] ?? `{{${k}}}`);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SRK) return json({ error: "supabase env missing" }, 500);
    const sb = createClient(SUPABASE_URL, SRK);

    const body = await req.json();
    const {
      order_id,
      quote_file_id,
      triggered_by,
      override_field_values,
      override_affidavit_text,
    } = body ?? {};

    if (!order_id) return json({ error: "order_id required" }, 400);
    if (!quote_file_id) return json({ error: "quote_file_id required" }, 400);
    if (triggered_by !== "customer_approval" && triggered_by !== "staff_override") {
      return json({ error: "triggered_by must be 'customer_approval' or 'staff_override'" }, 400);
    }

    // --------------------------------------------------------------------
    // 1. Order + quote + cert + languages
    // --------------------------------------------------------------------
    const { data: order } = await sb
      .from("orders")
      .select("id, order_number, quote_id, customer_id, certification_type_id, status")
      .eq("id", order_id)
      .maybeSingle();
    if (!order) return json({ error: "order not found" }, 404);
    if (!order.quote_id) return json({ error: "order has no quote_id" }, 400);

    if (!order.certification_type_id) {
      return json({
        error: "Order has no certification_type assigned — cannot select an affidavit template",
        code: "ORDER_MISSING_CERTIFICATION_TYPE",
      }, 422);
    }

    const { data: cert } = await sb
      .from("certification_types")
      .select("id, code, name")
      .eq("id", order.certification_type_id)
      .maybeSingle();
    if (!cert) return json({ error: "certification_type row missing" }, 500);

    const { data: quote } = await sb
      .from("quotes")
      .select("id, source_language_id, target_language_id, intended_use_id")
      .eq("id", order.quote_id)
      .maybeSingle();
    if (!quote) return json({ error: "quote not found" }, 404);

    const langIds = [quote.source_language_id, quote.target_language_id].filter(Boolean);
    const { data: langs } = await sb
      .from("languages")
      .select("id, code, name")
      .in("id", langIds);
    const sourceLang = langs?.find(l => l.id === quote.source_language_id) ?? null;
    const targetLang = langs?.find(l => l.id === quote.target_language_id) ?? null;
    if (!sourceLang || !targetLang) return json({ error: "languages missing on quote" }, 400);

    const isEnglishTarget = (targetLang.code ?? "").toLowerCase() === "en";
    const languageMode = isEnglishTarget ? "english_only" : "bilingual";

    // --------------------------------------------------------------------
    // 2. Template lookup — fail loud if missing
    // --------------------------------------------------------------------
    const { data: templates } = await sb
      .from("certification_affidavit_templates")
      .select("*")
      .eq("certification_type_code", cert.code)
      .eq("language_mode", languageMode)
      .eq("is_active", true);

    // Prefer matching province if known on a per-order basis. For Phase A
    // there's no per-order province field, so just take the most-recent row.
    const template = (templates ?? []).sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0] ?? null;
    if (!template) {
      return json({
        error: `No ${languageMode === "bilingual" ? "bilingual" : "english_only"} affidavit template configured for target=${targetLang.name}`,
        code: "AFFIDAVIT_TEMPLATE_MISSING",
        remediation: languageMode === "bilingual"
          ? "Seed a bilingual template or use admin override on Step 3"
          : "Seed the english_only template for this certification type",
      }, 422);
    }

    // --------------------------------------------------------------------
    // 3. Source draft file + translator + document holder
    // --------------------------------------------------------------------
    const { data: draftFile } = await sb
      .from("quote_files")
      .select("id, original_filename, document_type_id, document_holder_name, review_status, review_version, staff_notes")
      .eq("id", quote_file_id)
      .maybeSingle();
    if (!draftFile) return json({ error: "draft quote_file not found" }, 404);

    // Per-file document type (Ration Card, Driver's License, etc.).
    let documentTypeName = "Document";
    if (draftFile.document_type_id) {
      const { data: dt } = await sb
        .from("document_types")
        .select("name")
        .eq("id", draftFile.document_type_id)
        .maybeSingle();
      if (dt?.name) documentTypeName = dt.name;
    }

    // Document holder: explicit on the file, override, or customer name fallback.
    let documentHolderName = override_field_values?.document_holder_name
      ?? draftFile.document_holder_name
      ?? null;
    if (!documentHolderName) {
      const { data: cust } = await sb
        .from("customers")
        .select("full_name")
        .eq("id", order.customer_id)
        .maybeSingle();
      documentHolderName = cust?.full_name ?? "—";
    }

    // Translator: step 1 (Translation) vendor for this order.
    const { data: step1 } = await sb
      .from("order_workflow_steps")
      .select("id, vendor_id, final_delivery_id")
      .eq("order_id", order_id)
      .eq("step_number", 1)
      .maybeSingle();
    let translatorFullName: string | null = null;
    let translatorPhone: string | null = null;
    let translatorEmail: string | null = null;
    if (step1?.vendor_id) {
      const { data: vendor } = await sb
        .from("vendors")
        .select("full_name, email, phone")
        .eq("id", step1.vendor_id)
        .maybeSingle();
      translatorFullName = vendor?.full_name ?? null;
      translatorPhone = vendor?.phone ?? null;
      translatorEmail = vendor?.email ?? null;
    }

    // --------------------------------------------------------------------
    // 4. Render the affidavit body + commissioner block
    // --------------------------------------------------------------------
    const now = new Date();
    const { displayDate, dayOrdinal, monthYear } = formatAffidavitDate(now);

    const baseVars: Record<string, string> = {
      source_language: sourceLang.name,
      target_language: targetLang.name,
      affidavit_date: displayDate,
      affidavit_day_ordinal: dayOrdinal,
      affidavit_month_year: monthYear,
      document_holder_name: documentHolderName,
      document_type: documentTypeName,
      translator_full_name: translatorFullName ?? "",
      translator_phone: translatorPhone ?? "",
      translator_email: translatorEmail ?? "",
      commissioner_city: template.jurisdiction_city ?? "",
      commissioner_province: template.jurisdiction_province ?? "",
      ...(override_field_values ?? {}),
    };

    const bodyParagraph = override_affidavit_text
      ?? renderTemplate(template.body_template as string, baseVars);
    const commissionerBlock = renderTemplate(
      template.commissioner_block_template as string,
      baseVars,
    );

    // --------------------------------------------------------------------
    // 5. Generate the .docx
    // --------------------------------------------------------------------
    const labels = (template.field_labels ?? {
      dated: "Dated",
      document_holder: "Name(s) on the document",
      document_translated: "Document translated",
    }) as { dated: string; document_holder: string; document_translated: string };

    const fields: AffidavitFields = {
      heading: (template.heading as string) ?? "AFFIDAVIT",
      affidavitDate: displayDate,
      documentHolderName,
      documentType: documentTypeName,
      bodyParagraph,
      translatorFullName,
      translatorPhone,
      translatorEmail,
      commissionerBlock,
      includeTranslatorBlock: template.include_translator_block ?? true,
      includeCompanyBlock: template.include_company_block ?? true,
      fieldLabels: labels,
    };

    const docxBytes = await buildAffidavitDocx(fields);

    // --------------------------------------------------------------------
    // 6. Upload to quote-files bucket
    // --------------------------------------------------------------------
    const baseName = (draftFile.original_filename ?? "translation")
      .replace(/\.(docx?|pdf)$/i, "")
      .replace(/-DRAFT$/i, "");
    const certifiedFilename = `${baseName}-AFFIDAVIT.docx`;
    const ts = Date.now();
    const storagePath = `${order_id}/certified/${ts}-${certifiedFilename}`;

    const { error: uploadErr } = await sb.storage.from(BUCKET).upload(storagePath, docxBytes, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: false,
    });
    if (uploadErr) return json({ error: `storage upload failed: ${uploadErr.message}` }, 500);

    // --------------------------------------------------------------------
    // 7. Insert quote_files row for the affidavit (category: final_deliverable)
    // --------------------------------------------------------------------
    const { data: cat } = await sb
      .from("file_categories")
      .select("id")
      .eq("slug", "final_deliverable")
      .maybeSingle();
    if (!cat?.id) {
      try { await sb.storage.from(BUCKET).remove([storagePath]); } catch { /* swallow */ }
      return json({ error: "final_deliverable file_category not found" }, 500);
    }

    const { data: certifiedRow, error: certInsertErr } = await sb
      .from("quote_files")
      .insert({
        quote_id: order.quote_id,
        original_filename: certifiedFilename,
        storage_path: storagePath,
        file_size: docxBytes.byteLength,
        mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upload_status: "uploaded",
        processing_status: "completed",
        ai_processing_status: "skipped",
        is_staff_created: true,
        file_category_id: cat.id,
        document_type_id: draftFile.document_type_id ?? null,
        document_holder_name: documentHolderName,
        rendered_affidavit_text: bodyParagraph,
        source_step_delivery_id: step1?.final_delivery_id ?? null,
        staff_notes: `Affidavit generated for ${cert.name} (${languageMode}); triggered_by=${triggered_by}`,
      })
      .select("id, storage_path")
      .single();

    if (certInsertErr || !certifiedRow) {
      try { await sb.storage.from(BUCKET).remove([storagePath]); } catch { /* swallow */ }
      return json({ error: certInsertErr?.message ?? "quote_files insert failed" }, 500);
    }

    // --------------------------------------------------------------------
    // 8. Attach to step-3 (PM Review & Certification) + auto-advance
    // --------------------------------------------------------------------
    const { data: step3 } = await sb
      .from("order_workflow_steps")
      .select("id, status, step_number, name")
      .eq("order_id", order_id)
      .eq("step_number", 3)
      .maybeSingle();

    let step3DeliveryId: string | null = null;
    if (step3) {
      // Next version on this step
      const { data: lastDelivery } = await sb
        .from("step_deliveries")
        .select("version")
        .eq("step_id", step3.id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextVersion = ((lastDelivery as any)?.version ?? 0) + 1;

      // Affidavit is a working artifact for step 3, not the final deliverable.
      // PM still needs to print, get it signed by the commissioner of oaths,
      // scan it back, and upload the signed/scanned PDF as the actual final
      // delivery — which is what marks step 3 done.
      const { data: deliveryRow, error: deliveryErr } = await sb
        .from("step_deliveries")
        .insert({
          step_id: step3.id,
          version: nextVersion,
          actor_type: "internal_work",
          delivered_by_name: "apply-affidavit-and-finalize",
          delivered_at: new Date().toISOString(),
          file_paths: [storagePath],
          notes: `Auto-generated affidavit (working artifact — print, certify, scan + upload signed PDF to finalize). triggered_by=${triggered_by}. cert=${cert.code}.`,
          review_status: "pending_review",
        })
        .select("id")
        .single();
      step3DeliveryId = deliveryRow?.id ?? null;
      if (deliveryErr) console.error("[apply-affidavit] step_deliveries insert error:", deliveryErr);

      // Start step 3 → in_progress. Do NOT set approved_at, final_delivery_id,
      // or final_marked_at — those land when the PM marks the manually-signed
      // and scanned PDF as the final delivery.
      const { error: stepUpdateErr } = await sb
        .from("order_workflow_steps")
        .update({
          status: "in_progress",
          started_at: new Date().toISOString(),
        })
        .eq("id", step3.id);
      if (stepUpdateErr) console.error("[apply-affidavit] step3 update error:", stepUpdateErr);
    }

    // No staff_activity_log insert here. `staff_activity_log.staff_id` is
    // NOT NULL and this function runs without staff context (it's invoked
    // server-side from review-draft-file). The audit trail is already
    // covered by:
    //   - the affidavit `quote_files` row (rendered_affidavit_text,
    //     document_holder_name, source_step_delivery_id, staff_notes)
    //   - the `step_deliveries` row on step 3 (delivered_by_name +
    //     triggered_by + cert code in notes)
    //   - the staff-side row in review-draft-file (action_type=
    //     'draft_override_approved' or, for Flow A, the customer file_review_history row)

    return json({
      success: true,
      affidavit_quote_file_id: certifiedRow.id,
      affidavit_storage_path: storagePath,
      step3_status: step3 ? "in_progress" : "not_found",
      step3_delivery_id: step3DeliveryId,
      template_id: template.id,
      language_mode: languageMode,
      certification_code: cert.code,
      bytes: docxBytes.byteLength,
    }, 201);
  } catch (err: any) {
    console.error("[apply-affidavit-and-finalize] fatal:", err);
    return json({ error: err?.message || String(err) }, 500);
  }
});
