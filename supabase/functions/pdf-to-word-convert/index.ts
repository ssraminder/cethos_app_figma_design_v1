// supabase/functions/pdf-to-word-convert/index.ts
//
// Converts a scanned PDF to a layout-preserved DOCX using Adobe PDF Services
// (Export PDF to Word with OCR). Files live in the `pdf-to-word` storage
// bucket; input under `input/<jobId>.pdf`, output under `output/<jobId>.docx`.
//
// Request body: { jobId: string, storagePath: string, filename: string }
// Response:     { success, outputPath, signedUrl, sizeBytes, pagesProcessed? }
//
// Required edge-function secrets (set via `supabase secrets set`):
//   ADOBE_CLIENT_ID
//   ADOBE_CLIENT_SECRET
//
// Adobe PDF Services auth is OAuth2 client credentials. The Export PDF
// operation runs OCR automatically on scanned PDFs when `ocrLang` is passed.
// Docs: https://developer.adobe.com/document-services/docs/apis/#tag/Export-PDF

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ADOBE_IMS_URL = "https://ims-na1.adobelogin.com/ims/token/v3";
const ADOBE_PDF_BASE = "https://pdf-services.adobe.io";
const BUCKET = "pdf-to-word";
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24; // 24h download window
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 min — Adobe typically <60s/doc
const DEFAULT_OCR_LANG = "en-US";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const clientId = Deno.env.get("ADOBE_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("ADOBE_CLIENT_SECRET") ?? "";

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    if (!clientId || !clientSecret) {
      throw new Error(
        "ADOBE_CLIENT_ID / ADOBE_CLIENT_SECRET not configured in edge-function secrets",
      );
    }

    const body = await req.json().catch(() => ({}));
    const jobId = body.jobId as string | undefined;
    const storagePath = body.storagePath as string | undefined;
    const filename = (body.filename as string) || "document.pdf";
    const ocrLang = (body.ocrLang as string) || DEFAULT_OCR_LANG;

    if (!jobId || !storagePath) {
      return jsonResponse(400, {
        success: false,
        error: "jobId and storagePath are required",
      });
    }

    console.log(`📄 PDF→Word — job ${jobId} (${filename}), lang=${ocrLang}`);

    // 1. Download PDF from Supabase storage
    const { data: pdfBlob, error: downloadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .download(storagePath);
    if (downloadError || !pdfBlob) {
      throw new Error(
        `Failed to download input PDF: ${downloadError?.message || "empty blob"}`,
      );
    }
    const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());
    console.log(`  ↳ downloaded ${pdfBytes.byteLength} bytes from storage`);

    // 2. Get Adobe access token
    const accessToken = await getAdobeAccessToken(clientId, clientSecret);

    // 3. Create asset slot (returns uploadUri + assetID)
    const { uploadUri, assetID } = await createAdobeAsset(
      accessToken,
      clientId,
      "application/pdf",
    );

    // 4. Upload PDF bytes to the presigned S3 URL
    const uploadResp = await fetch(uploadUri, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: pdfBytes,
    });
    if (!uploadResp.ok) {
      throw new Error(
        `Adobe asset upload failed: ${uploadResp.status} ${await uploadResp.text().catch(() => "")}`,
      );
    }

    // 5. Kick off Export PDF → DOCX with OCR
    const jobLocation = await startExportPdfJob(
      accessToken,
      clientId,
      assetID,
      ocrLang,
    );
    console.log(`  ↳ Adobe job started: ${jobLocation}`);

    // 6. Poll until done
    const jobResult = await pollAdobeJob(accessToken, clientId, jobLocation);
    console.log(`  ↳ Adobe job completed, downloading DOCX`);

    // 7. Download the DOCX from Adobe's returned URL
    const docxResp = await fetch(jobResult.downloadUri);
    if (!docxResp.ok) {
      throw new Error(
        `Failed to download converted DOCX: ${docxResp.status}`,
      );
    }
    const docxBytes = new Uint8Array(await docxResp.arrayBuffer());

    // 8. Upload DOCX to Supabase storage
    const outputPath = `output/${jobId}.docx`;
    const { error: uploadErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(outputPath, docxBytes, {
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });
    if (uploadErr) {
      throw new Error(`Failed to store DOCX: ${uploadErr.message}`);
    }

    // 9. Signed URL for client download
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(outputPath, SIGNED_URL_TTL_SECONDS);
    if (signErr || !signed?.signedUrl) {
      throw new Error(
        `Failed to sign output URL: ${signErr?.message || "no URL"}`,
      );
    }

    console.log(`✅ PDF→Word done: ${outputPath} (${docxBytes.byteLength} bytes)`);

    return jsonResponse(200, {
      success: true,
      jobId,
      outputPath,
      signedUrl: signed.signedUrl,
      sizeBytes: docxBytes.byteLength,
    });
  } catch (error: any) {
    const errorMessage = error?.message?.substring(0, 500) || "Unknown error";
    console.error("❌ PDF→Word error:", errorMessage);
    return jsonResponse(500, { success: false, error: errorMessage });
  }
});

