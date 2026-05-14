// POST /functions/v1/customer-quote-finalize-files
// Body: {
//   quote_id: string,
//   files: Array<{
//     temp_path: string,        // must start with "uploads/"
//     original_filename: string,
//     file_size: number,
//     mime_type: string,
//     is_reference?: boolean
//   }>
// }
// Returns: { success, files: [{ original_filename, storage_path, quote_files_id }] }
//
// Replaces the anon storage.upload + quote_files.insert calls in
// client/components/quote/Step1Upload.tsx. The client uploads each file once
// to `<bucket>/uploads/<random>` (allowed by RLS for anon); this function
// then moves the object to `<bucket>/<quote_id>/<filename>` and inserts the
// quote_files row using the service role.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  getAdminClient,
  jsonResponse,
  preflight,
} from "../_shared/customer-quote.ts";

// Mirrors the constants used by Step1Upload pre-migration.
const FILE_CATEGORY_TO_TRANSLATE = "45cb02ba-fca5-423a-8cb9-6ad807ad3bbc";
const FILE_CATEGORY_REFERENCE = "f1aed462-a25f-4dd0-96c0-f952c3a72950";

const REGULAR_BUCKET = "quote-files";
const REFERENCE_BUCKET = "quote-reference-files";

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 200) || "file";
}

interface IncomingFile {
  temp_path: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  is_reference?: boolean;
  is_replacement?: boolean;
}

interface FinalizedFile {
  original_filename: string;
  storage_path: string;
  quote_files_id: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const quoteId = body?.quote_id;
    const filesInput = body?.files;

    if (typeof quoteId !== "string" || quoteId.length === 0) {
      return jsonResponse({ success: false, error: "Missing quote_id" }, 400);
    }
    if (!Array.isArray(filesInput) || filesInput.length === 0) {
      return jsonResponse({ success: false, error: "files must be a non-empty array" }, 400);
    }

    const admin = await getAdminClient();

    // Confirm the quote exists before doing storage work.
    const { data: quoteRow, error: quoteErr } = await admin
      .from("quotes")
      .select("id")
      .eq("id", quoteId)
      .maybeSingle();
    if (quoteErr) {
      return jsonResponse({ success: false, error: quoteErr.message }, 500);
    }
    if (!quoteRow) {
      return jsonResponse({ success: false, error: "Quote not found" }, 404);
    }

    const finalized: FinalizedFile[] = [];
    const errors: Array<{ original_filename: string; error: string }> = [];

    for (const raw of filesInput as IncomingFile[]) {
      const originalFilename = String(raw?.original_filename ?? "").trim();
      const tempPath = String(raw?.temp_path ?? "").trim();
      const fileSize = Number(raw?.file_size ?? 0);
      const mimeType = String(raw?.mime_type ?? "application/octet-stream");
      const isReference = !!raw?.is_reference;
      const isReplacement = !!raw?.is_replacement;

      if (!originalFilename || !tempPath) {
        errors.push({
          original_filename: originalFilename || "(unknown)",
          error: "Missing original_filename or temp_path",
        });
        continue;
      }
      if (!tempPath.startsWith("uploads/")) {
        errors.push({
          original_filename: originalFilename,
          error: "temp_path must be under the 'uploads/' prefix",
        });
        continue;
      }

      const bucket = isReference ? REFERENCE_BUCKET : REGULAR_BUCKET;
      const sanitized = sanitizeFilename(originalFilename);
      const finalName = isReference ? `ref_${sanitized}` : sanitized;
      const finalPath = `${quoteId}/${finalName}`;

      // Move within the same bucket from uploads/* to <quote_id>/*.
      const moveRes = await admin.storage.from(bucket).move(tempPath, finalPath);
      if (moveRes.error) {
        // If the destination already exists, attempt to fall through with the
        // existing object — frontends may retry.
        const msg = moveRes.error.message ?? String(moveRes.error);
        if (!/already exists|exists/i.test(msg)) {
          errors.push({ original_filename: originalFilename, error: `move failed: ${msg}` });
          continue;
        }
      }

      const insertRow: Record<string, unknown> = {
        quote_id: quoteId,
        original_filename: originalFilename,
        storage_path: finalPath,
        file_size: fileSize,
        mime_type: mimeType,
        upload_status: "uploaded",
        ai_processing_status: isReference ? "skipped" : "pending",
        file_category_id: isReference
          ? FILE_CATEGORY_REFERENCE
          : FILE_CATEGORY_TO_TRANSLATE,
      };
      if (isReplacement) insertRow.is_replacement = true;

      const { data: inserted, error: insertErr } = await admin
        .from("quote_files")
        .insert(insertRow)
        .select("id")
        .single();

      if (insertErr) {
        errors.push({ original_filename: originalFilename, error: insertErr.message });
        continue;
      }

      finalized.push({
        original_filename: originalFilename,
        storage_path: finalPath,
        quote_files_id: inserted!.id,
      });
    }

    return jsonResponse({
      success: errors.length === 0,
      files: finalized,
      errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("customer-quote-finalize-files error:", message);
    return jsonResponse({ success: false, error: message }, 500);
  }
});
