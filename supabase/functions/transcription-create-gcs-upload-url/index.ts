// POST /functions/v1/transcription-create-gcs-upload-url
//
// Mints a Google Cloud Storage V4 signed PUT URL so the browser can upload
// source media directly to GCS, bypassing Supabase Storage's project-level
// upload caps and TUS auth quirks.
//
// Body:
//   {
//     "job_id":       string (UUID),  // ties the object name into the job dir
//     "file_index":   number,          // 0..N — for multi-file uploads
//     "filename":     string,          // original filename (only the extension is used)
//     "content_type": string           // browser-detected MIME (passed through to the PUT)
//   }
//
// Response:
//   {
//     "success":     true,
//     "signed_url":  "https://storage.googleapis.com/cethos-stt-input/...",
//     "gcs_uri":     "gs://cethos-stt-input/uploads/{jobId}/raw_{i}.{ext}",
//     "expires_at":  "<ISO timestamp>"
//   }
//
// Auth: same Supabase session check as the other admin-only fns —
// transcription-process is invoked from authenticated admin/customer paths
// where the JWT is sent automatically via supabase.functions.invoke().
//
// Side effect (first call only): ensures the cethos-stt-input bucket exists
// with the correct CORS config so cross-origin PUT works from portal.cethos.com.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  jsonResponse,
  preflight,
} from "../_shared/transcription.ts";
import {
  ensureSttInputBucket,
  assertSttBucketExists,
  generateSignedUrl,
} from "../_shared/google-storage.ts";

const UPLOAD_EXPIRY_SECONDS = 60 * 60;     // 1 hour — enough for any single PUT

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  let body: {
    job_id?: string;
    file_index?: number;
    filename?: string;
    content_type?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }

  const jobId = body.job_id;
  const fileIndex = typeof body.file_index === "number" ? body.file_index : 0;
  const filename = body.filename ?? "";
  const contentType = body.content_type ?? "application/octet-stream";

  if (!jobId) return jsonResponse({ success: false, error: "job_id required" }, 400);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    return jsonResponse({ success: false, error: "job_id must be a UUID" }, 400);
  }
  if (fileIndex < 0 || fileIndex > 999) {
    return jsonResponse({ success: false, error: "file_index out of range" }, 400);
  }

  // Derive an extension from the filename — fallback to "bin"
  const ext = (filename.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
  const objectName = `uploads/${jobId}/raw_${fileIndex}.${ext}`;

  try {
    // Bucket name resolution (no remote call). The bucket itself is one-time
    // infrastructure — see scripts/setup-gcs.sh. assertSttBucketExists() probes
    // on first call (per cold start) and caches; if missing, it throws a clear
    // setup-pointing error rather than attempting auto-create at runtime.
    const bucketName = await ensureSttInputBucket();
    await assertSttBucketExists(bucketName);

    const signedUrl = await generateSignedUrl(bucketName, objectName, {
      method: "PUT",
      contentType,
      expirySeconds: UPLOAD_EXPIRY_SECONDS,
    });

    return jsonResponse({
      success: true,
      signed_url: signedUrl,
      gcs_uri: `gs://${bucketName}/${objectName}`,
      bucket: bucketName,
      object_name: objectName,
      content_type: contentType,
      expires_at: new Date(Date.now() + UPLOAD_EXPIRY_SECONDS * 1000).toISOString(),
    });
  } catch (e) {
    console.error("create-gcs-upload-url failed:", e);
    return jsonResponse({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }, 500);
  }
});
