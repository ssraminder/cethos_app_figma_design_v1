import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const vendorId = url.searchParams.get("vendor_id");

    if (!vendorId) {
      return new Response(
        JSON.stringify({ success: false, error: "vendor_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`📋 get-vendor-detail: vendor=${vendorId}`);

    // Run all queries in parallel
    const [
      vendorRes,
      languagePairsRes,
      ratesRes,
      paymentInfoRes,
      authRes,
      sessionsRes,
      jobsRes,
    ] = await Promise.all([
      // 1. Vendor record
      supabase.from("vendors").select("*").eq("id", vendorId).single(),

      // 2. Language pairs
      supabase
        .from("vendor_language_pairs")
        .select("id, vendor_id, source_language, target_language, source_type, notes, is_active, created_at")
        .eq("vendor_id", vendorId)
        .order("source_language")
        .order("target_language"),

      // 3. Rates with service join
      supabase
        .from("vendor_rates")
        .select(
          "id, vendor_id, service_id, language_pair_id, calculation_unit, rate, currency, rate_cad, minimum_charge, source, is_active, notes, added_by, services(name, code, category)"
        )
        .eq("vendor_id", vendorId)
        .order("is_active", { ascending: false })
        .order("currency")
        .order("rate"),

      // 4. Payment info
      supabase
        .from("vendor_payment_info")
        .select("*")
        .eq("vendor_id", vendorId)
        .maybeSingle(),

      // 5. Auth info
      supabase
        .from("vendor_auth")
        .select("vendor_id, password_set_at, must_reset")
        .eq("vendor_id", vendorId)
        .maybeSingle(),

      // 6. Active sessions count
      supabase
        .from("vendor_sessions")
        .select("id", { count: "exact", head: true })
        .eq("vendor_id", vendorId)
        .gte("expires_at", new Date().toISOString()),

      // 7. Active jobs (workflow steps assigned to this vendor)
      supabase
        .from("workflow_steps")
        .select(
          "id, order_id, step_number, step_name, status, source_language, target_language, deadline, rate, currency, orders(order_number)"
        )
        .eq("assigned_vendor_id", vendorId)
        .in("status", ["offered", "accepted", "in_progress"])
        .order("deadline"),
    ]);

    if (vendorRes.error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Vendor not found: ${vendorRes.error.message}`,
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const vendor = vendorRes.data;

    // Flatten rates with service info
    const rates = (ratesRes.data ?? []).map(
      (r: Record<string, unknown>) => {
        const svc = r.services as {
          name: string;
          code: string;
          category: string;
        } | null;
        return {
          id: r.id,
          vendor_id: r.vendor_id,
          service_id: r.service_id,
          service_name: svc?.name ?? "Unknown",
          service_code: svc?.code ?? null,
          service_category: svc?.category ?? null,
          language_pair_id: r.language_pair_id,
          calculation_unit: r.calculation_unit,
          rate: r.rate,
          currency: r.currency,
          rate_cad: r.rate_cad,
          minimum_charge: r.minimum_charge,
          source: r.source,
          is_active: r.is_active,
          notes: r.notes,
          added_by: r.added_by,
        };
      }
    );

    // Flatten jobs with order number
    const activeJobs = (jobsRes.data ?? []).map(
      (j: Record<string, unknown>) => {
        const order = j.orders as { order_number: string } | null;
        return {
          order_id: j.order_id,
          order_number: order?.order_number ?? "Unknown",
          step_number: j.step_number,
          step_name: j.step_name,
          status: j.status,
          source_language: j.source_language,
          target_language: j.target_language,
          deadline: j.deadline,
          rate: j.rate,
          currency: j.currency,
        };
      }
    );

    const languagePairs = languagePairsRes.data ?? [];
    const activePairs = languagePairs.filter(
      (lp: Record<string, unknown>) => lp.is_active
    );

    const activeRates = rates.filter(
      (r: Record<string, unknown>) => r.is_active
    );

    const summary = {
      language_pairs_active: activePairs.length,
      language_pairs_total: languagePairs.length,
      rates_active: activeRates.length,
      rates_total: rates.length,
      has_payment_info: paymentInfoRes.data !== null,
      has_portal_access: authRes.data !== null || vendor.auth_user_id !== null,
      active_job_count: activeJobs.length,
    };

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          vendor,
          language_pairs: languagePairs,
          rates,
          payment_info: paymentInfoRes.data ?? null,
          auth: authRes.data ?? null,
          active_sessions: sessionsRes.count ?? 0,
          active_jobs: activeJobs,
          summary,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("get-vendor-detail error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