// ============================================================================
// Adobe PDF Services helpers
// ============================================================================

async function getAdobeAccessToken(
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const form = new URLSearchParams();
  form.set("client_id", clientId);
  form.set("client_secret", clientSecret);
  form.set("grant_type", "client_credentials");
  form.set("scope", "openid,AdobeID,DCAPI");

  const resp = await fetch(ADOBE_IMS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!resp.ok) {
    throw new Error(
      `Adobe IMS token failed: ${resp.status} ${await resp.text().catch(() => "")}`,
    );
  }
  const data = await resp.json();
  if (!data.access_token) {
    throw new Error("Adobe IMS response missing access_token");
  }
  return data.access_token as string;
}

async function createAdobeAsset(
  accessToken: string,
  clientId: string,
  mediaType: string,
): Promise<{ uploadUri: string; assetID: string }> {
  const resp = await fetch(`${ADOBE_PDF_BASE}/assets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-API-Key": clientId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mediaType }),
  });
  if (!resp.ok) {
    throw new Error(
      `Adobe asset create failed: ${resp.status} ${await resp.text().catch(() => "")}`,
    );
  }
  const data = await resp.json();
  if (!data.uploadUri || !data.assetID) {
    throw new Error("Adobe asset response missing uploadUri/assetID");
  }
  return { uploadUri: data.uploadUri, assetID: data.assetID };
}

async function startExportPdfJob(
  accessToken: string,
  clientId: string,
  assetID: string,
  ocrLang: string,
): Promise<string> {
  const resp = await fetch(`${ADOBE_PDF_BASE}/operation/exportpdf`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-API-Key": clientId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      assetID,
      targetFormat: "docx",
      ocrLang,
    }),
  });
  // Adobe returns 201 with a Location header pointing to the job polling URL
  if (resp.status !== 201) {
    throw new Error(
      `Adobe export job start failed: ${resp.status} ${await resp.text().catch(() => "")}`,
    );
  }
  const location = resp.headers.get("location");
  if (!location) {
    throw new Error("Adobe export job missing Location header");
  }
  return location;
}

async function pollAdobeJob(
  accessToken: string,
  clientId: string,
  jobUrl: string,
): Promise<{ downloadUri: string }> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const resp = await fetch(jobUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-API-Key": clientId,
      },
    });
    if (!resp.ok) {
      throw new Error(
        `Adobe job poll failed: ${resp.status} ${await resp.text().catch(() => "")}`,
      );
    }
    const data = await resp.json();
    const status = (data.status || "").toLowerCase();

    if (status === "done") {
      const downloadUri = data?.asset?.downloadUri;
      if (!downloadUri) {
        throw new Error("Adobe job done but downloadUri missing");
      }
      return { downloadUri };
    }
    if (status === "failed") {
      const errMsg = data?.error?.message || JSON.stringify(data?.error || {});
      throw new Error(`Adobe job failed: ${errMsg}`);
    }
    // "in progress" or unknown — wait and retry
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error("Adobe job timed out after 5 minutes");
}

// ============================================================================
// Utilities
// ============================================================================

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
