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

    // 0. Compute order_financials up front so both branches (workflow
    //    exists AND no-workflow-yet) return it. Previously only the
    //    with-workflow branch returned financials, which left the
    //    admin-side Finance tab blank until a workflow was assigned.
    const orderFinancials = await loadOrderFinancials(supabase, order_id);
    const payments = await loadOrderPayments(supabase, order_id);

    // 1. Check for existing workflow
    const { data: workflow } = await supabase
      .from("order_workflows")
      .select("id, template_code, template_name, status, current_step_number, total_steps")
      .eq("order_id", order_id)
      .maybeSingle();

    if (!workflow) {
      // No workflow — return available templates with suggestions scoped to
      // the order's service_id.
      const { data: orderForService } = await supabase
        .from("orders")
        .select("service_id")
        .eq("id", order_id)
        .single();
      const orderServiceId = orderForService?.service_id ?? null;

      const { data: templates } = await supabase
        .from("workflow_templates")
        .select("id, code, name, description, is_default, service_id")
        .eq("is_active", true)
        .order("name");

      // Fetch template steps for preview
      const enriched = [];
      for (const t of templates ?? []) {
        const { data: steps } = await supabase
          .from("workflow_template_steps")
          .select("step_number, name, actor_type")
          .eq("template_id", t.id)
          .order("step_number");

        // A template is "suggested" when it targets this order's service, or
        // when it is flagged as the default.
        const matchesService =
          !!orderServiceId && t.service_id === orderServiceId;
        const isSuggested = matchesService || t.is_default === true;

        enriched.push({
          ...t,
          is_suggested: isSuggested,
          matches_service: matchesService,
          steps: steps ?? [],
        });
      }

      return json({
        success: true,
        has_workflow: false,
        workflow: null,
        steps: [],
        available_templates: enriched,
        order_financials: orderFinancials,
        payments,
      });
    }

    // 2. Fetch workflow steps — table is order_workflow_steps
    const { data: rawSteps } = await supabase
      .from("order_workflow_steps")
      .select(`
        id, step_number, name, actor_type, status, assignment_mode,
        auto_assign_rule, auto_advance, is_optional, requires_file_upload,
        allowed_actor_types,
        vendor_id, assigned_staff_id, assigned_by,
        preferred_vendor_id,
        offered_at, accepted_at, started_at, deadline,
        delivered_at, approved_at,
        vendor_rate, vendor_rate_unit, vendor_total, vendor_currency,
        source_file_paths, delivered_file_paths,
        instructions, notes_from_vendor, rejection_reason, revision_count,
        source_language, target_language,
        service_id, order_document_id,
        unassigned_vendor_id,
        unassign_reason, unassign_notes, unassigned_at,
        approval_depends_on_step,
        created_at, updated_at
      `)
      .eq("order_id", order_id)
      .eq("workflow_id", workflow.id)
      .order("step_number");

    // Batch-fetch vendor names for steps that have a vendor_id
    const vendorIds = (rawSteps ?? [])
      .map((s: any) => s.vendor_id)
      .filter(Boolean);
    const unassignedVendorIds = (rawSteps ?? [])
      .map((s: any) => s.unassigned_vendor_id)
      .filter(Boolean);
    const preferredVendorIds = (rawSteps ?? [])
      .map((s: any) => s.preferred_vendor_id)
      .filter(Boolean);

    // Also collect vendor IDs from offers
    const stepIds = (rawSteps ?? []).map((s: any) => s.id);
    let offerVendorIds: string[] = [];
    if (stepIds.length > 0) {
      const { data: offerRows } = await supabase
        .from("vendor_step_offers")
        .select("vendor_id")
        .in("step_id", stepIds);
      offerVendorIds = (offerRows ?? []).map((o: any) => o.vendor_id).filter(Boolean);
    }

    const allVendorIds = [...new Set([...vendorIds, ...unassignedVendorIds, ...preferredVendorIds, ...offerVendorIds])];

    let vendorNameMap: Record<string, string> = {};
    if (allVendorIds.length > 0) {
      const { data: vendors } = await supabase
        .from("vendors")
        .select("id, full_name")
        .in("id", allVendorIds);
      for (const v of vendors ?? []) {
        vendorNameMap[v.id] = v.full_name;
      }
    }

    // Fetch service names
    const serviceIds = (rawSteps ?? [])
      .map((s: any) => s.service_id)
      .filter(Boolean);
    let serviceNameMap: Record<string, string> = {};
    if (serviceIds.length > 0) {
      const { data: services } = await supabase
        .from("services")
        .select("id, name")
        .in("id", [...new Set(serviceIds)]);
      for (const svc of services ?? []) {
        serviceNameMap[svc.id] = svc.name;
      }
    }

    const steps: any[] = [];

    for (const s of rawSteps ?? []) {
      // Fetch offers for this step — table is vendor_step_offers
      const { data: offers } = await supabase
        .from("vendor_step_offers")
        .select(`
          id, vendor_id, status,
          vendor_rate, vendor_rate_unit, vendor_total, vendor_currency,
          deadline, expires_at, offered_at, declined_reason, responded_at,
          counter_status, counter_rate, counter_rate_unit, counter_total,
          counter_currency, counter_deadline, counter_note, counter_at,
          counter_responded_at, counter_rejection_reason,
          negotiation_allowed, max_rate, max_total, latest_deadline,
          auto_accept_within_limits
        `)
        .eq("step_id", s.id)
        .order("offered_at", { ascending: false });

      // Enrich offers with vendor names
      const enrichedOffers = (offers ?? []).map((o: any) => ({
        ...o,
        vendor_name: vendorNameMap[o.vendor_id] || null,
      }));

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
        .eq("workflow_step_id", s.id)
        .neq("status", "cancelled")
        .maybeSingle();

      const offerList = enrichedOffers;
      const activeOffers = offerList.filter(
        (o: any) => o.status === "pending" || o.status === "offered",
      );
      const hasPendingCounter = offerList.some(
        (o: any) => o.counter_status === "pending",
      );

      steps.push({
        id: s.id,
        step_number: s.step_number,
        name: s.name,
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
        vendor_id: s.vendor_id,
        vendor_name: vendorNameMap[s.vendor_id] || null,
        assigned_staff_id: s.assigned_staff_id,
        assigned_by: s.assigned_by,
        preferred_vendor_id: s.preferred_vendor_id,
        offered_at: s.offered_at,
        accepted_at: s.accepted_at,
        started_at: s.started_at,
        deadline: s.deadline,
        delivered_at: s.delivered_at,
        approved_at: s.approved_at,
        vendor_rate: s.vendor_rate,
        vendor_rate_unit: s.vendor_rate_unit,
        vendor_total: s.vendor_total,
        vendor_currency: s.vendor_currency || "CAD",
        source_file_paths: s.source_file_paths,
        delivered_file_paths: s.delivered_file_paths,
        instructions: s.instructions,
        notes_from_vendor: s.notes_from_vendor,
        rejection_reason: s.rejection_reason,
        revision_count: s.revision_count ?? 0,
        source_language: s.source_language,
        target_language: s.target_language,
        service_id: s.service_id,
        service_name: serviceNameMap[s.service_id] || null,
        order_document_id: s.order_document_id,
        offer_count: offerList.length,
        active_offer_count: activeOffers.length,
        has_pending_counter: hasPendingCounter,
        offers: offerList,
        payable: payable ?? null,
        unassigned_vendor_id: s.unassigned_vendor_id,
        unassigned_vendor_name: vendorNameMap[s.unassigned_vendor_id] || null,
        unassign_reason: s.unassign_reason,
        unassign_notes: s.unassign_notes,
        unassigned_at: s.unassigned_at,
        approval_depends_on_step: s.approval_depends_on_step ?? null,
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

    // 4. Order financials already computed up top — reuse it.

    // 5. Vendor financials aggregation
    const { data: payables } = await supabase
      .from("vendor_payables")
      .select("subtotal, total, status")
      .eq("order_id", order_id)
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
      payments,
      total_vendor_cost: totalVendorCost,
      vendor_financials: vendorFinancials,
      margin,
    });
  } catch (err) {
    console.error("get-order-workflow error:", err);
    return json({ success: false, error: (err as Error).message }, 500);
  }
});

