// supabase/functions/quality-read/index.ts
//
// Staff-only reads for the Quality & performance hub, NC/CAPA detail, and the
// per-linguist scorecard. Thin wrapper over the public.qms_* SECURITY DEFINER
// read functions (qms schema is not exposed over PostgREST). Deploy with
// --no-verify-jwt (project convention).
//
// Actions:
//   dashboard                 -> { metrics, register, linguists_to_watch }
//   list_complaints           { status? }
//   list_nonconformities      { status? }
//   get_nonconformity         { id }
//   list_for_order            { order_id }  -> { complaints, nonconformities }
//   linguist_performance      { vendor_id }

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

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return jr({ error: "Invalid JSON" }, 400); }
  const action = String(body.action || "");

  try {
    let rpc: string;
    let args: Record<string, unknown> = {};
    switch (action) {
      case "dashboard":
        rpc = "qms_quality_dashboard";
        break;
      case "list_complaints":
        rpc = "qms_list_complaints";
        args = { p_status: body.status ?? null };
        break;
      case "list_nonconformities":
        rpc = "qms_list_nonconformities";
        args = { p_status: body.status ?? null };
        break;
      case "get_nonconformity":
        rpc = "qms_get_nonconformity";
        args = { p_id: body.id };
        break;
      case "list_for_order":
        rpc = "qms_list_for_order";
        args = { p_order_id: body.order_id };
        break;
      case "list_updates":
        rpc = "qms_list_updates";
        args = { p_kind: body.kind, p_id: body.id };
        break;
      case "linguist_performance":
        rpc = "qms_linguist_performance";
        args = { p_vendor_id: body.vendor_id };
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
