// manage-sops — versioned Standard Operating Procedures for the admin portal.
//
// Versioning model:
//   - Each SOP has many versions. A version is editable only while status='draft'.
//   - Activating a draft supersedes the previously active version and stamps
//     approved_by/approved_at — that approval is the ISO 17100 §3.1.1 signoff.
//   - Content of non-draft versions is frozen by a DB trigger (42501 on update).
//
// Actions:
//   list                                            → all SOPs + current-version summary
//   get           { sop_id | slug }                 → SOP + full version history
//   create_sop    { title, category?, iso_clause_reference?, content_md, staff_id, sop_number? }
//   save_draft    { sop_id, content_md, change_summary?, staff_id }
//   activate      { version_id, staff_id, effective_date? }
//   update_meta   { sop_id, title?, category?, iso_clause_reference? }
//   archive_sop   { sop_id, staff_id }

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(d: Record<string, unknown>, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
}

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = await req.json();
    const action = body?.action as string;

    if (action === "list") {
      const { data: sops, error } = await sb
        .from("sops")
        .select("id, slug, sop_number, title, category, iso_clause_reference, current_version_id, is_archived, updated_at")
        .order("sop_number");
      if (error) return json({ success: false, error: error.message }, 400);

      const versionIds = (sops ?? []).map((s) => s.current_version_id).filter(Boolean);
      let versionsById: Record<string, unknown> = {};
      if (versionIds.length) {
        const { data: versions } = await sb
          .from("sop_versions")
          .select("id, version_number, status, effective_date, approved_by_name, approved_at, created_at")
          .in("id", versionIds);
        versionsById = Object.fromEntries((versions ?? []).map((v) => [v.id, v]));
      }
      const enriched = (sops ?? []).map((s) => ({
        ...s,
        current_version: s.current_version_id ? (versionsById[s.current_version_id] ?? null) : null,
      }));
      return json({ success: true, sops: enriched });
    }

    if (action === "get") {
      const { sop_id, slug } = body;
      if (!sop_id && !slug) return json({ success: false, error: "sop_id or slug required" }, 400);
      let q = sb.from("sops").select("*");
      q = sop_id ? q.eq("id", sop_id) : q.eq("slug", slug);
      const { data: sop, error } = await q.maybeSingle();
      if (error) return json({ success: false, error: error.message }, 400);
      if (!sop) return json({ success: false, error: "SOP not found" }, 404);

      const { data: versions, error: vErr } = await sb
        .from("sop_versions")
        .select("*")
        .eq("sop_id", sop.id)
        .order("version_number", { ascending: false });
      if (vErr) return json({ success: false, error: vErr.message }, 400);
      return json({ success: true, sop, versions: versions ?? [] });
    }

    if (action === "create_sop") {
      const { title, category, iso_clause_reference, content_md, staff_id } = body;
      if (!title?.trim() || !content_md?.trim() || !staff_id) {
        return json({ success: false, error: "title, content_md, staff_id required" }, 400);
      }
      const { data: staff } = await sb.from("staff_users").select("full_name").eq("id", staff_id).maybeSingle();
      const staffName = staff?.full_name ?? null;

      // SOP number: explicit if provided (e.g. a lettered series like SOP-PR-002),
      // else the next integer after the highest trailing number across ALL SOPs.
      // (Ordering by sop_number text sorted lettered prefixes like SOP-VM-001 last
      // and regenerated SOP-002 — a duplicate-key collision; take the max numerically.)
      let sopNumber = (body.sop_number as string | undefined)?.trim();
      if (sopNumber) {
        const { data: clash } = await sb.from("sops").select("id").eq("sop_number", sopNumber).maybeSingle();
        if (clash) return json({ success: false, error: `SOP number ${sopNumber} already exists` }, 409);
      } else {
        const { data: allNums } = await sb.from("sops").select("sop_number");
        const maxN = (allNums ?? []).reduce((m, r) => {
          const n = parseInt(r.sop_number?.match(/(\d+)$/)?.[1] ?? "0", 10) || 0;
          return n > m ? n : m;
        }, 0);
        sopNumber = `SOP-${String(maxN + 1).padStart(3, "0")}`;
      }

      let slug = slugify(title);
      const { data: slugTaken } = await sb.from("sops").select("id").eq("slug", slug).maybeSingle();
      if (slugTaken) slug = `${slug}-${sopNumber.toLowerCase()}`;

      const { data: sop, error } = await sb
        .from("sops")
        .insert({ slug, sop_number: sopNumber, title: title.trim(), category: category?.trim() || "General", iso_clause_reference: iso_clause_reference?.trim() || null, created_by: staff_id })
        .select("*")
        .single();
      if (error) return json({ success: false, error: error.message }, 400);

      const { data: version, error: vErr } = await sb
        .from("sop_versions")
        .insert({ sop_id: sop.id, version_number: 1, content_md, change_summary: "Initial version.", status: "draft", created_by: staff_id, created_by_name: staffName })
        .select("*")
        .single();
      if (vErr) return json({ success: false, error: vErr.message }, 400);

      const { error: linkErr } = await sb.from("sops").update({ current_version_id: version.id, updated_at: new Date().toISOString() }).eq("id", sop.id);
      if (linkErr) return json({ success: false, error: linkErr.message }, 400);
      return json({ success: true, sop: { ...sop, current_version_id: version.id }, version });
    }

    if (action === "save_draft") {
      const { sop_id, content_md, change_summary, staff_id } = body;
      if (!sop_id || !content_md?.trim() || !staff_id) {
        return json({ success: false, error: "sop_id, content_md, staff_id required" }, 400);
      }
      const { data: staff } = await sb.from("staff_users").select("full_name").eq("id", staff_id).maybeSingle();
      const staffName = staff?.full_name ?? null;

      const { data: latest, error: lErr } = await sb
        .from("sop_versions")
        .select("id, version_number, status")
        .eq("sop_id", sop_id)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lErr) return json({ success: false, error: lErr.message }, 400);

      if (latest?.status === "draft") {
        const { data: version, error } = await sb
          .from("sop_versions")
          .update({ content_md, change_summary: change_summary?.trim() || null })
          .eq("id", latest.id)
          .select("*")
          .single();
        if (error) return json({ success: false, error: error.message }, 400);
        return json({ success: true, version, updated_existing_draft: true });
      }

      const nextNumber = (latest?.version_number ?? 0) + 1;
      const { data: version, error } = await sb
        .from("sop_versions")
        .insert({ sop_id, version_number: nextNumber, content_md, change_summary: change_summary?.trim() || null, status: "draft", created_by: staff_id, created_by_name: staffName })
        .select("*")
        .single();
      if (error) return json({ success: false, error: error.message }, 400);
      await sb.from("sops").update({ updated_at: new Date().toISOString() }).eq("id", sop_id);
      return json({ success: true, version, updated_existing_draft: false });
    }

    if (action === "activate") {
      const { version_id, staff_id, effective_date } = body;
      if (!version_id || !staff_id) return json({ success: false, error: "version_id + staff_id required" }, 400);
      const { data: staff } = await sb.from("staff_users").select("full_name").eq("id", staff_id).maybeSingle();
      const staffName = staff?.full_name ?? null;

      const { data: version, error: vErr } = await sb.from("sop_versions").select("id, sop_id, status").eq("id", version_id).maybeSingle();
      if (vErr) return json({ success: false, error: vErr.message }, 400);
      if (!version) return json({ success: false, error: "Version not found" }, 404);
      if (version.status !== "draft") return json({ success: false, error: `Only drafts can be activated (status=${version.status})` }, 409);

      // Supersede the currently active version, if any.
      const { error: supErr } = await sb
        .from("sop_versions")
        .update({ status: "superseded" })
        .eq("sop_id", version.sop_id)
        .eq("status", "active");
      if (supErr) return json({ success: false, error: supErr.message }, 400);

      const { data: activated, error: actErr } = await sb
        .from("sop_versions")
        .update({
          status: "active",
          effective_date: effective_date ?? new Date().toISOString().slice(0, 10),
          approved_by: staff_id,
          approved_by_name: staffName,
          approved_at: new Date().toISOString(),
        })
        .eq("id", version_id)
        .select("*")
        .single();
      if (actErr) return json({ success: false, error: actErr.message }, 400);

      const { error: linkErr } = await sb
        .from("sops")
        .update({ current_version_id: version_id, updated_at: new Date().toISOString() })
        .eq("id", version.sop_id);
      if (linkErr) return json({ success: false, error: linkErr.message }, 400);
      return json({ success: true, version: activated });
    }

    if (action === "update_meta") {
      const { sop_id, title, category, iso_clause_reference } = body;
      if (!sop_id) return json({ success: false, error: "sop_id required" }, 400);
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (title?.trim()) patch.title = title.trim();
      if (category?.trim()) patch.category = category.trim();
      if (iso_clause_reference !== undefined) patch.iso_clause_reference = iso_clause_reference?.trim() || null;
      const { data: sop, error } = await sb.from("sops").update(patch).eq("id", sop_id).select("*").single();
      if (error) return json({ success: false, error: error.message }, 400);
      return json({ success: true, sop });
    }

    if (action === "archive_sop") {
      const { sop_id, staff_id } = body;
      if (!sop_id || !staff_id) return json({ success: false, error: "sop_id + staff_id required" }, 400);
      const { error: retireErr } = await sb.from("sop_versions").update({ status: "retired" }).eq("sop_id", sop_id).eq("status", "active");
      if (retireErr) return json({ success: false, error: retireErr.message }, 400);
      const { data: sop, error } = await sb
        .from("sops")
        .update({ is_archived: true, updated_at: new Date().toISOString() })
        .eq("id", sop_id)
        .select("*")
        .single();
      if (error) return json({ success: false, error: error.message }, 400);
      return json({ success: true, sop });
    }

    return json({ success: false, error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
