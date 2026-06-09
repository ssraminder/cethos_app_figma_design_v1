// find-matching-vendors v37 — resolves UUID language IDs to ISO codes before querying vendor_language_pairs.
// Filters vendors by language pair, service rate, availability, geography, then per-vendor
// QMS check. In gating_mode='warn' (default), every call writes a row to
// qms.assignment_eligibility_events; behavior unchanged. In 'block', ineligible vendors are
// filtered out. Annotation fields qms_eligible / qms_reason / qms_required_role / qms_gating_mode
// added to each result for UI display.
//
// v37 (2026-06-09, bug_reports/f9e5b95a): treat source_language='ANY' and target_language='ANY'
// in vendor_language_pairs as wildcards. Pre-fix, .eq("source_language", X) silently dropped the
// 19 vendors who had legacy "Any"-source pairs migrated verbatim into VLP. Now we use
// .in("source_language", [X, "ANY"]) so a vendor declaring (ANY → EN) matches any source → EN
// request. Same for target.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  try {
    let params: any = {};
    const url = new URL(req.url);

    if (req.method === "POST") {
      try { params = await req.json(); } catch (_) {}
    }

    let source_language_raw = params.source_language || url.searchParams.get("source_lang");
    let target_language_raw = params.target_language || url.searchParams.get("target_lang");
    const service_id = params.service_id || url.searchParams.get("service_id");
    const native_languages = params.native_languages || null;
    const country = params.country || null;
    const min_rating = params.min_rating ? parseFloat(params.min_rating) : null;
    const max_rate = params.max_rate ? parseFloat(params.max_rate) : null;
    const availability = params.availability || null;
    const search_text = params.search_text || url.searchParams.get("search") || null;
    const exclude_vendor_ids = params.exclude_vendor_ids || [];
    const sort_by = params.sort_by || url.searchParams.get("sort_by") || "match_score";
    const limit = Math.min(parseInt(params.limit || url.searchParams.get("limit") || "30"), 100);
    const offset = parseInt(params.offset || "0");

    // Resolve UUID language IDs → uppercase ISO codes (vendor_language_pairs stores "EN", "ES-419", etc.)
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let source_language = source_language_raw;
    let target_language = target_language_raw;

    const uuidsToResolve: string[] = [];
    if (source_language_raw && UUID_RE.test(source_language_raw)) uuidsToResolve.push(source_language_raw);
    if (target_language_raw && UUID_RE.test(target_language_raw)) uuidsToResolve.push(target_language_raw);

    if (uuidsToResolve.length > 0) {
      const { data: langRows } = await sb.from("languages").select("id, code").in("id", uuidsToResolve);
      const langCodeMap = new Map<string, string>(
        (langRows || []).map((r: any) => [r.id as string, (r.code as string).toUpperCase()])
      );
      if (source_language_raw && UUID_RE.test(source_language_raw)) {
        source_language = langCodeMap.get(source_language_raw) ?? source_language_raw;
      }
      if (target_language_raw && UUID_RE.test(target_language_raw)) {
        target_language = langCodeMap.get(target_language_raw) ?? target_language_raw;
      }
    } else {
      // Non-UUID: normalize to uppercase to match vendor_language_pairs storage
      if (source_language) source_language = source_language.toUpperCase();
      if (target_language) target_language = target_language.toUpperCase();
    }

    let vendorIds: Set<string> | null = null;

    if (source_language || target_language) {
      // v37: honor "ANY" wildcards in vendor_language_pairs. A vendor with (ANY → EN) matches
      // any source → EN request; (ZH-CN → ANY) matches ZH-CN → any target. Skipped when the
      // request itself is "ANY" (would just duplicate the predicate).
      let lpQuery = sb.from("vendor_language_pairs").select("vendor_id").eq("is_active", true);
      if (source_language) {
        const src = source_language.toUpperCase() === "ANY"
          ? [source_language]
          : [source_language, "ANY"];
        lpQuery = lpQuery.in("source_language", src);
      }
      if (target_language) {
        const tgt = target_language.toUpperCase() === "ANY"
          ? [target_language]
          : [target_language, "ANY"];
        lpQuery = lpQuery.in("target_language", tgt);
      }
      const { data: lpMatches } = await lpQuery;
      vendorIds = new Set((lpMatches || []).map(r => r.vendor_id));
      if (vendorIds.size === 0) return jsonResp({ success: true, vendors: [], total_matches: 0, filters_applied: { source_language, target_language } });
    }

    let rateMap: Record<string, { rate: number; unit: string; currency: string }> = {};
    if (service_id) {
      let rateQuery = sb.from("vendor_rates").select("vendor_id, rate, calculation_unit, currency").eq("service_id", service_id).eq("is_active", true);
      if (vendorIds) rateQuery = rateQuery.in("vendor_id", [...vendorIds]);
      if (max_rate) rateQuery = rateQuery.lte("rate", max_rate);
      const { data: rateMatches } = await rateQuery;

      const rateVendorIds = new Set<string>();
      for (const r of rateMatches || []) {
        rateVendorIds.add(r.vendor_id);
        if (!rateMap[r.vendor_id] || r.rate < rateMap[r.vendor_id].rate) {
          rateMap[r.vendor_id] = { rate: r.rate, unit: r.calculation_unit, currency: r.currency };
        }
      }

      // Only apply the rate filter if at least one vendor has rates for this service.
      // If no rates exist yet (service not yet set up in vendor_rates), fall through and
      // show all language-matched vendors so the PM can still assign and set terms manually.
      if (rateVendorIds.size > 0 || max_rate) {
        vendorIds = vendorIds ? new Set([...vendorIds].filter(id => rateVendorIds.has(id))) : rateVendorIds;
        if (vendorIds.size === 0) return jsonResp({ success: true, vendors: [], total_matches: 0, filters_applied: { source_language, target_language, service_id, max_rate } });
      }
    }

    let vendorQuery = sb
      .from("vendors")
      .select("id, full_name, email, phone, country, province_state, city, status, availability_status, rating, total_projects, last_project_date, preferred_rate_currency, native_languages, minimum_rate")
      .eq("status", "active");

    if (availability) {
      vendorQuery = vendorQuery.eq("availability_status", availability);
    } else {
      vendorQuery = vendorQuery.in("availability_status", ["available", "busy"]);
    }

    if (vendorIds) vendorQuery = vendorQuery.in("id", [...vendorIds]);
    if (min_rating) vendorQuery = vendorQuery.gte("rating", min_rating);
    if (country) vendorQuery = vendorQuery.eq("country", country);

    if (search_text) {
      vendorQuery = vendorQuery.or(`full_name.ilike.%${search_text}%,email.ilike.%${search_text}%`);
    }

    for (const eid of exclude_vendor_ids) {
      vendorQuery = vendorQuery.neq("id", eid);
    }

    vendorQuery = vendorQuery.limit(limit * 3);
    const { data: vendors, error: vErr } = await vendorQuery;
    if (vErr) return jsonResp({ success: false, error: vErr.message }, 500);

    let filteredVendors = vendors || [];

    if (native_languages && Array.isArray(native_languages) && native_languages.length > 0) {
      filteredVendors = filteredVendors.filter(v => {
        if (!v.native_languages || !Array.isArray(v.native_languages)) return false;
        return native_languages.some((nl: string) => v.native_languages.includes(nl));
      });
    }

    const vendorIdsFound = filteredVendors.map(v => v.id);

    let lpCounts: Record<string, number> = {};
    let lpDetails: Record<string, Array<{ source: string; target: string }>> = {};
    if (vendorIdsFound.length > 0) {
      // v37: mirror the wildcard handling from the gating query above so the matching_pairs
      // annotation surfaces (ANY → X) rows instead of dropping them.
      let lpDetailQuery = sb.from("vendor_language_pairs").select("vendor_id, source_language, target_language").in("vendor_id", vendorIdsFound).eq("is_active", true);
      if (source_language) {
        const src = source_language.toUpperCase() === "ANY"
          ? [source_language]
          : [source_language, "ANY"];
        lpDetailQuery = lpDetailQuery.in("source_language", src);
      }
      if (target_language) {
        const tgt = target_language.toUpperCase() === "ANY"
          ? [target_language]
          : [target_language, "ANY"];
        lpDetailQuery = lpDetailQuery.in("target_language", tgt);
      }

      const { data: lpData } = await lpDetailQuery;
      for (const r of lpData || []) {
        lpCounts[r.vendor_id] = (lpCounts[r.vendor_id] || 0) + 1;
        if (!lpDetails[r.vendor_id]) lpDetails[r.vendor_id] = [];
        if (lpDetails[r.vendor_id].length < 5) {
          lpDetails[r.vendor_id].push({ source: r.source_language, target: r.target_language });
        }
      }
    }

    if (!service_id && vendorIdsFound.length > 0) {
      const { data: allRates } = await sb.from("vendor_rates").select("vendor_id, rate, calculation_unit, currency").in("vendor_id", vendorIdsFound).eq("is_active", true);
      for (const r of allRates || []) {
        if (!rateMap[r.vendor_id] || r.rate < rateMap[r.vendor_id].rate) {
          rateMap[r.vendor_id] = { rate: r.rate, unit: r.calculation_unit, currency: r.currency };
        }
      }
    }

    let activeJobCounts: Record<string, number> = {};
    if (vendorIdsFound.length > 0) {
      const { data: jobData } = await sb.from("order_workflow_steps").select("vendor_id").in("vendor_id", vendorIdsFound).in("status", ["offered", "accepted", "in_progress"]);
      for (const r of jobData || []) { activeJobCounts[r.vendor_id] = (activeJobCounts[r.vendor_id] || 0) + 1; }
    }

    // QMS eligibility gating (parallel). Calls public.qms_check_assignment per vendor when service_id is provided.
    // gating_mode='warn' (default): every call writes a row to qms.assignment_eligibility_events; behavior unchanged.
    // gating_mode='block': ineligible vendors filtered out below.
    let qmsResults: Record<string, any> = {};
    if (service_id && vendorIdsFound.length > 0) {
      const gateCalls = filteredVendors.map(async (v) => {
        const { data: gate } = await sb.rpc("qms_check_assignment", {
          p_vendor_id: v.id,
          p_service_id: service_id,
          p_source_language_code: source_language ?? null,
          p_target_language_code: target_language ?? null,
          p_call_site: "find_matching_vendors",
        });
        return { vendor_id: v.id, gate };
      });
      const gateOutcomes = await Promise.all(gateCalls);
      for (const o of gateOutcomes) qmsResults[o.vendor_id] = o.gate;
    }

    let enriched = filteredVendors
      .map(v => {
        const qms = qmsResults[v.id] ?? null;
        if (qms?.should_block) return null;
        return {
          id: v.id,
          full_name: v.full_name,
          email: v.email,
          phone: v.phone,
          country: v.country,
          province_state: v.province_state,
          city: v.city,
          availability_status: v.availability_status,
          rating: v.rating,
          total_projects: v.total_projects,
          last_project_date: v.last_project_date,
          native_languages: v.native_languages,
          minimum_rate: v.minimum_rate,
          preferred_rate_currency: v.preferred_rate_currency || null,
          language_pair_count: lpCounts[v.id] || 0,
          matching_pairs: lpDetails[v.id] || [],
          rate_for_service: rateMap[v.id] || null,
          active_jobs: activeJobCounts[v.id] || 0,
          match_score: calculateMatchScore(v, rateMap[v.id], activeJobCounts[v.id] || 0, native_languages, target_language),
          qms_eligible: qms?.eligible ?? null,
          qms_reason: qms?.reason ?? null,
          qms_required_role: qms?.required_role ?? null,
          qms_gating_mode: qms?.gating_mode ?? null,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    if (sort_by === "rate_asc") {
      enriched.sort((a, b) => (a.rate_for_service?.rate ?? 999999) - (b.rate_for_service?.rate ?? 999999));
    } else if (sort_by === "rate_desc") {
      enriched.sort((a, b) => (b.rate_for_service?.rate ?? 0) - (a.rate_for_service?.rate ?? 0));
    } else if (sort_by === "projects") {
      enriched.sort((a, b) => (b.total_projects || 0) - (a.total_projects || 0));
    } else if (sort_by === "rating") {
      enriched.sort((a, b) => { const d = (b.rating || 0) - (a.rating || 0); return d !== 0 ? d : (b.total_projects || 0) - (a.total_projects || 0); });
    } else {
      enriched.sort((a, b) => b.match_score - a.match_score);
    }

    const totalBeforePagination = enriched.length;
    enriched = enriched.slice(offset, offset + limit);

    return jsonResp({
      success: true,
      vendors: enriched,
      total_matches: totalBeforePagination,
      offset,
      limit,
      filters_applied: {
        source_language: source_language || null,
        target_language: target_language || null,
        service_id: service_id || null,
        native_languages: native_languages || null,
        country: country || null,
        min_rating,
        max_rate,
        availability,
        search_text,
        sort_by,
      },
    });

  } catch (error: any) {
    console.error("Error:", error);
    return jsonResp({ success: false, error: error.message }, 500);
  }
});

function calculateMatchScore(
  vendor: any,
  rate: { rate: number; unit: string } | null,
  activeJobs: number,
  requiredNativeLanguages: string[] | null,
  targetLanguage: string | null
): number {
  let score = 0;
  score += (vendor.rating || 0) * 10;
  if (vendor.availability_status === "available") score += 20;
  else if (vendor.availability_status === "busy") score += 5;
  if (rate) score += 15;
  score += Math.min((vendor.total_projects || 0), 20);
  score -= activeJobs * 5;

  if (targetLanguage && vendor.native_languages && Array.isArray(vendor.native_languages)) {
    if (vendor.native_languages.includes(targetLanguage)) score += 25;
  }

  if (requiredNativeLanguages && vendor.native_languages && Array.isArray(vendor.native_languages)) {
    const overlap = requiredNativeLanguages.filter((nl: string) => vendor.native_languages.includes(nl));
    score += overlap.length * 10;
  }

  return Math.max(score, 0);
}

function jsonResp(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
