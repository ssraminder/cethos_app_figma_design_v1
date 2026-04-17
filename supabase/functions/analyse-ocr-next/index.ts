// supabase/functions/analyse-ocr-next/index.ts
// Background processor for large AI analysis jobs
// Called by pg_cron every 2 minutes
// Processes ONE document per invocation (same pattern as ocr-process-next)
// v2: Detects document_count and sub_documents
// v3: Filters ocr_batch_results by the file's active_ocr_provider so Claude
//     sees only the staff-selected provider's text when both providers ran.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

const NOTIFICATION_EMAILS = [
  "info@cethos.com",
  "pm@cethoscorp.com",
  "raminder@cethos.com",
];

// ============================================================================
// Claude System Prompt (v2 — with document count detection)
// ============================================================================

const SYSTEM_PROMPT = `You are a document analysis assistant for CETHOS, a certified translation services company in Canada. Analyze the provided OCR text from scanned documents and extract structured information.

For each document, determine:
1. Document type - use one of these exact values: birth_certificate, death_certificate, marriage_certificate, divorce_decree, diploma, transcript, degree, passport, drivers_license, national_id, immigration_document, court_order, power_of_attorney, affidavit, corporate_document, medical_record, tax_document, bank_statement, employment_letter, other
2. Document holder name(s)
3. Source language - ISO 639-1 code and full name
4. Issuing country - ISO 3166-1 alpha-2 code
5. Issuing authority if identifiable
6. Document date and document number if visible
7. Complexity assessment: easy, medium, or hard
8. Actionable items for the translation team
9. Document count - How many distinct logical documents are in this file. A single PDF may contain multiple certificates scanned together. Each document needing its own certified translation counts separately.
10. Sub-documents - If documentCount > 1, list each distinct document found.

Respond ONLY with a valid JSON object. No markdown fences, no preamble.`;

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }

    // ========================================================================
    // Step 1: Find a pending analysis job
    // ========================================================================

    const { data: job, error: jobError } = await supabaseAdmin
      .from("ocr_ai_analysis_jobs")
      .select("*")
      .in("status", ["pending", "processing"])
      .eq("is_background", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ success: true, message: "No pending analysis jobs" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark job as processing if still pending
    if (job.status === "pending") {
      await supabaseAdmin
        .from("ocr_ai_analysis_jobs")
        .update({ status: "processing", started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", job.id);
    }

    // ========================================================================
    // Step 2: Find next unprocessed document in this job
    // ========================================================================

    const { data: analysis, error: analysisError } = await supabaseAdmin
      .from("ocr_ai_analysis")
      .select("*")
      .eq("job_id", job.id)
      .eq("processing_status", "pending")
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (analysisError || !analysis) {
      console.log(`📋 No pending documents for job ${job.id}, checking completion...`);
      await checkJobCompletion(supabaseAdmin, job);
      return new Response(
        JSON.stringify({ success: true, message: "No pending documents, checked completion" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`🔍 Processing: ${analysis.original_filename} (job=${job.id})`);

    // Mark as processing
    await supabaseAdmin
      .from("ocr_ai_analysis")
      .update({ processing_status: "processing", updated_at: new Date().toISOString() })
      .eq("id", analysis.id);

    // ========================================================================
    // Step 3: Fetch OCR text for this document (filtered by active provider)
    // ========================================================================

    let allFileIds: string[] = [analysis.file_id];

    if (analysis.file_group_id) {
      const { data: chunks } = await supabaseAdmin
        .from("ocr_batch_files")
        .select("id")
        .eq("file_group_id", analysis.file_group_id)
        .eq("batch_id", analysis.batch_id)
        .order("chunk_index");

      if (chunks && chunks.length > 0) {
        allFileIds = chunks.map((c: any) => c.id);
      }
    }

    // Determine the active OCR provider for this file (staff-selected).
    // Chunks of the same original share the same active provider; read from
    // the primary analysis.file_id. Default to google_document_ai for
    // backward compat if the column isn't set.
    const { data: fileRow } = await supabaseAdmin
      .from("ocr_batch_files")
      .select("active_ocr_provider")
      .eq("id", analysis.file_id)
      .single();
    const activeProvider = (fileRow as any)?.active_ocr_provider || "google_document_ai";

    const { data: pageResults } = await supabaseAdmin
      .from("ocr_batch_results")
      .select("page_number, word_count, raw_text, confidence_score, detected_language, ocr_provider")
      .in("file_id", allFileIds)
      .eq("ocr_provider", activeProvider)
      .order("page_number");

    if (!pageResults || pageResults.length === 0) {
      await supabaseAdmin
        .from("ocr_ai_analysis")
        .update({
          processing_status: "failed",
          error_message: "No OCR text available",
          updated_at: new Date().toISOString(),
        })
        .eq("id", analysis.id);

      await updateJobProgress(supabaseAdmin, job.id);
      await checkJobCompletion(supabaseAdmin, job);

      return new Response(
        JSON.stringify({ success: true, message: "No OCR text, marked as failed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build document text
    const pageTexts = pageResults
      .sort((a: any, b: any) => a.page_number - b.page_number)
      .map((p: any) => p.raw_text)
      .filter((t: string) => t && !t.startsWith("[ERROR"))
      .join("\n\n--- PAGE BREAK ---\n\n");

    // ========================================================================
    // Step 4: Call Claude API (single document, v2 prompt)
    // ========================================================================

    const userPrompt = `Analyze this document and return a JSON object.

<document filename="${analysis.original_filename}" pages="${analysis.ocr_page_count}" words="${analysis.ocr_word_count}">
${pageTexts}
</document>

Return this exact JSON structure (single object, not array):
{
  "documentType": "birth_certificate",
  "documentTypeConfidence": 0.95,
  "holderName": "Full Name Here",
  "holderNameNormalized": "LASTNAME, Firstname",
  "detectedLanguage": "es",
  "languageName": "Spanish",
  "issuingCountry": "MX",
  "issuingAuthority": "Registro Civil",
  "documentDate": "2015-03-21",
  "documentNumber": "12345",
  "complexity": "easy",
  "complexityConfidence": 0.9,
  "complexityFactors": ["standard_format", "single_language"],
  "complexityReasoning": "Brief explanation",
  "documentCount": 1,
  "subDocuments": null,
  "actionableItems": [
    {"type": "note", "message": "Description"}
  ]
}

IMPORTANT for documentCount and subDocuments:
- documentCount: integer, how many distinct logical documents are in this file (default 1)
- subDocuments: null if documentCount is 1. If > 1, return an array:
  [{"type": "birth_certificate", "holderName": "Name", "pageRange": "1-2", "language": "es"}]
- Each document needing its own certified translation counts as 1.

Use null for any field you cannot determine. Return ONLY valid JSON.`;

    const apiStartTime = Date.now();

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    const apiTime = Date.now() - apiStartTime;

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Claude API error ${response.status}: ${errText}`);
    }

    const apiResult = await response.json();

    const textContent = apiResult.content
      ?.filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("");

    if (!textContent) {
      throw new Error("Empty response from Claude");
    }

    const cleanJson = textContent.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    let result: any;

    try {
      result = JSON.parse(cleanJson);
      if (Array.isArray(result)) result = result[0];
    } catch (parseErr) {
      console.error("❌ JSON parse error:", textContent.substring(0, 500));
      throw new Error(`JSON parse failed: ${parseErr}`);
    }

    console.log(`🤖 Claude: ${analysis.original_filename} → ${result.documentType}, docs=${result.documentCount || 1} (${apiTime}ms)`);

    // ========================================================================
    // Step 5: Save results (v2: includes document_count, sub_documents)
    // ========================================================================

    await supabaseAdmin
      .from("ocr_ai_analysis")
      .update({
        detected_document_type: result.documentType || null,
        document_type_confidence: result.documentTypeConfidence || null,
        detected_language: result.detectedLanguage || null,
        language_name: result.languageName || null,
        holder_name: result.holderName || null,
        holder_name_normalized: result.holderNameNormalized || null,
        issuing_country: result.issuingCountry || null,
        issuing_authority: result.issuingAuthority || null,
        document_date: result.documentDate || null,
        document_number: result.documentNumber || null,
        assessed_complexity: result.complexity || null,
        complexity_confidence: result.complexityConfidence || null,
        complexity_factors: result.complexityFactors || null,
        complexity_reasoning: result.complexityReasoning || null,
        actionable_items: result.actionableItems || [],
        document_count: result.documentCount || 1,
        sub_documents: result.subDocuments || null,
        ai_raw_response: result,
        llm_provider: "anthropic",
        llm_model: ANTHROPIC_MODEL,
        processing_time_ms: apiTime,
        input_tokens: apiResult.usage?.input_tokens || null,
        output_tokens: apiResult.usage?.output_tokens || null,
        processing_status: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", analysis.id);

    // ========================================================================
    // Step 6: Update job progress and check completion
    // ========================================================================

    await updateJobProgress(supabaseAdmin, job.id);
    await checkJobCompletion(supabaseAdmin, job);

    const totalTime = Date.now() - startTime;
    console.log(`✅ Done: ${analysis.original_filename} in ${totalTime}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        fileId: analysis.file_id,
        filename: analysis.original_filename,
        documentType: result.documentType,
        documentCount: result.documentCount || 1,
        processingTimeMs: totalTime,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("❌ Error:", error);

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ============================================================================
// Update Job Progress (v2: includes total_documents_found)
// ============================================================================

async function updateJobProgress(supabaseAdmin: any, jobId: string): Promise<void> {
  // Count completed and failed
  const { data: analyses } = await supabaseAdmin
    .from("ocr_ai_analysis")
    .select("processing_status, document_count")
    .eq("job_id", jobId);

  if (!analyses) return;

  const completed = analyses.filter((a: any) => a.processing_status === "completed").length;
  const failed = analyses.filter((a: any) => a.processing_status === "failed").length;
  const totalDocsFound = analyses
    .filter((a: any) => a.processing_status === "completed")
    .reduce((sum: number, a: any) => sum + (a.document_count || 1), 0);

  await supabaseAdmin
    .from("ocr_ai_analysis_jobs")
    .update({
      completed_files: completed,
      failed_files: failed,
      total_documents_found: totalDocsFound,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

// ============================================================================
// Check Job Completion & Send Email
// ============================================================================

async function checkJobCompletion(supabaseAdmin: any, job: any): Promise<void> {
  const { data: updatedJob } = await supabaseAdmin
    .from("ocr_ai_analysis_jobs")
    .select("*")
    .eq("id", job.id)
    .single();

  if (!updatedJob) return;

  // Check if all files are processed
  const totalProcessed = (updatedJob.completed_files || 0) + (updatedJob.failed_files || 0);
  const allDone = totalProcessed >= updatedJob.total_files;

  if (allDone && !["completed", "partial", "failed"].includes(updatedJob.status)) {
    // Determine final status
    const finalStatus = updatedJob.failed_files === updatedJob.total_files
      ? "failed"
      : updatedJob.failed_files > 0
        ? "partial"
        : "completed";

    await supabaseAdmin
      .from("ocr_ai_analysis_jobs")
      .update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    // Re-fetch for email
    const { data: finalJob } = await supabaseAdmin
      .from("ocr_ai_analysis_jobs")
      .select("*")
      .eq("id", job.id)
      .single();

    if (finalJob && !finalJob.notification_sent) {
      console.log(`📧 Job ${job.id} complete, sending notification...`);

      try {
        const { data: results } = await supabaseAdmin
          .from("ocr_ai_analysis")
          .select("*")
          .eq("job_id", job.id)
          .order("original_filename");

        await sendCompletionEmail(finalJob, results || []);

        await supabaseAdmin
          .from("ocr_ai_analysis_jobs")
          .update({
            notification_sent: true,
            notification_sent_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        console.log("✅ Notification sent successfully");
      } catch (emailError) {
        console.error("❌ Failed to send notification:", emailError);
      }
    }
  }
}

// ============================================================================
// Send Completion Email via Brevo (v2: includes document count)
// ============================================================================

async function sendCompletionEmail(job: any, results: any[]): Promise<void> {
  const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
  if (!BREVO_API_KEY) {
    console.error("BREVO_API_KEY not configured");
    return;
  }

  const totalDocsFound = results
    .filter((r: any) => r.processing_status === "completed")
    .reduce((sum: number, r: any) => sum + (r.document_count || 1), 0);

  const fileRows = results.map((r: any) => {
    if (r.processing_status === "completed") {
      const docCountBadge = (r.document_count || 1) > 1
        ? ` <span style="background: #dbeafe; color: #1e40af; padding: 2px 6px; border-radius: 4px; font-size: 12px;">${r.document_count} docs</span>`
        : "";
      return `<tr style="background-color: #f0fdf4;">
        <td style="padding: 8px; border: 1px solid #ddd;">✅ ${r.original_filename}${docCountBadge}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${formatDocType(r.detected_document_type)}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${r.holder_name || "-"}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${r.language_name || "-"}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${r.ocr_word_count || 0}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${r.billable_pages || 0}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${r.assessed_complexity || "-"}</td>
      </tr>`;
    } else {
      return `<tr style="background-color: #fef2f2;">
        <td style="padding: 8px; border: 1px solid #ddd;">❌ ${r.original_filename}</td>
        <td colspan="6" style="padding: 8px; border: 1px solid #ddd; color: #dc2626;">${r.error_message || "Analysis failed"}</td>
      </tr>`;
    }
  }).join("");

  const resultsUrl = `https://portal.cethos.com/admin/ocr-word-count/${job.batch_id}`;

  let subjectPrefix = "";
  if (job.failed_files > 0 && job.completed_files === 0) {
    subjectPrefix = "⚠️ FAILED: ";
  } else if (job.failed_files > 0) {
    subjectPrefix = "⚠️ Partial: ";
  } else {
    subjectPrefix = "✅ ";
  }

  const htmlContent = `
    <h2>AI Document Analysis Complete</h2>
    <p>The AI analysis of ${job.total_files} file(s) has finished.</p>

    <h3>Summary</h3>
    <table style="border-collapse: collapse; margin-bottom: 15px;">
      <tr><td style="padding: 5px 15px 5px 0;"><strong>Batch ID:</strong></td><td>${job.batch_id}</td></tr>
      <tr><td style="padding: 5px 15px 5px 0;"><strong>Files Analysed:</strong></td><td>${job.total_files}</td></tr>
      <tr><td style="padding: 5px 15px 5px 0;"><strong>Completed:</strong></td><td style="color: #16a34a;">${job.completed_files}</td></tr>
      <tr><td style="padding: 5px 15px 5px 0;"><strong>Failed:</strong></td><td style="color: #dc2626;">${job.failed_files}</td></tr>
      <tr><td style="padding: 5px 15px 5px 0;"><strong>Total Documents Found:</strong></td><td style="font-weight: bold;">${totalDocsFound}</td></tr>
      <tr><td style="padding: 5px 15px 5px 0;"><strong>Initiated by:</strong></td><td>${job.created_by_name || "Unknown"}</td></tr>
    </table>

    <h3>Document Analysis Results</h3>
    <table style="border-collapse: collapse; width: 100%; margin-bottom: 20px;">
      <thead>
        <tr style="background-color: #f3f4f6;">
          <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">File</th>
          <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Doc Type</th>
          <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Holder Name</th>
          <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Language</th>
          <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Words</th>
          <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Billable Pg</th>
          <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Complexity</th>
        </tr>
      </thead>
      <tbody>
        ${fileRows}
      </tbody>
    </table>

    <p>
      <a href="${resultsUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px;">
        View Full Results
      </a>
    </p>
  `;

  const emailResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": BREVO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "CETHOS Portal", email: "noreply@cethos.com" },
      to: NOTIFICATION_EMAILS.map(email => ({ email })),
      subject: `${subjectPrefix}AI Analysis Complete - ${job.total_files} files (${totalDocsFound} documents)`,
      htmlContent,
    }),
  });

  if (!emailResponse.ok) {
    const errorText = await emailResponse.text();
    throw new Error(`Brevo API error: ${errorText}`);
  }
}

// ============================================================================
// Helper: Format document type for display
// ============================================================================

function formatDocType(type: string | null): string {
  if (!type) return "Unknown";
  const labels: Record<string, string> = {
    birth_certificate: "Birth Certificate",
    death_certificate: "Death Certificate",
    marriage_certificate: "Marriage Certificate",
    divorce_decree: "Divorce Decree",
    diploma: "Diploma",
    transcript: "Academic Transcript",
    degree: "Degree Certificate",
    passport: "Passport",
    drivers_license: "Driver's License",
    national_id: "National ID",
    immigration_document: "Immigration Doc",
    court_order: "Court Order",
    power_of_attorney: "Power of Attorney",
    affidavit: "Affidavit",
    corporate_document: "Corporate Doc",
    medical_record: "Medical Record",
    tax_document: "Tax Document",
    bank_statement: "Bank Statement",
    employment_letter: "Employment Letter",
    other: "Other",
  };
  return labels[type] || type;
}
