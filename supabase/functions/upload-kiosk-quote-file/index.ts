// ============================================================================
// upload-kiosk-quote-file
//
// Kiosk-authenticated version of upload-staff-quote-file. Same storage bucket
// (quote-files), same quote_files table — just different auth gate.
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  authenticateDevice,
  getSupabaseAdmin,
  handleOptions,
  jsonResponse,
  KioskAuthError,
  resolveActingStaffId,
} from "../_shared/kiosk-auth.ts";

serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const supabase = getSupabaseAdmin();
    const device = await authenticateDevice(req, supabase);
    const actingStaffId = await resolveActingStaffId(req, device);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const quoteId = formData.get("quoteId") as string | null;

    if (!file) throw new Error("Missing file");
    if (!quoteId) throw new Error("Missing quoteId");

    // Confirm quote belongs to this device (defense in depth)
    const { data: quote } = await supabase
      .from("quotes")
      .select("id, kiosk_device_id")
      .eq("id", quoteId)
      .maybeSingle();
    if (!quote || quote.kiosk_device_id !== device.id) {
      return jsonResponse(
        { success: false, error: "Quote not found or not owned by this device" },
        403,
      );
    }

    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${quoteId}/${timestamp}_${sanitizedName}`;

    const { error: uploadError } = await supabase.storage
      .from("quote-files")
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });
    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    const { data: fileRecord, error: dbError } = await supabase
      .from("quote_files")
      .insert({
        quote_id: quoteId,
        original_filename: file.name,
        storage_path: storagePath,
        mime_type: file.type,
        file_size: file.size,
        upload_status: "uploaded",
        is_staff_created: true,
        ai_processing_status: "skipped",
      })
      .select("id")
      .single();

    if (dbError) {
      await supabase.storage.from("quote-files").remove([storagePath]);
      throw new Error(`Database insert failed: ${dbError.message}`);
    }

    await supabase
      .from("staff_activity_log")
      .insert({
        staff_id: actingStaffId,
        activity_type: "kiosk_file_uploaded",
        entity_type: "quote",
        entity_id: quoteId,
        details: {
          file_id: fileRecord.id,
          filename: file.name,
          storage_path: storagePath,
          kiosk_device_id: device.id,
        },
      })
      .then(() => {}, (err) => console.warn("activity log insert failed:", err));

    return jsonResponse({
      success: true,
      file_id: fileRecord.id,
      storage_path: storagePath,
    });
  } catch (err) {
    if (err instanceof KioskAuthError) {
      return jsonResponse({ success: false, error: err.message }, err.status);
    }
    console.error("upload-kiosk-quote-file error:", err);
    return jsonResponse(
      { success: false, error: err instanceof Error ? err.message : "Server error" },
      500,
    );
  }
});
