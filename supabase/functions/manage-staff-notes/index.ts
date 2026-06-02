// manage-staff-notes — CRUD for internal staff-only notes on quotes/orders.
//
// Actions:
//   list   { entity_type, entity_id }
//   create { entity_type, entity_id, body, staff_id }
//   update { id, body, staff_id }
//   delete { id, staff_id }
//
// All writes record created_by + created_by_name for audit. Soft-delete via
// deleted_at column; rows are never returned by list once soft-deleted.

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

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = await req.json();
    const action = body?.action as string;

    if (action === "list") {
      const { entity_type, entity_id } = body;
      if (!entity_type || !entity_id) return json({ success: false, error: "entity_type + entity_id required" }, 400);
      const { data, error } = await sb
        .from("staff_notes")
        .select("id, body, created_by, created_by_name, created_at, updated_at")
        .eq("entity_type", entity_type)
        .eq("entity_id", entity_id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) return json({ success: false, error: error.message }, 400);
      return json({ success: true, notes: data ?? [] });
    }

    if (action === "create") {
      const { entity_type, entity_id, body: noteBody, staff_id } = body;
      if (!entity_type || !entity_id || !noteBody?.trim() || !staff_id) {
        return json({ success: false, error: "entity_type, entity_id, body, staff_id required" }, 400);
      }
      const { data: staff } = await sb.from("staff_users").select("full_name").eq("id", staff_id).maybeSingle();
      const { data, error } = await sb
        .from("staff_notes")
        .insert({
          entity_type, entity_id, body: noteBody.trim(),
          created_by: staff_id, created_by_name: staff?.full_name ?? null,
        })
        .select("id, body, created_by, created_by_name, created_at, updated_at")
        .single();
      if (error) return json({ success: false, error: error.message }, 400);
      return json({ success: true, note: data });
    }

    if (action === "update") {
      const { id, body: noteBody, staff_id } = body;
      if (!id || !noteBody?.trim()) return json({ success: false, error: "id + body required" }, 400);
      const { data, error } = await sb
        .from("staff_notes")
        .update({ body: noteBody.trim() })
        .eq("id", id)
        .is("deleted_at", null)
        .select("id, body, created_by, created_by_name, created_at, updated_at")
        .single();
      if (error) return json({ success: false, error: error.message }, 400);
      return json({ success: true, note: data, by: staff_id ?? null });
    }

    if (action === "delete") {
      const { id, staff_id } = body;
      if (!id) return json({ success: false, error: "id required" }, 400);
      const { error } = await sb.from("staff_notes").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) return json({ success: false, error: error.message }, 400);
      return json({ success: true, by: staff_id ?? null });
    }

    return json({ success: false, error: "Unknown action" }, 400);
  } catch (err: any) {
    console.error("manage-staff-notes error:", err);
    return json({ success: false, error: err?.message ?? String(err) }, 500);
  }
});
