import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

interface ProcessingResult {
  success: boolean;
  fileId?: string;
  fileName?: string;
  detectedLanguage?: string;
  pageCount?: number;
  wordCount?: number;
  documentType?: string;
  processingTime?: number;
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { quoteId, fileId } = await req.json();

    if (!quoteId && !fileId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required parameters: quoteId or fileId",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(`🧠 [PROCESS-DOCUMENT] Starting AI analysis`);
    console.log(`  - quoteId: ${quoteId}`);
    console.log(`  - fileId: ${fileId}`);

    // Create Supabase client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    // Determine which files to process
    let filesToProcess: any[] = [];

    if (fileId) {
      // Process single file - process regardless of current status
      const { data: file, error: fileError } = await supabaseAdmin
        .from("quote_files")
        .select(
          "id, quote_id, original_filename, storage_path, file_size, mime_type",
        )
        .eq("id", fileId)
        .single();

      if (fileError || !file) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "File not found",
          }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      filesToProcess = [file];
      console.log(
        `🎯 [PROCESS-DOCUMENT] Processing specific file: ${file.original_filename}`,
      );
    } else if (quoteId) {
      // Process all files for quote
      const { data: files, error: filesError } = await supabaseAdmin
        .from("quote_files")
        .select(
          "id, quote_id, original_filename, storage_path, file_size, mime_type",
        )
        .eq("quote_id", quoteId)
        .eq("ai_processing_status", "pending");

      if (filesError) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to fetch files: " + filesError.message,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      filesToProcess = files || [];
    }

