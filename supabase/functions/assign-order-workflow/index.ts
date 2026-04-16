// ============================================================================
// assign-order-workflow
// Assigns a workflow template to an order, creating the workflow record
// and initializing all steps from the template definition.
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
    const { order_id, template_code } = await req.json();
    if (!order_id || !template_code) {
      return json({ success: false, error: "Missing order_id or template_code" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify order exists
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, quote_id, quotes(source_language_id, target_language_id)")
      .eq("id", order_id)
      .single();

    if (orderErr || !order) {
      return json({ success: false, error: "Order not found" }, 404);
    }

    // Check no workflow already exists
    const { data: existing } = await supabase
      .from("order_workflows")
      .select("id")
      .eq("order_id", order_id)
      .maybeSingle();

    if (existing) {
      return json({ success: false, error: "Workflow already assigned to this order" }, 409);
    }

    // Fetch template
    const { data: template, error: tplErr } = await supabase
      .from("workflow_templates")
      .select("id, code, name")
      .eq("code", template_code)
      .eq("is_active", true)
      .single();

    if (tplErr || !template) {
      return json({ success: false, error: `Template '${template_code}' not found` }, 404);
    }

    // Fetch template steps
    const { data: templateSteps } = await supabase
      .from("workflow_template_steps")
      .select("step_number, name, actor_type, assignment_mode, auto_advance, is_optional, requires_file_upload, instructions, service_id, allowed_actor_types, approval_depends_on_step")
      .eq("template_id", template.id)
      .order("step_number");

    if (!templateSteps?.length) {
      return json({ success: false, error: "Template has no steps defined" }, 400);
    }

    // Create workflow
    const { data: workflow, error: wfErr } = await supabase
      .from("order_workflows")
      .insert({
        order_id,
        template_id: template.id,
        template_code: template.code,
        template_name: template.name,
        status: "not_started",
        current_step_number: 1,
        total_steps: templateSteps.length,
      })
      .select("id")
      .single();

    if (wfErr || !workflow) {
      return json({ success: false, error: `Failed to create workflow: ${wfErr?.message}` }, 500);
    }

    // Extract languages from quote
    const quote = order.quotes as any;
    const sourceLang = quote?.source_language_id ?? null;
    const targetLang = quote?.target_language_id ?? null;

    // Create workflow steps
    const stepInserts = templateSteps.map((ts: any) => ({
      workflow_id: workflow.id,
      order_id,
      step_number: ts.step_number,
      name: ts.name,
      actor_type: ts.actor_type,
      assignment_mode: ts.assignment_mode || "manual",
      auto_advance: ts.auto_advance ?? false,
      is_optional: ts.is_optional ?? false,
      requires_file_upload: ts.requires_file_upload ?? false,
      instructions: ts.instructions,
      service_id: ts.service_id,
      allowed_actor_types: ts.allowed_actor_types,
      status: "pending",
      vendor_currency: "CAD",
      revision_count: 0,
      source_language: sourceLang,
      target_language: targetLang,
      approval_depends_on_step: ts.approval_depends_on_step ?? null,
    }));

    const { error: stepsErr } = await supabase
      .from("order_workflow_steps")
      .insert(stepInserts);

    if (stepsErr) {
      // Cleanup workflow on failure
      await supabase.from("order_workflows").delete().eq("id", workflow.id);
      return json({ success: false, error: `Failed to create steps: ${stepsErr.message}` }, 500);
    }

    console.log(`Workflow assigned: order=${order_id}, template=${template_code}, steps=${templateSteps.length}`);

    return json({ success: true, workflow_id: workflow.id });
  } catch (err) {
    console.error("assign-order-workflow error:", err);
    return json({ success: false, error: (err as Error).message }, 500);
  }
});
