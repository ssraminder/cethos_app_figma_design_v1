import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface AnalyzeGroupRequest {
  groupId: string;
  staffId?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { groupId, staffId }: AnalyzeGroupRequest = await req.json();

    if (!groupId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required parameter: groupId",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`🔍 [ANALYZE-GROUP] Starting analysis for group: ${groupId}`);

    // Create Supabase client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Get the document group
    const { data: group, error: groupError } = await supabaseAdmin
      .from("quote_document_groups")
      .select("*")
      .eq("id", groupId)
      .single();

    if (groupError || !group) {
      console.error(`❌ [ANALYZE-GROUP] Group not found:`, groupError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Document group not found",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(
      `📋 [ANALYZE-GROUP] Group: ${group.group_label || "Untitled"}`
    );

    // Get all files assigned to this group
    const { data: assignments, error: assignmentsError } = await supabaseAdmin
      .from("quote_page_group_assignments")
      .select(
        `
        id,
        file_id,
        page_id,
        sequence_order,
        quote_files!quote_page_group_assignments_file_id_fkey (
          id,
          quote_id,
          original_filename,
          storage_path,
          file_size,
          mime_type,
          ai_processing_status
        )
      `
      )
      .eq("group_id", groupId)
      .order("sequence_order");

    if (assignmentsError) {
      console.error(
        `❌ [ANALYZE-GROUP] Failed to get assignments:`,
        assignmentsError
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to get group assignments",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(
      `📁 [ANALYZE-GROUP] Found ${assignments?.length || 0} assignments`
    );

    // Filter to get unique files
    const uniqueFiles = new Map<string, any>();
    for (const assignment of assignments || []) {
      if (assignment.file_id && assignment.quote_files) {
        uniqueFiles.set(assignment.file_id, assignment.quote_files);
      }
    }

    console.log(`📄 [ANALYZE-GROUP] Processing ${uniqueFiles.size} unique files`);

    let totalWordCount = 0;
    let totalPageCount = 0;
    const processedFiles: string[] = [];

    // Process each file
    for (const [fileId, file] of uniqueFiles) {
      console.log(`📄 [ANALYZE-GROUP] Processing file: ${file.original_filename}`);

      try {
        // Check if file already has analysis results
        const { data: existingAnalysis } = await supabaseAdmin
          .from("ai_analysis_results")
          .select("*")
          .eq("quote_file_id", fileId)
          .single();

        if (existingAnalysis) {
          // Use existing analysis
          console.log(
            `✅ [ANALYZE-GROUP] Using existing analysis for: ${file.original_filename}`
          );
          totalWordCount += existingAnalysis.word_count || 0;
          totalPageCount += existingAnalysis.page_count || 0;
          processedFiles.push(fileId);
          continue;
        }

        // File needs analysis - run OCR and AI analysis
        console.log(`🔍 [ANALYZE-GROUP] Running analysis for: ${file.original_filename}`);

        // Update file status to processing
        await supabaseAdmin
          .from("quote_files")
          .update({ ai_processing_status: "processing" })
          .eq("id", fileId);

        // Download file from storage
        const { data: fileData, error: downloadError } =
          await supabaseAdmin.storage
            .from("quote-files")
            .download(file.storage_path);

        if (downloadError || !fileData) {
          console.error(
            `❌ [ANALYZE-GROUP] Download failed for ${file.original_filename}:`,
            downloadError
          );
          await supabaseAdmin
            .from("quote_files")
            .update({ ai_processing_status: "failed" })
            .eq("id", fileId);
          continue;
        }

        // Simple text extraction for analysis
        const analysisResult = await analyzeFile(fileData, file);

        // Store analysis results
        const now = new Date().toISOString();
        const { data: savedAnalysis, error: insertError } = await supabaseAdmin
          .from("ai_analysis_results")
          .insert({
            quote_id: group.quote_id,
            quote_file_id: fileId,
            detected_language: analysisResult.detected_language,
            detected_document_type:
              group.document_type || analysisResult.detected_document_type,
            word_count: analysisResult.word_count,
            page_count: analysisResult.page_count,
            assessed_complexity: group.complexity || analysisResult.assessed_complexity,
            complexity_multiplier:
              group.complexity_multiplier || analysisResult.complexity_multiplier,
            llm_model: "analyze-document-group",
            processing_status: "completed",
            processed_at: now,
            created_at: now,
            updated_at: now,
          })
          .select()
          .single();

        if (insertError) {
          console.error(
            `❌ [ANALYZE-GROUP] Failed to save analysis:`,
            insertError
          );
          await supabaseAdmin
            .from("quote_files")
            .update({ ai_processing_status: "failed" })
            .eq("id", fileId);
          continue;
        }

        // Update file status to completed
        await supabaseAdmin
          .from("quote_files")
          .update({ ai_processing_status: "completed" })
          .eq("id", fileId);

        totalWordCount += analysisResult.word_count;
        totalPageCount += analysisResult.page_count;
        processedFiles.push(fileId);

        console.log(
          `✅ [ANALYZE-GROUP] Completed analysis for: ${file.original_filename}`
        );
      } catch (fileError) {
        console.error(
          `❌ [ANALYZE-GROUP] Error processing ${file.original_filename}:`,
          fileError
        );
        await supabaseAdmin
          .from("quote_files")
          .update({ ai_processing_status: "failed" })
          .eq("id", fileId);
      }
    }

    // Calculate billable pages and update group
    const complexityMultiplier = group.complexity_multiplier || 1.0;
    const wordsPerPage = 225;
    const billablePages =
      Math.ceil((totalWordCount / wordsPerPage) * complexityMultiplier * 10) /
      10;

    // Update the group with analysis results
    const { error: updateError } = await supabaseAdmin
      .from("quote_document_groups")
      .update({
        total_word_count: totalWordCount,
        total_pages: totalPageCount,
        billable_pages: billablePages,
        analysis_status: "completed",
        last_analyzed_at: new Date().toISOString(),
      })
      .eq("id", groupId);

    if (updateError) {
      console.error(`❌ [ANALYZE-GROUP] Failed to update group:`, updateError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to update group with analysis results",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Recalculate group totals using the RPC function if available
    try {
      await supabaseAdmin.rpc("recalculate_document_group", {
        p_group_id: groupId,
      });
    } catch (rpcError) {
      console.warn(
        `⚠️ [ANALYZE-GROUP] RPC recalculate failed (may not exist):`,
        rpcError
      );
    }

    console.log(`🎉 [ANALYZE-GROUP] Analysis complete for group: ${groupId}`);
    console.log(
      `   - Files processed: ${processedFiles.length}/${uniqueFiles.size}`
    );
    console.log(`   - Total words: ${totalWordCount}`);
    console.log(`   - Total pages: ${totalPageCount}`);
    console.log(`   - Billable pages: ${billablePages}`);

    // Log staff activity
    if (staffId) {
      await supabaseAdmin.from("staff_activity_log").insert({
        staff_id: staffId,
        action: "analyze_document_group",
        details: {
          group_id: groupId,
          quote_id: group.quote_id,
          files_processed: processedFiles.length,
          total_word_count: totalWordCount,
          total_pages: totalPageCount,
        },
        created_at: new Date().toISOString(),
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        groupId: groupId,
        filesProcessed: processedFiles.length,
        totalFiles: uniqueFiles.size,
        totalWordCount,
        totalPageCount,
        billablePages,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("❌ [ANALYZE-GROUP] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Analysis failed",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

// Simple file analysis function
async function analyzeFile(
  fileData: Blob,
  fileInfo: { mime_type: string; original_filename: string }
): Promise<{
  detected_language: string;
  detected_document_type: string;
  word_count: number;
  page_count: number;
  assessed_complexity: string;
  complexity_multiplier: number;
}> {
  const fileName = fileInfo.original_filename.toLowerCase();
  const buffer = await fileData.arrayBuffer();
  const text = new TextDecoder().decode(buffer);

  // Estimate page count
  let pageCount = 1;
  if (fileName.endsWith(".pdf") || fileInfo.mime_type.includes("pdf")) {
    pageCount = Math.max(1, (text.match(/endstream/g) || []).length);
  }

  // Count words
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;

  // Detect language (simplified)
  let language = "en";
  const lowerText = text.toLowerCase();
  if (lowerText.includes("este") || lowerText.includes("que")) {
    language = "es";
  } else if (lowerText.includes("le ") || lowerText.includes(" la ")) {
    language = "fr";
  } else if (lowerText.includes("der ") || lowerText.includes(" und ")) {
    language = "de";
  }

  // Detect document type
  let documentType = "document";
  if (
    fileName.includes("certificate") ||
    fileName.includes("diploma") ||
    fileName.includes("degree")
  ) {
    documentType = "certificate";
  } else if (
    fileName.includes("transcript") ||
    fileName.includes("grades")
  ) {
    documentType = "transcript";
  } else if (fileName.includes("passport") || fileName.includes("id")) {
    documentType = "identification";
  } else if (fileName.includes("birth")) {
    documentType = "birth_certificate";
  } else if (fileName.includes("marriage")) {
    documentType = "marriage_certificate";
  }

  // Assess complexity
  let complexity = "medium";
  let complexityMultiplier = 1.0;
  if (wordCount > 5000 || pageCount > 10) {
    complexity = "hard";
    complexityMultiplier = 1.5;
  } else if (wordCount < 1000 || pageCount <= 2) {
    complexity = "easy";
    complexityMultiplier = 1.0;
  }

  return {
    detected_language: language,
    detected_document_type: documentType,
    word_count: wordCount,
    page_count: pageCount,
    assessed_complexity: complexity,
    complexity_multiplier: complexityMultiplier,
  };
}
