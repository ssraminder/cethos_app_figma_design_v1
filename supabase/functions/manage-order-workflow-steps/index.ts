// ============================================================================
// manage-order-workflow-steps
// Manages workflow step lifecycle: add, remove, reorder steps, and
// list available services for step configuration.
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
    const body = await req.json();
    const { workflow_id, action } = body;

    if (!workflow_id || !action) {
      return json({ success: false, error: "Missing workflow_id or action" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify workflow exists
    const { data: workflow } = await supabase
      .from("order_workflows")
      .select("id, order_id, total_steps")
      .eq("id", workflow_id)
      .is("deleted_at", null)
      .single();

    if (!workflow) {
      return json({ success: false, error: "Workflow not found" }, 404);
    }

    switch (action) {
      case "add_step": {
        const { insert_after, name, service_id, actor_type, auto_advance, is_optional, requires_file_upload, instructions } = body;

        if (!name || !actor_type) {
          return json({ success: false, error: "Missing name or actor_type" }, 400);
        }

        const insertPosition = (insert_after ?? workflow.total_steps) + 1;

        // Shift existing steps at or after the insert position
        const { data: existingSteps } = await supabase
          .from("workflow_steps")
          .select("id, step_number")
          .eq("workflow_id", workflow_id)
          .is("deleted_at", null)
          .gte("step_number", insertPosition)
          .order("step_number", { ascending: false });

        for (const step of existingSteps ?? []) {
          await supabase
            .from("workflow_steps")
            .update({ step_number: step.step_number + 1 })
            .eq("id", step.id);
        }

        // Insert the new step
        const { error: insertErr } = await supabase
          .from("workflow_steps")
          .insert({
            workflow_id,
            order_id: workflow.order_id,
            step_number: insertPosition,
            step_name: name,
            actor_type,
            service_id: service_id || null,
            assignment_mode: "manual",
            auto_advance: auto_advance ?? false,
            is_optional: is_optional ?? false,
            requires_file_upload: requires_file_upload ?? false,
            instructions: instructions || null,
            status: "pending",
            currency: "CAD",
            revision_count: 0,
          });

        if (insertErr) {
          return json({ success: false, error: insertErr.message }, 500);
        }

        // Update workflow total
        await supabase
          .from("order_workflows")
          .update({ total_steps: workflow.total_steps + 1 })
          .eq("id", workflow_id);

        return json({ success: true });
      }

      case "remove_step": {
        const { step_id } = body;
        if (!step_id) return json({ success: false, error: "Missing step_id" }, 400);

        // Get the step to remove
        const { data: step } = await supabase
          .from("workflow_steps")
          .select("id, step_number, status")
          .eq("id", step_id)
          .single();

        if (!step) return json({ success: false, error: "Step not found" }, 404);

        if (!["pending", "skipped", "cancelled"].includes(step.status)) {
          return json({ success: false, error: "Cannot remove a step that is in progress or completed" }, 400);
        }

        // Soft-delete the step
        await supabase
          .from("workflow_steps")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", step_id);

        // Re-number remaining steps
        const { data: remaining } = await supabase
          .from("workflow_steps")
          .select("id, step_number")
          .eq("workflow_id", workflow_id)
          .is("deleted_at", null)
          .gt("step_number", step.step_number)
          .order("step_number");

        for (const s of remaining ?? []) {
          await supabase
            .from("workflow_steps")
            .update({ step_number: s.step_number - 1 })
            .eq("id", s.id);
        }

        // Update total
        await supabase
          .from("order_workflows")
          .update({ total_steps: Math.max(0, workflow.total_steps - 1) })
          .eq("id", workflow_id);

        return json({ success: true });
      }

      case "reorder_step": {
        const { step_id, new_position } = body;
        if (!step_id || !new_position) {
          return json({ success: false, error: "Missing step_id or new_position" }, 400);
        }

        const { data: step } = await supabase
          .from("workflow_steps")
          .select("id, step_number")
          .eq("id", step_id)
          .single();

        if (!step) return json({ success: false, error: "Step not found" }, 404);

        const oldPos = step.step_number;
        const newPos = new_position;

        if (oldPos === newPos) return json({ success: true });

        // Get all steps in the workflow
        const { data: allSteps } = await supabase
          .from("workflow_steps")
          .select("id, step_number")
          .eq("workflow_id", workflow_id)
          .is("deleted_at", null)
          .order("step_number");

        if (!allSteps) return json({ success: false, error: "No steps found" }, 500);

        // Shift steps between old and new positions
        if (newPos < oldPos) {
          // Moving up: shift steps in [newPos, oldPos-1] down by 1
          for (const s of allSteps) {
            if (s.step_number >= newPos && s.step_number < oldPos) {
              await supabase
                .from("workflow_steps")
                .update({ step_number: s.step_number + 1 })
                .eq("id", s.id);
            }
          }
        } else {
          // Moving down: shift steps in [oldPos+1, newPos] up by 1
          for (const s of allSteps) {
            if (s.step_number > oldPos && s.step_number <= newPos) {
              await supabase
                .from("workflow_steps")
                .update({ step_number: s.step_number - 1 })
                .eq("id", s.id);
            }
          }
        }

        // Set the moved step to its new position
        await supabase
          .from("workflow_steps")
          .update({ step_number: newPos })
          .eq("id", step_id);

        return json({ success: true });
      }

      case "list_available_services": {
        const { data: services } = await supabase
          .from("services")
          .select("id, name, code, category")
          .eq("is_active", true)
          .order("category")
          .order("name");

        return json({ success: true, services: services ?? [] });
      }

      default:
        return json({ success: false, error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("manage-order-workflow-steps error:", err);
    return json({ success: false, error: (err as Error).message }, 500);
  }
});
