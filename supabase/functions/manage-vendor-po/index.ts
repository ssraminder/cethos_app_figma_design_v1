// manage-vendor-po
// VERSION: 1.0.0 — Admin-facing read/actions for vendor Purchase Orders.
//
// POST { action, ... }
//   action: "list"     { order_id }              -> POs for the order + derived
//                                                   status (open/invoiced/paid/draft),
//                                                   latest send + send count, keyed by step.
//   action: "download" { po_id }                 -> short-lived signed URL for the PO PDF.
//   action: "send"     { po_id? | workflow_step_id+vendor_id, triggered_by }
//                                                -> generate-if-missing then email (manual).
//   action: "logs"     { po_id }                 -> audit log rows (+ staff name).

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (d: Record<string, unknown>, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const call = (fn: string, payload: unknown) =>
    fetch(`${SUPABASE_URL}/functions/v1/${fn}`, { method: "POST", headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }));

  try {
    const body = await req.json();
    const action = body.action;

    if (action === "list") {
      if (!body.order_id) throw new Error("order_id required");
      const { data: pos } = await sb.from("vendor_purchase_orders").select("*").eq("order_id", body.order_id).order("created_at", { ascending: false });
      const rows = pos || [];
      const payableIds = [...new Set(rows.map((p) => p.vendor_payable_id).filter(Boolean))];
      const poIds = rows.map((p) => p.id);
      const { data: pays } = payableIds.length ? await sb.from("vendor_payables").select("id, vendor_invoice_number, invoiced_at, paid_at").in("id", payableIds) : { data: [] };
      const payMap = new Map((pays || []).map((p: any) => [p.id, p]));
      const { data: logs } = poIds.length ? await sb.from("vendor_po_email_log").select("po_id, status, created_at").in("po_id", poIds) : { data: [] };
      const logAgg = new Map<string, { count: number; last: string | null }>();
      for (const l of logs || []) { const a = logAgg.get(l.po_id) || { count: 0, last: null }; if (l.status === "sent") a.count++; if (!a.last || l.created_at > a.last) a.last = l.created_at; logAgg.set(l.po_id, a); }
      const out = rows.map((po) => {
        const pay: any = po.vendor_payable_id ? payMap.get(po.vendor_payable_id) : null;
        let status = "draft";
        if (pay?.paid_at) status = "paid";
        else if (pay?.vendor_invoice_number || pay?.invoiced_at) status = "invoiced";
        else if (po.status === "sent" || po.sent_at) status = "open";
        const agg = logAgg.get(po.id);
        return { id: po.id, po_number: po.po_number, workflow_step_id: po.workflow_step_id, vendor_id: po.vendor_id, step_name: po.step_name, service: po.service, source_language: po.source_language, target_language: po.target_language, total: po.total, currency: po.currency, deadline: po.deadline, doc_status: po.status, status, sent_at: po.sent_at, emailed_to: po.emailed_to, send_count: agg?.count || 0, last_send_at: agg?.last || po.sent_at, has_pdf: !!po.pdf_storage_path };
      });
      return json({ success: true, pos: out });
    }

    if (action === "download") {
      if (!body.po_id) throw new Error("po_id required");
      const { data: po } = await sb.from("vendor_purchase_orders").select("pdf_storage_path, po_number").eq("id", body.po_id).single();
      if (!po?.pdf_storage_path) throw new Error("PO has no PDF — send/generate it first");
      const { data: signed, error } = await sb.storage.from("vendor-pos").createSignedUrl(po.pdf_storage_path, 300, { download: `${po.po_number}.pdf` });
      if (error || !signed) throw new Error(`Could not sign URL: ${error?.message}`);
      return json({ success: true, url: signed.signedUrl, po_number: po.po_number });
    }

    if (action === "send") {
      const triggered_by = body.triggered_by ?? null;
      let poId = body.po_id;
      if (!poId && body.workflow_step_id && body.vendor_id) {
        const { data: existing } = await sb.from("vendor_purchase_orders").select("id, pdf_storage_path").eq("workflow_step_id", body.workflow_step_id).eq("vendor_id", body.vendor_id).maybeSingle();
        poId = existing?.id;
        if (!poId || !existing?.pdf_storage_path) {
          const gen = await call("generate-vendor-po", { workflow_step_id: body.workflow_step_id, vendor_id: body.vendor_id });
          if (!gen.ok || !gen.body?.success) throw new Error(`generate: ${gen.body?.error || "failed"}`);
          poId = gen.body.po_id;
        }
      } else if (poId) {
        // ensure PDF exists (regenerate if a prior gen failed)
        const { data: po } = await sb.from("vendor_purchase_orders").select("workflow_step_id, vendor_id, pdf_storage_path").eq("id", poId).single();
        if (po && !po.pdf_storage_path) {
          const gen = await call("generate-vendor-po", { workflow_step_id: po.workflow_step_id, vendor_id: po.vendor_id });
          if (!gen.ok || !gen.body?.success) throw new Error(`generate: ${gen.body?.error || "failed"}`);
          poId = gen.body.po_id;
        }
      } else throw new Error("po_id, or workflow_step_id + vendor_id, required");
      const sent = await call("send-vendor-po", { po_id: poId, source: "manual", triggered_by });
      if (!sent.ok || !sent.body?.success) throw new Error(`send: ${sent.body?.error || "failed"}`);
      return json({ success: true, po_id: poId, po_number: sent.body.po_number, sent_to: sent.body.sent_to });
    }

    if (action === "logs") {
      if (!body.po_id) throw new Error("po_id required");
      const { data: logs } = await sb.from("vendor_po_email_log").select("*").eq("po_id", body.po_id).order("created_at", { ascending: false });
      const staffIds = [...new Set((logs || []).map((l) => l.triggered_by).filter(Boolean))];
      const { data: staff } = staffIds.length ? await sb.from("staff_users").select("id, full_name").in("id", staffIds) : { data: [] };
      const sMap = new Map((staff || []).map((s: any) => [s.id, s.full_name]));
      return json({ success: true, logs: (logs || []).map((l) => ({ ...l, triggered_by_name: l.triggered_by ? (sMap.get(l.triggered_by) || "Staff") : (l.source === "manual" ? "Manual (staff)" : "System (auto)") })) });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (e) {
    console.error("manage-vendor-po error:", (e as Error).message);
    return json({ success: false, error: (e as Error).message }, 400);
  }
});
