// supabase/functions/manage-quality/index.ts
//
// Staff-only writes for CAPA + complaint handling. Thin wrapper over the
// public.qms_* SECURITY DEFINER function layer (qms schema is not exposed over
// PostgREST). Attribution uses the verified staff_users.id from requireStaff —
// never body.staff_id. Every write is recorded in qms.quality_event_log by the
// auto-log triggers. Deploy with --no-verify-jwt (project convention).
//
// Actions:
//   create_complaint        { payload }
//   triage_complaint        { id, status, note? }
//   create_nonconformity    { payload }
//   set_root_cause          { id, root_cause, method? }
//   update_nc_status        { id, status, summary? }
//   create_capa             { payload }
//   update_capa             { payload }   // payload includes id + status/effectiveness

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { requireStaff } from "../_shared/require-staff.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jr(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) return jr({ error: "Missing Supabase configuration" }, 500);

  const auth = await requireStaff(req);
  if (!auth.ok) return jr({ error: auth.error }, auth.status);
  const actor = auth.staff.staffId;

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return jr({ error: "Invalid JSON" }, 400); }
  const action = String(body.action || "");

  try {
    let rpc: string;
    let args: Record<string, unknown>;
    switch (action) {
      case "create_complaint":
        rpc = "qms_create_complaint";
        args = { p_payload: body.payload ?? {}, p_actor: actor };
        break;
      case "triage_complaint":
        rpc = "qms_triage_complaint";
        args = { p_id: body.id, p_status: body.status, p_note: body.note ?? null, p_actor: actor };
        break;
      case "create_nonconformity":
        rpc = "qms_create_nonconformity";
        args = { p_payload: body.payload ?? {}, p_actor: actor };
        break;
      case "set_root_cause":
        rpc = "qms_set_nc_root_cause";
        args = { p_id: body.id, p_root_cause: body.root_cause, p_method: body.method ?? null, p_actor: actor };
        break;
      case "update_nc_status":
        rpc = "qms_update_nc_status";
        args = { p_id: body.id, p_status: body.status, p_summary: body.summary ?? null, p_actor: actor };
        break;
      case "create_capa":
        rpc = "qms_create_capa";
        args = { p_payload: body.payload ?? {}, p_actor: actor };
        break;
      case "update_capa":
        rpc = "qms_update_capa";
        args = { p_payload: body.payload ?? {}, p_actor: actor };
        break;
      default:
        return jr({ error: `Unknown action: ${action}` }, 400);
    }

    const { data, error } = await sb.rpc(rpc, args);
    if (error) throw error;
    return jr({ success: true, result: data });
  } catch (e) {
    return jr({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
