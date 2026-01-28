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
    const messageId = formData.get("message_id") as string;
    const conversationId = formData.get("conversation_id") as string;

    if (!file || !messageId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing file or message_id",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(`📁 Uploading file: ${file.name} (${file.size} bytes)`);

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
    const storagePath = `${conversationId}/${timestamp}-${randomSuffix}-${file.name}`;

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

    // Create attachment record in database
    console.log(`💾 Creating attachment record for message: ${messageId}`);
    const { data: attachment, error: dbError } = await supabaseAdmin
      .from("message_attachments")
      .insert({
        message_id: messageId,
        file_name: file.name,
        file_type: file.type,
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
        attachment_id: attachment.id,
        file_name: attachment.file_name,
        file_size: attachment.file_size,
        storage_path: attachment.storage_path,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
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
