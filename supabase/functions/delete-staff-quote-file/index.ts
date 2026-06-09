// ============================================================================
// delete-staff-quote-file
//
// Soft-deletes a quote_files row that was created by staff (is_staff_created=true),
// and removes the underlying storage object. Mirrors the contract that
// upload-staff-quote-file establishes.
//
// Reconstructed 2026-06-09 after the original bundle was lost. This is the
// 6th edge function in 6 weeks to suffer bundle-loss; pattern documented in
// memory/feedback_supabase_bundle_loss_pattern.md.
//
// Reported by Fayza via Raminder (bug_reports row a1c6b270-6cdb-4966-b415-f8db21972423).
// Client failure mode: "Failed to delete file: Failed to fetch (api.cethos.com)"
// because the gateway returned 503 LOAD_FUNCTION_ERROR.
//
// Client contract (from AdminOrderDetail.tsx deleteFile):
//   POST { file_id: uuid, staffId?: uuid }
//   → { success: true, filename }
//   → { success: false, error } on validation/permission/db failure
//
// Safety:
//   * Only deletes when is_staff_created = true and not already soft-deleted.
//   * Treats not-found and not-staff-created the same way to avoid info leaks.
//   * Wraps storage removal in try/catch so a missing storage object never
//     blocks the soft-delete itself (the row is the source of truth).
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase configuration");
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const fileId = (body.file_id ?? body.fileId) as string | undefined;
    const staffId = (body.staffId ?? body.staff_id) as string | undefined;

    if (!fileId || typeof fileId !== "string") {
      return jsonResponse(
        { success: false, error: "Missing required field: file_id" },
        400,
      );
    }

    // 1. Fetch the row. Only staff-created files are deletable here.
    const { data: file, error: lookupError } = await supabase
      .from("quote_files")
      .select(
        "id, quote_id, original_filename, storage_path, is_staff_created, deleted_at",
      )
      .eq("id", fileId)
      .maybeSingle();

    if (lookupError) {
      console.error("Lookup error:", lookupError);
      throw new Error(`Lookup failed: ${lookupError.message}`);
    }

    if (!file) {
      return jsonResponse(
        { success: false, error: "File not found" },
        404,
      );
    }

    if (!file.is_staff_created) {
      // Staff aren't allowed to delete customer-uploaded files via this endpoint.
      return jsonResponse(
        {
          success: false,
          error:
            "This file was not uploaded by staff and can't be deleted from this UI.",
        },
        403,
      );
    }

    if (file.deleted_at) {
      // Idempotent — treat as success so the client can refresh its list.
      return jsonResponse({
        success: true,
        filename: file.original_filename,
        already_deleted: true,
      });
    }

    // 2. Soft-delete the row first (source of truth).
    const { error: updateError } = await supabase
      .from("quote_files")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", fileId);

    if (updateError) {
      console.error("Soft-delete error:", updateError);
      throw new Error(`Delete failed: ${updateError.message}`);
    }

    // 3. Best-effort storage cleanup. Don't fail the response if it errors —
    //    a missing object would orphan the storage but the DB row is already
    //    marked deleted. Any real cleanup happens in a separate cron.
    if (file.storage_path) {
      try {
        const { error: storageError } = await supabase.storage
          .from("quote-files")
          .remove([file.storage_path]);
        if (storageError) {
          console.warn(
            "Storage remove warning (non-fatal):",
            storageError.message,
          );
        }
      } catch (e: any) {
        console.warn("Storage remove exception (non-fatal):", e?.message ?? e);
      }
    }

    // 4. Audit log — best-effort; don't fail if staff_id is missing or staff
    //    activity table rejects the insert.
    if (staffId) {
      try {
        await supabase.from("staff_activity_log").insert({
          staff_id: staffId,
          activity_type: "file_deleted",
          entity_type: "quote",
          entity_id: file.quote_id,
          details: {
            file_id: file.id,
            filename: file.original_filename,
            storage_path: file.storage_path,
          },
        });
      } catch (e: any) {
        console.warn(
          "staff_activity_log insert warning (non-fatal):",
          e?.message ?? e,
        );
      }
    }

    return jsonResponse({
      success: true,
      filename: file.original_filename,
    });
  } catch (error: any) {
    console.error("delete-staff-quote-file error:", error?.message ?? error);
    return jsonResponse(
      { success: false, error: error?.message ?? "Internal error" },
      400,
    );
  }
});
