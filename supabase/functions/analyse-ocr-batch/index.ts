// supabase/functions/analyse-ocr-batch/index.ts
// Analyses selected OCR batch files using Claude AI
// Handles file chunk reassembly, sync/async processing modes
// v3: Fixes id propagation so frontend never generates temp-* IDs
//     Detects document_count and sub_documents per file
// v4: Filters ocr_batch_results by the file's active_ocr_provider so word/page
//     totals and Claude's input use only one provider when both have run.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Anthropic API config
const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const MAX_SYNC_TOKENS = 150000; // ~150K tokens = process synchronously
const CHARS_PER_TOKEN = 4;

// Email recipients for background job completion
const NOTIFICATION_EMAILS = [
  "info@cethos.com",
  "pm@cethoscorp.com",
  "raminder@cethos.com",
];

// ============================================================================
// Types
// ============================================================================

interface PageData {
  pageNumber: number;
  wordCount: number;
  rawText: string;
  confidence: number | null;
  detectedLanguage: string | null;
}

interface LogicalDocument {
  primaryFileId: string;
  fileGroupId: string | null;
  originalFilename: string;
  allFileIds: string[];
  pages: PageData[];
  totalWordCount: number;
  totalPageCount: number;
}

interface AnalysisResult {
  id: string | null;
  fileId: string;
  originalFilename: string;
  documentType: string | null;
  holderName: string | null;
  detectedLanguage: string | null;
  languageName: string | null;
  issuingCountry: string | null;
  complexity: string | null;
  wordCount: number;
  billablePages: number;
  documentCount: number;
  subDocuments: any[] | null;
  actionableItems: any[];
  processingStatus: string;
  errorMessage: string | null;
}

// ============================================================================
// Claude System Prompt
// ============================================================================

