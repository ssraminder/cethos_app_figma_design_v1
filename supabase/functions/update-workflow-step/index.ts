// update-workflow-step v57 — orphaned-offers defense
//
// Source was at v24 in repo while v56 ran in prod; this commit
// resyncs the repo to prod AND adds a hardening pass:
//
// - New helper `retractAllStepOffers(stepId)` flips every non-terminal
//   offer (pending / offered / accepted / counter_offered) on a step
//   to "retracted". Used by both `retract_offer` (singular) and
//   `unassign_vendor` so resetting the step never leaves orphaned
//   offer rows that would still show up in the vendor portal.
//
// - `unassign_vendor` now always retracts non-terminal offers
//   (previously only when the caller passed `retract_offers: true`,
//   and even then only `pending`/`offered`). The audit trail of who
//   was unassigned still lives on the step row.
//
// - `retract_offer` (singular) includes `accepted` and
//   `counter_offered` in the "remaining" count so the step isn't
//   reset to pending while a sibling accepted offer is still alive,
//   and proactively retracts those siblings if it does reset.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { notifyVendorAssignment, notifyVendorOfferBatchSummary } from "../_shared/notify-vendor-assignment.ts";
import { notifyStaffAssignment } from "../_shared/notify-staff-assignment.ts";
import {
  notifyVendorStepApproved,
  notifyVendorRevisionRequested,
  notifyVendorUnassigned,
  notifyVendorDeadlineChanged,
  notifyCustomerWorkflowCompleted,
} from "../_shared/notify-step-lifecycle.ts";

const CORS_HEADERS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

// Loads the customer + order context for the workflow-completed email.
// Returns null (and logs) if the order has no customer attached. Wrapped
// in try/catch so a missing lookup never breaks the response.
async function loadWorkflowCompletedContext(supabase: any, step: any): Promise<any | null> {
  try {
    if (!step?.order_id) return null;
    const { data: orderRow } = await supabase
      .from("orders")
      .select("id, order_number, customer_id")
      .eq("id", step.order_id)
      .maybeSingle();
    if (!orderRow?.customer_id) return null;
    const { data: customer } = await supabase
      .from("customers")
      .select("id, full_name, email")
      .eq("id", orderRow.customer_id)
      .maybeSingle();
    if (!customer?.email) return null;
    return {
      supabase,
      customer: { id: customer.id, full_name: customer.full_name, email: customer.email },
      order: { id: orderRow.id, order_number: orderRow.order_number },
      workflowId: step.workflow_id,
    };
  } catch (e: any) {
    console.error("loadWorkflowCompletedContext failed:", e?.message || e);
    return null;
  }
}

