// ============================================================================
// find-matching-vendors
// Searches vendor database with filters (language, service, rating, rate,
// availability, etc.) and returns paginated results sorted by relevance.
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
    const {
      source_language,
      target_language,
      service_id,
      native_languages,
      country,
      min_rating,
      max_rate,
      availability,
      search_text,
      sort_by = "match_score",
      limit: maxResults = 30,
      offset: skipCount = 0,
    } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Build base vendor query
    let query = supabase
      .from("vendors")
      .select(`
        id, company_name, contact_name, email, phone,
        country, city, status, rating,
        native_languages, availability_status, availability_notes,
        specializations, years_experience,
        created_at
      `, { count: "exact" })
      .eq("status", "active");

    // Text search on company_name or contact_name
    if (search_text) {
      query = query.or(
        `company_name.ilike.%${search_text}%,contact_name.ilike.%${search_text}%,email.ilike.%${search_text}%`,
      );
    }

    // Country filter
    if (country) {
      query = query.ilike("country", `%${country}%`);
    }

    // Minimum rating filter
    if (min_rating) {
      query = query.gte("rating", min_rating);
    }

    // Availability filter
    if (availability) {
      query = query.eq("availability_status", availability);
    }

    // Native language filter
    if (native_languages?.length) {
      query = query.overlaps("native_languages", native_languages);
    }

    // Ordering
    if (sort_by === "rating") {
      query = query.order("rating", { ascending: false, nullsFirst: false });
    } else if (sort_by === "name") {
      query = query.order("company_name");
    } else {
      // Default: match_score (rating descending as proxy)
      query = query.order("rating", { ascending: false, nullsFirst: false });
    }

    // Pagination
    query = query.range(skipCount, skipCount + maxResults - 1);

    const { data: vendors, count, error } = await query;

    if (error) {
      return json({ success: false, error: error.message }, 500);
    }

    // Enrich vendors with language pair and rate data
    const enriched = [];
    for (const vendor of vendors ?? []) {
      let matchScore = vendor.rating ?? 0;
      let rateForService = null;

      // Check if vendor has a matching language pair
      if (source_language || target_language) {
        const lpQuery = supabase
          .from("vendor_language_pairs")
          .select("id, source_language, target_language")
          .eq("vendor_id", vendor.id);

        if (source_language) lpQuery.eq("source_language", source_language);
        if (target_language) lpQuery.eq("target_language", target_language);

        const { data: pairs } = await lpQuery;
        if (pairs?.length) {
          matchScore += 2; // Boost for language match
        } else {
          matchScore -= 1; // Penalize for no match
        }
      }

      // Check if vendor has a rate for the requested service
      if (service_id) {
        const { data: rates } = await supabase
          .from("vendor_rates")
          .select("rate, calculation_unit, currency")
          .eq("vendor_id", vendor.id)
          .eq("service_id", service_id)
          .eq("is_active", true)
          .limit(1);

        if (rates?.length) {
          rateForService = rates[0];
          matchScore += 1;

          // Apply max_rate filter
          if (max_rate && rates[0].rate > max_rate) {
            continue; // Skip this vendor
          }
        }
      }

      enriched.push({
        ...vendor,
        match_score: matchScore,
        rate_for_service: rateForService,
      });
    }

    // Sort by match score if that's the sort method
    if (sort_by === "match_score") {
      enriched.sort((a, b) => b.match_score - a.match_score);
    }

    return json({
      success: true,
      vendors: enriched,
      total_matches: count ?? enriched.length,
    });
  } catch (err) {
    console.error("find-matching-vendors error:", err);
    return json({ success: false, error: (err as Error).message }, 500);
  }
});
