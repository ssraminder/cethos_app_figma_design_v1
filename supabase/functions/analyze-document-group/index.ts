// supabase/functions/analyze-document-group/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { groupId, staffId } = await req.json();

    if (!groupId) {
      return new Response(
        JSON.stringify({ success: false, error: "Group ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📊 [ANALYZE-GROUP] Starting analysis for group: ${groupId}`);

    // 1. Get group details
    const { data: group, error: groupError } = await supabaseAdmin
      .from("quote_document_groups")
      .select("*, quote:quotes(*)")
      .eq("id", groupId)
      .single();

    if (groupError || !group) {
      return new Response(
        JSON.stringify({ success: false, error: "Group not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Update status to analyzing
    await supabaseAdmin
      .from("quote_document_groups")
      .update({ analysis_status: "analyzing", updated_at: new Date().toISOString() })
      .eq("id", groupId);

    // 3. Get all assigned items (pages and files)
    const { data: assignments, error: assignError } = await supabaseAdmin
      .from("quote_page_group_assignments")
      .select(`
        id,
        page_id,
        file_id,
        sequence_order,
        page:quote_pages(id, page_number, word_count, ocr_raw_text, quote_file_id),
        file:quote_files(id, original_filename, storage_path, mime_type)
      `)
      .eq("group_id", groupId)
      .order("sequence_order");

    if (assignError) {
      throw new Error(`Failed to get assignments: ${assignError.message}`);
    }

    if (!assignments || assignments.length === 0) {
      // No items assigned - just update status
      await supabaseAdmin
        .from("quote_document_groups")
        .update({
          analysis_status: "complete",
          total_pages: 0,
          total_word_count: 0,
          updated_at: new Date().toISOString()
        })
        .eq("id", groupId);

      return new Response(
        JSON.stringify({ success: true, message: "No items to analyze" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Collect all text content and images for analysis
    let combinedText = "";
    let totalWordCount = 0;
    let imageUrls: string[] = [];

    for (const assignment of assignments) {
      if (assignment.page_id && assignment.page) {
        // Page assignment
        const page = assignment.page as any;
        if (page.ocr_raw_text) {
          combinedText += page.ocr_raw_text + "\n\n";
        }
        totalWordCount += page.word_count || 0;

        // Get image URL for the page's file
        if (page.quote_file_id) {
          const { data: fileData } = await supabaseAdmin
            .from("quote_files")
            .select("storage_path")
            .eq("id", page.quote_file_id)
            .single();

          if (fileData?.storage_path && !fileData.storage_path.startsWith("virtual/")) {
            const { data: signedUrl } = await supabaseAdmin.storage
              .from("quote-files")
              .createSignedUrl(fileData.storage_path, 3600);
            if (signedUrl?.signedUrl) {
              imageUrls.push(signedUrl.signedUrl);
            }
          }
        }
      } else if (assignment.file_id && assignment.file) {
        // File assignment
        const file = assignment.file as any;

        // Get analysis results for this file
        const { data: analysis } = await supabaseAdmin
          .from("ai_analysis_results")
          .select("word_count, ocr_raw_text")
          .eq("quote_file_id", file.id)
          .single();

        if (analysis) {
          if (analysis.ocr_raw_text) {
            combinedText += analysis.ocr_raw_text + "\n\n";
          }
          totalWordCount += analysis.word_count || 0;
        }

        // Get signed URL for file
        if (file.storage_path && !file.storage_path.startsWith("virtual/")) {
          const { data: signedUrl } = await supabaseAdmin.storage
            .from("quote-files")
            .createSignedUrl(file.storage_path, 3600);
          if (signedUrl?.signedUrl) {
            imageUrls.push(signedUrl.signedUrl);
          }
        }
      }
    }

    // 5. Call Claude API for analysis
    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!anthropicApiKey) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }

    // Build message content with images
    const messageContent: any[] = [];

    // Add images (max 5 to avoid token limits)
    for (const url of imageUrls.slice(0, 5)) {
      try {
        const imageResponse = await fetch(url);
        const imageBuffer = await imageResponse.arrayBuffer();
        const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
        const mediaType = url.includes(".png") ? "image/png" : "image/jpeg";

        messageContent.push({
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType,
            data: base64Image,
          },
        });
      } catch (e) {
        console.log(`Failed to fetch image: ${e}`);
      }
    }

    // Add text prompt
    messageContent.push({
      type: "text",
      text: `Analyze this document group. The pages/files belong to a SINGLE logical document for translation certification purposes.

Combined OCR Text:
${combinedText.slice(0, 10000)}

Analyze and provide:
1. document_type: The type of document (e.g., drivers_license, birth_certificate, work_permit, passport, id_card, marriage_certificate, diploma_degree, transcript, bank_statement, etc.)
2. detected_language: ISO 639-1 code of the source language (e.g., "it", "zh", "es", "ar")
3. language_name: Full name of the language (e.g., "Italian", "Chinese", "Spanish")
4. complexity: Assessment of translation complexity - "easy", "medium", or "hard"
   - easy: Standard forms, clear text, common document types
   - medium: Some handwriting, stamps, technical terms, or complex layouts
   - hard: Extensive handwriting, poor quality, legal/medical terminology, archaic language
5. word_count: Your estimate of translatable words (may differ from OCR count)
6. suggested_label: A descriptive label for this document (e.g., "Italian Driver's License", "Chinese Work Permit")
7. confidence: Your confidence in this analysis (0.0 to 1.0)

Respond ONLY with valid JSON:
{
  "document_type": "string",
  "detected_language": "string",
  "language_name": "string",
  "complexity": "easy|medium|hard",
  "word_count": number,
  "suggested_label": "string",
  "confidence": number
}`
    });

    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: messageContent,
          },
        ],
      }),
    });

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      throw new Error(`Claude API error: ${errorText}`);
    }

    const claudeData = await claudeResponse.json();
    const responseText = claudeData.content?.[0]?.text || "";

    // Parse JSON from response
    let analysis;
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (e) {
      console.error("Failed to parse Claude response:", responseText);
      throw new Error(`Failed to parse analysis: ${e}`);
    }

    // 6. Calculate complexity multiplier
    const complexityMultiplier =
      analysis.complexity === "easy" ? 1.0 :
      analysis.complexity === "medium" ? 1.15 :
      analysis.complexity === "hard" ? 1.25 : 1.0;

    // 7. Update document group with analysis results
    const { error: updateError } = await supabaseAdmin
      .from("quote_document_groups")
      .update({
        group_label: analysis.suggested_label || group.group_label,
        document_type: analysis.document_type,
        source_language: analysis.detected_language,
        detected_language_name: analysis.language_name,
        complexity: analysis.complexity,
        complexity_multiplier: complexityMultiplier,
        total_word_count: analysis.word_count || totalWordCount,
        total_pages: assignments.length,
        ai_confidence: analysis.confidence,
        is_ai_suggested: true,
        analysis_status: "complete",
        last_analyzed_at: new Date().toISOString(),
        modified_by_staff_id: staffId || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", groupId);

    if (updateError) {
      throw new Error(`Failed to update group: ${updateError.message}`);
    }

    // 8. Recalculate group totals (pricing)
    await supabaseAdmin.rpc("recalculate_document_group", { p_group_id: groupId });

    // 9. Recalculate quote totals
    await supabaseAdmin.rpc("recalculate_quote_from_groups", { p_quote_id: group.quote_id });

    // 10. Log activity
    if (staffId) {
      await supabaseAdmin.from("staff_activity_log").insert({
        staff_id: staffId,
        action_type: "analyze_document_group",
        entity_type: "quote_document_group",
        entity_id: groupId,
        details: {
          quote_id: group.quote_id,
          document_type: analysis.document_type,
          complexity: analysis.complexity,
          word_count: analysis.word_count,
          confidence: analysis.confidence,
        },
      });
    }

    console.log(`✅ [ANALYZE-GROUP] Analysis complete for group: ${groupId}`);

    return new Response(
      JSON.stringify({
        success: true,
        groupId,
        analysis: {
          document_type: analysis.document_type,
          detected_language: analysis.detected_language,
          language_name: analysis.language_name,
          complexity: analysis.complexity,
          word_count: analysis.word_count,
          suggested_label: analysis.suggested_label,
          confidence: analysis.confidence,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("❌ [ANALYZE-GROUP] Error:", error);

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
