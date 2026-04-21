// ============================================================================
// update-workflow-step
// Multi-action workflow step management: assign/offer vendors, lookup rates,
// unassign vendors, retract offers, extend deadlines, approve/request revision,
// start work, skip/cancel steps, and switch actor types.
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
    const { step_id, action } = body;

    if (!step_id || !action) {
      return json({ success: false, error: "Missing step_id or action" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch the step
    const { data: step, error: stepErr } = await supabase
      .from("order_workflow_steps")
      .select("*, order_workflows!workflow_id(id, order_id, status, current_step_number)")
      .eq("id", step_id)
      .single();

    if (stepErr || !step) {
      return json({ success: false, error: "Step not found" }, 404);
    }

    const workflow = step.order_workflows as any;

    switch (action) {
      // ── Lookup vendor rate ──
      case "lookup_vendor_rate": {
        const { vendor_id } = body;
        if (!vendor_id) return json({ success: false, error: "Missing vendor_id" }, 400);

        const { data: rates } = await supabase
          .from("vendor_rates")
          .select("rate, calculation_unit, currency")
          .eq("vendor_id", vendor_id)
          .eq("is_active", true);

        let match = rates?.find((r: any) => step.service_id && r.service_id === step.service_id);
        if (!match && rates?.length) match = rates[0];

        return json({
          success: true,
          suggested_rate: match
            ? { rate: match.rate, calculation_unit: match.calculation_unit, currency: match.currency }
            : null,
        });
      }

      // ── Direct assign a staff member (internal work / internal review) ──
      case "assign_staff": {
        const { staff_id, deadline, instructions } = body;
        if (!staff_id) return json({ success: false, error: "Missing staff_id" }, 400);

        // Verify the staff user exists + is active
        const { data: staffRow } = await supabase
          .from("staff_users")
          .select("id, full_name, is_active")
          .eq("id", staff_id)
          .maybeSingle();
        if (!staffRow || staffRow.is_active === false) {
          return json({ success: false, error: "Staff user not found or inactive" }, 404);
        }

        await supabase
          .from("order_workflow_steps")
          .update({
            assigned_staff_id: staff_id,
            status: "accepted",
            deadline: deadline || null,
            instructions: instructions || null,
            accepted_at: new Date().toISOString(),
            assigned_by: body.staff_id_actor || body.acting_staff_id || null,
          })
          .eq("id", step_id);

        // Kick the parent workflow into in_progress if it was still queued.
        if (workflow.status === "not_started") {
          await supabase
            .from("order_workflows")
            .update({ status: "in_progress" })
            .eq("id", step.workflow_id);
        }

        return json({ success: true });
      }

      // ── Direct assign vendor ──
      case "direct_assign": {
        const { vendor_id, vendor_rate, vendor_rate_unit, vendor_total, vendor_currency, deadline, instructions } = body;
        if (!vendor_id) return json({ success: false, error: "Missing vendor_id" }, 400);

        const { data: vendor } = await supabase
          .from("vendors")
          .select("id, full_name")
          .eq("id", vendor_id)
          .single();

        const vendorName = vendor?.full_name || "Unknown Vendor";

        await supabase
          .from("order_workflow_steps")
          .update({
            vendor_id,
            status: "accepted",
            vendor_rate: vendor_rate ?? null,
            vendor_rate_unit: vendor_rate_unit ?? null,
            vendor_total: vendor_total ?? null,
            vendor_currency: vendor_currency || "CAD",
            deadline: deadline || null,
            instructions: instructions || null,
            accepted_at: new Date().toISOString(),
            assigned_by: body.staff_id || null,
          })
          .eq("id", step_id);

        // Create payable record
        if (vendor_rate && vendor_total) {
          const units = vendor_rate > 0 ? vendor_total / vendor_rate : 1;
          await supabase.from("vendor_payables").insert({
            workflow_step_id: step_id,
            vendor_id,
            order_id: workflow.order_id,
            rate: vendor_rate,
            rate_unit: vendor_rate_unit || "flat",
            units,
            subtotal: vendor_total,
            total: vendor_total,
            currency: vendor_currency || "CAD",
            status: "pending",
            step_name: step.name,
            description: `Step ${step.step_number}: ${step.name}`,
          });
        }

        // Update workflow status if still not_started
        if (workflow.status === "not_started") {
          await supabase
            .from("order_workflows")
            .update({ status: "in_progress" })
            .eq("id", step.workflow_id);
        }

        return json({ success: true });
      }

      // ── Offer to single vendor ──
      case "offer_vendor": {
        const {
          vendor_id, vendor_rate, vendor_rate_unit, vendor_total, vendor_currency,
          deadline, instructions, expires_in_hours,
          negotiation_allowed, max_rate, max_total, latest_deadline, auto_accept_within_limits,
        } = body;

        if (!vendor_id) return json({ success: false, error: "Missing vendor_id" }, 400);

        const expiresAt = expires_in_hours
          ? new Date(Date.now() + expires_in_hours * 3600000).toISOString()
          : null;

        // Create offer record
        await supabase.from("vendor_step_offers").insert({
          step_id,
          vendor_id,
          status: "pending",
          vendor_rate: vendor_rate ?? null,
          vendor_rate_unit: vendor_rate_unit ?? null,
          vendor_total: vendor_total ?? null,
          vendor_currency: vendor_currency || "CAD",
          deadline: deadline || null,
          expires_at: expiresAt,
          offered_at: new Date().toISOString(),
          offered_by: body.staff_id || null,
          negotiation_allowed: negotiation_allowed ?? false,
          max_rate: max_rate ?? null,
          max_total: max_total ?? null,
          latest_deadline: latest_deadline ?? null,
          auto_accept_within_limits: auto_accept_within_limits ?? true,
        });

        // Update step status to offered
        await supabase
          .from("order_workflow_steps")
          .update({
            status: "offered",
            offered_at: new Date().toISOString(),
            instructions: instructions || step.instructions,
          })
          .eq("id", step_id);

        // Create pending payable
        if (vendor_rate && vendor_total) {
          const units = vendor_rate > 0 ? vendor_total / vendor_rate : 1;
          await supabase.from("vendor_payables").insert({
            workflow_step_id: step_id,
            vendor_id,
            order_id: workflow.order_id,
            rate: vendor_rate,
            rate_unit: vendor_rate_unit || "flat",
            units,
            subtotal: vendor_total,
            total: vendor_total,
            currency: vendor_currency || "CAD",
            status: "pending",
            step_name: step.name,
            description: `Step ${step.step_number}: ${step.name}`,
          });
        }

        if (workflow.status === "not_started") {
          await supabase
            .from("order_workflows")
            .update({ status: "in_progress" })
            .eq("id", step.workflow_id);
        }

        return json({ success: true });
      }

      // ── Offer to multiple vendors ──
      case "offer_multiple": {
        const {
          vendors: vendorList, vendor_rate, vendor_rate_unit, vendor_total, vendor_currency,
          deadline, instructions, expires_in_hours,
          negotiation_allowed, max_rate, max_total, latest_deadline, auto_accept_within_limits,
        } = body;

        if (!vendorList?.length) return json({ success: false, error: "No vendors provided" }, 400);

        const expiresAt = expires_in_hours
          ? new Date(Date.now() + expires_in_hours * 3600000).toISOString()
          : null;

        for (const v of vendorList) {
          const offerRate = v.vendor_rate ?? vendor_rate;
          const offerTotal = v.vendor_total ?? vendor_total;

          await supabase.from("vendor_step_offers").insert({
            step_id,
            vendor_id: v.vendor_id,
            status: "pending",
            vendor_rate: offerRate ?? null,
            vendor_rate_unit: vendor_rate_unit ?? null,
            vendor_total: offerTotal ?? null,
            vendor_currency: vendor_currency || "CAD",
            deadline: deadline || null,
            expires_at: expiresAt,
            offered_at: new Date().toISOString(),
            offered_by: body.staff_id || null,
            negotiation_allowed: negotiation_allowed ?? false,
            max_rate: max_rate ?? null,
            max_total: max_total ?? null,
            latest_deadline: latest_deadline ?? null,
            auto_accept_within_limits: auto_accept_within_limits ?? true,
          });
        }

        await supabase
          .from("order_workflow_steps")
          .update({
            status: "offered",
            offered_at: new Date().toISOString(),
            instructions: instructions || step.instructions,
          })
          .eq("id", step_id);

        if (workflow.status === "not_started") {
          await supabase
            .from("order_workflows")
            .update({ status: "in_progress" })
            .eq("id", step.workflow_id);
        }

        return json({ success: true, offers_sent: vendorList.length });
      }

      // ── Retract offer ──
      case "retract_offer": {
        const { offer_id } = body;
        if (!offer_id) return json({ success: false, error: "Missing offer_id" }, 400);

        await supabase
          .from("vendor_step_offers")
          .update({
            status: "retracted",
            responded_at: new Date().toISOString(),
          })
          .eq("id", offer_id);

        // Cancel associated payable
        await supabase
          .from("vendor_payables")
          .update({ status: "cancelled" })
          .eq("workflow_step_id", step_id)
          .eq("status", "pending");

        // Check remaining active offers
        const { data: remaining } = await supabase
          .from("vendor_step_offers")
          .select("id")
          .eq("step_id", step_id)
          .in("status", ["pending", "offered"]);

        const remainingCount = remaining?.length ?? 0;

        if (remainingCount === 0) {
          await supabase
            .from("order_workflow_steps")
            .update({
              status: "pending",
              vendor_id: null,
              offered_at: null,
            })
            .eq("id", step_id);
        }

        return json({ success: true, remaining_offers: remainingCount });
      }

      // ── Unassign vendor ──
      case "unassign_vendor": {
        const {
          reason, notes,
          payable_action, adjusted_amount,
          retract_offers, preserve_files,
        } = body;

        await supabase
          .from("order_workflow_steps")
          .update({
            unassigned_vendor_id: step.vendor_id,
            unassign_reason: reason,
            unassign_notes: notes || null,
            unassigned_at: new Date().toISOString(),
            vendor_id: null,
            status: "pending",
            accepted_at: null,
            started_at: null,
            delivered_at: null,
            offered_at: null,
            delivered_file_paths: preserve_files ? step.delivered_file_paths : null,
          })
          .eq("id", step_id);

        if (payable_action === "cancel") {
          await supabase
            .from("vendor_payables")
            .update({ status: "cancelled" })
            .eq("workflow_step_id", step_id)
            .neq("status", "paid");
        } else if (payable_action === "adjust" && adjusted_amount !== undefined) {
          const { data: payable } = await supabase
            .from("vendor_payables")
            .select("id, subtotal, total")
            .eq("workflow_step_id", step_id)
            .neq("status", "cancelled")
            .maybeSingle();

          if (payable) {
            await supabase
              .from("vendor_payables")
              .update({
                original_subtotal: payable.subtotal,
                original_total: payable.total,
                subtotal: adjusted_amount,
                total: adjusted_amount,
                status: "approved",
              })
              .eq("id", payable.id);
          }
        }

        if (retract_offers) {
          await supabase
            .from("vendor_step_offers")
            .update({ status: "retracted", responded_at: new Date().toISOString() })
            .eq("step_id", step_id)
            .in("status", ["pending", "offered"]);
        }

        return json({ success: true });
      }

      // ── Extend deadline ──
      case "extend_deadline": {
        const { new_deadline } = body;
        if (!new_deadline) return json({ success: false, error: "Missing new_deadline" }, 400);

        await supabase
          .from("order_workflow_steps")
          .update({ deadline: new_deadline })
          .eq("id", step_id);

        await supabase
          .from("vendor_step_offers")
          .update({ deadline: new_deadline })
          .eq("step_id", step_id)
          .in("status", ["pending", "offered"]);

        return json({ success: true });
      }

      // ── Approve delivery ──
      case "approve": {
        // Check approval dependency
        if (step.approval_depends_on_step) {
          const { data: depStep } = await supabase
            .from("order_workflow_steps")
            .select("id, step_number, name, status")
            .eq("workflow_id", step.workflow_id)
            .eq("step_number", step.approval_depends_on_step)
            .single();

          if (depStep && depStep.status !== "approved" && depStep.status !== "skipped") {
            if (depStep.status === "pending") {
              await supabase
                .from("order_workflow_steps")
                .update({
                  status: "in_progress",
                  started_at: new Date().toISOString(),
                })
                .eq("id", depStep.id);
            }

            return json({
              success: false,
              error: `Cannot approve this step until Step ${depStep.step_number} (${depStep.name}) is completed. Current status: ${depStep.status}`,
              blocked_by_step: depStep.step_number,
              blocked_by_step_name: depStep.name,
              blocked_by_step_status: depStep.status,
            }, 409);
          }
        }

        await supabase
          .from("order_workflow_steps")
          .update({
            status: "approved",
            approved_at: new Date().toISOString(),
          })
          .eq("id", step_id);

        // Update latest delivery review status
        const { data: latestDelivery } = await supabase
          .from("step_deliveries")
          .select("id")
          .eq("step_id", step_id)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestDelivery) {
          await supabase
            .from("step_deliveries")
            .update({
              review_status: "approved",
              reviewed_by: body.staff_id || null,
              reviewed_at: new Date().toISOString(),
            })
            .eq("id", latestDelivery.id);
        }

        // Approve vendor payable
        await supabase
          .from("vendor_payables")
          .update({
            status: "approved",
            approved_at: new Date().toISOString(),
          })
          .eq("workflow_step_id", step_id)
          .eq("status", "pending");

        // Check if all steps are complete
        const { data: allSteps } = await supabase
          .from("order_workflow_steps")
          .select("status")
          .eq("workflow_id", step.workflow_id);

        const allDone = allSteps?.every(
          (s: any) => s.status === "approved" || s.status === "skipped",
        );

        if (allDone) {
          await supabase
            .from("order_workflows")
            .update({ status: "completed" })
            .eq("id", step.workflow_id);
        }

        return json({ success: true });
      }

      // ── Request revision ──
      case "request_revision": {
        const { reason: revisionReason } = body;

        await supabase
          .from("order_workflow_steps")
          .update({
            status: "revision_requested",
            rejection_reason: revisionReason || null,
            revision_count: (step.revision_count ?? 0) + 1,
            delivered_at: null,
          })
          .eq("id", step_id);

        const { data: latestDelivery } = await supabase
          .from("step_deliveries")
          .select("id")
          .eq("step_id", step_id)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestDelivery) {
          await supabase
            .from("step_deliveries")
            .update({
              review_status: "revision_requested",
              reviewed_by: body.staff_id || null,
              reviewed_at: new Date().toISOString(),
              review_feedback: revisionReason || null,
            })
            .eq("id", latestDelivery.id);
        }

        return json({ success: true });
      }

      // ── Start work ──
      case "start": {
        await supabase
          .from("order_workflow_steps")
          .update({
            status: "in_progress",
            started_at: new Date().toISOString(),
          })
          .eq("id", step_id);

        return json({ success: true });
      }

      // ── Skip step ──
      case "skip": {
        await supabase
          .from("order_workflow_steps")
          .update({ status: "skipped" })
          .eq("id", step_id);

        return json({ success: true });
      }

      // ── Cancel step ──
      case "cancel": {
        await supabase
          .from("order_workflow_steps")
          .update({ status: "cancelled" })
          .eq("id", step_id);

        await supabase
          .from("vendor_payables")
          .update({ status: "cancelled" })
          .eq("workflow_step_id", step_id)
          .neq("status", "paid");

        return json({ success: true });
      }

      // ── Switch actor type ──
      case "switch_actor_type": {
        const { new_actor_type } = body;
        if (!new_actor_type) return json({ success: false, error: "Missing new_actor_type" }, 400);

        await supabase
          .from("order_workflow_steps")
          .update({ actor_type: new_actor_type })
          .eq("id", step_id);

        return json({ success: true });
      }

      // ── Adjust payable ──
      case "adjust_payable": {
        const { payable_id, new_rate, new_subtotal } = body;

        const { data: payable } = await supabase
          .from("vendor_payables")
          .select("id, rate, subtotal, total")
          .eq("id", payable_id)
          .single();

        if (!payable) return json({ success: false, error: "Payable not found" }, 404);

        const updateData: any = {
          original_subtotal: payable.subtotal,
          original_total: payable.total,
        };

        if (new_rate !== undefined) {
          updateData.rate = new_rate;
        }
        if (new_subtotal !== undefined) {
          updateData.subtotal = new_subtotal;
          updateData.total = new_subtotal;
        }

        await supabase
          .from("vendor_payables")
          .update(updateData)
          .eq("id", payable_id);

        const { data: updated } = await supabase
          .from("vendor_payables")
          .select("rate, subtotal, total")
          .eq("id", payable_id)
          .single();

        return json({ success: true, current: updated });
      }

      // ── Generic status change ──
      case "change_status": {
        const { status: newStatus } = body;
        if (!newStatus) return json({ success: false, error: "Missing status" }, 400);

        const updateData: any = { status: newStatus };
        if (newStatus === "in_progress" && !step.started_at) {
          updateData.started_at = new Date().toISOString();
        }
        if (newStatus === "delivered") {
          updateData.delivered_at = new Date().toISOString();
        }

        await supabase
          .from("order_workflow_steps")
          .update(updateData)
          .eq("id", step_id);

        // Update workflow status if needed
        if (newStatus === "in_progress" && workflow.status === "not_started") {
          await supabase
            .from("order_workflows")
            .update({ status: "in_progress" })
            .eq("id", workflow.id);
        }

        return json({ success: true });
      }

      default:
        return json({ success: false, error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("update-workflow-step error:", err);
    return json({ success: false, error: (err as Error).message }, 500);
  }
});
