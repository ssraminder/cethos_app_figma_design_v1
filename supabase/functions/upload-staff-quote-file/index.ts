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
    const processWithAI = formData.get("processWithAI") === "true";

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
    console.log(`🤖 Process with AI: ${processWithAI}`);

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

    // 1. Verify quote exists and belongs to staff (or is a manual quote)
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

    // Verify staff owns the quote or it's a manual quote
    if (quote.created_by_staff_id !== staffId && !quote.is_manual_quote) {
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

    // 4. Create quote_files record
    const now = new Date().toISOString();
    const { data: quoteFile, error: dbError } = await supabaseAdmin
      .from("quote_files")
      .insert({
        quote_id: quoteId,
        original_filename: file.name,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: file.type,
        uploaded_by_staff: true,
        uploaded_by_staff_id: staffId,
        ai_processing_status: processWithAI ? "pending" : "skipped",
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (dbError) {
      console.error("❌ Database error:", dbError);
      // Try to delete the uploaded file since we couldn't record it
      try {
        await supabaseAdmin.storage
          .from("quote-files")
          .remove([storagePath]);
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

    // 5. If processWithAI is true, trigger AI processing
    // NOTE: This would call a process-document edge function if it exists
    // For now, we'll just log it and return the file info
    if (processWithAI) {
      console.log(`🤖 AI processing requested for file: ${quoteFile.id}`);
      // TODO: Call process-document edge function here
      // Example:
      // await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/process-document`, {
      //   method: "POST",
      //   headers: {
      //     "Content-Type": "application/json",
      //     "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      //   },
      //   body: JSON.stringify({
      //     fileId: quoteFile.id,
      //     quoteId: quoteId,
      //   }),
      // });
    }

    // 6. Log staff activity
    await supabaseAdmin.from("staff_activity_log").insert({
      staff_id: staffId,
      action: "upload_quote_file",
      details: {
        quote_id: quoteId,
        file_id: quoteFile.id,
        filename: file.name,
        file_size: file.size,
        process_with_ai: processWithAI,
      },
      created_at: now,
    });

    return new Response(
      JSON.stringify({
        success: true,
        fileId: quoteFile.id,
        storagePath: storagePath,
        uploadStatus: processWithAI ? "pending_ai" : "success",
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