// ----------------------------------------------------------------------------
// Load order payments with card details. Lazily enriches from Stripe (card
// brand, last4, receipt URL, charge id) the first time each row is read,
// caches back to the payments row via stripe_enriched_at. Subsequent calls
// return from DB only — no Stripe API hit per admin page load.
// ----------------------------------------------------------------------------
async function loadOrderPayments(supabase: any, order_id: string) {
  const { data: rows } = await supabase
    .from("payments")
    .select(`
      id, order_id, amount, currency, amount_cad, payment_type, status,
      payment_method, failure_reason, receipt_url, created_at,
      stripe_checkout_session_id, stripe_payment_intent_id, stripe_charge_id,
      card_brand, card_last4, card_exp_month, card_exp_year,
      cardholder_name, card_country, stripe_enriched_at
    `)
    .eq("order_id", order_id)
    .order("created_at", { ascending: false });

  if (!rows || rows.length === 0) return [];

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const enriched: any[] = [];

  for (const row of rows) {
    const needsEnrichment =
      !row.stripe_enriched_at &&
      (row.stripe_payment_intent_id || row.stripe_checkout_session_id);

    if (stripeKey && needsEnrichment) {
      try {
        const details = await fetchStripeCardDetails(
          stripeKey,
          row.stripe_payment_intent_id,
          row.stripe_checkout_session_id,
        );
        if (details) {
          const patch: Record<string, unknown> = {
            stripe_enriched_at: new Date().toISOString(),
          };
          if (details.charge_id && !row.stripe_charge_id) patch.stripe_charge_id = details.charge_id;
          if (details.card_brand) patch.card_brand = details.card_brand;
          if (details.card_last4) patch.card_last4 = details.card_last4;
          if (details.card_exp_month) patch.card_exp_month = details.card_exp_month;
          if (details.card_exp_year) patch.card_exp_year = details.card_exp_year;
          if (details.cardholder_name) patch.cardholder_name = details.cardholder_name;
          if (details.card_country) patch.card_country = details.card_country;
          if (details.receipt_url && !row.receipt_url) patch.receipt_url = details.receipt_url;

          await supabase.from("payments").update(patch).eq("id", row.id);
          Object.assign(row, patch);
        } else {
          // Mark as tried so we don't keep re-requesting
          await supabase
            .from("payments")
            .update({ stripe_enriched_at: new Date().toISOString() })
            .eq("id", row.id);
          row.stripe_enriched_at = new Date().toISOString();
        }
      } catch (err) {
        console.error("Stripe enrichment failed:", (err as Error).message);
      }
    }

    enriched.push(row);
  }

  return enriched;
}

