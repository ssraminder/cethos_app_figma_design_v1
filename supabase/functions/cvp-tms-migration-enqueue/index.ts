// cvp-tms-migration-enqueue
//
// Admin endpoint. Populates cvp_tms_migration_queue with one row per
// past-working vendor in the chosen wave. Idempotent — duplicates are blocked
// by the (vendor_id, wave) unique constraint.
//
// Body:
//   {
//     wave: "dutch_to_english" | "arabic" | "ccjk",
//     dry_run?: boolean   // if true, count matches but don't insert
//   }

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Wave = "dutch_to_english" | "arabic" | "ccjk";

interface EnqueueRequest {
  wave: Wave;
  dry_run?: boolean;
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function waveFilter(wave: Wave): {
  sourcePrefixes: string[];
  targetPrefixes: string[];
  bothMustMatch: boolean;
} {
  switch (wave) {
    case "dutch_to_english":
      return { sourcePrefixes: ["dutch%"], targetPrefixes: ["english%"], bothMustMatch: true };
    case "arabic":
      return { sourcePrefixes: ["arabic%"], targetPrefixes: ["arabic%"], bothMustMatch: false };
    case "ccjk":
      return {
        sourcePrefixes: ["chinese%", "mandarin%", "japanese%", "korean%"],
        targetPrefixes: ["chinese%", "mandarin%", "japanese%", "korean%"],
        bothMustMatch: false,
      };
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: EnqueueRequest;
  try {
    body = (await req.json()) as EnqueueRequest;
  } catch {
    return json({ success: false, error: "invalid_json" }, 400);
  }

  if (!body.wave || !["dutch_to_english", "arabic", "ccjk"].includes(body.wave)) {
    return json({ success: false, error: "invalid_wave" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const filter = waveFilter(body.wave);

  let pairQuery = supabase
    .from("vendor_language_pairs")
    .select("vendor_id, source_language, target_language")
    .eq("is_active", true);

  if (filter.bothMustMatch) {
    const srcOr = filter.sourcePrefixes.map((p) => `source_language.ilike.${p}`).join(",");
    const tgtOr = filter.targetPrefixes.map((p) => `target_language.ilike.${p}`).join(",");
    pairQuery = pairQuery.or(srcOr).or(tgtOr);
  } else {
    const ors = [
      ...filter.sourcePrefixes.map((p) => `source_language.ilike.${p}`),
      ...filter.targetPrefixes.map((p) => `target_language.ilike.${p}`),
    ].join(",");
    pairQuery = pairQuery.or(ors);
  }

  const { data: pairs, error: pairErr } = await pairQuery;
  if (pairErr) return json({ success: false, error: pairErr.message }, 500);

  const vendorIds = Array.from(
    new Set((pairs ?? []).map((p: { vendor_id: string }) => p.vendor_id)),
  );
  if (vendorIds.length === 0) {
    return json({ success: true, data: { wave: body.wave, matched: 0, inserted: 0 } });
  }

  const { data: vendors, error: vendorErr } = await supabase
    .from("vendors")
    .select("id, full_name, email, total_projects, last_project_date, status")
    .in("id", vendorIds)
    .not("email", "is", null)
    .or("total_projects.gt.0,last_project_date.not.is.null");

  if (vendorErr) return json({ success: false, error: vendorErr.message }, 500);

  const eligible = (vendors ?? []).filter(
    (v: { email: string | null }) => typeof v.email === "string" && v.email.includes("@"),
  );

  if (body.dry_run) {
    return json({
      success: true,
      data: {
        wave: body.wave,
        matched: eligible.length,
        inserted: 0,
        dry_run: true,
        sample: eligible.slice(0, 5).map((v: { id: string; email: string; full_name: string }) => ({
          vendor_id: v.id,
          email: v.email,
          full_name: v.full_name,
        })),
      },
    });
  }

  const rows = eligible.map((v: { id: string; email: string; full_name: string }) => ({
    vendor_id: v.id,
    email: v.email,
    full_name: v.full_name,
    wave: body.wave,
  }));

  const { data: inserted, error: insErr } = await supabase
    .from("cvp_tms_migration_queue")
    .upsert(rows, { onConflict: "vendor_id,wave", ignoreDuplicates: true })
    .select("id");

  if (insErr) return json({ success: false, error: insErr.message }, 500);

  return json({
    success: true,
    data: {
      wave: body.wave,
      matched: eligible.length,
      inserted: inserted?.length ?? 0,
      skipped_existing: eligible.length - (inserted?.length ?? 0),
    },
  });
});
