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
    const messageId = formData.get("message_id") as string | null;
    const conversationId = formData.get("conversation_id") as string;
    const uploaderType = formData.get("uploader_type") as string; // "customer" or "staff"
    const uploaderId = formData.get("uploader_id") as string;

    if (!file) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing file",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(`📁 Uploading file: ${file.name} (${file.size} bytes)`);
    console.log(`📝 Message ID: ${messageId || "TEMP (not created yet)"}`);
    console.log(`👤 Uploader: ${uploaderType} ${uploaderId}`);

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

    // Generate unique storage path
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(7);
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");

    // If messageId exists, use permanent path; otherwise use temp path
    let storagePath: string;
    if (messageId) {
      // Permanent path for existing message
      storagePath = `${conversationId}/${messageId}/${timestamp}-${randomSuffix}-${sanitizedFileName}`;
    } else {
      // Temporary path (will be moved when message is created)
      storagePath = `temp/${conversationId}/${timestamp}-${randomSuffix}-${sanitizedFileName}`;
    }

    // Upload file to storage
    console.log(`📤 Uploading to storage: ${storagePath}`);
    const fileBuffer = await file.arrayBuffer();

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("message-attachments")
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("❌ Storage upload error:", uploadError);
      throw new Error("File upload failed: " + uploadError.message);
    }

    console.log(`✅ File uploaded to storage: ${uploadData.path}`);

    // If messageId exists, create attachment record in database immediately
    if (messageId) {
      console.log(`💾 Creating attachment record for message: ${messageId}`);
      const { data: attachment, error: dbError } = await supabaseAdmin
        .from("message_attachments")
        .insert({
          message_id: messageId,
          filename: sanitizedFileName,
          original_filename: file.name,
          mime_type: file.type,
          file_size: file.size,
          storage_path: storagePath,
        })
        .select()
        .single();

      if (dbError) {
        console.error("❌ Database error:", dbError);
        // Try to delete the uploaded file since we couldn't record it
        try {
          await supabaseAdmin.storage
            .from("message-attachments")
            .remove([storagePath]);
        } catch (deleteError) {
          console.error("Failed to cleanup uploaded file:", deleteError);
        }
        throw new Error("Failed to create attachment record: " + dbError.message);
      }

      console.log(`✅ Attachment record created: ${attachment.id}`);

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            attachment_id: attachment.id,
            filename: attachment.filename,
            original_filename: attachment.original_filename,
            file_size: attachment.file_size,
            storage_path: attachment.storage_path,
          },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    } else {
      // Return temp path for later processing
      console.log(`✅ File uploaded to temp location: ${storagePath}`);

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            temp_path: storagePath,
            filename: sanitizedFileName,
            original_filename: file.name,
            file_size: file.size,
            mime_type: file.type,
          },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  } catch (error) {
    console.error("❌ Error in upload-message-attachment:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
