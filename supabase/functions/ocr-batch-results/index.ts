// supabase/functions/ocr-batch-results/index.ts
// Get detailed results for a completed batch
// Note: No auth check - this is an admin-only function, auth handled by frontend
// Updated: Returns file_group_id, original_filename, chunk_index for grouping
// Updated: Returns detected_language, language_confidence per page
// Updated: Supports quote_files ID lookup (fallback when ocr_batch_files ID not found)
// Updated: Returns API usage/cost data per file and batch totals

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Get parameters from query string
    const url = new URL(req.url);
    const batchId = url.searchParams.get("batchId");
    const fileId = url.searchParams.get("fileId");
    const includeText = url.searchParams.get("includeText") === "true";

    // Must have either batchId or fileId
    if (!batchId && !fileId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing batchId or fileId parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==========================================
    // SINGLE FILE MODE (for OcrResultsModal)
    // ==========================================
    if (fileId) {
      // Try direct lookup in ocr_batch_files first
      let { data: file, error: fileError } = await supabaseAdmin
        .from("ocr_batch_files")
        .select(`
          id,
          batch_id,
          filename,
          status,
          page_count,
          word_count,
          file_size,
          error_message,
          processing_time_ms,
          queued_at,
          completed_at,
          file_group_id,
          original_filename,
          chunk_index,
          total_api_cost_usd,
          total_input_tokens,
          total_output_tokens,
          total_tokens,
          total_pages_ocrd,
          api_calls_count,
          ocr_provider,
          fallback_attempted,
          primary_provider_error
        `)
        .eq("id", fileId)
        .single();

      // If not found, try as a quote_files ID (fallback path)
      // quote_files.id → quote_files.quote_id → ocr_batches.quote_id → ocr_batch_files.batch_id
      if (fileError || !file) {
        console.log(`File not found in ocr_batch_files, trying as quote_files ID: ${fileId}`);

        // Get the quote_id from quote_files
        const { data: quoteFile } = await supabaseAdmin
          .from("quote_files")
          .select("id, quote_id, original_filename")
          .eq("id", fileId)
          .single();

        if (quoteFile) {
          // Find the batch for this quote
          const { data: batches } = await supabaseAdmin
            .from("ocr_batches")
            .select("id")
            .eq("quote_id", quoteFile.quote_id)
            .order("created_at", { ascending: false });

          if (batches && batches.length > 0) {
            const batchIds = batches.map((b: any) => b.id);

            // Find batch files for these batches
            const { data: batchFiles } = await supabaseAdmin
              .from("ocr_batch_files")
              .select(`
                id,
                batch_id,
                filename,
                status,
                page_count,
                word_count,
                file_size,
                error_message,
                processing_time_ms,
                queued_at,
                completed_at,
                file_group_id,
                original_filename,
                chunk_index,
                total_api_cost_usd,
                total_input_tokens,
                total_output_tokens,
                total_tokens,
                total_pages_ocrd,
                api_calls_count,
                ocr_provider,
                fallback_attempted,
                primary_provider_error
              `)
              .in("batch_id", batchIds)
              .order("queued_at");

            if (batchFiles && batchFiles.length > 0) {
              // Try to match by original_filename
              const qfName = quoteFile.original_filename || "";
              const matchedFile = batchFiles.find((bf: any) => {
                const bfName = bf.original_filename || bf.filename || "";
                return bfName === qfName || bfName.includes(qfName) || qfName.includes(bfName);
              });

              if (matchedFile) {
                // Found exact match — use it
                file = matchedFile;
              } else {
                // No exact match — return all batch files aggregated
                const allFileIds = batchFiles.map((f: any) => f.id);

                const resultSelect = includeText
                  ? "id, file_id, page_number, word_count, character_count, raw_text, markdown_text, confidence_score, detected_language, language_confidence, ocr_provider"
                  : "id, file_id, page_number, word_count, character_count, confidence_score, detected_language, language_confidence, ocr_provider";

                let allPages: any[] = [];
                if (allFileIds.length > 0) {
                  const { data: pagesData } = await supabaseAdmin
                    .from("ocr_batch_results")
                    .select(resultSelect)
                    .in("file_id", allFileIds)
                    .order("page_number");

                  allPages = pagesData || [];
                }

                const totalPages = batchFiles.reduce((sum: number, f: any) => sum + (f.page_count || 0), 0);
                const totalWords = batchFiles.reduce((sum: number, f: any) => sum + (f.word_count || 0), 0);

                return new Response(
                  JSON.stringify({
                    success: true,
                    file: {
                      id: fileId,
                      batch_id: batchFiles[0].batch_id,
                      filename: quoteFile.original_filename,
                      original_filename: quoteFile.original_filename,
                      status: batchFiles[0].status,
                      page_count: totalPages,
                      word_count: totalWords,
                      file_size: batchFiles.reduce((sum: number, f: any) => sum + (f.file_size || 0), 0),
                      error_message: null,
                      processing_time_ms: batchFiles.reduce((sum: number, f: any) => sum + (f.processing_time_ms || 0), 0),
                      queued_at: batchFiles[0].queued_at,
                      completed_at: batchFiles[batchFiles.length - 1].completed_at,
                      file_group_id: batchFiles[0].file_group_id,
                      chunk_index: null,
                      pages: allPages,
                      source_files: batchFiles.length,
                      total_api_cost_usd: batchFiles.reduce((sum: number, f: any) => sum + (parseFloat(f.total_api_cost_usd) || 0), 0),
                      total_input_tokens: batchFiles.reduce((sum: number, f: any) => sum + (f.total_input_tokens || 0), 0),
                      total_output_tokens: batchFiles.reduce((sum: number, f: any) => sum + (f.total_output_tokens || 0), 0),
                      total_tokens: batchFiles.reduce((sum: number, f: any) => sum + (f.total_tokens || 0), 0),
                      total_pages_ocrd: batchFiles.reduce((sum: number, f: any) => sum + (f.total_pages_ocrd || 0), 0),
                      api_calls_count: batchFiles.reduce((sum: number, f: any) => sum + (f.api_calls_count || 0), 0),
                    },
                  }),
                  { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
              }
            }
          }
        }
      }

      // If still no file found after fallback
      if (!file) {
        return new Response(
          JSON.stringify({ success: false, error: "File not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const resultSelect = includeText
        ? "id, file_id, page_number, word_count, character_count, raw_text, markdown_text, confidence_score, detected_language, language_confidence, ocr_provider"
        : "id, file_id, page_number, word_count, character_count, confidence_score, detected_language, language_confidence, ocr_provider";

      const { data: pages, error: pagesError } = await supabaseAdmin
        .from("ocr_batch_results")
        .select(resultSelect)
        .eq("file_id", file.id)
        .order("page_number");

      if (pagesError) {
        throw new Error("Failed to fetch page results");
      }

      return new Response(
        JSON.stringify({
          success: true,
          file: {
            ...file,
            pages: pages || [],
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==========================================
    // BATCH MODE
    // ==========================================
    const { data: batch, error: batchError } = await supabaseAdmin
      .from("ocr_batches")
      .select("*")
      .eq("id", batchId)
      .single();

    if (batchError || !batch) {
      return new Response(
        JSON.stringify({ success: false, error: "Batch not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: files, error: filesError } = await supabaseAdmin
      .from("ocr_batch_files")
      .select(`
        id,
        filename,
        status,
        page_count,
        word_count,
        file_size,
        error_message,
        processing_time_ms,
        queued_at,
        completed_at,
        file_group_id,
        original_filename,
        chunk_index,
        total_api_cost_usd,
        total_input_tokens,
        total_output_tokens,
        total_tokens,
        total_pages_ocrd,
        api_calls_count,
        ocr_provider,
        fallback_attempted,
        primary_provider_error
      `)
      .eq("batch_id", batchId)
      .order("queued_at");

    if (filesError) {
      throw new Error("Failed to fetch files");
    }

    const fileIds = (files || []).map(f => f.id);

    const resultSelect = includeText
      ? "id, file_id, page_number, word_count, character_count, raw_text, markdown_text, confidence_score, detected_language, language_confidence, ocr_provider"
      : "id, file_id, page_number, word_count, character_count, confidence_score, detected_language, language_confidence, ocr_provider";

    let results: any[] = [];
    if (fileIds.length > 0) {
      const { data: resultsData, error: resultsError } = await supabaseAdmin
        .from("ocr_batch_results")
        .select(resultSelect)
        .in("file_id", fileIds)
        .order("page_number");

      if (resultsError) {
        throw new Error("Failed to fetch results");
      }
      results = resultsData || [];
    }

    const resultsByFile = new Map<string, any[]>();
    results.forEach(r => {
      if (!resultsByFile.has(r.file_id)) {
        resultsByFile.set(r.file_id, []);
      }
      resultsByFile.get(r.file_id)!.push(r);
    });

    const filesWithResults = (files || []).map(file => ({
      ...file,
      pages: resultsByFile.get(file.id) || [],
    }));

    // Fetch API usage breakdown for this batch from api_usage_log
    let apiUsageBreakdown: any[] = [];
    const { data: usageData } = await supabaseAdmin
      .from("api_usage_log")
      .select("provider, model, operation, input_tokens, output_tokens, total_tokens, pages_processed, cost_usd, processing_time_ms")
      .eq("source_type", "ocr_batch")
      .eq("source_id", batchId);

    if (usageData) {
      // Aggregate by provider+operation
      const usageMap = new Map<string, any>();
      usageData.forEach((entry: any) => {
        const key = `${entry.provider}::${entry.operation}`;
        if (!usageMap.has(key)) {
          usageMap.set(key, {
            provider: entry.provider,
            model: entry.model,
            operation: entry.operation,
            callCount: 0,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            pagesProcessed: 0,
            totalCostUsd: 0,
            avgProcessingTimeMs: 0,
          });
        }
        const agg = usageMap.get(key)!;
        agg.callCount++;
        agg.inputTokens += entry.input_tokens || 0;
        agg.outputTokens += entry.output_tokens || 0;
        agg.totalTokens += entry.total_tokens || 0;
        agg.pagesProcessed += entry.pages_processed || 0;
        agg.totalCostUsd += parseFloat(entry.cost_usd) || 0;
        agg.avgProcessingTimeMs += entry.processing_time_ms || 0;
      });

      // Finalize averages
      usageMap.forEach((agg) => {
        if (agg.callCount > 0) {
          agg.avgProcessingTimeMs = Math.round(agg.avgProcessingTimeMs / agg.callCount);
        }
        agg.totalCostUsd = Math.round(agg.totalCostUsd * 1_000_000) / 1_000_000;
      });

      apiUsageBreakdown = Array.from(usageMap.values());
    }

    return new Response(
      JSON.stringify({
        success: true,
        batch: {
          id: batch.id,
          status: batch.status,
          totalFiles: batch.total_files,
          completedFiles: batch.completed_files,
          failedFiles: batch.failed_files,
          totalPages: batch.total_pages,
          totalWords: batch.total_words,
          createdAt: batch.created_at,
          completedAt: batch.completed_at,
          staffName: batch.staff_name,
          staffEmail: batch.staff_email,
          notes: batch.notes,
          // API usage totals
          totalApiCostUsd: parseFloat(batch.total_api_cost_usd) || 0,
          totalInputTokens: batch.total_input_tokens || 0,
          totalOutputTokens: batch.total_output_tokens || 0,
          totalTokens: batch.total_tokens || 0,
          totalPagesOcrd: batch.total_pages_ocrd || 0,
          apiCallsCount: batch.api_calls_count || 0,
        },
        files: filesWithResults,
        apiUsageBreakdown,
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
