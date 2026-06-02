// ============================================================================
// EDGE FUNCTION: manage-receivables
// PHASE: B-2 of audit #2.5
// PURPOSE: Customer-side mirror of manage-vendor-payables.
//          Creates / adjusts / cancels order_receivables rows with optional
//          CAT-analysis tier breakdown into receivable_cat_lines.
//          Mirrors the deterministic math + Replace-cancels-prior semantics
//          so receivables and payables stay symmetric.
// AUTH:    staffId in body (matches existing pattern).
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      // ── Adjust Receivable ──────────────────────────────────────────
      // Updates rate / subtotal on an existing receivable. Refused once
      // the parent order has a non-void customer invoice (mirrors the
      // hasIssuedInvoice gate in OrderFinanceTab).
      case "adjust_receivable": {
        const { receivable_id, new_rate, new_subtotal, staff_id } = body;
        if (!receivable_id) {
          return json({ success: false, error: "Missing receivable_id" }, 400);
        }
        if (new_rate == null && new_subtotal == null) {
          return json(
            { success: false, error: "Provide new_rate or new_subtotal" },
            400,
          );
        }

        const { data: row, error: fetchErr } = await sb
          .from("order_receivables")
          .select(
            "id, order_id, rate, quantity, line_subtotal, line_total, status, currency, pricing_mode, calculation_unit, tax_rate, tax_amount",
          )
          .eq("id", receivable_id)
          .single();

        if (fetchErr || !row) {
          return json({ success: false, error: "Receivable not found" }, 404);
        }

        // Lock once the receivable has been invoiced or voided.
        if (row.status === "invoiced" || row.status === "voided") {
          return json({
            success: false,
            error: `Cannot adjust a ${row.status} receivable. Void the customer invoice first.`,
            code: "RECEIVABLE_LOCKED",
          }, 409);
        }

        const qty = Number(row.quantity ?? 1) || 1;
        const updateData: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
          updated_by_staff_id: staff_id ?? null,
        };
        if (new_rate != null) {
          const r = Number(new_rate);
          updateData.rate = r;
          updateData.line_subtotal = Math.round(r * qty * 100) / 100;
        }
        if (new_subtotal != null) {
          updateData.line_subtotal = Number(new_subtotal);
          if (qty > 0) updateData.rate = Number(new_subtotal) / qty;
        }
        const subtotal = Number(updateData.line_subtotal ?? row.line_subtotal);
        const taxRate = Number(row.tax_rate ?? 0);
        const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
        updateData.tax_amount = taxAmount;
        updateData.line_total = Math.round((subtotal + taxAmount) * 100) / 100;

        const { error: updateErr } = await sb
          .from("order_receivables")
          .update(updateData)
          .eq("id", receivable_id);
        if (updateErr) {
          return json({ success: false, error: updateErr.message }, 500);
        }

        return json({ success: true, receivable_id });
      }

      // ── Create Receivable ─────────────────────────────────────────
      // New order_receivables row. Supports flat / per_word / per_hour /
      // per_page / CAT modes. When mode='cat', also inserts child rows
      // into receivable_cat_lines with the deterministic tier math.
      case "create_receivable": {
        const {
          order_id,
          mode, // "flat" | "per_word" | "per_hour" | "per_page" | "cat"
          rate,
          quantity,
          flat_amount,
          base_rate, // CAT only
          cat_lines, // CAT only
          currency,
          tax_rate,
          description,
          sort_order,
          staff_id,
        } = body;

        if (!order_id) {
          return json({ success: false, error: "Missing order_id" }, 400);
        }
        if (!mode) return json({ success: false, error: "Missing mode" }, 400);

        const RATE_UNIT: Record<string, string> = {
          flat: "flat",
          per_word: "per_word",
          per_hour: "per_hour",
          per_page: "per_page",
          cat: "per_word",
        };
        if (!RATE_UNIT[mode]) {
          return json({ success: false, error: `Unknown mode: ${mode}` }, 400);
        }

        let computedRate = 0;
        let computedUnits = 0;
        let computedSubtotal = 0;
        let normalizedCatLines: Array<{
          match_tier: string;
          tier_label: string | null;
          word_count: number;
          tier_percentage: number;
          base_rate: number;
          line_subtotal: number;
          sort_order: number;
        }> = [];

        if (mode === "flat") {
          const flat = Number(flat_amount);
          if (!Number.isFinite(flat) || flat <= 0) {
            return json(
              { success: false, error: "flat mode requires flat_amount > 0" },
              400,
            );
          }
          computedRate = flat;
          computedUnits = 1;
          computedSubtotal = flat;
        } else if (mode === "cat") {
          const b = Number(base_rate);
          if (!Number.isFinite(b) || b <= 0) {
            return json(
              { success: false, error: "cat mode requires base_rate > 0" },
              400,
            );
          }
          if (!Array.isArray(cat_lines) || cat_lines.length === 0) {
            return json(
              { success: false, error: "cat mode requires cat_lines[]" },
              400,
            );
          }
          let totalWords = 0;
          let totalSub = 0;
          normalizedCatLines = cat_lines.map((l: any, idx: number) => {
            const w = Number(l?.word_count ?? 0);
            const p = Number(l?.tier_percentage ?? 0);
            if (!Number.isFinite(w) || w < 0) {
              throw new Error(`cat_lines[${idx}].word_count invalid`);
            }
            if (!Number.isFinite(p) || p < 0 || p > 5) {
              throw new Error(`cat_lines[${idx}].tier_percentage out of range`);
            }
            const ls = Math.round(w * p * b * 10000) / 10000;
            totalWords += w;
            totalSub += ls;
            return {
              match_tier: String(l?.match_tier ?? `tier_${idx}`),
              tier_label: l?.tier_label ? String(l.tier_label) : null,
              word_count: w,
              tier_percentage: p,
              base_rate: b,
              line_subtotal: ls,
              sort_order: idx,
            };
          });
          computedRate = b;
          computedUnits = totalWords;
          computedSubtotal = Math.round(totalSub * 100) / 100;
        } else {
          const r = Number(rate);
          const u = Number(quantity);
          if (!Number.isFinite(r) || r <= 0) {
            return json(
              { success: false, error: `${mode} requires rate > 0` },
              400,
            );
          }
          if (!Number.isFinite(u) || u <= 0) {
            return json(
              { success: false, error: `${mode} requires quantity > 0` },
              400,
            );
          }
          computedRate = r;
          computedUnits = u;
          computedSubtotal = Math.round(r * u * 100) / 100;
        }

        const taxRateNum = Number.isFinite(Number(tax_rate))
          ? Number(tax_rate)
          : 0;
        const taxAmount = Math.round(computedSubtotal * taxRateNum * 100) / 100;
        const lineTotal =
          Math.round((computedSubtotal + taxAmount) * 100) / 100;

        const { data: inserted, error: insertErr } = await sb
          .from("order_receivables")
          .insert({
            order_id,
            description: description || null,
            rate: computedRate,
            quantity: computedUnits,
            calculation_unit: RATE_UNIT[mode],
            line_subtotal: computedSubtotal,
            tax_rate: taxRateNum,
            tax_amount: taxAmount,
            line_total: lineTotal,
            currency: (currency || "CAD").toUpperCase(),
            pricing_mode: mode === "cat" ? "cat" : "per_unit",
            status: "draft",
            sort_order: sort_order ?? 0,
            created_by_staff_id: staff_id ?? null,
          })
          .select("id")
          .single();

        if (insertErr || !inserted) {
          return json(
            { success: false, error: insertErr?.message || "Insert failed" },
            500,
          );
        }

        if (mode === "cat" && normalizedCatLines.length > 0) {
          const rows = normalizedCatLines.map((l) => ({
            ...l,
            receivable_id: inserted.id,
          }));
          const { error: linesErr } = await sb
            .from("receivable_cat_lines")
            .insert(rows);
          if (linesErr) {
            console.error(
              "cat lines insert failed; rolling back receivable:",
              linesErr.message,
            );
            await sb
              .from("order_receivables")
              .delete()
              .eq("id", inserted.id);
            return json(
              {
                success: false,
                error: `CAT lines insert failed: ${linesErr.message}`,
              },
              500,
            );
          }
        }

        return json({
          success: true,
          receivable_id: inserted.id,
          subtotal: computedSubtotal,
          tax_amount: taxAmount,
          total: lineTotal,
          currency: (currency || "CAD").toUpperCase(),
          rate: computedRate,
          units: computedUnits,
        });
      }

      // ── Cancel Receivable ─────────────────────────────────────────
      case "cancel_receivable": {
        const { receivable_id, staff_id } = body;
        if (!receivable_id) {
          return json({ success: false, error: "Missing receivable_id" }, 400);
        }
        const { data: row } = await sb
          .from("order_receivables")
          .select("id, status")
          .eq("id", receivable_id)
          .maybeSingle();
        if (!row) {
          return json({ success: false, error: "Receivable not found" }, 404);
        }
        if (row.status === "invoiced") {
          return json({
            success: false,
            error: "Cannot cancel an invoiced receivable. Void the customer invoice first.",
            code: "RECEIVABLE_LOCKED",
          }, 409);
        }
        await sb
          .from("order_receivables")
          .update({
            status: "voided",
            updated_at: new Date().toISOString(),
            updated_by_staff_id: staff_id ?? null,
          })
          .eq("id", receivable_id);
        return json({ success: true });
      }

      default:
        return json({ success: false, error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("manage-receivables error:", err);
    return json({ success: false, error: (err as Error).message }, 500);
  }
});
