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
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get auth token from header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing or invalid authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    // Create Supabase clients
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify token and get user (staffId)
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const staffId = user.id;
    console.log(`Staff ID from token: ${staffId}`);

    // Parse form data
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const quoteId = formData.get("quoteId") as string;
    const categoryId = formData.get("categoryId") as string | null;

    // Validate required fields
    if (!file) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required field: file" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!quoteId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required field: quoteId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Uploading file for quote: ${quoteId}`);
    console.log(`File: ${file.name} (${file.size} bytes)`);
    console.log(`Category ID: ${categoryId || "not specified"}`);

    // Verify quote exists - include quote_number for HITL lookup
    const { data: quote, error: quoteError } = await supabaseAdmin
      .from("quotes")
      .select("id, quote_number, created_by_staff_id, is_manual_quote")
      .eq("id", quoteId)
      .single();

    if (quoteError || !quote) {
      console.error("Quote not found:", quoteError);
      return new Response(
        JSON.stringify({ success: false, error: "Quote not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Quote found: ${quote.quote_number}`);

    // Check authorization
    const isOwner = quote.created_by_staff_id === staffId;
    const isManualQuote = quote.is_manual_quote;

    // Check HITL queue - use quote_number, NOT quote_id
    const { data: hitlReview } = await supabaseAdmin
      .from("hitl_reviews")
      .select("id, assigned_to, status")
      .eq("quote_number", quote.quote_number)
      .maybeSingle();

    console.log(`HITL Review lookup for ${quote.quote_number}:`, hitlReview);

    // Allow upload if:
    // 1. Staff owns the quote (created it)
    // 2. It's a manual quote
    // 3. Staff has claimed the HITL review (assigned_to matches staffId)
    // 4. HITL review exists and is unassigned (anyone can work on it)
    const isClaimedByStaff = hitlReview?.assigned_to === staffId;
    const isUnassignedHITL = hitlReview && !hitlReview.assigned_to;
    const isInHITLQueue = isClaimedByStaff || isUnassignedHITL;

    console.log(`Auth check - isOwner: ${isOwner}, isManualQuote: ${isManualQuote}, isClaimedByStaff: ${isClaimedByStaff}, isUnassignedHITL: ${isUnassignedHITL}`);

    if (!isOwner && !isManualQuote && !isInHITLQueue) {
      console.error(`Authorization failed for staff ${staffId} on quote ${quoteId}`);
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized: Cannot upload to this quote. You must claim the HITL review first." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate storage path
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(7);
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${quoteId}/${timestamp}-${randomSuffix}-${sanitizedFileName}`;

    // Upload to storage
    console.log(`Uploading to storage: ${storagePath}`);
    const fileBuffer = await file.arrayBuffer();

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("quote-files")
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return new Response(
        JSON.stringify({ success: false, error: "File upload failed: " + uploadError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`File uploaded to storage: ${uploadData.path}`);

    // Get default category if not provided
    let finalCategoryId = categoryId;
    if (!finalCategoryId) {
      const { data: defaultCat } = await supabaseAdmin
        .from("file_categories")
        .select("id")
        .eq("slug", "to_translate")
        .single();
      finalCategoryId = defaultCat?.id || null;
      console.log(`Using default category "to_translate": ${finalCategoryId}`);
    }

    // Create quote_files record
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
        ai_processing_status: "pending",
        category_id: finalCategoryId,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      // Cleanup uploaded file
      try {
        await supabaseAdmin.storage.from("quote-files").remove([storagePath]);
      } catch (e) {
        console.error("Failed to cleanup file:", e);
      }
      return new Response(
        JSON.stringify({ success: false, error: "Failed to create file record: " + dbError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Quote file record created: ${quoteFile.id}`);

    // Log activity
    await supabaseAdmin.from("staff_activity_log").insert({
      staff_id: staffId,
      action: "upload_quote_file",
      details: {
        quote_id: quoteId,
        quote_number: quote.quote_number,
        file_id: quoteFile.id,
        filename: file.name,
        file_size: file.size,
        category_id: finalCategoryId,
      },
      created_at: now,
    }).catch(e => console.error("Failed to log activity:", e));

    return new Response(
      JSON.stringify({
        success: true,
        fileId: quoteFile.id,
        storagePath: storagePath,
        filename: file.name,
        categoryId: finalCategoryId,
        message: "File uploaded successfully",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
