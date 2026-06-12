// fetch-exchange-rates — called by pg_cron job 37 ("fetch-exchange-rates",
// 0 12,16,20,0 * * 1-5 UTC = every 4h, 8am-8pm ET on weekdays).
// Records a USD→CAD observation, then refreshes the daily summary row.
//
// Rebuilt 2026-06-12: the original deployed bundle was lost (LOAD_FUNCTION_ERROR
// since 2026-05-08) and its source was never committed. This version mirrors the
// client-side "Fetch Today's Rates" logic in client/pages/admin/ExchangeRates.tsx.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const [midRes, bocRes] = await Promise.allSettled([
      fetch("https://open.er-api.com/v6/latest/USD"),
      fetch(
        "https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1"
      ),
    ]);

    let midRate: number | null = null;
    let midRaw: unknown = null;
    if (midRes.status === "fulfilled" && midRes.value.ok) {
      midRaw = await midRes.value.json();
      const cad = (midRaw as { rates?: { CAD?: number } })?.rates?.CAD;
      midRate = typeof cad === "number" ? cad : null;
    }

    let bocRate: number | null = null;
    let bocRaw: unknown = null;
    if (bocRes.status === "fulfilled" && bocRes.value.ok) {
      bocRaw = await bocRes.value.json();
      const obs = (bocRaw as { observations?: { FXUSDCAD?: { v?: string } }[] })
        ?.observations?.[0];
      const parsed = obs?.FXUSDCAD?.v ? parseFloat(obs.FXUSDCAD.v) : NaN;
      bocRate = Number.isFinite(parsed) ? parsed : null;
    }

    if (midRate == null && bocRate == null) {
      return json({ success: false, error: "Both rate APIs failed" }, 502);
    }

    const today = new Date().toISOString().split("T")[0];

    const { error: obsError } = await supabase
      .from("exchange_rate_observations")
      .insert({
        rate_date: today,
        source: "cron",
        mid_market_rate: midRate,
        boc_rate: bocRate,
        raw_response: { mid: midRaw, boc: bocRaw },
      });
    if (obsError) throw obsError;

    // Daily summary keeps latest mid/BoC plus low/avg across all observations
    const { error: rpcError } = await supabase.rpc(
      "refresh_daily_exchange_rate",
      { target_date: today }
    );
    if (rpcError) throw rpcError;

    return json({
      success: true,
      rate_date: today,
      mid_market_rate: midRate,
      boc_rate: bocRate,
    });
  } catch (err) {
    console.error("fetch-exchange-rates failed:", err);
    return json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      500
    );
  }
});