async function fetchStripeCardDetails(
  stripeKey: string,
  paymentIntentId: string | null,
  checkoutSessionId: string | null,
): Promise<{
  charge_id?: string;
  card_brand?: string;
  card_last4?: string;
  card_exp_month?: number;
  card_exp_year?: number;
  cardholder_name?: string;
  card_country?: string;
  receipt_url?: string;
} | null> {
  const auth = `Bearer ${stripeKey}`;

  // Prefer the payment intent path — expand charges + payment_method.
  let pi: any = null;
  if (paymentIntentId) {
    const url = `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(
      paymentIntentId,
    )}?expand[]=latest_charge&expand[]=payment_method`;
    const resp = await fetch(url, { headers: { Authorization: auth } });
    if (resp.ok) pi = await resp.json();
  }

  // Fall back to checkout session if we only have the session id.
  if (!pi && checkoutSessionId) {
    const url = `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(
      checkoutSessionId,
    )}?expand[]=payment_intent.latest_charge&expand[]=payment_intent.payment_method`;
    const resp = await fetch(url, { headers: { Authorization: auth } });
    if (resp.ok) {
      const sess = await resp.json();
      pi = sess?.payment_intent && typeof sess.payment_intent === "object" ? sess.payment_intent : null;
    }
  }

  if (!pi) return null;

  const charge = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  const pm = typeof pi.payment_method === "object" ? pi.payment_method : null;

  const card =
    pm?.card ||
    charge?.payment_method_details?.card ||
    null;
  const billing =
    pm?.billing_details ||
    charge?.billing_details ||
    null;

  return {
    charge_id: charge?.id || undefined,
    card_brand: card?.brand || undefined,
    card_last4: card?.last4 || undefined,
    card_exp_month: card?.exp_month || undefined,
    card_exp_year: card?.exp_year || undefined,
    cardholder_name: billing?.name || undefined,
    card_country: card?.country || undefined,
    receipt_url: charge?.receipt_url || undefined,
  };
}

// ----------------------------------------------------------------------------
// Load order_financials from the orders row.
// orders is the source of truth: columns are written at creation and updated
// by the Stripe webhook. The Finance tab expects the full shape
// (amount_paid, balance_due, payment_status, currency, etc.), not just a
// subset from quotes.calculated_totals.
// ----------------------------------------------------------------------------
async function loadOrderFinancials(supabase: any, order_id: string) {
  const { data: orderRow } = await supabase
    .from("orders")
    .select(`
      subtotal, certification_total, rush_fee, delivery_fee,
      discount_total, surcharge_total,
      tax_rate, tax_amount, total_amount,
      amount_paid, balance_due, currency, status
    `)
    .eq("id", order_id)
    .single();

  if (!orderRow) return null;

  const num = (v: any) => (v == null ? 0 : parseFloat(v) || 0);
  const subtotal = num(orderRow.subtotal);
  const certification_total = num(orderRow.certification_total);
  const rush_fee = num(orderRow.rush_fee);
  const delivery_fee = num(orderRow.delivery_fee);
  const discount_total = num(orderRow.discount_total);
  const surcharge_total = num(orderRow.surcharge_total);
  const tax_rate = num(orderRow.tax_rate);
  const tax = num(orderRow.tax_amount);
  const total = num(orderRow.total_amount);
  const amount_paid = num(orderRow.amount_paid);
  const balance_due = num(orderRow.balance_due);
  const pre_tax =
    subtotal +
    certification_total +
    rush_fee +
    delivery_fee +
    surcharge_total -
    discount_total;
  const payment_status =
    orderRow.status === "paid" || balance_due <= 0
      ? "paid"
      : amount_paid > 0
        ? "partial"
        : "unpaid";
  return {
    subtotal,
    certification_total,
    rush_fee,
    delivery_fee,
    discount_total,
    surcharge_total,
    pre_tax,
    tax_rate,
    tax,
    total,
    amount_paid,
    balance_due,
    currency: orderRow.currency || "CAD",
    payment_status,
  };
}
