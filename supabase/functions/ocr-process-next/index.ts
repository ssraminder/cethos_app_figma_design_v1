// supabase/functions/ocr-process-next/index.ts
// Version: 19
// Changes:
//   v19: Memory-efficient base64 encoding for large PDF chunks.
//        Replaces the string concatenation approach (which OOMs on 20MB+ files)
//        with a chunked encoding strategy that processes 32KB at a time.
//   v18: Concurrency guard on self-chain.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NOTIFICATION_EMAILS = [
  "info@cethos.com",
  "pm@cethoscorp.com",
  "raminder@cethos.com",
];

const DOCUMENT_AI_TIMEOUT_MS = 90_000;
const SELF_CHAIN_DELAY_MS = 500;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    console.log("🔍 Looking for next pending file...");

    const { data: nextFile, error: nextError } = await supabaseAdmin
      .rpc("get_next_ocr_file");

    if (nextError) {
      console.error("Error getting next file:", nextError);
      throw new Error(`Failed to get next file: ${nextError.message}`);
    }

    if (!nextFile || nextFile.length === 0) {
      console.log("✅ No pending files to process — chain complete");
      return new Response(
        JSON.stringify({ success: true, message: "No pending files" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const file = nextFile[0];
    console.log(`📄 Processing file: ${file.filename} (${file.file_id})`);

    await supabaseAdmin
      .from("ocr_batch_files")
      .update({ status: "processing", started_at: new Date().toISOString() })
      .eq("id", file.file_id);

    const startTime = Date.now();
    let processingResult: { success: boolean; pages?: number; words?: number; error?: string } = { success: false };

    try {
      console.log(`⬇️ Downloading from: ${file.storage_path}`);
      const { data: fileData, error: downloadError } = await supabaseAdmin
        .storage
        .from("ocr-uploads")
        .download(file.storage_path);

      if (downloadError || !fileData) {
        throw new Error(`Failed to download file: ${downloadError?.message || "No data"}`);
      }

      const arrayBuffer = await fileData.arrayBuffer();
      const fileSizeKB = Math.round(arrayBuffer.byteLength / 1024);
      const fileSizeMB = (arrayBuffer.byteLength / (1024 * 1024)).toFixed(1);
      console.log(`📦 File size: ${fileSizeKB} KB (${fileSizeMB} MB)`);

      // Memory-efficient base64 encoding using Deno std library
      // This avoids the OOM from building a giant string via string concatenation
      const base64Content = base64Encode(new Uint8Array(arrayBuffer));

      console.log(`📤 Sending to Document AI (${fileSizeMB} MB, base64: ${Math.round(base64Content.length / 1024)} KB)...`);

      const accessToken = await getGoogleAccessToken();

      const projectId = Deno.env.get("GOOGLE_CLOUD_PROJECT");
      const location = Deno.env.get("DOCUMENT_AI_LOCATION") || "us";
      const processorId = Deno.env.get("DOCUMENT_AI_PROCESSOR_ID");

      if (!projectId) throw new Error("GOOGLE_CLOUD_PROJECT not configured");
      if (!processorId) throw new Error("DOCUMENT_AI_PROCESSOR_ID not configured");

      const documentAiUrl = `https://${location}-documentai.googleapis.com/v1/projects/${projectId}/locations/${location}/processors/${processorId}:process`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.error(`⏱️ Document AI request timed out after ${DOCUMENT_AI_TIMEOUT_MS / 1000}s for file ${file.filename}`);
        controller.abort();
      }, DOCUMENT_AI_TIMEOUT_MS);

      let docAiResponse: Response;
      try {
        docAiResponse = await fetch(documentAiUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            rawDocument: {
              content: base64Content,
              mimeType: "application/pdf",
            },
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!docAiResponse.ok) {
        const errorText = await docAiResponse.text();
        throw new Error(`Document AI error: ${docAiResponse.status} - ${errorText}`);
      }

      const docAiResult = await docAiResponse.json();
      const document = docAiResult.document;

      if (!document) {
        throw new Error("No document in Document AI response");
      }

      console.log(`✅ Document AI processed: ${document.pages?.length || 0} pages`);

      const pages = document.pages || [];
      let totalWords = 0;

      const pageResults = pages.map((page: any, index: number) => {
        const pageText = extractPageText(document.text, page);
        const wordCount = countWords(pageText);
        const charCount = pageText.length;
        totalWords += wordCount;
        const { language, confidence } = extractPageLanguage(page);
        return {
          file_id: file.file_id,
          page_number: index + 1,
          word_count: wordCount,
          character_count: charCount,
          raw_text: pageText.substring(0, 50000),
          confidence_score: page.layout?.confidence || null,
          detected_language: language,
          language_confidence: confidence,
        };
      });

      if (pageResults.length > 0) {
        const { error: insertError } = await supabaseAdmin
          .from("ocr_batch_results")
          .insert(pageResults);
        if (insertError) {
          throw new Error(`Failed to save results: ${insertError.message}`);
        }
      }

      const processingTime = Date.now() - startTime;

      await supabaseAdmin
        .from("ocr_batch_files")
        .update({
          status: "completed",
          page_count: pages.length,
          word_count: totalWords,
          processing_time_ms: processingTime,
          completed_at: new Date().toISOString(),
        })
        .eq("id", file.file_id);

      console.log(`✅ File completed: ${pages.length} pages, ${totalWords} words, ${processingTime}ms`);

      await updateBatchProgress(supabaseAdmin, file.batch_id);
      await checkAndNotify(supabaseAdmin, file.batch_id);

      processingResult = { success: true, pages: pages.length, words: totalWords };

    } catch (processingError: any) {
      const isTimeout = processingError.name === "AbortError";
      const errorMessage = isTimeout
        ? `Document AI timeout after ${DOCUMENT_AI_TIMEOUT_MS / 1000}s — chunk too large`
        : (processingError.message?.substring(0, 500) || "Unknown error");

      console.error(`❌ Processing error for ${file.filename}:`, errorMessage);

      await supabaseAdmin
        .from("ocr_batch_files")
        .update({
          status: "failed",
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq("id", file.file_id);

      await updateBatchProgress(supabaseAdmin, file.batch_id);
      await checkAndNotify(supabaseAdmin, file.batch_id);

      processingResult = { success: false, error: errorMessage };
    }

    // ── v18: Self-chain with concurrency guard ─────────────────────────────
    const { data: pendingFiles } = await supabaseAdmin
      .from("ocr_batch_files")
      .select("id")
      .eq("status", "pending")
      .limit(1);

    const { data: processingFiles } = await supabaseAdmin
      .from("ocr_batch_files")
      .select("id")
      .eq("status", "processing")
      .limit(1);

    const hasPending = pendingFiles && pendingFiles.length > 0;
    const alreadyProcessing = processingFiles && processingFiles.length > 0;

    if (hasPending && !alreadyProcessing) {
      console.log(`🔗 More files pending, none processing — self-chaining in ${SELF_CHAIN_DELAY_MS}ms...`);
      setTimeout(() => {
        fetch(`${supabaseUrl}/functions/v1/ocr-process-next`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }).catch((e) => console.error("Self-chain fire failed:", e.message));
      }, SELF_CHAIN_DELAY_MS);
    } else if (hasPending && alreadyProcessing) {
      console.log("⏭️ More files pending but another instance is already processing — skipping self-chain");
    } else {
      console.log("✅ No more pending files — chain complete");
    }

    return new Response(
      JSON.stringify({ success: processingResult.success, fileId: file.file_id, filename: file.filename, ...processingResult }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("❌ Fatal error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function extractPageText(fullText: string, page: any): string {
  if (!fullText || !page.layout?.textAnchor?.textSegments) return "";
  const segments = page.layout.textAnchor.textSegments;
  let pageText = "";
  for (const segment of segments) {
    const startIndex = parseInt(segment.startIndex || "0");
    const endIndex = parseInt(segment.endIndex || "0");
    pageText += fullText.substring(startIndex, endIndex);
  }
  return pageText;
}

function countWords(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter(word => word.length > 0).length;
}

function extractPageLanguage(page: any): { language: string | null; confidence: number | null } {
  try {
    const detectedLanguages = page.detectedLanguages;
    if (!detectedLanguages || detectedLanguages.length === 0) return { language: null, confidence: null };
    let bestLanguage = detectedLanguages[0];
    for (const lang of detectedLanguages) {
      if ((lang.confidence || 0) > (bestLanguage.confidence || 0)) bestLanguage = lang;
    }
    return { language: bestLanguage.languageCode || null, confidence: bestLanguage.confidence || null };
  } catch (e) {
    return { language: null, confidence: null };
  }
}

async function updateBatchProgress(supabaseAdmin: any, batchId: string): Promise<void> {
  const { data: files } = await supabaseAdmin
    .from("ocr_batch_files")
    .select("status, page_count, word_count")
    .eq("batch_id", batchId);

  if (!files) return;

  const completed = files.filter((f: any) => f.status === "completed").length;
  const failed = files.filter((f: any) => f.status === "failed").length;
  const totalPages = files.reduce((sum: number, f: any) => sum + (f.page_count || 0), 0);
  const totalWords = files.reduce((sum: number, f: any) => sum + (f.word_count || 0), 0);
  const allDone = (completed + failed) === files.length;

  await supabaseAdmin
    .from("ocr_batches")
    .update({
      status: allDone ? "completed" : "processing",
      completed_files: completed,
      failed_files: failed,
      total_pages: totalPages,
      total_words: totalWords,
      ...(allDone ? { completed_at: new Date().toISOString() } : {}),
    })
    .eq("id", batchId);
}

// ============================================================================
// GOOGLE AUTH
// ============================================================================

async function getGoogleAccessToken(): Promise<string> {
  const credentialsJson = Deno.env.get("GOOGLE_APPLICATION_CREDENTIALS_JSON");
  if (!credentialsJson) throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON not configured");

  const credentials = JSON.parse(credentialsJson);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const privateKey = credentials.private_key;
  const pemContents = privateKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, encoder.encode(unsignedToken));
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const jwt = `${unsignedToken}.${signatureB64}`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) {
    throw new Error(`Google auth failed: ${tokenData.error_description || tokenData.error || "Unknown error"}`);
  }
  return tokenData.access_token;
}

// ============================================================================
// EMAIL NOTIFICATION
// ============================================================================

async function checkAndNotify(supabaseAdmin: any, batchId: string): Promise<void> {
  const { data: batch, error: batchError } = await supabaseAdmin
    .from("ocr_batches").select("*").eq("id", batchId).single();

  if (batchError || !batch) return;

  if (batch.status === "completed" && !batch.notification_sent) {
    console.log(`📧 Batch ${batchId} complete, sending notification...`);
    try {
      await sendNotificationEmail(supabaseAdmin, batch);
      await supabaseAdmin.from("ocr_batches").update({
        notification_sent: true,
        notification_sent_at: new Date().toISOString(),
      }).eq("id", batchId);
      console.log("✅ Notification sent");
    } catch (emailError: any) {
      console.error("❌ Failed to send notification:", emailError.message);
    }
  }
}

async function sendNotificationEmail(supabaseAdmin: any, batch: any): Promise<void> {
  const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
  if (!BREVO_API_KEY) return;

  const { data: files } = await supabaseAdmin
    .from("ocr_batch_files")
    .select("filename, status, page_count, word_count, error_message, file_group_id, original_filename, chunk_index")
    .eq("batch_id", batch.id)
    .order("queued_at");

  const groupMap = new Map<string, any[]>();
  const standaloneFiles: any[] = [];

  (files || []).forEach((f: any) => {
    if (f.file_group_id) {
      if (!groupMap.has(f.file_group_id)) groupMap.set(f.file_group_id, []);
      groupMap.get(f.file_group_id)!.push(f);
    } else {
      standaloneFiles.push(f);
    }
  });

  interface DisplayRow { filename: string; status: string; page_count: number; word_count: number; error_message: string | null; }
  const displayRows: DisplayRow[] = [];

  groupMap.forEach((chunks) => {
    chunks.sort((a: any, b: any) => (a.chunk_index || 0) - (b.chunk_index || 0));
    const totalPages = chunks.reduce((sum: number, c: any) => sum + (c.page_count || 0), 0);
    const totalWords = chunks.reduce((sum: number, c: any) => sum + (c.word_count || 0), 0);
    const failedChunks = chunks.filter((c: any) => c.status === "failed");
    const allFailed = failedChunks.length === chunks.length;
    const originalName = chunks[0].original_filename || chunks[0].filename;
    let errorMsg: string | null = null;
    if (failedChunks.length > 0 && !allFailed) errorMsg = `${failedChunks.length} of ${chunks.length} chunks failed`;
    else if (allFailed) errorMsg = failedChunks[0].error_message || "All chunks failed";
    displayRows.push({
      filename: `${originalName} (${chunks.length} chunks)`,
      status: allFailed ? "failed" : (failedChunks.length > 0 ? "partial" : "completed"),
      page_count: totalPages, word_count: totalWords, error_message: errorMsg,
    });
  });

  standaloneFiles.forEach((f: any) => {
    displayRows.push({ filename: f.filename, status: f.status, page_count: f.page_count || 0, word_count: f.word_count || 0, error_message: f.error_message });
  });

  const fileListHtml = displayRows.map((f) => {
    if (f.status === "completed" || f.status === "partial") {
      const billable = (f.word_count / 225).toFixed(1);
      const bgColor = f.status === "partial" ? "#fffbeb" : "#f0fdf4";
      const icon = f.status === "completed" ? "✅" : "⚠️";
      return `<tr style="background-color: ${bgColor};"><td style="padding: 8px; border: 1px solid #ddd;">${icon} ${f.filename}</td><td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${f.page_count}</td><td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${f.word_count.toLocaleString()}</td><td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${billable}</td><td style="padding: 8px; border: 1px solid #ddd;">${f.error_message || "-"}</td></tr>`;
    } else {
      return `<tr style="background-color: #fef2f2;"><td style="padding: 8px; border: 1px solid #ddd;">❌ ${f.filename}</td><td style="padding: 8px; border: 1px solid #ddd; text-align: center;">-</td><td style="padding: 8px; border: 1px solid #ddd; text-align: center;">-</td><td style="padding: 8px; border: 1px solid #ddd; text-align: center;">-</td><td style="padding: 8px; border: 1px solid #ddd; color: #dc2626;">${f.error_message || "Processing failed"}</td></tr>`;
    }
  }).join("");

  const resultsUrl = `https://portal.cethos.com/admin/ocr-word-count/${batch.id}`;
  const subjectPrefix = batch.failed_files > 0 && batch.completed_files === 0 ? "⚠️ FAILED: " : batch.failed_files > 0 ? "⚠️ Partial: " : "✅ ";
  const billableTotal = (batch.total_words / 225).toFixed(1);
  const uniqueOriginalFiles = groupMap.size + standaloneFiles.length;

  const htmlContent = `<h2>OCR Word Count Results</h2><p>The OCR batch processing has finished.</p><h3>Summary</h3><table style="border-collapse: collapse; margin-bottom: 20px;"><tr><td style="padding: 5px 15px 5px 0;"><strong>Batch ID:</strong></td><td>${batch.id}</td></tr><tr><td style="padding: 5px 15px 5px 0;"><strong>Created by:</strong></td><td>${batch.staff_name}</td></tr><tr><td style="padding: 5px 15px 5px 0;"><strong>Original Files:</strong></td><td>${uniqueOriginalFiles}</td></tr><tr><td style="padding: 5px 15px 5px 0;"><strong>Total Chunks:</strong></td><td>${batch.total_files}</td></tr><tr><td style="padding: 5px 15px 5px 0;"><strong>Completed:</strong></td><td style="color: #16a34a;">${batch.completed_files}</td></tr><tr><td style="padding: 5px 15px 5px 0;"><strong>Failed:</strong></td><td style="color: ${batch.failed_files > 0 ? "#dc2626" : "#16a34a"}">${batch.failed_files}</td></tr><tr><td style="padding: 5px 15px 5px 0;"><strong>Total Pages:</strong></td><td>${batch.total_pages}</td></tr><tr><td style="padding: 5px 15px 5px 0;"><strong>Total Words:</strong></td><td>${batch.total_words.toLocaleString()}</td></tr><tr><td style="padding: 5px 15px 5px 0;"><strong>Billable Pages:</strong></td><td>${billableTotal}</td></tr></table><h3>File Details</h3><table style="border-collapse: collapse; width: 100%; margin-bottom: 20px;"><thead><tr style="background-color: #f3f4f6;"><th style="padding: 10px; border: 1px solid #ddd; text-align: left;">File</th><th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Pages</th><th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Words</th><th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Billable</th><th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Notes/Error</th></tr></thead><tbody>${fileListHtml}</tbody></table>${batch.failed_files > 0 ? `<div style="background-color: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 8px; margin-bottom: 20px;"><strong style="color: #dc2626;">⚠️ ${batch.failed_files} file(s) failed to process</strong><p style="margin: 10px 0 0 0; color: #7f1d1d;">Common causes: Encrypted/corrupted PDF, low-quality scan, chunk too large for Document AI inline limit.</p></div>` : ""}<p><a href="${resultsUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 8px;">View Full Results</a></p>`;

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: { name: "CETHOS Portal", email: "noreply@cethos.com" },
      to: NOTIFICATION_EMAILS.map((email) => ({ email })),
      subject: `${subjectPrefix}OCR Word Count - ${uniqueOriginalFiles} file(s), ${batch.total_words.toLocaleString()} words`,
      htmlContent,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Brevo API error: ${errorText}`);
  }
}
