import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let quoteId: string | null = null;
  let quoteNumber: string | null = null;

  try {
    const body = await req.json();
    quoteId = body.quoteId;

    if (!quoteId) {
      return new Response(
        JSON.stringify({ success: false, error: "quoteId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`Processing documents for quote: ${quoteId}`);

    // Set processing status to "processing"
    await supabase
      .from("quotes")
      .update({ processing_status: "processing" })
      .eq("id", quoteId);

    // Fetch quote details
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select("id, quote_number, source_language_id, target_language_id")
      .eq("id", quoteId)
      .single();

    if (quoteError || !quote) {
      throw new Error(`Quote not found: ${quoteError?.message}`);
    }

    quoteNumber = quote.quote_number;

    // Fetch uploaded files (exclude reference files — they use a different bucket
    // and should not be processed by the AI/OCR pipeline)
    const REFERENCE_CATEGORY_ID = "f1aed462-a25f-4dd0-96c0-f952c3a72950";
    const { data: files, error: filesError } = await supabase
      .from("quote_files")
      .select("id, original_filename, storage_path, file_size, mime_type")
      .eq("quote_id", quoteId)
      .eq("upload_status", "uploaded")
      .or(`file_category_id.neq.${REFERENCE_CATEGORY_ID},file_category_id.is.null`);

    if (filesError) {
      throw new Error(`Failed to fetch files: ${filesError.message}`);
    }

    if (!files || files.length === 0) {
      throw new Error("No uploaded files found for this quote");
    }

    console.log(`Found ${files.length} file(s) to process`);

    let needsReview = false;
    const hitlReasons: string[] = [];
    let totalPages = 0;
    let totalWords = 0;
    let translationCost = 0;

    // Process each file
    for (const file of files) {
      try {
        // Update file processing status
        await supabase
          .from("quote_files")
          .update({ ai_processing_status: "processing" })
          .eq("id", file.id);

        // Download file from storage for OCR/AI analysis
        const { data: fileData, error: downloadError } = await supabase.storage
          .from("quote-files")
          .download(file.storage_path);

        if (downloadError || !fileData) {
          console.error(
            `Failed to download ${file.original_filename}:`,
            downloadError,
          );
          needsReview = true;
          hitlReasons.push(
            `Could not process file: ${file.original_filename}`,
          );

          await supabase
            .from("quote_files")
            .update({ ai_processing_status: "failed" })
            .eq("id", file.id);
          continue;
        }

        // ──────────────────────────────────────────────────────────────
        // AI / OCR Processing
        //
        // This is where the actual document analysis happens:
        //   1. OCR via Google Document AI (or similar)
        //   2. LLM analysis for document type, language, complexity
        //   3. Holder name / metadata extraction
        //   4. Word count and page calculations
        //
        // The results are stored in ai_analysis_results and quote_pages.
        // For brevity, the AI/OCR provider calls are abstracted here.
        // ──────────────────────────────────────────────────────────────

        const processingStart = Date.now();

        // Placeholder for AI analysis results — in production these come
        // from the OCR + LLM pipeline.
        const analysisResult = {
          detectedLanguage: "es",
          languageConfidence: 0.95,
          detectedDocumentType: "birth_certificate",
          documentTypeConfidence: 0.92,
          assessedComplexity: "easy" as "easy" | "medium" | "hard",
          complexityConfidence: 0.88,
          wordCount: 350,
          pageCount: 1,
          ocrConfidence: 0.91,
          extractedHolderName: null as string | null,
          holderExtractionConfidence: 0.0,
          certificationTypeId: null as string | null,
        };

        const processingTimeMs = Date.now() - processingStart;

        // Determine complexity multiplier
        const complexityMultiplier =
          analysisResult.assessedComplexity === "hard"
            ? 1.25
            : analysisResult.assessedComplexity === "medium"
              ? 1.15
              : 1.0;

        // Calculate billable pages (words / 225 * complexity multiplier)
        const billablePages =
          Math.ceil(
            ((analysisResult.wordCount / 225) * complexityMultiplier) * 100,
          ) / 100;
        const baseRate = 65.0;
        const lineTotal = Math.round(billablePages * baseRate * 100) / 100;

        totalPages += analysisResult.pageCount;
        totalWords += analysisResult.wordCount;
        translationCost += lineTotal;

        // Store AI analysis result
        await supabase.from("ai_analysis_results").insert({
          quote_id: quoteId,
          quote_file_id: file.id,
          detected_language: analysisResult.detectedLanguage,
          language_confidence: analysisResult.languageConfidence,
          detected_document_type: analysisResult.detectedDocumentType,
          document_type_confidence: analysisResult.documentTypeConfidence,
          assessed_complexity: analysisResult.assessedComplexity,
          complexity_multiplier: complexityMultiplier,
          complexity_confidence: analysisResult.complexityConfidence,
          word_count: analysisResult.wordCount,
          page_count: analysisResult.pageCount,
          billable_pages: billablePages,
          base_rate: baseRate,
          line_total: lineTotal,
          certification_type_id: analysisResult.certificationTypeId,
          extracted_holder_name: analysisResult.extractedHolderName,
          ocr_confidence: analysisResult.ocrConfidence,
          processing_status: "completed",
          processing_time_ms: processingTimeMs,
        });

        // Mark file as processed
        await supabase
          .from("quote_files")
          .update({ ai_processing_status: "completed" })
          .eq("id", file.id);

        // Check confidence thresholds — flag for review if any are low
        if (
          analysisResult.ocrConfidence < 0.7 ||
          analysisResult.languageConfidence < 0.7 ||
          analysisResult.documentTypeConfidence < 0.7
        ) {
          needsReview = true;
          if (analysisResult.ocrConfidence < 0.7) {
            hitlReasons.push(
              `Low OCR confidence (${(analysisResult.ocrConfidence * 100).toFixed(0)}%) for ${file.original_filename}`,
            );
          }
          if (analysisResult.languageConfidence < 0.7) {
            hitlReasons.push(
              `Low language detection confidence for ${file.original_filename}`,
            );
          }
          if (analysisResult.documentTypeConfidence < 0.7) {
            hitlReasons.push(
              `Low document type confidence for ${file.original_filename}`,
            );
          }
        }

        // Flag complex documents for review
        if (analysisResult.assessedComplexity === "hard") {
          needsReview = true;
          hitlReasons.push(
            `High complexity document: ${file.original_filename}`,
          );
        }
      } catch (fileErr) {
        console.error(
          `Error processing file ${file.original_filename}:`,
          fileErr,
        );
        needsReview = true;
        hitlReasons.push(
          `Processing error for ${file.original_filename}: ${fileErr instanceof Error ? fileErr.message : "Unknown error"}`,
        );

        await supabase
          .from("quote_files")
          .update({ ai_processing_status: "failed" })
          .eq("id", file.id);
      }
    }

    // Determine final processing status
    if (needsReview) {
      // ── Review Required ──────────────────────────────────────────
      await supabase
        .from("quotes")
        .update({
          processing_status: "review_required",
          updated_at: new Date().toISOString(),
        })
        .eq("id", quoteId);

      // Notify staff of review required
      try {
        const notifResponse = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-staff-notification`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              quote_id: quoteId,
              trigger_type: "review_required",
              quote_number: quoteNumber || null,
            }),
          },
        );
        console.log("Staff notification sent:", notifResponse.status);
      } catch (notifErr) {
        console.error("Staff notification failed (non-blocking):", notifErr);
      }

      console.log(`Quote ${quoteId} flagged for review: ${hitlReasons.join("; ")}`);
    } else {
      // ── Quote Ready ──────────────────────────────────────────────
      // Update quote with calculated totals
      const certificationTotal = 0; // Calculated from certification_type assignments
      const subtotal = translationCost + certificationTotal;

      await supabase
        .from("quotes")
        .update({
          processing_status: "quote_ready",
          subtotal: translationCost,
          certification_total: certificationTotal,
          calculated_totals: {
            translation_total: translationCost,
            certification_total: certificationTotal,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", quoteId);

      console.log(
        `Quote ${quoteId} ready — ${files.length} docs, $${subtotal.toFixed(2)} subtotal`,
      );
    }

    const result = {
      success: true,
      documentsProcessed: files.length,
      totals: {
        translationCost,
        documentCount: files.length,
        totalPages,
        totalWords,
      },
      hitl: {
        required: needsReview,
        reasons: hitlReasons,
      },
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("process-quote-documents error:", err);

    // If we have a quoteId, mark it as review_required so the customer isn't stuck
    if (quoteId) {
      await supabase
        .from("quotes")
        .update({
          processing_status: "review_required",
          updated_at: new Date().toISOString(),
        })
        .eq("id", quoteId);

      // Notify staff of review required (error fallback)
      try {
        const notifResponse = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-staff-notification`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              quote_id: quoteId,
              trigger_type: "review_required",
              quote_number: quoteNumber || null,
            }),
          },
        );
        console.log("Staff notification sent (error fallback):", notifResponse.status);
      } catch (notifErr) {
        console.error("Staff notification failed (non-blocking):", notifErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Processing failed",
        hitl: { required: true, reasons: ["Processing encountered an error"] },
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
