// list-vendor-qms — reads a vendor's qms.role_qualifications + nda_agreements
// for the admin VendorQmsTab. PostgREST only exposes public/graphql_public/tr;
// qms.* tables aren't reachable from the client even with the qms schema
// option, so the UI calls this edge function which uses service_role.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(d: Record<string, unknown>, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { vendor_id } = await req.json();
    if (!vendor_id) return json({ success: false, error: "vendor_id required" }, 400);

    const qmsSb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { db: { schema: "qms" } },
    );

    const [qRes, nRes] = await Promise.all([
      qmsSb
        .from("role_qualifications")
        .select(`id, status, qualified_at, re_qualification_due, role_type_id, competence_basis_id`)
        .eq("vendor_id", vendor_id)
        .order("qualified_at", { ascending: false }),
      qmsSb
        .from("nda_agreements")
        .select("id, status, signed_date, effective_date, expiry_date, template_version")
        .eq("vendor_id", vendor_id)
        .order("signed_date", { ascending: false }),
    ]);

    if (qRes.error) return json({ success: false, error: qRes.error.message }, 400);
    if (nRes.error) return json({ success: false, error: nRes.error.message }, 400);

    const quals = qRes.data ?? [];
    const ndas = nRes.data ?? [];

    // Enrich qualifications with role + competence-basis labels + language pairs.
    const roleIds = Array.from(new Set(quals.map((q: any) => q.role_type_id).filter(Boolean)));
    const basisIds = Array.from(new Set(quals.map((q: any) => q.competence_basis_id).filter(Boolean)));
    const qualIds = quals.map((q: any) => q.id);

    const [rolesRes, basesRes, pairsRes] = await Promise.all([
      roleIds.length > 0
        ? qmsSb.from("role_types").select("id, code, name").in("id", roleIds)
        : Promise.resolve({ data: [], error: null }),
      basisIds.length > 0
        ? qmsSb.from("competence_bases").select("id, code, short_label").in("id", basisIds)
        : Promise.resolve({ data: [], error: null }),
      qualIds.length > 0
        ? qmsSb
            .from("language_pair_qualifications")
            .select("role_qualification_id, direction, source_language_id, target_language_id")
            .in("role_qualification_id", qualIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const roleMap = new Map((rolesRes.data ?? []).map((r: any) => [r.id, r]));
    const basisMap = new Map((basesRes.data ?? []).map((b: any) => [b.id, b]));

    // Resolve language IDs from public.languages
    const langIds = Array.from(
      new Set(
        (pairsRes.data ?? []).flatMap((p: any) => [p.source_language_id, p.target_language_id]).filter(Boolean),
      ),
    );
    const publicSb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const langsRes = langIds.length > 0
      ? await publicSb.from("languages").select("id, code, name").in("id", langIds)
      : { data: [], error: null };
    const langMap = new Map((langsRes.data ?? []).map((l: any) => [l.id, l]));

    const pairsByQualId = new Map<string, any[]>();
    for (const p of (pairsRes.data ?? []) as any[]) {
      const arr = pairsByQualId.get(p.role_qualification_id) ?? [];
      arr.push({
        direction: p.direction,
        source_language: langMap.get(p.source_language_id) ?? null,
        target_language: langMap.get(p.target_language_id) ?? null,
      });
      pairsByQualId.set(p.role_qualification_id, arr);
    }

    const qualifications = quals.map((q: any) => ({
      id: q.id,
      status: q.status,
      qualified_at: q.qualified_at,
      re_qualification_due: q.re_qualification_due,
      role_type: roleMap.get(q.role_type_id) ?? null,
      competence_basis: basisMap.get(q.competence_basis_id) ?? null,
      language_pair_qualifications: pairsByQualId.get(q.id) ?? [],
    }));

    return json({ success: true, qualifications, ndas });
  } catch (err: any) {
    console.error("list-vendor-qms error:", err);
    return json({ success: false, error: err?.message ?? String(err) }, 500);
  }
});
