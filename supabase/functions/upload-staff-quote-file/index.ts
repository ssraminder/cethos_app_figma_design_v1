// ============================================================================
// upload-staff-quote-file
// Handles file uploads from staff to a quote's storage bucket.
// Accepts multipart form data with a file and metadata fields.
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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const quoteId = formData.get("quoteId") as string | null;
    const staffId = formData.get("staffId") as string | null;
    const fileCategory = formData.get("file_category") as string | null;
    const staffNotes = formData.get("staffNotes") as string | null;

    if (!file) throw new Error("Missing required field: file");
    if (!quoteId) throw new Error("Missing required field: quoteId");
    if (!staffId) throw new Error("Missing required field: staffId");

    console.log("upload-staff-quote-file called:", {
      filename: file.name,
      size: file.size,
      quoteId,
      staffId,
      fileCategory,
      hasStaffNotes: !!staffNotes,
    });

    // Upload file to storage
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
      console.error("Storage upload error:", uploadError);
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // Look up file category ID if provided
    let fileCategoryId: string | null = null;
    if (fileCategory) {
      const { data: category } = await supabase
        .from("file_categories")
        .select("id")
        .eq("slug", fileCategory)
        .single();

      if (category) {
        fileCategoryId = category.id;
      }
    }

    // Insert quote_files record
    const insertData: Record<string, unknown> = {
      quote_id: quoteId,
      original_filename: file.name,
      storage_path: storagePath,
      mime_type: file.type,
      file_size: file.size,
      upload_status: "uploaded",
      is_staff_created: true,
      ai_processing_status: "skipped",
      file_category_id: fileCategoryId,
    };

    if (staffNotes && staffNotes.trim()) {
      insertData.staff_notes = staffNotes.trim();
    }

    const { data: fileRecord, error: dbError } = await supabase
      .from("quote_files")
      .insert(insertData)
      .select("id")
      .single();

    if (dbError) {
      console.error("Database insert error:", dbError);
      // Clean up uploaded file
      await supabase.storage.from("quote-files").remove([storagePath]);
      throw new Error(`Database insert failed: ${dbError.message}`);
    }

    // Log to staff activity
    await supabase.from("staff_activity_log").insert({
      staff_id: staffId,
      activity_type: "file_uploaded",
      entity_type: "quote",
      entity_id: quoteId,
      details: {
        file_id: fileRecord.id,
        filename: file.name,
        file_category: fileCategory,
        storage_path: storagePath,
      },
    });

    console.log("File uploaded successfully:", fileRecord.id);

    return jsonResponse({
      success: true,
      file_id: fileRecord.id,
      fileId: fileRecord.id,
      filename: file.name,
      storage_path: storagePath,
      storagePath: storagePath,
    });
  } catch (error) {
    console.error("upload-staff-quote-file error:", error.message);
    return jsonResponse({ success: false, error: error.message }, 400);
  }
});