    if (filesToProcess.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          error: "No files to process",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(
      `📁 [PROCESS-DOCUMENT] Found ${filesToProcess.length} files to process`,
    );

    // Process each file
    const results: ProcessingResult[] = [];

    for (const file of filesToProcess) {
      console.log(
        `🔄 [PROCESS-DOCUMENT] Processing file: ${file.original_filename}`,
      );

      try {
        // Update status to processing
        await supabaseAdmin
          .from("quote_files")
          .update({ ai_processing_status: "processing" })
          .eq("id", file.id);

        // Download file from storage
        console.log(
          `📥 [PROCESS-DOCUMENT] Downloading file from storage: ${file.storage_path}`,
        );
        const { data: fileData, error: downloadError } =
          await supabaseAdmin.storage
            .from("quote-files")
            .download(file.storage_path);

        if (downloadError || !fileData) {
          console.error(
            `❌ [PROCESS-DOCUMENT] Download failed:`,
            downloadError,
          );
          await supabaseAdmin
            .from("quote_files")
            .update({
              ai_processing_status: "failed",
            })
            .eq("id", file.id);
          continue;
        }

        // Analyze the file
        const analysis = await analyzeFile(fileData, file);

        // Store analysis results
        const now = new Date().toISOString();
        const { error: insertError } = await supabaseAdmin
          .from("ai_analysis_results")
          .upsert(
            {
              quote_id: file.quote_id,
              quote_file_id: file.id,
              detected_language: analysis.language,
              detected_document_type: analysis.documentType,
              word_count: analysis.wordCount,
              page_count: analysis.pageCount,
              assessed_complexity: analysis.complexity,
              processing_status: "completed",
              processed_at: now,
              created_at: now,
              updated_at: now,
            },
            {
              onConflict: "quote_file_id",
            },
          );

        if (insertError) {
          console.error(
            `❌ [PROCESS-DOCUMENT] Failed to store results:`,
            insertError,
          );
          await supabaseAdmin
            .from("quote_files")
            .update({
              ai_processing_status: "failed",
            })
            .eq("id", file.id);
          continue;
        }

        // Update file status to completed
        await supabaseAdmin
          .from("quote_files")
          .update({
            ai_processing_status: "completed",
          })
          .eq("id", file.id);

        console.log(
          `✅ [PROCESS-DOCUMENT] Completed analysis for ${file.original_filename}`,
        );

        results.push({
          success: true,
          fileId: file.id,
          fileName: file.original_filename,
          detectedLanguage: analysis.language,
          pageCount: analysis.pageCount,
          wordCount: analysis.wordCount,
          documentType: analysis.documentType,
        });
      } catch (fileError) {
        console.error(
          `❌ [PROCESS-DOCUMENT] Error processing file ${file.original_filename}:`,
          fileError,
        );

        // Mark as failed
        await supabaseAdmin
          .from("quote_files")
          .update({
            ai_processing_status: "failed",
          })
          .eq("id", file.id);

        results.push({
          success: false,
          fileId: file.id,
          fileName: file.original_filename,
          error: fileError.message,
        });
      }
    }

    const processingTime = Date.now() - startTime;
    const successfulResults = results.filter((r) => r.success);

    // Auto-update quote status to quote_ready after successful processing
    // Only update if called with quoteId (customer flow), not fileId (HITL re-analysis)
    if (quoteId && successfulResults.length > 0) {
      try {
        // Check current status - don't override hitl_pending, awaiting_payment, etc.
        const { data: currentQuote } = await supabaseAdmin
          .from("quotes")
          .select("status, processing_status")
          .eq("id", quoteId)
          .single();

        const allowedStatuses = ["draft", "pending", "processing", null, undefined];
        const allowedProcessingStatuses = ["pending", "processing", null, undefined];

        const canAutoUpdate =
          allowedStatuses.includes(currentQuote?.status) &&
          allowedProcessingStatuses.includes(currentQuote?.processing_status);

        if (canAutoUpdate) {
          console.log(`📊 [PROCESS-DOCUMENT] Auto-updating quote ${quoteId} to quote_ready`);
          await supabaseAdmin
            .from("quotes")
            .update({
              processing_status: "quote_ready",
              status: "quote_ready",
              updated_at: new Date().toISOString(),
            })
            .eq("id", quoteId);
        } else {
          console.log(
            `⏭️ [PROCESS-DOCUMENT] Skipping status update - quote has status: ${currentQuote?.status}, processing_status: ${currentQuote?.processing_status}`
          );
        }
      } catch (statusError) {
        console.error("❌ [PROCESS-DOCUMENT] Failed to update quote status:", statusError);
        // Don't fail the whole operation if status update fails
      }
    }

    return new Response(
      JSON.stringify({
        success: results.length > 0 && results.every((r) => r.success),
        documentsProcessed: successfulResults.length,
        results,
        processingTime,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("❌ [PROCESS-DOCUMENT] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Processing failed",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

// Helper function to analyze file content
async function analyzeFile(
  fileData: Blob,
  fileInfo: { mime_type: string; original_filename: string },
): Promise<{
  language: string;
  documentType: string;
  pageCount: number;
  wordCount: number;
  complexity: string;
}> {
  const mimeType = fileInfo.mime_type;
  const fileName = fileInfo.original_filename.toLowerCase();

  let pageCount = 1;
  let wordCount = 0;
  let documentType = "document";

  // Detect document type from file extension
  if (fileName.endsWith(".pdf")) {
    documentType = "pdf";
    // Simple PDF page count estimation (count occurrences of "endstream")
    // This is a rough estimate and should be replaced with proper PDF parsing
    const buffer = await fileData.arrayBuffer();
    const text = new TextDecoder().decode(buffer);
    pageCount = (text.match(/endstream/g) || []).length;
    pageCount = Math.max(1, pageCount); // At least 1 page
  } else if (fileName.endsWith(".doc") || fileName.endsWith(".docx")) {
    documentType = "word";
    pageCount = 1; // Estimate
  } else if (
    fileName.endsWith(".jpg") ||
    fileName.endsWith(".jpeg") ||
    fileName.endsWith(".png")
  ) {
    documentType = "image";
    pageCount = 1;
  } else {
    documentType = "other";
  }

  // Try to detect language from file content (simple heuristic)
  let language = "en"; // Default to English
  try {
    const buffer = await fileData.arrayBuffer();
    const text = new TextDecoder().decode(buffer);

    // Simple language detection based on common words
    // This is a very basic implementation
    if (
      text.toLowerCase().includes("este") ||
      text.toLowerCase().includes("que")
    ) {
      language = "es";
    } else if (
      text.toLowerCase().includes("le") ||
      text.toLowerCase().includes("la")
    ) {
      language = "fr";
    } else if (
      text.toLowerCase().includes("der") ||
      text.toLowerCase().includes("und")
    ) {
      language = "de";
    }

    // Estimate word count (rough)
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    wordCount = words.length;
  } catch {
    // If analysis fails, use defaults
  }

  // Determine complexity based on word count and page count
  let complexity = "low";
  if (wordCount > 5000 || pageCount > 10) {
    complexity = "high";
  } else if (wordCount > 2000 || pageCount > 5) {
    complexity = "medium";
  }

  return {
    language,
    documentType,
    pageCount: Math.max(1, pageCount),
    wordCount,
    complexity,
  };
}