const SYSTEM_PROMPT = `You are a document analysis assistant for CETHOS, a certified translation services company in Canada. Analyze the provided OCR text from scanned documents and extract structured information.

For each file, determine:
1. Document type - use one of these exact values: birth_certificate, death_certificate, marriage_certificate, divorce_decree, diploma, transcript, degree, passport, drivers_license, national_id, immigration_document, court_order, power_of_attorney, affidavit, corporate_document, medical_record, tax_document, bank_statement, employment_letter, other
2. Document holder name(s) - the person(s) the document belongs to or is about
3. Source language - ISO 639-1 code and full name
4. Issuing country - ISO 3166-1 alpha-2 code
5. Issuing authority if identifiable
6. Document date and document number if visible
7. Complexity assessment:
   - easy: Standard single-language, clear text, common document type
   - medium: Multiple languages, some handwriting, technical terminology
   - hard: Poor scan quality, heavy handwriting, legal complexity, rare language
8. Actionable items for the translation team - warnings, notes, suggestions
9. Document count - How many distinct logical documents are contained in this file. A single PDF may contain multiple certificates, IDs, or other documents scanned together. Count each distinct document separately. If only one document is present, return 1.
10. Sub-documents - If documentCount > 1, list each distinct document found with its type, holder name, and approximate page range.

IMPORTANT: A file containing 3 birth certificates scanned together is documentCount: 3, NOT 1. Each certificate that would need its own certified translation is a separate document.

Respond ONLY with a valid JSON array. No markdown fences, no preamble, no explanation.`;

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── Parse request ────────────────────────────────────────────────────
    const { batchId, fileIds, staffId, staffName, staffEmail } =
      await req.json();

    if (
      !batchId ||
      !fileIds ||
      !Array.isArray(fileIds) ||
      fileIds.length === 0
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "batchId and fileIds[] required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(
      `📋 Analyse request: batch=${batchId}, files=${fileIds.length}, staff=${staffName}`
    );

    // ====================================================================
    // Step 1: Fetch selected files with grouping info
    // ====================================================================

    const { data: selectedFiles, error: filesError } = await supabaseAdmin
      .from("ocr_batch_files")
      .select(
        "id, filename, status, page_count, word_count, file_group_id, original_filename, chunk_index"
      )
      .in("id", fileIds)
      .eq("batch_id", batchId);

    if (filesError || !selectedFiles || selectedFiles.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No valid files found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`📁 Found ${selectedFiles.length} selected files`);

    // ====================================================================
    // Step 2: Build logical documents (reassemble split PDFs)
    // ====================================================================

    const logicalDocs = await buildLogicalDocuments(
      supabaseAdmin,
      selectedFiles,
      batchId
    );
    console.log(`📄 Built ${logicalDocs.length} logical documents`);

    // ====================================================================
    // Step 3: Fetch OCR text for each logical document, filtered by the
    //         file's active_ocr_provider so word/page totals and the text
    //         we send to Claude reflect only the staff-selected provider.
    // ====================================================================

    for (const doc of logicalDocs) {
      // Determine active provider for this document. Chunks of the same
      // original share the same active provider; read from the primary file.
      // Default to google_document_ai for backward compatibility.
      const { data: fileRow } = await supabaseAdmin
        .from("ocr_batch_files")
        .select("active_ocr_provider")
        .eq("id", doc.primaryFileId)
        .single();
      const activeProvider =
        (fileRow as any)?.active_ocr_provider || "google_document_ai";

      const { data: pageResults, error: pagesError } = await supabaseAdmin
        .from("ocr_batch_results")
        .select(
          "page_number, word_count, raw_text, confidence_score, detected_language, ocr_provider"
        )
        .in("file_id", doc.allFileIds)
        .eq("ocr_provider", activeProvider)
        .order("page_number");

      if (pagesError) {
        console.error(
          `❌ Failed to fetch pages for ${doc.originalFilename}:`,
          pagesError
        );
        continue;
      }

      doc.pages = (pageResults || []).map((p: any) => ({
        pageNumber: p.page_number,
        wordCount: p.word_count || 0,
        rawText: p.raw_text || "",
        confidence: p.confidence_score,
        detectedLanguage: p.detected_language,
      }));

      doc.totalWordCount = doc.pages.reduce((sum, p) => sum + p.wordCount, 0);
      doc.totalPageCount = doc.pages.length;
    }

    // Filter out docs with no usable text
    const docsWithText = logicalDocs.filter(
      (d) => d.pages.length > 0 && d.pages.some((p) => p.rawText)
    );

    if (docsWithText.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No OCR text available for selected files",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ====================================================================
    // Step 4: Estimate tokens and decide sync vs background
    // ====================================================================

    const totalChars = docsWithText.reduce(
      (sum, doc) =>
        sum + doc.pages.reduce((s, p) => s + (p.rawText?.length || 0), 0),
      0
    );
    const estimatedTokens = Math.ceil(totalChars / CHARS_PER_TOKEN);
    const isBackground = estimatedTokens > MAX_SYNC_TOKENS;

    console.log(
      `📊 Estimated tokens: ${estimatedTokens}, mode: ${isBackground ? "background" : "sync"}`
    );

    // ====================================================================
    // Step 5: Create analysis job
    // ====================================================================

    const allFileIds = docsWithText.flatMap((d) => d.allFileIds);
    const uniqueFileIds = [...new Set(allFileIds)];

    const { data: job, error: jobError } = await supabaseAdmin
      .from("ocr_ai_analysis_jobs")
      .insert({
        batch_id: batchId,
        status: isBackground ? "pending" : "processing",
        selected_file_ids: uniqueFileIds,
        total_files: docsWithText.length,
        is_background: isBackground,
        estimated_tokens: estimatedTokens,
        created_by_staff_id: staffId || null,
        created_by_name: staffName || null,
        created_by_email: staffEmail || null,
        started_at: isBackground ? null : new Date().toISOString(),
      })
      .select("id")
      .single();

    if (jobError || !job) {
      throw new Error(`Failed to create analysis job: ${jobError?.message}`);
    }

    console.log(`✅ Created job: ${job.id}`);

    // ====================================================================
    // Step 6: Create analysis rows (one per logical document)
    //         Return the inserted IDs so we can propagate them
    // ====================================================================

    const analysisInsertRows = docsWithText.map((doc) => ({
      job_id: job.id,
      batch_id: batchId,
      file_id: doc.primaryFileId,
      file_group_id: doc.fileGroupId,
      original_filename: doc.originalFilename,
      ocr_word_count: doc.totalWordCount,
      ocr_page_count: doc.totalPageCount,
      billable_pages: parseFloat((doc.totalWordCount / 225).toFixed(2)),
      processing_status: isBackground ? "pending" : "processing",
    }));

    const { data: insertedRows, error: insertError } = await supabaseAdmin
      .from("ocr_ai_analysis")
      .insert(analysisInsertRows)
      .select("id, file_id");

    if (insertError) {
      throw new Error(
        `Failed to create analysis rows: ${insertError.message}`
      );
    }

    // Build a fileId → analysisRowId lookup for later
    const fileToAnalysisId = new Map<string, string>();
    if (insertedRows) {
      for (const row of insertedRows) {
        fileToAnalysisId.set(row.file_id, row.id);
      }
    }

    console.log(
      `📝 Inserted ${insertedRows?.length || 0} analysis rows with IDs`
    );

    // ====================================================================
    // Step 7: Process (sync) or return (background)
    // ====================================================================

    if (isBackground) {
      return new Response(
        JSON.stringify({
          success: true,
          mode: "background",
          jobId: job.id,
          message:
            "Analysis queued. You will receive an email when complete.",
          estimatedFiles: docsWithText.length,
          estimatedTokens,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── Sync mode — process all documents now ────────────────────────────

    const results = await processDocuments(
      supabaseAdmin,
      job.id,
      docsWithText,
      fileToAnalysisId
    );

    // Update job status
    const completedCount = results.filter(
      (r) => r.processingStatus === "completed"
    ).length;
    const failedCount = results.filter(
      (r) => r.processingStatus === "failed"
    ).length;
    const totalDocsFound = results.reduce(
      (sum, r) => sum + (r.documentCount || 1),
      0
    );

    await supabaseAdmin
      .from("ocr_ai_analysis_jobs")
      .update({
        status:
          failedCount === docsWithText.length
            ? "failed"
            : failedCount > 0
              ? "partial"
              : "completed",
        completed_files: completedCount,
        failed_files: failedCount,
        total_documents_found: totalDocsFound,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    const processingTime = Date.now() - startTime;
    console.log(
      `✅ Sync analysis complete: ${completedCount}/${docsWithText.length} in ${processingTime}ms (${totalDocsFound} docs found)`
    );

    return new Response(
      JSON.stringify({
        success: true,
        mode: "sync",
        jobId: job.id,
        processingTimeMs: processingTime,
        totalDocumentsFound: totalDocsFound,
        results: results.map((r) => ({
          id: r.id,
          fileId: r.fileId,
          originalFilename: r.originalFilename,
          documentType: r.documentType,
          holderName: r.holderName,
          language: r.detectedLanguage,
          languageName: r.languageName,
          issuingCountry: r.issuingCountry,
          complexity: r.complexity,
          wordCount: r.wordCount,
          billablePages: r.billablePages,
          documentCount: r.documentCount,
          subDocuments: r.subDocuments,
          actionableItems: r.actionableItems,
          processingStatus: r.processingStatus,
          errorMessage: r.errorMessage,
        })),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("❌ Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

// ============================================================================
// Build Logical Documents (reassemble split PDFs)
// ============================================================================

async function buildLogicalDocuments(
  supabaseAdmin: any,
  selectedFiles: any[],
  batchId: string
): Promise<LogicalDocument[]> {
  const grouped = new Map<string, any[]>();
  const standalone: any[] = [];

  selectedFiles.forEach((f) => {
    if (f.file_group_id) {
      if (!grouped.has(f.file_group_id)) grouped.set(f.file_group_id, []);
      grouped.get(f.file_group_id)!.push(f);
    } else {
      standalone.push(f);
    }
  });

  const logicalDocs: LogicalDocument[] = [];

  // For grouped files, fetch ALL chunks in the group (not just selected ones)
  for (const [groupId, _selectedChunks] of grouped) {
    const { data: allChunks } = await supabaseAdmin
      .from("ocr_batch_files")
      .select(
        "id, filename, chunk_index, page_count, word_count, original_filename, status"
      )
      .eq("file_group_id", groupId)
      .eq("batch_id", batchId)
      .order("chunk_index");

    if (!allChunks || allChunks.length === 0) continue;

    const sorted = allChunks.sort(
      (a: any, b: any) => (a.chunk_index || 0) - (b.chunk_index || 0)
    );

    logicalDocs.push({
      primaryFileId: sorted[0].id,
      fileGroupId: groupId,
      originalFilename: sorted[0].original_filename || sorted[0].filename,
      allFileIds: sorted.map((c: any) => c.id),
      pages: [],
      totalWordCount: 0,
      totalPageCount: 0,
    });
  }

  standalone.forEach((f) => {
    logicalDocs.push({
      primaryFileId: f.id,
      fileGroupId: null,
      originalFilename: f.filename,
      allFileIds: [f.id],
      pages: [],
      totalWordCount: 0,
      totalPageCount: 0,
    });
  });

  return logicalDocs;
}

// ============================================================================
// Process Documents via Claude API
// ============================================================================

async function processDocuments(
  supabaseAdmin: any,
  jobId: string,
  documents: LogicalDocument[],
  fileToAnalysisId: Map<string, string>
): Promise<AnalysisResult[]> {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  // ── Build the document text block for Claude ───────────────────────────

  const docTexts = documents
    .map((doc, i) => {
      const pageTexts = doc.pages
        .sort((a, b) => a.pageNumber - b.pageNumber)
        .map((p) => p.rawText)
        .filter((t) => t && !t.startsWith("[ERROR"))
        .join("\n\n--- PAGE BREAK ---\n\n");

      return `<document index="${i + 1}" filename="${doc.originalFilename}" pages="${doc.totalPageCount}" words="${doc.totalWordCount}">
${pageTexts}
</document>`;
    })
    .join("\n\n");

  const userPrompt = `Analyze these ${documents.length} document(s) and return a JSON array with one object per document.

${docTexts}

Return this exact JSON structure (array of objects, one per document):
[
  {
    "documentIndex": 1,
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
      {"type": "note", "message": "Description"},
      {"type": "warning", "message": "Description"},
      {"type": "suggestion", "message": "Description"}
    ]
  }
]

IMPORTANT for documentCount and subDocuments:
- documentCount: integer, how many distinct logical documents are in this file (default 1)
- subDocuments: null if documentCount is 1. If > 1, return an array:
  [
    {"type": "birth_certificate", "holderName": "Maria Garcia", "pageRange": "1-2", "language": "es"},
    {"type": "birth_certificate", "holderName": "Jose Garcia", "pageRange": "3-4", "language": "es"}
  ]
- Each distinct certificate, ID, or document that would need its own certified translation counts as 1.
- A 6-page PDF with 3 birth certificates = documentCount: 3

Use null for any field you cannot determine. Return ONLY valid JSON, no markdown.`;

  // ── Call Claude API ────────────────────────────────────────────────────

  const apiStartTime = Date.now();

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Claude API error ${response.status}: ${errText}`);
    }

    const apiResult = await response.json();
    const apiTime = Date.now() - apiStartTime;

    console.log(
      `🤖 Claude response: ${apiTime}ms, tokens: in=${apiResult.usage?.input_tokens}, out=${apiResult.usage?.output_tokens}`
    );

    // ── Parse Claude response ────────────────────────────────────────────

    const textContent = apiResult.content
      ?.filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("");

    if (!textContent) {
      throw new Error("Empty response from Claude");
    }

    const cleanJson = textContent
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    let analysisResults: any[];
    try {
      analysisResults = JSON.parse(cleanJson);
    } catch (parseErr) {
      console.error(
        "❌ JSON parse error. Raw response:",
        textContent.substring(0, 500)
      );
      throw new Error(
        `Failed to parse Claude response as JSON: ${parseErr}`
      );
    }

    if (!Array.isArray(analysisResults)) {
      analysisResults = [analysisResults];
    }

    // ── Map results back to documents and save ───────────────────────────

    const savedResults: AnalysisResult[] = [];

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const analysisRowId = fileToAnalysisId.get(doc.primaryFileId) || null;
      const result =
        analysisResults.find((r: any) => r.documentIndex === i + 1) ||
        analysisResults[i];

      // No result from Claude for this document
      if (!result) {
        if (analysisRowId) {
          await supabaseAdmin
            .from("ocr_ai_analysis")
            .update({
              processing_status: "failed",
              error_message:
                "No analysis result returned for this document",
              updated_at: new Date().toISOString(),
            })
            .eq("id", analysisRowId);
        }

        savedResults.push({
          id: analysisRowId,
          fileId: doc.primaryFileId,
          originalFilename: doc.originalFilename,
          documentType: null,
          holderName: null,
          detectedLanguage: null,
          languageName: null,
          issuingCountry: null,
          complexity: null,
          wordCount: doc.totalWordCount,
          billablePages: parseFloat(
            (doc.totalWordCount / 225).toFixed(2)
          ),
          documentCount: 1,
          subDocuments: null,
          actionableItems: [],
          processingStatus: "failed",
          errorMessage: "No analysis result returned",
        });
        continue;
      }

      // Save Claude results to the analysis row
      const updatePayload = {
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
      };

      let updateError: any = null;

      if (analysisRowId) {
        // Update by the known row ID (precise, no ambiguity)
        const { error } = await supabaseAdmin
          .from("ocr_ai_analysis")
          .update(updatePayload)
          .eq("id", analysisRowId);
        updateError = error;
      } else {
        // Fallback: match by job_id + file_id (should not happen normally)
        const { error } = await supabaseAdmin
          .from("ocr_ai_analysis")
          .update(updatePayload)
          .eq("job_id", jobId)
          .eq("file_id", doc.primaryFileId);
        updateError = error;
      }

      if (updateError) {
        console.error(
          `❌ Failed to save result for ${doc.originalFilename}:`,
          updateError
        );
      }

      savedResults.push({
        id: analysisRowId,
        fileId: doc.primaryFileId,
        originalFilename: doc.originalFilename,
        documentType: result.documentType || null,
        holderName: result.holderName || null,
        detectedLanguage: result.detectedLanguage || null,
        languageName: result.languageName || null,
        issuingCountry: result.issuingCountry || null,
        complexity: result.complexity || null,
        wordCount: doc.totalWordCount,
        billablePages: parseFloat(
          (doc.totalWordCount / 225).toFixed(2)
        ),
        documentCount: result.documentCount || 1,
        subDocuments: result.subDocuments || null,
        actionableItems: result.actionableItems || [],
        processingStatus: updateError ? "failed" : "completed",
        errorMessage: updateError?.message || null,
      });
    }

    return savedResults;
  } catch (error: any) {
    console.error("❌ Claude processing error:", error);

    // Mark all pending/processing rows as failed
    await supabaseAdmin
      .from("ocr_ai_analysis")
      .update({
        processing_status: "failed",
        error_message: error.message,
        updated_at: new Date().toISOString(),
      })
      .eq("job_id", jobId)
      .in("processing_status", ["pending", "processing"]);

    // Return failed results with correct IDs
    return documents.map((doc) => ({
      id: fileToAnalysisId.get(doc.primaryFileId) || null,
      fileId: doc.primaryFileId,
      originalFilename: doc.originalFilename,
      documentType: null,
      holderName: null,
      detectedLanguage: null,
      languageName: null,
      issuingCountry: null,
      complexity: null,
      wordCount: doc.totalWordCount,
      billablePages: parseFloat((doc.totalWordCount / 225).toFixed(2)),
      documentCount: 1,
      subDocuments: null,
      actionableItems: [],
      processingStatus: "failed",
      errorMessage: error.message,
    }));
  }
}
