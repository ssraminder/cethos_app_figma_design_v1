import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface AnalyzeRequest {
  fileId: string;
  quoteId: string;
  analysisType: "ocr_only" | "ocr_and_ai";
  ocrProvider: string;
  aiModel?: string;
}

interface OCRPageResult {
  page_number: number;
  text: string;
  word_count: number;
}

interface OCRResult {
  total_pages: number;
  total_words: number;
  pages: OCRPageResult[];
  confidence_score?: number;
  processing_time_ms: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const {
      fileId,
      quoteId,
      analysisType,
      ocrProvider,
      aiModel,
    }: AnalyzeRequest = await req.json();

    if (!fileId || !quoteId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required parameters: fileId and quoteId",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(`🔍 [ANALYZE-DOCUMENT] Starting analysis`);
    console.log(`  - fileId: ${fileId}`);
    console.log(`  - quoteId: ${quoteId}`);
    console.log(`  - analysisType: ${analysisType}`);
    console.log(`  - ocrProvider: ${ocrProvider}`);
    console.log(`  - aiModel: ${aiModel}`);

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

    // Fetch file information
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

    console.log(`📄 [ANALYZE-DOCUMENT] Processing: ${file.original_filename}`);

    // Update file status to processing
    await supabaseAdmin
      .from("quote_files")
      .update({ ai_processing_status: "processing" })
      .eq("id", fileId);

    // Download file from storage
    console.log(
      `📥 [ANALYZE-DOCUMENT] Downloading from storage: ${file.storage_path}`,
    );
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from("quote-files")
      .download(file.storage_path);

    if (downloadError || !fileData) {
      console.error(`❌ [ANALYZE-DOCUMENT] Download failed:`, downloadError);
      await supabaseAdmin
        .from("quote_files")
        .update({ ai_processing_status: "failed" })
        .eq("id", fileId);

      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to download file from storage",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Run OCR analysis
    console.log(
      `🔍 [ANALYZE-DOCUMENT] Running OCR with provider: ${ocrProvider}`,
    );
    const ocrStartTime = Date.now();
    const ocrResult = await runOCRAnalysis(fileData, file, ocrProvider);
    const ocrProcessingTime = Date.now() - ocrStartTime;

    console.log(
      `✅ [ANALYZE-DOCUMENT] OCR completed: ${ocrResult.total_pages} pages, ${ocrResult.total_words} words`,
    );

    // Store OCR results in database
    const { data: savedOcrResult, error: ocrInsertError } = await supabaseAdmin
      .from("ocr_results")
      .insert({
        quote_file_id: fileId,
        ocr_provider: ocrProvider,
        total_pages: ocrResult.total_pages,
        total_words: ocrResult.total_words,
        pages: ocrResult.pages,
        confidence_score: ocrResult.confidence_score,
        processing_time_ms: ocrProcessingTime,
      })
      .select()
      .single();

    if (ocrInsertError) {
      console.error(
        `❌ [ANALYZE-DOCUMENT] Failed to save OCR results:`,
        ocrInsertError,
      );
    }

    let aiResult = null;

    // Run AI analysis if requested
    if (analysisType === "ocr_and_ai" && aiModel) {
      console.log(
        `🤖 [ANALYZE-DOCUMENT] Running AI analysis with model: ${aiModel}`,
      );
      const aiStartTime = Date.now();

      // Combine all page texts
      const fullText = ocrResult.pages.map((p) => p.text).join("\n\n");

      aiResult = await runAIAnalysis(fullText, file, aiModel, ocrResult);
      const aiProcessingTime = Date.now() - aiStartTime;

      console.log(
        `✅ [ANALYZE-DOCUMENT] AI completed: ${aiResult.detected_language}, ${aiResult.detected_document_type}`,
      );

      // Store AI results in database
      const now = new Date().toISOString();
      const { data: savedAiResult, error: aiInsertError } = await supabaseAdmin
        .from("ai_analysis_results")
        .upsert(
          {
            quote_id: quoteId,
            quote_file_id: fileId,
            detected_language: aiResult.detected_language,
            detected_document_type: aiResult.detected_document_type,
            word_count: aiResult.word_count,
            page_count: aiResult.page_count,
            assessed_complexity: aiResult.assessed_complexity,
            complexity_multiplier: aiResult.complexity_multiplier,
            language_confidence: aiResult.language_confidence,
            document_type_confidence: aiResult.document_type_confidence,
            complexity_confidence: aiResult.complexity_confidence,
            llm_model: aiModel,
            processing_status: "completed",
            processed_at: now,
            created_at: now,
            updated_at: now,
          },
          {
            onConflict: "quote_file_id",
          },
        )
        .select()
        .single();

      if (aiInsertError) {
        console.error(
          `❌ [ANALYZE-DOCUMENT] Failed to save AI results:`,
          aiInsertError,
        );
      } else {
        aiResult.id = savedAiResult.id;
      }
    }

    // Update file status to completed
    await supabaseAdmin
      .from("quote_files")
      .update({ ai_processing_status: "completed" })
      .eq("id", fileId);

    const totalProcessingTime = Date.now() - startTime;

    console.log(
      `🎉 [ANALYZE-DOCUMENT] Analysis complete in ${totalProcessingTime}ms`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        ocrResult: {
          id: savedOcrResult?.id,
          ocr_provider: ocrProvider,
          total_pages: ocrResult.total_pages,
          total_words: ocrResult.total_words,
          pages: ocrResult.pages,
          confidence_score: ocrResult.confidence_score,
          processing_time_ms: ocrProcessingTime,
        },
        aiResult: aiResult,
        totalProcessingTime,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("❌ [ANALYZE-DOCUMENT] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Analysis failed",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

// Run OCR analysis based on provider
async function runOCRAnalysis(
  fileData: Blob,
  fileInfo: { mime_type: string; original_filename: string },
  provider: string,
): Promise<OCRResult> {
  console.log(`🔍 Running OCR with provider: ${provider}`);

  // For now, use simple heuristic analysis
  // In production, this would call the actual OCR provider APIs
  const result = await simpleTextExtraction(fileData, fileInfo);

  // TODO: Implement actual OCR provider integrations:
  // - google_document_ai: Call Google Document AI API
  // - aws_textract: Call AWS Textract API
  // - azure_form_recognizer: Call Azure Form Recognizer API
  // - mistral: Call Mistral API for combined OCR+AI

  return result;
}

// Simple text extraction (fallback/development)
async function simpleTextExtraction(
  fileData: Blob,
  fileInfo: { mime_type: string; original_filename: string },
): Promise<OCRResult> {
  const startTime = Date.now();
  const fileName = fileInfo.original_filename.toLowerCase();
  const buffer = await fileData.arrayBuffer();
  const text = new TextDecoder().decode(buffer);

  let pageCount = 1;
  const pages: OCRPageResult[] = [];

  // Detect document type and estimate pages
  if (fileName.endsWith(".pdf") || fileInfo.mime_type.includes("pdf")) {
    // Count PDF pages by looking for page markers
    const pageMatches = text.match(/\/Type\s*\/Page[^s]/g);
    pageCount = pageMatches ? pageMatches.length : 1;

    // For each page, extract text (simplified)
    // In production, use a proper PDF parser
    const estimatedWordsPerPage =
      text.split(/\s+/).filter((w) => w.length > 0).length / pageCount;

    for (let i = 1; i <= pageCount; i++) {
      const pageText = `[Page ${i} text would be extracted here]`;
      const wordCount = Math.floor(estimatedWordsPerPage);
      pages.push({
        page_number: i,
        text: pageText,
        word_count: wordCount,
      });
    }
  } else {
    // For non-PDF files, treat as single page
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    pages.push({
      page_number: 1,
      text: text.substring(0, 1000), // First 1000 chars as preview
      word_count: words.length,
    });
  }

  const totalWords = pages.reduce((sum, page) => sum + page.word_count, 0);
  const processingTime = Date.now() - startTime;

  return {
    total_pages: pageCount,
    total_words: totalWords,
    pages: pages,
    confidence_score: 85.5, // Mock confidence
    processing_time_ms: processingTime,
  };
}

// Run AI analysis on extracted text
async function runAIAnalysis(
  text: string,
  fileInfo: { original_filename: string; mime_type: string },
  aiModel: string,
  ocrResult: OCRResult,
): Promise<any> {
  console.log(`🤖 Running AI analysis with model: ${aiModel}`);

  // TODO: Implement actual AI model calls (Anthropic, OpenAI, Google)
  // For now, use simple heuristics

  // Detect language (simplified)
  let language = "en";
  const lowerText = text.toLowerCase();
  if (lowerText.includes("este") || lowerText.includes("que")) {
    language = "es";
  } else if (lowerText.includes("le") || lowerText.includes("la")) {
    language = "fr";
  } else if (lowerText.includes("der") || lowerText.includes("und")) {
    language = "de";
  }

  // Detect document type
  let documentType = "document";
  const fileName = fileInfo.original_filename.toLowerCase();
  if (
    fileName.includes("certificate") ||
    fileName.includes("diploma") ||
    fileName.includes("degree")
  ) {
    documentType = "certificate";
  } else if (
    fileName.includes("transcript") ||
    fileName.includes("grades") ||
    fileName.includes("marks")
  ) {
    documentType = "transcript";
  } else if (fileName.includes("passport") || fileName.includes("id")) {
    documentType = "identification";
  }

  // Assess complexity
  let complexity = "medium";
  let complexityMultiplier = 1.0;
  const wordCount = ocrResult.total_words;
  const pageCount = ocrResult.total_pages;

  if (wordCount > 5000 || pageCount > 10) {
    complexity = "high";
    complexityMultiplier = 1.5;
  } else if (wordCount < 1000 || pageCount <= 2) {
    complexity = "low";
    complexityMultiplier = 0.8;
  }

  return {
    detected_language: language,
    detected_document_type: documentType,
    assessed_complexity: complexity,
    word_count: wordCount,
    page_count: pageCount,
    complexity_multiplier: complexityMultiplier,
    language_confidence: 0.85,
    document_type_confidence: 0.78,
    complexity_confidence: 0.82,
  };
}
