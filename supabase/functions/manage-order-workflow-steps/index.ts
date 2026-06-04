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

    const { data: workflow, error: wfErr } = await supabase
      .from("order_workflows")
      .select("id, order_id, total_steps")
      .eq("id", workflow_id)
      .single();

    if (wfErr || !workflow) {
      return json({ success: false, error: "Workflow not found" }, 404);
    }

    switch (action) {
      case "add_step": {
        const {
          insert_after,
          name,
          service_id,
          actor_type,
          auto_advance,
          is_optional,
          requires_file_upload,
          instructions,
        } = body;

        if (!name || !actor_type) {
          return json({ success: false, error: "Missing name or actor_type" }, 400);
        }

        const insertPosition = (insert_after ?? workflow.total_steps) + 1;

        const { data: existingSteps, error: existingErr } = await supabase
          .from("order_workflow_steps")
          .select("id, step_number")
          .eq("workflow_id", workflow_id)
          .gte("step_number", insertPosition)
          .order("step_number", { ascending: false });

        if (existingErr) {
          return json({ success: false, error: existingErr.message }, 500);
        }

        for (const step of existingSteps ?? []) {
          const { error: shiftErr } = await supabase
            .from("order_workflow_steps")
            .update({ step_number: step.step_number + 1 })
            .eq("id", step.id);
          if (shiftErr) return json({ success: false, error: shiftErr.message }, 500);
        }

        // Bump approval_depends_on_step refs >= insertPosition so they keep pointing
        // at the same logical step after renumber.
        const { data: depsToBump, error: depsErr } = await supabase
          .from("order_workflow_steps")
          .select("id, approval_depends_on_step")
          .eq("workflow_id", workflow_id)
          .gte("approval_depends_on_step", insertPosition);
        if (depsErr) return json({ success: false, error: depsErr.message }, 500);
        for (const s of depsToBump ?? []) {
          if (s.approval_depends_on_step != null) {
            const { error: e } = await supabase
              .from("order_workflow_steps")
              .update({ approval_depends_on_step: s.approval_depends_on_step + 1 })
              .eq("id", s.id);
            if (e) return json({ success: false, error: e.message }, 500);
          }
        }

        const { error: insertErr } = await supabase
          .from("order_workflow_steps")
          .insert({
            workflow_id,
            order_id: workflow.order_id,
            step_number: insertPosition,
            name,
            actor_type,
            service_id: service_id || null,
            assignment_mode: "manual",
            auto_advance: auto_advance ?? false,
            is_optional: is_optional ?? false,
            requires_file_upload: requires_file_upload ?? false,
            instructions: instructions || null,
            status: "pending",
            vendor_currency: "CAD",
            revision_count: 0,
          });

        if (insertErr) {
          return json({ success: false, error: insertErr.message }, 500);
        }

        await supabase
          .from("order_workflows")
          .update({ total_steps: workflow.total_steps + 1 })
          .eq("id", workflow_id);

        return json({ success: true });
      }

      case "remove_step": {
        const { step_id } = body;
        if (!step_id) return json({ success: false, error: "Missing step_id" }, 400);

        const { data: step, error: stepErr } = await supabase
          .from("order_workflow_steps")
          .select("id, step_number, status, workflow_id")
          .eq("id", step_id)
          .single();

        if (stepErr || !step) return json({ success: false, error: "Step not found" }, 404);
        if (step.workflow_id !== workflow_id) {
          return json({ success: false, error: "Step does not belong to this workflow" }, 400);
        }

        if (!["pending", "skipped", "cancelled"].includes(step.status)) {
          return json(
            { success: false, error: "Cannot remove a step that is in progress or completed" },
            400,
          );
        }

        // Clear FK references before delete. For pending/skipped/cancelled steps these
        // are typically empty, but vendor_step_offers and notification_log can have rows.
        await supabase.from("vendor_step_offers").delete().eq("step_id", step_id);
        await supabase.from("notification_log").delete().eq("step_id", step_id);
        await supabase.from("step_deliveries").delete().eq("step_id", step_id);
        await supabase.from("step_draft_sends").delete().eq("step_id", step_id);
        await supabase.from("vendor_payables").delete().eq("workflow_step_id", step_id);
        await supabase.from("vendor_terms_acceptances").delete().eq("step_id", step_id);

        const { error: delErr } = await supabase
          .from("order_workflow_steps")
          .delete()
          .eq("id", step_id);

        if (delErr) return json({ success: false, error: delErr.message }, 500);

        // Renumber remaining downstream steps.
        const { data: remaining, error: remErr } = await supabase
          .from("order_workflow_steps")
          .select("id, step_number")
          .eq("workflow_id", workflow_id)
          .gt("step_number", step.step_number)
          .order("step_number");

        if (remErr) return json({ success: false, error: remErr.message }, 500);

        for (const s of remaining ?? []) {
          const { error: e } = await supabase
            .from("order_workflow_steps")
            .update({ step_number: s.step_number - 1 })
            .eq("id", s.id);
          if (e) return json({ success: false, error: e.message }, 500);
        }

        // Fix approval_depends_on_step references that pointed at or past the removed step.
        const { data: depsExact } = await supabase
          .from("order_workflow_steps")
          .select("id")
          .eq("workflow_id", workflow_id)
          .eq("approval_depends_on_step", step.step_number);
        for (const s of depsExact ?? []) {
          await supabase
            .from("order_workflow_steps")
            .update({ approval_depends_on_step: null })
            .eq("id", s.id);
        }

        const { data: depsAfter } = await supabase
          .from("order_workflow_steps")
          .select("id, approval_depends_on_step")
          .eq("workflow_id", workflow_id)
          .gt("approval_depends_on_step", step.step_number);
        for (const s of depsAfter ?? []) {
          if (s.approval_depends_on_step != null) {
            await supabase
              .from("order_workflow_steps")
              .update({ approval_depends_on_step: s.approval_depends_on_step - 1 })
              .eq("id", s.id);
          }
        }

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
          .from("order_workflow_steps")
          .select("id, step_number, workflow_id")
          .eq("id", step_id)
          .single();

        if (!step) return json({ success: false, error: "Step not found" }, 404);
        if (step.workflow_id !== workflow_id) {
          return json({ success: false, error: "Step does not belong to this workflow" }, 400);
        }

        const oldPos = step.step_number;
        const newPos = new_position;

        if (oldPos === newPos) return json({ success: true });

        const { data: allSteps } = await supabase
          .from("order_workflow_steps")
          .select("id, step_number")
          .eq("workflow_id", workflow_id)
          .order("step_number");

        if (!allSteps) return json({ success: false, error: "No steps found" }, 500);

        // Park the moving step at a sentinel to avoid the (workflow_id, step_number)
        // unique conflict while neighbors are being shifted.
        await supabase
          .from("order_workflow_steps")
          .update({ step_number: -1 })
          .eq("id", step_id);

        if (newPos < oldPos) {
          for (const s of allSteps) {
            if (s.id === step_id) continue;
            if (s.step_number >= newPos && s.step_number < oldPos) {
              await supabase
                .from("order_workflow_steps")
                .update({ step_number: s.step_number + 1 })
                .eq("id", s.id);
            }
          }
        } else {
          for (const s of allSteps) {
            if (s.id === step_id) continue;
            if (s.step_number > oldPos && s.step_number <= newPos) {
              await supabase
                .from("order_workflow_steps")
                .update({ step_number: s.step_number - 1 })
                .eq("id", s.id);
            }
          }
        }

        await supabase
          .from("order_workflow_steps")
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
