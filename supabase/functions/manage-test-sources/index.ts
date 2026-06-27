// manage-test-sources — versioned QMS store for English qualification-test
// source documents (cvp_test_library).
//
// Versioning model: AUTO-VERSION ON EVERY EDIT. Each `save` snapshots an
// immutable row into cvp_test_source_versions (append-only, no-mutate trigger)
// and repoints the library row at it via cvp_test_source_save_version().
// A save whose content is byte-identical to the current version is a no-op.
//
// Actions:
//   list                                  → all sources + current version + lang names + preview
//   get        { id }                     → one source (full content) + full version history
//   save       { id, source_text, title?, instructions?, reference_translation?,
//                ai_assessment_rubric?, source_file_path?, change_reason?, staff_id }
//   create     { title, domain, service_type?, difficulty?, source_language_id,
//                target_language_id?, source_text, instructions?,
//                reference_translation?, ai_assessment_rubric?, is_active?, staff_id }
//   set_active { id, is_active, staff_id }
//
// Deployed --no-verify-jwt: the admin UI is already behind admin auth and
// passes the staff session id; mutations verify staff_id against staff_users.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(d: Record<string, unknown>, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
}

const norm = (v: unknown) => (v ?? "").toString();

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  async function requireStaff(staffId: unknown): Promise<{ ok: true; name: string | null } | { ok: false }> {
    if (!staffId || typeof staffId !== "string") return { ok: false };
    const { data } = await sb.from("staff_users").select("full_name").eq("id", staffId).maybeSingle();
    return data ? { ok: true, name: data.full_name ?? null } : { ok: false };
  }

  try {
    const body = await req.json();
    const action = body?.action as string;

    // ── list ──────────────────────────────────────────────────────────────────
    if (action === "list") {
      const { data: rows, error } = await sb
        .from("cvp_test_library")
        .select("id, title, domain, service_type, difficulty, source_language_id, target_language_id, is_active, current_version_number, source_text, times_used, last_used_at, updated_at")
        .order("domain")
        .order("title");
      if (error) return json({ success: false, error: error.message }, 400);

      const { data: langs } = await sb.from("languages").select("id, name, code");
      const langById = new Map((langs ?? []).map((l) => [l.id, l]));

      const sources = (rows ?? []).map((r) => ({
        id: r.id,
        title: r.title,
        domain: r.domain,
        service_type: r.service_type,
        difficulty: r.difficulty,
        is_active: r.is_active,
        version_number: r.current_version_number,
        source_language: langById.get(r.source_language_id)?.name ?? null,
        target_language: r.target_language_id ? (langById.get(r.target_language_id)?.name ?? null) : null,
        times_used: r.times_used,
        last_used_at: r.last_used_at,
        updated_at: r.updated_at,
        source_preview: (r.source_text ?? "").slice(0, 220),
      }));
      return json({ success: true, sources });
    }

    // ── get ───────────────────────────────────────────────────────────────────
    if (action === "get") {
      const { id } = body;
      if (!id) return json({ success: false, error: "id required" }, 400);
      const { data: source, error } = await sb.from("cvp_test_library").select("*").eq("id", id).maybeSingle();
      if (error) return json({ success: false, error: error.message }, 400);
      if (!source) return json({ success: false, error: "Test source not found" }, 404);

      const { data: versions, error: vErr } = await sb
        .from("cvp_test_source_versions")
        .select("id, version_number, title, source_text, instructions, reference_translation, ai_assessment_rubric, change_reason, created_by_name, created_at")
        .eq("test_id", id)
        .order("version_number", { ascending: false });
      if (vErr) return json({ success: false, error: vErr.message }, 400);

      const { data: langs } = await sb.from("languages").select("id, name");
      const langById = new Map((langs ?? []).map((l) => [l.id, l.name]));
      return json({
        success: true,
        source: {
          ...source,
          source_language: langById.get(source.source_language_id) ?? null,
          target_language: source.target_language_id ? (langById.get(source.target_language_id) ?? null) : null,
        },
        versions: versions ?? [],
      });
    }

    // ── save (auto-version) ────────────────────────────────────────────────────
    if (action === "save") {
      const { id, source_text, title, instructions, reference_translation, ai_assessment_rubric, source_file_path, change_reason, staff_id } = body;
      if (!id) return json({ success: false, error: "id required" }, 400);
      if (!source_text || !String(source_text).trim()) return json({ success: false, error: "source_text required" }, 400);
      const staff = await requireStaff(staff_id);
      if (!staff.ok) return json({ success: false, error: "Valid staff_id required" }, 403);

      // No-op guard: skip if every content field matches the current version.
      const { data: current } = await sb
        .from("cvp_test_library")
        .select("current_version_id")
        .eq("id", id)
        .maybeSingle();
      if (current?.current_version_id) {
        const { data: cur } = await sb
          .from("cvp_test_source_versions")
          .select("source_text, instructions, reference_translation, ai_assessment_rubric")
          .eq("id", current.current_version_id)
          .maybeSingle();
        if (
          cur &&
          norm(cur.source_text) === norm(source_text) &&
          norm(cur.instructions) === norm(instructions) &&
          norm(cur.reference_translation) === norm(reference_translation) &&
          norm(cur.ai_assessment_rubric) === norm(ai_assessment_rubric)
        ) {
          return json({ success: true, unchanged: true });
        }
      }

      const { data: version, error } = await sb.rpc("cvp_test_source_save_version", {
        p_test_id: id,
        p_title: title ?? null,
        p_source_text: source_text,
        p_instructions: instructions ?? null,
        p_reference_translation: reference_translation ?? null,
        p_ai_assessment_rubric: ai_assessment_rubric ?? null,
        p_source_file_path: source_file_path ?? null,
        p_change_reason: change_reason ?? null,
        p_staff_id: staff_id,
      });
      if (error) return json({ success: false, error: error.message }, 400);
      return json({ success: true, version });
    }

    // ── create ─────────────────────────────────────────────────────────────────
    if (action === "create") {
      const { title, domain, service_type, difficulty, source_language_id, target_language_id, source_text, instructions, reference_translation, ai_assessment_rubric, is_active, staff_id } = body;
      const staff = await requireStaff(staff_id);
      if (!staff.ok) return json({ success: false, error: "Valid staff_id required" }, 403);
      if (!title?.trim() || !domain?.trim() || !source_language_id || !source_text?.trim()) {
        return json({ success: false, error: "title, domain, source_language_id, source_text required" }, 400);
      }

      const { data: row, error } = await sb
        .from("cvp_test_library")
        .insert({
          title: title.trim(),
          domain: domain.trim(),
          service_type: service_type?.trim() || "translation",
          difficulty: difficulty?.trim() || "intermediate",
          source_language_id,
          target_language_id: target_language_id || null,
          is_active: is_active ?? false,
        })
        .select("id")
        .single();
      if (error) return json({ success: false, error: error.message }, 400);

      // v1 snapshot + content via the auto-version helper.
      const { data: version, error: vErr } = await sb.rpc("cvp_test_source_save_version", {
        p_test_id: row.id,
        p_title: title.trim(),
        p_source_text: source_text,
        p_instructions: instructions ?? null,
        p_reference_translation: reference_translation ?? null,
        p_ai_assessment_rubric: ai_assessment_rubric ?? null,
        p_source_file_path: null,
        p_change_reason: "Created in QMS Hub",
        p_staff_id: staff_id,
      });
      if (vErr) return json({ success: false, error: vErr.message }, 400);
      return json({ success: true, id: row.id, version });
    }

    // ── set_active ──────────────────────────────────────────────────────────────
    if (action === "set_active") {
      const { id, is_active, staff_id } = body;
      if (!id || typeof is_active !== "boolean") return json({ success: false, error: "id and is_active required" }, 400);
      const staff = await requireStaff(staff_id);
      if (!staff.ok) return json({ success: false, error: "Valid staff_id required" }, 403);
      const { error } = await sb
        .from("cvp_test_library")
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) return json({ success: false, error: error.message }, 400);
      return json({ success: true });
    }

    return json({ success: false, error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
