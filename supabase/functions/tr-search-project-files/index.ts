// ============================================================================
// tr-search-project-files — picker backend. Returns files available to link
// from an existing project: project assets (glossary, style guide), quote
// files for quotes/orders belonging to that project, and order deliverables
// for orders belonging to that project.
//
// Input: { project_id?, customer_id?, search_text? }
// Output: {
//   project_assets: [{ kind, project_id, storage_path, filename }],
//   quote_files:    [{ quote_id, quote_number, file_id, filename, category, custom_label, mime_type }],
//   order_deliverables: [{ order_id, order_number, step_id, deliverable_id, file_id, filename }]
// }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { CORS, json, serviceClient } from "../_shared/tr.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const { project_id, customer_id, search_text } = await req.json();
    if (!project_id && !customer_id) {
      return json({ error: "project_id or customer_id required" }, 400);
    }

    const sb = serviceClient();
    const projectAssets: unknown[] = [];
    const quoteFiles: unknown[] = [];
    const orderDeliverables: unknown[] = [];

    // ── 1. Project assets ────────────────────────────────────────────────
    if (project_id) {
      const { data: project } = await sb
        .from("internal_projects")
        .select("id, project_number, name, glossary_storage_path, style_guide_storage_path")
        .eq("id", project_id)
        .maybeSingle();
      if (project) {
        if (project.glossary_storage_path) {
          projectAssets.push({
            kind: "glossary",
            project_id,
            storage_bucket: "project-assets",
            storage_path: project.glossary_storage_path,
            filename: project.glossary_storage_path.split("/").pop() ?? "glossary",
          });
        }
        if (project.style_guide_storage_path) {
          projectAssets.push({
            kind: "style_guide",
            project_id,
            storage_bucket: "project-assets",
            storage_path: project.style_guide_storage_path,
            filename: project.style_guide_storage_path.split("/").pop() ?? "style-guide",
          });
        }
      }
    }

    // ── 2. Quote files (via quotes linked to the project/customer) ────────
    let quoteIdsQ = sb.from("quotes").select("id, quote_number, customer_id, internal_project_id");
    if (project_id) quoteIdsQ = quoteIdsQ.eq("internal_project_id", project_id);
    else if (customer_id) quoteIdsQ = quoteIdsQ.eq("customer_id", customer_id);
    const { data: quotes } = await quoteIdsQ.limit(200);
    const quoteIds = (quotes ?? []).map((q) => q.id);

    if (quoteIds.length) {
      let qf = sb
        .from("quote_files")
        .select("id, quote_id, filename, mime_type, file_category_id, custom_label, storage_path")
        .in("quote_id", quoteIds)
        .limit(500);
      if (search_text) qf = qf.ilike("filename", `%${search_text}%`);
      const { data: files } = await qf;

      // Resolve quote_number + file category labels
      const quoteMap = new Map((quotes ?? []).map((q) => [q.id, q.quote_number]));
      const catIds = Array.from(new Set((files ?? []).map((f) => f.file_category_id).filter(Boolean)));
      const catMap = new Map<string, string>();
      if (catIds.length) {
        const { data: cats } = await sb.from("file_categories").select("id, slug, name").in("id", catIds as string[]);
        for (const c of cats ?? []) catMap.set(c.id, c.slug ?? c.name);
      }

      for (const f of files ?? []) {
        quoteFiles.push({
          quote_id: f.quote_id,
          quote_number: quoteMap.get(f.quote_id) ?? null,
          file_id: f.id,
          filename: f.filename,
          mime_type: f.mime_type,
          category: catMap.get(f.file_category_id ?? "") ?? null,
          custom_label: f.custom_label,
          storage_path: f.storage_path,
        });
      }
    }

    // ── 3. Order deliverables (via orders linked to the project/customer) ──
    let ordersQ = sb.from("orders").select("id, order_number, customer_id, internal_project_id");
    if (project_id) ordersQ = ordersQ.eq("internal_project_id", project_id);
    else if (customer_id) ordersQ = ordersQ.eq("customer_id", customer_id);
    const { data: orders } = await ordersQ.limit(200);
    const orderIds = (orders ?? []).map((o) => o.id);

    if (orderIds.length) {
      const { data: steps } = await sb
        .from("order_workflow_steps")
        .select("id, order_id")
        .in("order_id", orderIds);
      const stepIds = (steps ?? []).map((s) => s.id);

      if (stepIds.length) {
        const { data: dels } = await sb
          .from("step_deliveries")
          .select("id, step_id, file_id, filename, storage_path, mime_type")
          .in("step_id", stepIds)
          .limit(500);

        const stepMap = new Map((steps ?? []).map((s) => [s.id, s.order_id]));
        const orderMap = new Map((orders ?? []).map((o) => [o.id, o.order_number]));

        for (const d of dels ?? []) {
          if (search_text && d.filename && !d.filename.toLowerCase().includes(String(search_text).toLowerCase())) {
            continue;
          }
          const order_id = stepMap.get(d.step_id);
          orderDeliverables.push({
            order_id,
            order_number: order_id ? orderMap.get(order_id) ?? null : null,
            step_id: d.step_id,
            deliverable_id: d.id,
            file_id: d.file_id ?? null,
            filename: d.filename,
            mime_type: d.mime_type,
            storage_path: d.storage_path,
          });
        }
      }
    }

    return json({
      project_assets: projectAssets,
      quote_files: quoteFiles,
      order_deliverables: orderDeliverables,
    });
  } catch (err) {
    console.error("[tr-search-project-files] fatal:", err);
    return json({ error: String(err) }, 500);
  }
});
