// ============================================================================
// manage-vendor-payables
// Manages vendor payable status transitions and amount adjustments.
// Actions: update_status (invoiced/paid), adjust_payable (rate/total changes)
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  notifyVendorPayableInvoiced,
  notifyVendorPayablePaid,
  notifyVendorPayableAdjusted,
} from "../_shared/notify-step-lifecycle.ts";

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

// Loads everything notify-step-lifecycle helpers need to render an email
// from just the payable id. Returns null (and logs) on lookup failure so a
// missing related row can never fail the underlying status write.
async function loadPayableLifecycleContext(supabase: any, payable_id: string): Promise<any | null> {
  try {
    const { data: payable } = await supabase
      .from("vendor_payables")
      .select(
        "id, workflow_step_id, vendor_id, order_id, total, currency, payment_method, payment_reference, vendor_invoice_number, vendor_invoice_date",
      )
      .eq("id", payable_id)
      .maybeSingle();
    if (!payable) return null;
    const [{ data: vendor }, { data: orderRow }, { data: step }] = await Promise.all([
      supabase.from("vendors").select("id, full_name, email, additional_emails").eq("id", payable.vendor_id).maybeSingle(),
      payable.order_id
        ? supabase
            .from("orders")
            .select("id, order_number, internal_project:internal_projects(project_number), customer:customers(company_name)")
            .eq("id", payable.order_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      payable.workflow_step_id
        ? supabase.from("order_workflow_steps").select("id, name, step_number, source_language, target_language").eq("id", payable.workflow_step_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (!vendor?.email || !orderRow) return null;
    // Resolve language pair names if both UUIDs are present on the step.
    let sourceName: string | null = null, targetName: string | null = null;
    if (step?.source_language || step?.target_language) {
      const ids = [step.source_language, step.target_language].filter((v: any) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v));
      if (ids.length > 0) {
        const { data: rows } = await supabase.from("languages").select("id, name").in("id", ids);
        const m = new Map<string, string>();
        for (const r of (rows ?? []) as Array<{ id: string; name: string }>) m.set(r.id, r.name);
        sourceName = step.source_language && m.has(step.source_language) ? m.get(step.source_language) ?? null : (typeof step.source_language === "string" ? step.source_language : null);
        targetName = step.target_language && m.has(step.target_language) ? m.get(step.target_language) ?? null : (typeof step.target_language === "string" ? step.target_language : null);
      }
    }
    return {
      supabase,
      vendor: {
        id: vendor.id,
        full_name: vendor.full_name,
        email: vendor.email,
        additional_emails: Array.isArray(vendor.additional_emails) ? vendor.additional_emails : [],
      },
      order: { id: orderRow.id, order_number: orderRow.order_number },
      step: {
        id: step?.id ?? payable.workflow_step_id ?? null,
        name: step?.name ?? null,
        step_number: step?.step_number ?? null,
      },
      project_number: (orderRow as any)?.internal_project?.project_number ?? null,
      company_name: (orderRow as any)?.customer?.company_name ?? null,
      source_lang_name: sourceName,
      target_lang_name: targetName,
      payable: {
        id: payable.id,
        total: payable.total == null ? null : Number(payable.total),
        currency: payable.currency || "CAD",
        payment_method: payable.payment_method ?? null,
        payment_reference: payable.payment_reference ?? null,
        vendor_invoice_number: payable.vendor_invoice_number ?? null,
        vendor_invoice_date: payable.vendor_invoice_date ?? null,
      },
    };
  } catch (e: any) {
    console.error("loadPayableLifecycleContext failed:", e?.message || e);
    return null;
  }
}

// Mirror a payable's rate/total/currency into the upstream caches that
// the workflow-step card and the vendor portal both read from. Today
// (pre-2026-06-02) `manage-vendor-payables` only wrote to `vendor_payables`,
// so the admin step header (which reads `order_workflow_steps.vendor_*`) and
// the vendor portal "My Jobs" view (which reads `vendor_step_offers.vendor_*`)
// silently disagreed with the actual payable after every Replace/Adjust. See
// ORD-2026-10242 step 51328dfe — admin step header showed $0.05 while the
// real payable was $12.65. This helper is fire-and-forget: errors are logged
// but never surface back to the admin write.
async function mirrorPayableToStepAndOffer(
  supabase: any,
  args: {
    workflow_step_id: string;
    vendor_id: string;
    rate: number;
    rate_unit: string;
    total: number;
    currency: string;
  },
): Promise<void> {
  const { workflow_step_id, vendor_id, rate, rate_unit, total, currency } = args;
  try {
    const { error: stepErr } = await supabase
      .from("order_workflow_steps")
      .update({
        vendor_rate: rate,
        vendor_rate_unit: rate_unit,
        vendor_total: total,
        vendor_currency: currency,
        updated_at: new Date().toISOString(),
      })
      .eq("id", workflow_step_id);
    if (stepErr) {
      console.error(
        `mirrorPayableToStepAndOffer: order_workflow_steps update failed for ${workflow_step_id}: ${stepErr.message}`,
      );
    }
  } catch (e: any) {
    console.error("mirrorPayableToStepAndOffer step update threw:", e?.message || e);
  }

  try {
    const { error: offerErr } = await supabase
      .from("vendor_step_offers")
      .update({
        vendor_rate: rate,
        vendor_rate_unit: rate_unit,
        vendor_total: total,
        vendor_currency: currency,
        updated_at: new Date().toISOString(),
      })
      .eq("step_id", workflow_step_id)
      .eq("vendor_id", vendor_id)
      .in("status", ["pending", "accepted", "approved"]);
    if (offerErr) {
      console.error(
        `mirrorPayableToStepAndOffer: vendor_step_offers update failed for step=${workflow_step_id} vendor=${vendor_id}: ${offerErr.message}`,
      );
    }
  } catch (e: any) {
    console.error("mirrorPayableToStepAndOffer offer update threw:", e?.message || e);
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (!action) {
      return json({ success: false, error: "Missing action" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    switch (action) {
      // ── Update Status ──────────────────────────────────────────────
      case "update_status": {
        const {
          payable_id,
          status,
          vendor_invoice_number,
          vendor_invoice_date,
          payment_method,
          payment_reference,
          payment_notes,
        } = body;

        if (!payable_id || !status) {
          return json({ success: false, error: "Missing payable_id or status" }, 400);
        }

        // Fetch current payable
        const { data: payable, error: fetchErr } = await supabase
          .from("vendor_payables")
          .select("id, status")
          .eq("id", payable_id)
          .single();

        if (fetchErr || !payable) {
          return json({ success: false, error: "Payable not found" }, 404);
        }

        // Validate status transitions
        const validTransitions: Record<string, string[]> = {
          pending: ["approved", "cancelled"],
          approved: ["invoiced", "paid", "cancelled"],
          invoiced: ["paid", "cancelled"],
          paid: [],
          cancelled: [],
        };

        const allowed = validTransitions[payable.status] || [];
        if (!allowed.includes(status)) {
          return json({
            success: false,
            error: `Cannot transition from '${payable.status}' to '${status}'`,
          }, 400);
        }

        const now = new Date().toISOString();
        const updateData: Record<string, unknown> = {
          status,
          updated_at: now,
        };

        if (status === "invoiced") {
          updateData.invoiced_at = now;
          if (vendor_invoice_number) {
            updateData.vendor_invoice_number = vendor_invoice_number;
          }
          if (vendor_invoice_date) {
            updateData.vendor_invoice_date = vendor_invoice_date;
          }
        }

        if (status === "paid") {
          updateData.paid_at = now;
          if (payment_method) updateData.payment_method = payment_method;
          if (payment_reference) updateData.payment_reference = payment_reference;
          if (payment_notes) updateData.payment_notes = payment_notes;
        }

        if (status === "approved") {
          updateData.approved_at = now;
        }

        if (status === "cancelled") {
          updateData.cancelled_at = now;
        }

        const { error: updateErr } = await supabase
          .from("vendor_payables")
          .update(updateData)
          .eq("id", payable_id);

        if (updateErr) {
          return json({ success: false, error: updateErr.message }, 500);
        }

        console.log(`Payable ${payable_id}: ${payable.status} → ${status}`);

        // Fire vendor email on invoiced + paid transitions. Wrapped so
        // a Brevo or DB hiccup never fails the status write.
        if (status === "invoiced" || status === "paid") {
          try {
            const ctx = await loadPayableLifecycleContext(supabase, payable_id);
            if (ctx) {
              if (status === "invoiced") await notifyVendorPayableInvoiced(ctx);
              if (status === "paid") await notifyVendorPayablePaid(ctx);
            }
          } catch (e: any) {
            console.error(`${status} email fan-out failed:`, e?.message || e);
          }
        }

        return json({ success: true });
      }

      // ── Adjust Payable ─────────────────────────────────────────────
      case "adjust_payable": {
        const {
          payable_id,
          new_rate,
          new_subtotal,
          adjustment_reason,
          staff_id,
        } = body;

        if (!payable_id) {
          return json({ success: false, error: "Missing payable_id" }, 400);
        }

        if (new_rate == null && new_subtotal == null) {
          return json({ success: false, error: "Provide new_rate or new_subtotal" }, 400);
        }

        // Fetch current payable — pull currency too so the email can format
        // amounts in the vendor's currency. original_subtotal/original_total
        // are read so we don't clobber a prior adjustment baseline.
        const { data: payable, error: fetchErr } = await supabase
          .from("vendor_payables")
          .select("id, rate, rate_unit, units, subtotal, total, status, currency, original_subtotal, original_total, workflow_step_id, vendor_id")
          .eq("id", payable_id)
          .single();

        if (fetchErr || !payable) {
          return json({ success: false, error: "Payable not found" }, 404);
        }

        if (payable.status === "paid" || payable.status === "cancelled") {
          return json({
            success: false,
            error: `Cannot adjust a ${payable.status} payable`,
          }, 400);
        }

        // Snapshot the pre-adjustment values so the vendor email can show
        // the diff (old → new) rather than just the new amount.
        const oldRate = payable.rate == null ? null : Number(payable.rate);
        const oldSubtotal = payable.subtotal == null ? null : Number(payable.subtotal);

        const now = new Date().toISOString();
        const updateData: Record<string, unknown> = {
          original_subtotal: payable.original_subtotal ?? payable.subtotal,
          original_total: payable.original_total ?? payable.total,
          adjustment_reason: adjustment_reason || null,
          adjusted_by: staff_id || null,
          adjusted_at: now,
          updated_at: now,
        };

        if (new_rate != null) {
          updateData.rate = new_rate;
          const newSubtotalCalc = new_rate * payable.units;
          updateData.subtotal = newSubtotalCalc;
          updateData.total = newSubtotalCalc;
        }

        if (new_subtotal != null) {
          updateData.subtotal = new_subtotal;
          updateData.total = new_subtotal;
          if (payable.units > 0) {
            updateData.rate = new_subtotal / payable.units;
          }
        }

        const { error: updateErr } = await supabase
          .from("vendor_payables")
          .update(updateData)
          .eq("id", payable_id);

        if (updateErr) {
          return json({ success: false, error: updateErr.message }, 500);
        }

        console.log(`Payable ${payable_id} adjusted: reason=${adjustment_reason}`);

        // Mirror the new rate/total/currency into order_workflow_steps and
        // vendor_step_offers so the admin step header + vendor portal stay
        // in sync with the canonical payable row.
        if (payable.workflow_step_id && payable.vendor_id) {
          const mirroredRate = Number(updateData.rate ?? payable.rate ?? 0);
          const mirroredTotal = Number(updateData.total ?? payable.total ?? 0);
          await mirrorPayableToStepAndOffer(supabase, {
            workflow_step_id: payable.workflow_step_id,
            vendor_id: payable.vendor_id,
            rate: mirroredRate,
            rate_unit: payable.rate_unit || "flat",
            total: mirroredTotal,
            currency: payable.currency || "CAD",
          });
        }

        // Vendor email — fire-and-forget. The adjustment write is already
        // committed; a Brevo / lookup failure must never surface to admin UI.
        try {
          const ctx = await loadPayableLifecycleContext(supabase, payable_id);
          if (ctx) {
            const finalRate = updateData.rate as number | undefined;
            const finalSubtotal = updateData.subtotal as number | undefined;
            await notifyVendorPayableAdjusted({
              ...ctx,
              old_rate: oldRate,
              new_rate: finalRate == null ? null : Number(finalRate),
              old_subtotal: oldSubtotal,
              new_subtotal: finalSubtotal == null ? null : Number(finalSubtotal),
              currency: payable.currency || "CAD",
              reason: adjustment_reason ?? null,
            });
          }
        } catch (e: any) {
          console.error("vendor_payable_adjusted email fan-out failed:", e?.message || e);
        }

        return json({ success: true });
      }

      // ── Create Payable ─────────────────────────────────────────────
      // Manual payable creation for a workflow step. Supports flat,
      // per-word, per-hour, per-page, and CAT-analysis modes.
      //
      // Respects the unique-step active-payable index by cancelling any
      // existing non-cancelled row before inserting (same pattern as
      // update-workflow-step direct_assign).
      //
      // For CAT mode the caller passes pre-computed lines (already run
      // through parse-cat-analysis) — server validates the math and
      // inserts both the parent payable and child cat_lines.
      case "create_payable": {
        const {
          workflow_step_id,
          vendor_id,
          mode,             // "flat" | "per_word" | "per_hour" | "per_page" | "cat"
          rate,             // numeric — required except flat (where it equals total)
          units,            // numeric — required for per_* modes; ignored for flat/cat
          flat_amount,      // numeric — required for flat
          base_rate,        // numeric — required for cat (per-word base rate)
          cat_lines,        // array — required for cat: [{match_tier, tier_label, word_count, tier_percentage}]
          currency,         // "CAD" by default
          tax_name,
          tax_rate,         // numeric 0..1 (e.g. 0.05 for 5%)
          description,
          staff_id,
        } = body;

        if (!workflow_step_id) return json({ success: false, error: "Missing workflow_step_id" }, 400);
        if (!mode) return json({ success: false, error: "Missing mode" }, 400);

        // Load step + workflow context so the payable rows can be tagged
        // with step_name + order_id + language fields (mirrors
        // direct_assign in update-workflow-step).
        const { data: step, error: stepErr } = await supabase
          .from("order_workflow_steps")
          .select("id, step_number, name, order_id, vendor_id, source_language, target_language, service_id, workflow_id")
          .eq("id", workflow_step_id)
          .single();
        if (stepErr || !step) return json({ success: false, error: "Workflow step not found" }, 404);

        const effectiveVendorId = vendor_id || step.vendor_id;
        if (!effectiveVendorId) return json({ success: false, error: "Step has no vendor; pass vendor_id" }, 400);

        // Compute subtotal + rate_unit per mode. The deterministic math
        // lives here, server-side — Claude is never trusted to pick the
        // final number even when the CAT lines came from a parse step.
        let computedRate: number;
        let computedRateUnit: string;
        let computedUnits: number;
        let computedSubtotal: number;
        let normalizedCatLines: Array<{
          match_tier: string;
          tier_label: string | null;
          word_count: number;
          tier_percentage: number;
          base_rate: number;
          line_subtotal: number;
          sort_order: number;
        }> = [];

        const RATE_UNIT_BY_MODE: Record<string, string> = {
          flat: "flat",
          per_word: "per_word",
          per_hour: "per_hour",
          per_page: "per_page",
          cat: "per_word",
        };
        if (!RATE_UNIT_BY_MODE[mode]) {
          return json({ success: false, error: `Unknown mode: ${mode}` }, 400);
        }
        computedRateUnit = RATE_UNIT_BY_MODE[mode];

        if (mode === "flat") {
          const flat = Number(flat_amount);
          if (!Number.isFinite(flat) || flat <= 0) {
            return json({ success: false, error: "flat mode requires flat_amount > 0" }, 400);
          }
          computedRate = flat;
          computedUnits = 1;
          computedSubtotal = flat;
        } else if (mode === "cat") {
          const baseRateNum = Number(base_rate);
          if (!Number.isFinite(baseRateNum) || baseRateNum <= 0) {
            return json({ success: false, error: "cat mode requires base_rate > 0" }, 400);
          }
          if (!Array.isArray(cat_lines) || cat_lines.length === 0) {
            return json({ success: false, error: "cat mode requires cat_lines[]" }, 400);
          }
          let totalWords = 0;
          let totalSubtotal = 0;
          normalizedCatLines = cat_lines.map((l: any, idx: number) => {
            const words = Number(l?.word_count ?? 0);
            const pct = Number(l?.tier_percentage ?? 0);
            if (!Number.isFinite(words) || words < 0) {
              throw new Error(`cat_lines[${idx}].word_count invalid`);
            }
            if (!Number.isFinite(pct) || pct < 0 || pct > 5) {
              throw new Error(`cat_lines[${idx}].tier_percentage out of range`);
            }
            const lineSubtotal = Math.round(words * pct * baseRateNum * 10000) / 10000;
            totalWords += words;
            totalSubtotal += lineSubtotal;
            return {
              match_tier: String(l?.match_tier ?? `tier_${idx}`),
              tier_label: l?.tier_label ? String(l.tier_label) : null,
              word_count: words,
              tier_percentage: pct,
              base_rate: baseRateNum,
              line_subtotal: lineSubtotal,
              sort_order: idx,
            };
          });
          computedRate = baseRateNum;
          computedUnits = totalWords;
          computedSubtotal = Math.round(totalSubtotal * 100) / 100;
        } else {
          // per_word | per_hour | per_page
          const r = Number(rate);
          const u = Number(units);
          if (!Number.isFinite(r) || r <= 0) {
            return json({ success: false, error: `${mode} requires rate > 0` }, 400);
          }
          if (!Number.isFinite(u) || u <= 0) {
            return json({ success: false, error: `${mode} requires units > 0` }, 400);
          }
          computedRate = r;
          computedUnits = u;
          computedSubtotal = Math.round(r * u * 100) / 100;
        }

        const taxRateNum = Number.isFinite(Number(tax_rate)) ? Number(tax_rate) : 0;
        const taxAmount = Math.round(computedSubtotal * taxRateNum * 100) / 100;
        const total = Math.round((computedSubtotal + taxAmount) * 100) / 100;
        const cur = (currency || "CAD").toUpperCase();

        // Cancel any existing non-cancelled payable on this step (unique-step
        // index requires this). Matches the cancel-then-insert pattern in
        // update-workflow-step.
        const { error: cancelErr } = await supabase
          .from("vendor_payables")
          .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
          .eq("workflow_step_id", workflow_step_id)
          .neq("status", "cancelled");
        if (cancelErr) {
          return json({ success: false, error: `Failed to cancel prior payable: ${cancelErr.message}` }, 500);
        }

        const { data: inserted, error: insertErr } = await supabase
          .from("vendor_payables")
          .insert({
            workflow_step_id,
            vendor_id: effectiveVendorId,
            order_id: step.order_id,
            service_id: step.service_id ?? null,
            step_name: step.name,
            source_language: step.source_language ?? null,
            target_language: step.target_language ?? null,
            rate: computedRate,
            rate_unit: computedRateUnit,
            units: computedUnits,
            subtotal: computedSubtotal,
            currency: cur,
            tax_name: tax_name ?? null,
            tax_rate: taxRateNum,
            tax_amount: taxAmount,
            total,
            status: "pending",
            description: description || `Step ${step.step_number}: ${step.name}`,
            created_by: staff_id ?? null,
          })
          .select("id")
          .single();

        if (insertErr || !inserted) {
          return json({ success: false, error: insertErr?.message || "Insert failed" }, 500);
        }

        if (mode === "cat" && normalizedCatLines.length > 0) {
          const rows = normalizedCatLines.map((l) => ({ ...l, payable_id: inserted.id }));
          const { error: linesErr } = await supabase
            .from("vendor_payable_cat_lines")
            .insert(rows);
          if (linesErr) {
            console.error("cat lines insert failed; rolling back payable:", linesErr.message);
            await supabase.from("vendor_payables").delete().eq("id", inserted.id);
            return json({ success: false, error: `CAT lines insert failed: ${linesErr.message}` }, 500);
          }
        }

        console.log(`Payable created (${mode}): ${inserted.id} step=${workflow_step_id} subtotal=${computedSubtotal} ${cur}`);

        // Mirror to order_workflow_steps + vendor_step_offers (admin step
        // header + vendor portal both read these caches).
        await mirrorPayableToStepAndOffer(supabase, {
          workflow_step_id,
          vendor_id: effectiveVendorId,
          rate: computedRate,
          rate_unit: computedRateUnit,
          total,
          currency: cur,
        });

        return json({
          success: true,
          payable_id: inserted.id,
          subtotal: computedSubtotal,
          tax_amount: taxAmount,
          total,
          currency: cur,
          rate_unit: computedRateUnit,
          units: computedUnits,
          rate: computedRate,
        });
      }

      default:
        return json({ success: false, error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("manage-vendor-payables error:", err);
    return json({ success: false, error: (err as Error).message }, 500);
  }
});