// Loads the vendor + order + payable context needed by step-lifecycle emails
// (approve, request_revision, mark invoiced, mark paid). Returns null if the
// step has no vendor (e.g. internal_work step) — those steps don't generate
// vendor-facing emails. Never throws; logs and returns null on lookup failure
// so a missing related row can't break the parent state transition.
async function loadStepLifecycleContext(supabase: any, step: any): Promise<any | null> {
  try {
    if (!step?.vendor_id) return null;
    const [{ data: vendor }, { data: orderRow }, { data: payable }] = await Promise.all([
      supabase.from("vendors").select("id, full_name, email, additional_emails").eq("id", step.vendor_id).maybeSingle(),
      step.order_id
        ? supabase.from("orders").select("id, order_number").eq("id", step.order_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("vendor_payables")
        .select("id, total, currency, payment_method, payment_reference, vendor_invoice_number, vendor_invoice_date, status")
        .eq("workflow_step_id", step.id)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (!vendor?.email || !orderRow) return null;
    return {
      supabase,
      vendor: {
        id: vendor.id,
        full_name: vendor.full_name,
        email: vendor.email,
        additional_emails: Array.isArray(vendor.additional_emails) ? vendor.additional_emails : [],
      },
      order: { id: orderRow.id, order_number: orderRow.order_number },
      step: { id: step.id, name: step.name ?? null, step_number: step.step_number ?? null },
      payable: payable
        ? {
            id: payable.id,
            total: payable.total == null ? null : Number(payable.total),
            currency: payable.currency || "CAD",
            payment_method: payable.payment_method ?? null,
            payment_reference: payable.payment_reference ?? null,
            vendor_invoice_number: payable.vendor_invoice_number ?? null,
            vendor_invoice_date: payable.vendor_invoice_date ?? null,
          }
        : null,
    };
  } catch (e: any) {
    console.error("loadStepLifecycleContext failed:", e?.message || e);
    return null;
  }
}

// Statuses an offer can sit at where it still represents "live work"
// for a vendor — anything from these must be retracted before the
// step can be considered free again. Excludes terminal statuses
// (retracted, expired, declined, rejected, completed) which are
// already closed.
const LIVE_OFFER_STATUSES = ["pending", "offered", "accepted", "counter_offered"];

async function retractAllStepOffers(supabase: any, stepId: string, exceptOfferId?: string) {
  // We can't use a single UPDATE ... WHERE status IN (...) → 'retracted'
  // because of the partial UNIQUE constraint on (step_id, vendor_id, status):
  // two rows for the same vendor at different live statuses would collide
  // when both flipped to 'retracted'. Walk the rows individually and
  // skip vendors that already have a retracted row on this step.
  const filter = supabase
    .from("vendor_step_offers")
    .select("id, vendor_id, status")
    .eq("step_id", stepId)
    .in("status", LIVE_OFFER_STATUSES);
  const { data: live } = exceptOfferId
    ? await filter.neq("id", exceptOfferId)
    : await filter;
  if (!live || live.length === 0) return { retracted: 0 };

  // Group by vendor_id; for each vendor pick ONE row to retract and
  // mark the rest as 'expired' so the unique constraint holds.
  const byVendor = new Map<string, typeof live>();
  for (const row of live) {
    const arr = byVendor.get(row.vendor_id) ?? [];
    arr.push(row);
    byVendor.set(row.vendor_id, arr);
  }

  const nowIso = new Date().toISOString();
  let retracted = 0;
  for (const [vendorId, rows] of byVendor) {
    // Does this vendor already have a retracted row on this step? If so,
    // every live row for them must become something other than retracted.
    const { data: existingRetracted } = await supabase
      .from("vendor_step_offers")
      .select("id")
      .eq("step_id", stepId)
      .eq("vendor_id", vendorId)
      .eq("status", "retracted")
      .maybeSingle();

    const canUseRetracted = !existingRetracted;
    let usedRetracted = false;
    for (const row of rows) {
      const targetStatus = canUseRetracted && !usedRetracted ? "retracted" : "expired";
      if (targetStatus === "retracted") usedRetracted = true;
      const update: Record<string, unknown> = { status: targetStatus };
      if (targetStatus === "retracted") update.retracted_at = nowIso;
      await supabase.from("vendor_step_offers").update(update).eq("id", row.id);
      retracted++;
    }
  }
  return { retracted };
}

async function gateAssignment(
  supabase: any, callSite: string, vendor_id: string, step: any, workflow: any, vendor_step_offer_id?: string,
) {
  const { data: gate, error } = await supabase.rpc("qms_check_assignment", {
    p_vendor_id: vendor_id,
    p_service_id: step?.service_id ?? null,
    p_source_language_code: step?.source_language ?? null,
    p_target_language_code: step?.target_language ?? null,
    p_call_site: callSite,
    p_order_id: workflow?.order_id ?? null,
    p_workflow_step_id: step?.id ?? null,
    p_vendor_step_offer_id: vendor_step_offer_id ?? null,
  });
  if (error) { console.warn("qms_check_assignment failed (non-fatal):", error.message); return null; }
  return gate;
}

// Build a qms_warnings array returnable in success payloads so the admin
// UI can render a soft warning chip even when the gate runs in warn mode
// and proceeds. Eligible=true → no warning. Returns [] if gate is null.
function gateToWarnings(gate: any, vendor_id: string): Array<Record<string, unknown>> {
  if (!gate || gate.eligible === true) return [];
  return [
    {
      vendor_id,
      eligible: false,
      reason: gate.reason ?? null,
      required_role: gate.required_role ?? null,
      gating_mode: gate.gating_mode ?? "warn",
    },
  ];
}

function validateDeadlineAndExpiry(action: string, body: any): string | null {
  if (action !== "direct_assign" && action !== "offer_vendor" && action !== "offer_multiple") return null;
  const deadline = body?.deadline ? new Date(body.deadline) : null;
  if (!deadline || isNaN(deadline.getTime())) return "Deadline is required for assign/offer actions.";
  const isOffer = action === "offer_vendor" || action === "offer_multiple";
  if (isOffer && body?.expires_in_hours) {
    const hours = Number(body.expires_in_hours);
    if (Number.isFinite(hours) && hours > 0) {
      const expiry = new Date(Date.now() + hours * 3600_000);
      if (expiry.getTime() >= deadline.getTime()) return "Offer expiry must be before the deadline.";
    }
  }
  return null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  try {
    const body = await req.json();
    const { step_id, action } = body;
    if (!step_id || !action) return json({ success: false, error: "Missing step_id or action" }, 400);
    const validationError = validateDeadlineAndExpiry(action, body);
    if (validationError) return json({ success: false, error: validationError }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: step, error: stepErr } = await supabase
      .from("order_workflow_steps")
      .select("*, order_workflows!workflow_id(id, order_id, status, current_step_number)")
      .eq("id", step_id).single();
    if (stepErr || !step) return json({ success: false, error: "Step not found" }, 404);
    const workflow = step.order_workflows as any;

    switch (action) {
      case "lookup_vendor_rate": {
        const { vendor_id } = body;
        if (!vendor_id) return json({ success: false, error: "Missing vendor_id" }, 400);
        const { data: rates } = await supabase.from("vendor_rates").select("rate, calculation_unit, currency, service_id, valid_from, valid_until").eq("vendor_id", vendor_id).eq("is_active", true);
        let match = rates?.find((r: any) => step.service_id && r.service_id === step.service_id);
        if (!match && rates?.length) match = rates[0];
        // Also fetch all vendor rates for the "View Rates" modal
        const { data: allRates } = await supabase.from("vendor_rates").select("id, rate, calculation_unit, currency, service_id, valid_from, valid_until, is_active, notes, services:service_id(name)").eq("vendor_id", vendor_id).order("is_active", { ascending: false }).order("created_at", { ascending: false });
        const isExpired = match?.valid_until && new Date(match.valid_until) < new Date();
        return json({
          success: true,
          suggested_rate: match ? { rate: match.rate, calculation_unit: match.calculation_unit, currency: match.currency, valid_until: match.valid_until, is_expired: isExpired } : null,
          all_rates: allRates || [],
        });
      }
      case "assign_staff": {
        const { staff_id, deadline, instructions } = body;
        if (!staff_id) return json({ success: false, error: "Missing staff_id" }, 400);
        const { data: staffRow } = await supabase.from("staff_users").select("id, full_name, email, is_active").eq("id", staff_id).maybeSingle();
        if (!staffRow || staffRow.is_active === false) return json({ success: false, error: "Staff user not found or inactive" }, 404);
        await supabase.from("order_workflow_steps").update({ assigned_staff_id: staff_id, status: "accepted", deadline: deadline || null, instructions: instructions || null, accepted_at: new Date().toISOString(), assigned_by: body.staff_id_actor || body.acting_staff_id || null }).eq("id", step_id);
        if (workflow.status === "not_started") await supabase.from("order_workflows").update({ status: "in_progress" }).eq("id", step.workflow_id);
        try {
          await notifyStaffAssignment({ supabase, staff_id, step, workflow, deadline: deadline || null, instructions: instructions || null });
        } catch (e: any) {
          console.error("notify-staff-assignment failed:", e?.message || e);
        }
        return json({ success: true });
      }
      case "unassign_staff": {
        if (!step.assigned_staff_id) return json({ success: false, error: "Step has no staff assigned" }, 400);
        const { reason, notes, preserve_files } = body;
        await supabase
          .from("order_workflow_steps")
          .update({
            unassigned_vendor_id: null,
            unassign_reason: reason || null,
            unassign_notes: notes || null,
            unassigned_at: new Date().toISOString(),
            assigned_staff_id: null,
            status: "pending",
            accepted_at: null,
            started_at: null,
            delivered_at: null,
            delivered_file_paths: preserve_files ? step.delivered_file_paths : null,
          })
          .eq("id", step_id);
        return json({ success: true });
      }
      case "resend_staff_notification": {
        const targetStaffId = step.assigned_staff_id;
        if (!targetStaffId) return json({ success: false, error: "Step has no staff assigned" }, 400);
        await notifyStaffAssignment({ supabase, staff_id: targetStaffId, step, workflow, deadline: step.deadline ?? null, instructions: step.instructions ?? null });
        return json({ success: true, resent: true });
      }
      case "mark_final": {
        // Mark one of the step_deliveries rows as THE final version.
        // The customer draft flow pulls from this row. Passing
        // delivery_id=null clears the choice (UI revert).
        const { delivery_id } = body;
        if (delivery_id) {
          const { data: d } = await supabase
            .from("step_deliveries").select("id").eq("id", delivery_id).eq("step_id", step_id).maybeSingle();
          if (!d) return json({ success: false, error: "delivery not found on this step" }, 404);
        }
        await supabase.from("order_workflow_steps").update({
          final_delivery_id: delivery_id ?? null,
          final_marked_at: delivery_id ? new Date().toISOString() : null,
          final_marked_by: delivery_id ? (body.staff_id_actor || body.staff_id || null) : null,
        }).eq("id", step_id);
        return json({ success: true, final_delivery_id: delivery_id ?? null });
      }
      case "direct_assign": {
        const { vendor_id, vendor_rate, vendor_rate_unit, vendor_total, vendor_currency, deadline, instructions, pricing_mode } = body;
        if (!vendor_id) return json({ success: false, error: "Missing vendor_id" }, 400);
        const gate = await gateAssignment(supabase, "direct_assign", vendor_id, step, workflow);
        if (gate?.should_block) return json({ success: false, error: `QMS gating: ${gate.reason}`, qms_gating: gate }, 403);
        // IMPORTANT: surface UPDATE errors. Without this, a CHECK constraint
        // violation (e.g. an unexpected status value) returns success while
        // the row stays untouched — and we still send the vendor email for
        // an assignment that never persisted. The missing 'assigned' value
        // in order_workflow_steps_status_check (fixed in migration
        // 20260525_order_workflow_steps_allow_assigned_status.sql) is the
        // exact failure mode this guard was added to catch.
        const { error: updErr } = await supabase.from("order_workflow_steps").update({ vendor_id, status: "assigned", pricing_mode: pricing_mode || "per_unit", vendor_rate: vendor_rate ?? null, vendor_rate_unit: vendor_rate_unit ?? null, vendor_total: vendor_total ?? null, vendor_currency: vendor_currency || "CAD", deadline: deadline || null, instructions: instructions || null, assigned_at: new Date().toISOString(), assigned_by: body.staff_id || null }).eq("id", step_id);
        if (updErr) {
          console.error("direct_assign step update failed:", updErr);
          return json({ success: false, error: `Failed to assign step: ${updErr.message}` }, 500);
        }
        if (pricing_mode !== "target" && vendor_rate && vendor_total) {
          const units = vendor_rate > 0 ? vendor_total / vendor_rate : 1;
          // Cancel any existing pending payable for this step to prevent duplicates
          await supabase.from("vendor_payables").update({ status: "cancelled" }).eq("workflow_step_id", step_id).eq("status", "pending");
          await supabase.from("vendor_payables").insert({ workflow_step_id: step_id, vendor_id, order_id: workflow.order_id, rate: vendor_rate, rate_unit: vendor_rate_unit || "flat", units, subtotal: vendor_total, total: vendor_total, currency: vendor_currency || "CAD", status: "pending", step_name: step.name, description: `Step ${step.step_number}: ${step.name}` });
        }
        if (workflow.status === "not_started") await supabase.from("order_workflows").update({ status: "in_progress" }).eq("id", step.workflow_id);
        await notifyVendorAssignment({ supabase, vendor_id, step, workflow, kind: "direct_assign", vendor_rate, vendor_rate_unit, vendor_total, vendor_currency, deadline, instructions });
        return json({ success: true, qms_warnings: gateToWarnings(gate, vendor_id) });
      }
      case "offer_vendor": {
        const { vendor_id, vendor_rate, vendor_rate_unit, vendor_total, vendor_currency, deadline, instructions, expires_in_hours, negotiation_allowed, max_rate, max_total, latest_deadline, auto_accept_within_limits, pricing_mode } = body;
        if (!vendor_id) return json({ success: false, error: "Missing vendor_id" }, 400);
        const gate = await gateAssignment(supabase, "offer_vendor", vendor_id, step, workflow);
        if (gate?.should_block) return json({ success: false, error: `QMS gating: ${gate.reason}`, qms_gating: gate }, 403);
        const expiresAt = expires_in_hours ? new Date(Date.now() + expires_in_hours * 3600000).toISOString() : null;
        const { data: insertedOffer } = await supabase.from("vendor_step_offers").insert({ step_id, vendor_id, status: "pending", pricing_mode: pricing_mode || "per_unit", vendor_rate: vendor_rate ?? null, vendor_rate_unit: vendor_rate_unit ?? null, vendor_total: vendor_total ?? null, vendor_currency: vendor_currency || "CAD", deadline: deadline || null, expires_at: expiresAt, offered_at: new Date().toISOString(), offered_by: body.staff_id || null, negotiation_allowed: negotiation_allowed ?? false, max_rate: max_rate ?? null, max_total: max_total ?? null, latest_deadline: latest_deadline ?? null, auto_accept_within_limits: auto_accept_within_limits ?? true }).select("id").single();
        await supabase.from("order_workflow_steps").update({ status: "offered", offered_at: new Date().toISOString(), instructions: instructions || step.instructions, pricing_mode: pricing_mode || "per_unit" }).eq("id", step_id);
        if (pricing_mode !== "target" && vendor_rate && vendor_total) {
          const units = vendor_rate > 0 ? vendor_total / vendor_rate : 1;
          // Cancel any existing pending payable for this step to prevent duplicates
          await supabase.from("vendor_payables").update({ status: "cancelled" }).eq("workflow_step_id", step_id).eq("status", "pending");
          await supabase.from("vendor_payables").insert({ workflow_step_id: step_id, vendor_id, order_id: workflow.order_id, rate: vendor_rate, rate_unit: vendor_rate_unit || "flat", units, subtotal: vendor_total, total: vendor_total, currency: vendor_currency || "CAD", status: "pending", step_name: step.name, description: `Step ${step.step_number}: ${step.name}` });
        }
        if (workflow.status === "not_started") await supabase.from("order_workflows").update({ status: "in_progress" }).eq("id", step.workflow_id);
        await notifyVendorAssignment({ supabase, vendor_id, step, workflow, kind: "offer_vendor", offer_id: insertedOffer?.id ?? null, vendor_rate, vendor_rate_unit, vendor_total, vendor_currency, deadline, expires_at: expiresAt, instructions });
        return json({ success: true, qms_warnings: gateToWarnings(gate, vendor_id) });
      }
      case "offer_multiple": {
        const { vendors: vendorList, vendor_rate, vendor_rate_unit, vendor_total, vendor_currency, deadline, instructions, expires_in_hours, negotiation_allowed, max_rate, max_total, latest_deadline, auto_accept_within_limits, pricing_mode } = body;
        if (!vendorList?.length) return json({ success: false, error: "No vendors provided" }, 400);
        const gateResults = [] as Array<{ vendor_id: string, gate: any }>;
        for (const v of vendorList) { const gate = await gateAssignment(supabase, "offer_multiple", v.vendor_id, step, workflow); gateResults.push({ vendor_id: v.vendor_id, gate }); }
        const blocked = gateResults.filter((g) => g.gate?.should_block);
        if (blocked.length > 0) return json({ success: false, error: `QMS gating: ${blocked.length} of ${vendorList.length} vendors are ineligible`, qms_gating: { blocked } }, 403);
        const expiresAt = expires_in_hours ? new Date(Date.now() + expires_in_hours * 3600000).toISOString() : null;
        const insertedOffersByVendor: Record<string, string> = {};
        for (const v of vendorList) {
          const offerRate = v.vendor_rate ?? vendor_rate; const offerTotal = v.vendor_total ?? vendor_total;
          const { data: insertedOffer } = await supabase.from("vendor_step_offers").insert({ step_id, vendor_id: v.vendor_id, status: "pending", pricing_mode: pricing_mode || "per_unit", vendor_rate: offerRate ?? null, vendor_rate_unit: vendor_rate_unit ?? null, vendor_total: offerTotal ?? null, vendor_currency: vendor_currency || "CAD", deadline: deadline || null, expires_at: expiresAt, offered_at: new Date().toISOString(), offered_by: body.staff_id || null, negotiation_allowed: negotiation_allowed ?? false, max_rate: max_rate ?? null, max_total: max_total ?? null, latest_deadline: latest_deadline ?? null, auto_accept_within_limits: auto_accept_within_limits ?? true }).select("id").single();
          if (insertedOffer?.id) insertedOffersByVendor[v.vendor_id] = insertedOffer.id;
        }
        await supabase.from("order_workflow_steps").update({ status: "offered", offered_at: new Date().toISOString(), instructions: instructions || step.instructions, pricing_mode: pricing_mode || "per_unit" }).eq("id", step_id);
        if (workflow.status === "not_started") await supabase.from("order_workflows").update({ status: "in_progress" }).eq("id", step.workflow_id);
        await Promise.all(vendorList.map((v: any) => notifyVendorAssignment({ supabase, vendor_id: v.vendor_id, step, workflow, kind: "offer_vendor", offer_id: insertedOffersByVendor[v.vendor_id] ?? null, vendor_rate: v.vendor_rate ?? vendor_rate, vendor_rate_unit, vendor_currency, vendor_total: v.vendor_total ?? vendor_total, deadline, expires_at: expiresAt, instructions, suppressPmCc: true })));
        await notifyVendorOfferBatchSummary({ supabase, step, workflow, vendorList, vendor_rate, vendor_rate_unit, vendor_currency, vendor_total, deadline, expires_at: expiresAt });
        const qms_warnings = gateResults.flatMap((g) => gateToWarnings(g.gate, g.vendor_id));
        return json({ success: true, offers_sent: vendorList.length, qms_warnings });
      }
      case "resend_notification": {
        const targetVendorId = step.vendor_id;
        if (!targetVendorId) return json({ success: false, error: "Step has no vendor assigned" }, 400);
        const kind = step.status === "offered" ? "offer_vendor" : "direct_assign";
        await notifyVendorAssignment({ supabase, vendor_id: targetVendorId, step, workflow, kind, vendor_rate: step.vendor_rate ?? null, vendor_rate_unit: step.vendor_rate_unit ?? null, vendor_total: step.vendor_total ?? null, vendor_currency: step.vendor_currency ?? null, deadline: step.deadline ?? null, instructions: step.instructions ?? null });
        return json({ success: true, resent: true, kind });
      }
      case "retract_offer": {
        // Retract the specific offer the admin clicked, then decide whether
        // the step itself should reset. The "remaining live offers" count
        // includes ACCEPTED + COUNTER_OFFERED (previously only pending /
        // offered), and if the step does reset we also clean up any
        // sibling accepted/counter_offered offers so nothing dangles.
        const { offer_id } = body;
        if (!offer_id) return json({ success: false, error: "Missing offer_id" }, 400);
        await supabase
          .from("vendor_step_offers")
          .update({ status: "retracted", retracted_at: new Date().toISOString(), responded_at: new Date().toISOString() })
          .eq("id", offer_id);
        await supabase.from("vendor_payables").update({ status: "cancelled" }).eq("workflow_step_id", step_id).eq("status", "pending");
        const { data: remaining } = await supabase
          .from("vendor_step_offers")
          .select("id")
          .eq("step_id", step_id)
          .in("status", LIVE_OFFER_STATUSES);
        const remainingCount = remaining?.length ?? 0;
        if (remainingCount === 0) {
          await supabase
            .from("order_workflow_steps")
            .update({ status: "pending", vendor_id: null, offered_at: null })
            .eq("id", step_id);
        } else {
          // Defensive: retract any sibling 'accepted' / 'counter_offered'
          // rows so we don't leave the same vendor with both a retracted
          // and a live offer on the step.
          await retractAllStepOffers(supabase, step_id, offer_id);
          await supabase
            .from("order_workflow_steps")
            .update({ status: "pending", vendor_id: null, offered_at: null })
            .eq("id", step_id);
        }
        return json({ success: true, remaining_offers: remainingCount });
      }
      case "retract_offers": {
        // Bulk retract every live offer on the step + reset the step.
        const result = await retractAllStepOffers(supabase, step_id);
        await supabase.from("vendor_payables").update({ status: "cancelled" }).eq("workflow_step_id", step_id).eq("status", "pending");
        await supabase.from("order_workflow_steps").update({ status: "pending", vendor_id: null, offered_at: null, accepted_at: null }).eq("id", step_id);
        return json({ success: true, retracted_count: result.retracted });
      }
      case "unassign_vendor": {
        // Resetting the step always implies retracting every live offer
        // tied to it — leaving a sibling accepted/counter_offered row
        // alive after the vendor_id has been cleared produces the
        // "stale offer in vendor portal" bug. The `retract_offers` body
        // flag is ignored now; we treat retraction as required.
        const { reason, notes, payable_action, adjusted_amount, preserve_files } = body;
        const previousVendorId: string | null = step.vendor_id ?? null;
        await retractAllStepOffers(supabase, step_id);
        await supabase
          .from("order_workflow_steps")
          .update({
            unassigned_vendor_id: step.vendor_id,
            unassign_reason: reason,
            unassign_notes: notes || null,
            unassigned_at: new Date().toISOString(),
            vendor_id: null,
            status: "pending",
            // Clear lifecycle timestamps so the step truly looks fresh
            // for the next assignment. Leaving `assigned_at` populated
            // confuses the workflow audit query
            // ("when was this last assigned?") because the historical
            // assignment isn't actually live anymore; the answer should
            // come from `notification_log` / `qms.assignment_eligibility_events`
            // instead.
            assigned_at: null,
            assigned_by: null,
            accepted_at: null,
            started_at: null,
            delivered_at: null,
            offered_at: null,
            // Clear the previous vendor's commercial terms too. Leaving
            // them on the step row leaks the prior rate into the next
            // assignment / offer, which the vendor portal then displays
            // instead of the new offer's actual rate. Rates live on the
            // offer row until acceptance copies them back (see
            // accept-step / accept-direct-assign), so nulling here is
            // safe.
            vendor_rate: null,
            vendor_rate_unit: null,
            vendor_total: null,
            vendor_currency: null,
            deadline: null,
            delivered_file_paths: preserve_files ? step.delivered_file_paths : null,
          })
          .eq("id", step_id);
        if (payable_action === "cancel") {
          await supabase.from("vendor_payables").update({ status: "cancelled" }).eq("workflow_step_id", step_id).neq("status", "paid");
        } else if (payable_action === "adjust" && adjusted_amount !== undefined) {
          const { data: payable } = await supabase.from("vendor_payables").select("id, subtotal, total").eq("workflow_step_id", step_id).neq("status", "cancelled").maybeSingle();
          if (payable) await supabase.from("vendor_payables").update({ original_subtotal: payable.subtotal, original_total: payable.total, subtotal: adjusted_amount, total: adjusted_amount, status: "approved" }).eq("id", payable.id);
        }
        // Vendor email — fire-and-forget. The unassign write is already
        // committed at this point; a Brevo / lookup failure must never
        // surface as an error to the admin UI.
        try {
          if (previousVendorId) {
            const [{ data: vendorRow }, { data: orderRow }] = await Promise.all([
              supabase
                .from("vendors")
                .select("id, full_name, email, additional_emails")
                .eq("id", previousVendorId)
                .maybeSingle(),
              workflow?.order_id
                ? supabase
                    .from("orders")
                    .select("id, order_number")
                    .eq("id", workflow.order_id)
                    .maybeSingle()
                : Promise.resolve({ data: null }),
            ]);
            if (vendorRow?.email && orderRow) {
              await notifyVendorUnassigned({
                supabase,
                vendor: {
                  id: vendorRow.id,
                  full_name: vendorRow.full_name,
                  email: vendorRow.email,
                  additional_emails: Array.isArray(vendorRow.additional_emails)
                    ? vendorRow.additional_emails
                    : [],
                },
                order: { id: orderRow.id, order_number: orderRow.order_number },
                step: { id: step.id, name: step.name, step_number: step.step_number },
                reason: reason ?? null,
                notes: notes ?? null,
              });
            }
          }
        } catch (e: any) {
          console.error("vendor_unassigned email fan-out failed:", e?.message || e);
        }
        return json({ success: true });
      }
      case "extend_deadline": {
        const { new_deadline, reason } = body;
        if (!new_deadline) return json({ success: false, error: "Missing new_deadline" }, 400);
        const previousDeadline: string | null = step.deadline ?? null;
        await supabase.from("order_workflow_steps").update({ deadline: new_deadline }).eq("id", step_id);
        await supabase.from("vendor_step_offers").update({ deadline: new_deadline }).eq("step_id", step_id).in("status", ["pending", "offered"]);
        // Notify the committed vendor (if any) that their deadline shifted.
        // We deliberately skip offered/pending-offer recipients here — there
        // can be many of them and they haven't accepted. If they accept after
        // this, the notification will already be reflected in the offer email
        // they see in the portal.
        try {
          if (step.vendor_id) {
            const [{ data: vendorRow }, { data: orderRow }] = await Promise.all([
              supabase
                .from("vendors")
                .select("id, full_name, email, additional_emails")
                .eq("id", step.vendor_id)
                .maybeSingle(),
              workflow?.order_id
                ? supabase
                    .from("orders")
                    .select("id, order_number")
                    .eq("id", workflow.order_id)
                    .maybeSingle()
                : Promise.resolve({ data: null }),
            ]);
            if (vendorRow?.email && orderRow) {
              await notifyVendorDeadlineChanged({
                supabase,
                vendor: {
                  id: vendorRow.id,
                  full_name: vendorRow.full_name,
                  email: vendorRow.email,
                  additional_emails: Array.isArray(vendorRow.additional_emails)
                    ? vendorRow.additional_emails
                    : [],
                },
                order: { id: orderRow.id, order_number: orderRow.order_number },
                step: { id: step.id, name: step.name, step_number: step.step_number },
                old_deadline: previousDeadline,
                new_deadline,
                reason: reason ?? null,
              });
            }
          }
        } catch (e: any) {
          console.error("vendor_deadline_changed email fan-out failed:", e?.message || e);
        }
        return json({ success: true });
      }
      case "approve": {
        if (step.approval_depends_on_step) {
          const { data: depStep } = await supabase.from("order_workflow_steps").select("id, step_number, name, status").eq("workflow_id", step.workflow_id).eq("step_number", step.approval_depends_on_step).single();
          if (depStep && depStep.status !== "approved" && depStep.status !== "skipped") {
            if (depStep.status === "pending") await supabase.from("order_workflow_steps").update({ status: "in_progress", started_at: new Date().toISOString() }).eq("id", depStep.id);
            return json({ success: false, error: `Cannot approve this step until Step ${depStep.step_number} (${depStep.name}) is completed. Current status: ${depStep.status}`, blocked_by_step: depStep.step_number, blocked_by_step_name: depStep.name, blocked_by_step_status: depStep.status }, 409);
          }
        }
        await supabase.from("order_workflow_steps").update({ status: "approved", approved_at: new Date().toISOString() }).eq("id", step_id);
        const { data: latestDelivery } = await supabase.from("step_deliveries").select("id").eq("step_id", step_id).order("version", { ascending: false }).limit(1).maybeSingle();
        if (latestDelivery) await supabase.from("step_deliveries").update({ review_status: "approved", reviewed_by: body.staff_id || null, reviewed_at: new Date().toISOString() }).eq("id", latestDelivery.id);
        await supabase.from("vendor_payables").update({ status: "approved", approved_at: new Date().toISOString() }).eq("workflow_step_id", step_id).eq("status", "pending");
        const { data: allSteps } = await supabase.from("order_workflow_steps").select("status").eq("workflow_id", step.workflow_id);
        const allDone = allSteps?.every((s: any) => s.status === "approved" || s.status === "skipped");
        if (allDone) await supabase.from("order_workflows").update({ status: "completed" }).eq("id", step.workflow_id);
        // Fire-and-forget vendor email. Wrapped so a Brevo / DB hiccup
        // never fails the approve write.
        try {
          const ctx = await loadStepLifecycleContext(supabase, step);
          if (ctx) await notifyVendorStepApproved(ctx);
        } catch (e: any) {
          console.error("step_approved email fan-out failed:", e?.message || e);
        }
        // When this approve completes the whole workflow, fire the
        // customer-facing "order complete" email. Independent try/catch
        // so a customer-side hiccup never blocks the response.
        if (allDone) {
          try {
            const customerCtx = await loadWorkflowCompletedContext(supabase, step);
            if (customerCtx) await notifyCustomerWorkflowCompleted(customerCtx);
          } catch (e: any) {
            console.error("workflow_completed email fan-out failed:", e?.message || e);
          }
        }
        // Auto-generate a draft invoice in cvp_payments so the vendor
        // can review, attach their own invoice ref, and submit for payment.
        try {
          if (step.vendor_id && step.vendor_total && step.vendor_total > 0) {
            const { data: existingInv } = await supabase
              .from("cvp_payments")
              .select("id")
              .eq("step_id", step_id)
              .in("status", ["draft", "submitted", "approved", "pending"])
              .maybeSingle();
            if (!existingInv) {
              const invoiceNum = "PAY-" + crypto.randomUUID().slice(0, 8).toUpperCase();
              let orderRef: string | null = null;
              if (workflow?.order_id) {
                const { data: ord } = await supabase
                  .from("orders")
                  .select("order_number")
                  .eq("id", workflow.order_id)
                  .maybeSingle();
                orderRef = ord?.order_number ?? null;
              }
              const desc = [
                step.name,
                step.source_language && step.target_language
                  ? `${step.source_language} → ${step.target_language}`
                  : null,
              ].filter(Boolean).join(" — ");
              await supabase.from("cvp_payments").insert({
                vendor_id: step.vendor_id,
                step_id: step_id,
                invoice_number: invoiceNum,
                amount: step.vendor_total,
                currency: step.vendor_currency || "CAD",
                tax_amount: 0,
                total_amount: step.vendor_total,
                status: "draft",
                invoice_date: new Date().toISOString().split("T")[0],
                order_reference: orderRef
                  ? `${orderRef} — ${desc}`
                  : desc || null,
                description: desc || null,
                notes: `Rate: ${step.vendor_rate} per ${step.vendor_rate_unit || "word"}`,
              });
            }
          }
        } catch (invErr: any) {
          console.error("Draft invoice creation failed (non-blocking):", invErr?.message || invErr);
        }
        return json({ success: true });
      }
      case "request_revision": {
        const { reason: revisionReason } = body;
        await supabase.from("order_workflow_steps").update({ status: "revision_requested", rejection_reason: revisionReason || null, revision_count: (step.revision_count ?? 0) + 1, delivered_at: null }).eq("id", step_id);
        const { data: latestDelivery } = await supabase.from("step_deliveries").select("id").eq("step_id", step_id).order("version", { ascending: false }).limit(1).maybeSingle();
        if (latestDelivery) await supabase.from("step_deliveries").update({ review_status: "revision_requested", reviewed_by: body.staff_id || null, reviewed_at: new Date().toISOString(), review_feedback: revisionReason || null }).eq("id", latestDelivery.id);
        try {
          const ctx = await loadStepLifecycleContext(supabase, step);
          if (ctx) await notifyVendorRevisionRequested({ ...ctx, reason: revisionReason ?? null });
        } catch (e: any) {
          console.error("revision_requested email fan-out failed:", e?.message || e);
        }
        return json({ success: true });
      }
      case "start": { await supabase.from("order_workflow_steps").update({ status: "in_progress", started_at: new Date().toISOString() }).eq("id", step_id); return json({ success: true }); }
      case "skip": { await supabase.from("order_workflow_steps").update({ status: "skipped" }).eq("id", step_id); return json({ success: true }); }
      case "cancel": { await supabase.from("order_workflow_steps").update({ status: "cancelled" }).eq("id", step_id); await supabase.from("vendor_payables").update({ status: "cancelled" }).eq("workflow_step_id", step_id).neq("status", "paid"); return json({ success: true }); }
      case "switch_actor_type": { const { new_actor_type } = body; if (!new_actor_type) return json({ success: false, error: "Missing new_actor_type" }, 400); await supabase.from("order_workflow_steps").update({ actor_type: new_actor_type }).eq("id", step_id); return json({ success: true }); }
      case "update_config": {
        const update: Record<string, unknown> = {};
        if (body.actor_type !== undefined) update.actor_type = body.actor_type;
        if (body.requires_file_upload !== undefined) update.requires_file_upload = !!body.requires_file_upload;
        if (body.allowed_actor_types !== undefined) update.allowed_actor_types = body.allowed_actor_types;
        if (body.is_optional !== undefined) update.is_optional = !!body.is_optional;
        if (body.auto_advance !== undefined) update.auto_advance = !!body.auto_advance;
        if (body.instructions !== undefined) update.instructions = body.instructions;
        if (Object.keys(update).length === 0) return json({ success: false, error: "No updatable fields provided" }, 400);
        await supabase.from("order_workflow_steps").update(update).eq("id", step_id);
        return json({ success: true });
      }
      case "adjust_payable": {
        const { payable_id, new_rate, new_subtotal } = body;
        const { data: payable } = await supabase.from("vendor_payables").select("id, rate, subtotal, total").eq("id", payable_id).single();
        if (!payable) return json({ success: false, error: "Payable not found" }, 404);
        const updateData: any = { original_subtotal: payable.subtotal, original_total: payable.total };
        if (new_rate !== undefined) updateData.rate = new_rate;
        if (new_subtotal !== undefined) { updateData.subtotal = new_subtotal; updateData.total = new_subtotal; }
        await supabase.from("vendor_payables").update(updateData).eq("id", payable_id);
        const { data: updated } = await supabase.from("vendor_payables").select("rate, subtotal, total").eq("id", payable_id).single();
        return json({ success: true, current: updated });
      }
      case "change_status": {
        const { status: newStatus } = body;
        if (!newStatus) return json({ success: false, error: "Missing status" }, 400);
        const updateData: any = { status: newStatus };
        if (newStatus === "in_progress" && !step.started_at) updateData.started_at = new Date().toISOString();
        if (newStatus === "delivered") updateData.delivered_at = new Date().toISOString();
        await supabase.from("order_workflow_steps").update(updateData).eq("id", step_id);
        if (newStatus === "in_progress" && workflow.status === "not_started") await supabase.from("order_workflows").update({ status: "in_progress" }).eq("id", workflow.id);
        return json({ success: true });
      }
      default: return json({ success: false, error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("update-workflow-step error:", err);
    return json({ success: false, error: (err as Error).message }, 500);
  }
});
