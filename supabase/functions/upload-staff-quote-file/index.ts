import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const quoteId = formData.get("quoteId") as string;
    const staffId = formData.get("staffId") as string;
    const categoryId = formData.get("categoryId") as string | null;
    // Note: processWithAI parameter is deprecated - files are always uploaded without auto-processing
    // Staff must assign files to document groups and manually trigger analysis
    const _processWithAI = formData.get("processWithAI"); // kept for backwards compatibility

    if (!file || !quoteId || !staffId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: file, quoteId, staffId",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(`📁 Uploading file for quote: ${quoteId}`);
    console.log(`📝 File: ${file.name} (${file.size} bytes)`);
    console.log(`📋 File will be uploaded for manual group assignment`);
    console.log(`📂 Category ID: ${categoryId || "not specified"}`);

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

    // 1. Verify quote exists
    const { data: quote, error: quoteError } = await supabaseAdmin
      .from("quotes")
      .select("id, created_by_staff_id, is_manual_quote")
      .eq("id", quoteId)
      .single();

    if (quoteError || !quote) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Quote not found",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Verify authorization: staff owns the quote, it's a manual quote, OR staff has it in HITL queue
    const isOwner = quote.created_by_staff_id === staffId;
    const isManualQuote = quote.is_manual_quote;

    // Check if quote is in HITL queue assigned to this staff
    const { data: hitlReview } = await supabaseAdmin
      .from("hitl_reviews")
      .select("id, assigned_to")
      .eq("quote_id", quoteId)
      .maybeSingle();

    const isInHITLQueue =
      hitlReview &&
      (!hitlReview.assigned_to || // Unassigned - any staff can work on it
        hitlReview.assigned_to === staffId); // Assigned to this staff

    if (!isOwner && !isManualQuote && !isInHITLQueue) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Unauthorized: Quote does not belong to this staff member",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 2. Generate unique storage path
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(7);
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${quoteId}/${timestamp}-${randomSuffix}-${sanitizedFileName}`;

    // 3. Upload file to storage
    console.log(`📤 Uploading to storage: ${storagePath}`);
    const fileBuffer = await file.arrayBuffer();

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("quote-files")
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("❌ Storage upload error:", uploadError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "File upload failed: " + uploadError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(`✅ File uploaded to storage: ${uploadData.path}`);

    // 4. Determine final category ID (default to "to_translate" if not provided)
    let finalCategoryId = categoryId;
    if (!finalCategoryId) {
      const { data: defaultCat } = await supabaseAdmin
        .from("file_categories")
        .select("id")
        .eq("slug", "to_translate")
        .single();
      finalCategoryId = defaultCat?.id || null;
      console.log(`📂 Using default category "to_translate": ${finalCategoryId}`);
    }

    // 5. Create quote_files record
    // Note: ai_processing_status is always "skipped" - files must be assigned to document groups
    // and analysis triggered via the "Analyze" button on the group
    const now = new Date().toISOString();
    const { data: quoteFile, error: dbError } = await supabaseAdmin
      .from("quote_files")
      .insert({
        quote_id: quoteId,
        original_filename: file.name,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: file.type,
        is_staff_created: true,
        ai_processing_status: "skipped",
        category_id: finalCategoryId,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (dbError) {
      console.error("❌ Database error:", dbError);
      // Try to delete the uploaded file since we couldn't record it
      try {
        await supabaseAdmin.storage.from("quote-files").remove([storagePath]);
      } catch (deleteError) {
        console.error("Failed to cleanup uploaded file:", deleteError);
      }
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to create quote file record: " + dbError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(`✅ Quote file record created: ${quoteFile.id}`);

    // 6. Log staff activity
    await supabaseAdmin.from("staff_activity_log").insert({
      staff_id: staffId,
      action: "upload_quote_file",
      details: {
        quote_id: quoteId,
        file_id: quoteFile.id,
        filename: file.name,
        file_size: file.size,
      },
      created_at: now,
    });

    return new Response(
      JSON.stringify({
        success: true,
        fileId: quoteFile.id,
        storagePath: storagePath,
        uploadStatus: "success",
        message: "File uploaded. Assign to a document group and click Analyze.",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("❌ Error in upload-staff-quote-file:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
