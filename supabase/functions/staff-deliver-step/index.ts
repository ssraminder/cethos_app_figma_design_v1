// ============================================================================
// staff-deliver-step
// Handles multipart file upload for staff delivering completed work on a
// workflow step. Uploads files to storage, creates delivery record, and
// tracks delivery version number.
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Parse multipart form data
    const formData = await req.formData();
    const stepId = formData.get("step_id") as string;
    const notes = formData.get("notes") as string | null;
    const staffId = formData.get("staff_id") as string | null;
    const files = formData.getAll("files") as File[];

    if (!stepId) return json({ success: false, error: "Missing step_id" }, 400);
    if (!files.length) return json({ success: false, error: "No files provided" }, 400);

    // Fetch step
    const { data: step, error: stepErr } = await supabase
      .from("workflow_steps")
      .select("id, workflow_id, order_id, step_number, step_name, delivered_file_paths")
      .eq("id", stepId)
      .single();

    if (stepErr || !step) {
      return json({ success: false, error: "Step not found" }, 404);
    }

    // Get staff name
    let staffName = "Staff";
    if (staffId) {
      const { data: staff } = await supabase
        .from("staff")
        .select("full_name")
        .eq("id", staffId)
        .single();
      if (staff) staffName = staff.full_name;
    }

    // Determine delivery version
    const { data: existingDeliveries } = await supabase
      .from("step_deliveries")
      .select("version")
      .eq("step_id", stepId)
      .order("version", { ascending: false })
      .limit(1);

    const deliveryVersion = (existingDeliveries?.[0]?.version ?? 0) + 1;

    // Upload files to storage
    const uploadedPaths: string[] = [];
    const timestamp = Date.now();

    for (const file of files) {
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `workflows/${step.order_id}/${stepId}/v${deliveryVersion}/${timestamp}_${sanitizedName}`;

      const { error: uploadErr } = await supabase.storage
        .from("quote-files")
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadErr) {
        console.error("File upload error:", uploadErr);
        return json({ success: false, error: `Failed to upload ${file.name}: ${uploadErr.message}` }, 500);
      }

      uploadedPaths.push(storagePath);
    }

    // Create delivery record
    const { error: deliveryErr } = await supabase
      .from("step_deliveries")
      .insert({
        step_id: stepId,
        version: deliveryVersion,
        actor_type: "internal_work",
        delivered_by_id: staffId,
        delivered_by_name: staffName,
        delivered_at: new Date().toISOString(),
        file_paths: uploadedPaths,
        notes: notes || null,
        review_status: "pending_review",
      });

    if (deliveryErr) {
      return json({ success: false, error: `Failed to create delivery record: ${deliveryErr.message}` }, 500);
    }

    // Update step status and delivered file paths
    const allPaths = [...(step.delivered_file_paths || []), ...uploadedPaths];

    await supabase
      .from("workflow_steps")
      .update({
        status: "delivered",
        delivered_at: new Date().toISOString(),
        delivered_file_paths: allPaths,
      })
      .eq("id", stepId);

    console.log(`Staff delivery: step=${stepId}, version=${deliveryVersion}, files=${files.length}`);

    return json({
      success: true,
      delivery_version: deliveryVersion,
      file_count: files.length,
    });
  } catch (err) {
    console.error("staff-deliver-step error:", err);
    return json({ success: false, error: (err as Error).message }, 500);
  }
});
