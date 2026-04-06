// ============================================================================
// get-order-workflow
// Fetches complete workflow state for an order: steps, financial data,
// margin analysis, and available templates if no workflow is assigned.
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
    const { order_id } = await req.json();
    if (!order_id) return json({ success: false, error: "Missing order_id" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Check for existing workflow
    const { data: workflow } = await supabase
      .from("order_workflows")
      .select("id, template_code, template_name, status, current_step_number, total_steps")
      .eq("order_id", order_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!workflow) {
      // No workflow — return available templates
      const { data: templates } = await supabase
        .from("workflow_templates")
        .select("id, code, name, description, is_default, step_count")
        .eq("is_active", true)
        .order("sort_order");

      // Fetch template steps for preview
      const enriched = [];
      for (const t of templates ?? []) {
        const { data: steps } = await supabase
          .from("workflow_template_steps")
          .select("step_number, name, actor_type")
          .eq("template_id", t.id)
          .order("step_number");

        // Determine if template is suggested for this order
        const { data: order } = await supabase
          .from("orders")
          .select("quote_id, quotes(service_type)")
          .eq("id", order_id)
          .single();

        const serviceType = (order?.quotes as any)?.service_type;
        const isSuggested = t.is_default || (serviceType && t.code?.includes(serviceType));

        enriched.push({
          ...t,
          is_suggested: !!isSuggested,
          steps: steps ?? [],
        });
      }

      return json({
        success: true,
        has_workflow: false,
        workflow: null,
        steps: [],
        available_templates: enriched,
      });
    }

    // 2. Fetch workflow steps with offers, deliveries, and payables
    const { data: rawSteps } = await supabase
      .from("workflow_steps")
      .select(`
        id, step_number, step_name, actor_type, status, assignment_mode,
        auto_assign_rule, auto_advance, is_optional, requires_file_upload,
        allowed_actor_types,
        assigned_vendor_id, vendor_name, assigned_staff_id, assigned_by,
        preferred_vendor_id,
        offered_at, accepted_at, started_at, deadline,
        delivered_at, approved_at,
        rate, rate_unit, vendor_total, currency,
        source_file_paths, delivered_file_paths,
        instructions, notes_from_vendor, rejection_reason, revision_count,
        source_language, target_language,
        service_id, service_name, order_document_id,
        unassigned_vendor_id, unassigned_vendor_name,
        unassign_reason, unassign_notes, unassigned_at,
        created_at, updated_at
      `)
      .eq("order_id", order_id)
      .eq("workflow_id", workflow.id)
      .is("deleted_at", null)
      .order("step_number");

    const steps: any[] = [];

    for (const s of rawSteps ?? []) {
      // Fetch offers for this step
      const { data: offers } = await supabase
        .from("vendor_offers")
        .select(`
          id, vendor_id, vendor_name, status,
          vendor_rate, vendor_rate_unit, vendor_total, vendor_currency,
          deadline, expires_at, offered_at, declined_reason, responded_at,
          counter_status, counter_rate, counter_rate_unit, counter_total,
          counter_currency, counter_deadline, counter_note, counter_at,
          counter_responded_at, counter_rejection_reason,
          negotiation_allowed, max_rate, max_total, latest_deadline,
          auto_accept_within_limits
        `)
        .eq("step_id", s.id)
        .is("deleted_at", null)
        .order("offered_at", { ascending: false });

      // Fetch deliveries for this step
      const { data: deliveries } = await supabase
        .from("step_deliveries")
        .select(`
          id, step_id, version, actor_type,
          delivered_by_id, delivered_by_name, delivered_at,
          file_paths, notes,
          review_status, reviewed_by, reviewed_at, review_feedback,
          created_at
        `)
        .eq("step_id", s.id)
        .order("version", { ascending: false });

      // Fetch payable for this step
      const { data: payable } = await supabase
        .from("vendor_payables")
        .select(`
          id, rate, rate_unit, units, subtotal, total, currency, status,
          margin_percent, description,
          vendor_invoice_number, approved_at, paid_at,
          original_subtotal, original_total
        `)
        .eq("step_id", s.id)
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .maybeSingle();

      const offerList = offers ?? [];
      const activeOffers = offerList.filter(
        (o: any) => o.status === "pending" || o.status === "offered",
      );
      const hasPendingCounter = offerList.some(
        (o: any) => o.counter_status === "pending",
      );

      steps.push({
        id: s.id,
        step_number: s.step_number,
        name: s.step_name,
        actor_type: s.actor_type,
        status: s.status,
        assignment_mode: s.assignment_mode,
        auto_assign_rule: s.auto_assign_rule,
        auto_advance: s.auto_advance,
        is_optional: s.is_optional,
        requires_file_upload: s.requires_file_upload,
        allowed_actor_types: s.allowed_actor_types,
        deliveries: deliveries ?? [],
        delivery_count: deliveries?.length ?? 0,
        latest_delivery: deliveries?.[0] ?? null,
        vendor_id: s.assigned_vendor_id,
        vendor_name: s.vendor_name,
        assigned_staff_id: s.assigned_staff_id,
        assigned_by: s.assigned_by,
        preferred_vendor_id: s.preferred_vendor_id,
        offered_at: s.offered_at,
        accepted_at: s.accepted_at,
        started_at: s.started_at,
        deadline: s.deadline,
        delivered_at: s.delivered_at,
        approved_at: s.approved_at,
        vendor_rate: s.rate,
        vendor_rate_unit: s.rate_unit,
        vendor_total: s.vendor_total,
        vendor_currency: s.currency || "CAD",
        source_file_paths: s.source_file_paths,
        delivered_file_paths: s.delivered_file_paths,
        instructions: s.instructions,
        notes_from_vendor: s.notes_from_vendor,
        rejection_reason: s.rejection_reason,
        revision_count: s.revision_count ?? 0,
        source_language: s.source_language,
        target_language: s.target_language,
        service_id: s.service_id,
        service_name: s.service_name,
        order_document_id: s.order_document_id,
        offer_count: offerList.length,
        active_offer_count: activeOffers.length,
        has_pending_counter: hasPendingCounter,
        offers: offerList,
        payable: payable ?? null,
        unassigned_vendor_id: s.unassigned_vendor_id,
        unassigned_vendor_name: s.unassigned_vendor_name,
        unassign_reason: s.unassign_reason,
        unassign_notes: s.unassign_notes,
        unassigned_at: s.unassigned_at,
        created_at: s.created_at,
        updated_at: s.updated_at,
      });
    }

    // 3. Compute progress
    const total = steps.length;
    const completed = steps.filter((s: any) => s.status === "approved" || s.status === "skipped").length;
    const inProgress = steps.filter((s: any) =>
      ["offered", "accepted", "in_progress", "delivered", "revision_requested"].includes(s.status),
    ).length;
    const pending = total - completed - inProgress;

    // 4. Order financials from the order's quote
    const { data: orderRow } = await supabase
      .from("orders")
      .select("quote_id, quotes(calculated_totals)")
      .eq("id", order_id)
      .single();

    const totals = (orderRow?.quotes as any)?.calculated_totals;
    const orderFinancials = totals
      ? {
          subtotal: totals.subtotal ?? 0,
          pre_tax: totals.pre_tax ?? totals.subtotal ?? 0,
          tax: totals.tax ?? 0,
          total: totals.total ?? 0,
        }
      : null;

    // 5. Vendor financials aggregation
    const { data: payables } = await supabase
      .from("vendor_payables")
      .select("subtotal, total, status")
      .eq("workflow_id", workflow.id)
      .is("deleted_at", null)
      .neq("status", "cancelled");

    const vendorFinancials = {
      total_committed: 0,
      total_approved: 0,
      total_paid: 0,
      payable_count: payables?.length ?? 0,
    };
    let totalVendorCost = 0;
    for (const p of payables ?? []) {
      const amount = p.subtotal ?? p.total ?? 0;
      totalVendorCost += amount;
      if (p.status === "approved" || p.status === "invoiced" || p.status === "paid") {
        vendorFinancials.total_approved += amount;
      }
      if (p.status === "paid") {
        vendorFinancials.total_paid += amount;
      }
      vendorFinancials.total_committed += amount;
    }

    // 6. Margin calculation
    const revenue = orderFinancials?.subtotal ?? 0;
    const margin =
      revenue > 0
        ? {
            amount: revenue - totalVendorCost,
            percent: ((revenue - totalVendorCost) / revenue) * 100,
          }
        : null;

    return json({
      success: true,
      has_workflow: true,
      workflow: {
        ...workflow,
        progress: {
          total,
          completed,
          in_progress: inProgress,
          pending,
          percent: total > 0 ? Math.round((completed / total) * 100) : 0,
        },
      },
      steps,
      order_financials: orderFinancials,
      total_vendor_cost: totalVendorCost,
      vendor_financials: vendorFinancials,
      margin,
    });
  } catch (err) {
    console.error("get-order-workflow error:", err);
    return json({ success: false, error: (err as Error).message }, 500);
  }
});
