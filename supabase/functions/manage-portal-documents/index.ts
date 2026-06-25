// manage-portal-documents — internal Documents & Manuals library for the
// portal. Documents carry an audience (staff/vendor/customer/all) and full
// file-version history (portal_documents + portal_document_files). Files live
// in the private `portal-documents` bucket; downloads are served as short-lived
// signed URLs. Service-role only; staff identity is validated from staff_id.
//
// Transport:
//   multipart/form-data  → create, add_version  (carry a file)
//   application/json     → list, get, update_meta, archive, download_url
//
// Deploy with --no-verify-jwt; the gateway accepts the anon key and this
// function does its own staff validation.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(d: Record<string, unknown>, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
}

const BUCKET = "portal-documents";
const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB — manuals can be chunky.

function safeName(name: string): string {
  return (name || "document").replace(/[^\w.\-]+/g, "_").slice(0, 100);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const contentType = req.headers.get("Content-Type") ?? "";
  const isMultipart = contentType.toLowerCase().startsWith("multipart/form-data");

  // Validate the acting staff member (required for every action).
  async function requireStaff(staffId: string | null): Promise<{ id: string; name: string | null } | null> {
    if (!staffId) return null;
    const { data } = await sb.from("staff_users").select("id, is_active, full_name").eq("id", staffId).maybeSingle();
    if (!data || (data as { is_active: boolean }).is_active === false) return null;
    return { id: (data as { id: string }).id, name: (data as { full_name: string | null }).full_name ?? null };
  }

  try {
    // ---------- multipart actions (create / add_version) ----------
    if (isMultipart) {
      let form: FormData;
      try { form = await req.formData(); } catch { return json({ success: false, error: "invalid_form_data" }, 400); }
      const action = String(form.get("action") ?? "");
      const staffId = String(form.get("staff_id") ?? "") || null;
      const staff = await requireStaff(staffId);
      if (!staff) return json({ success: false, error: "invalid_or_inactive_staff" }, 401);

      const file = form.get("file");
      if (!(file instanceof File)) return json({ success: false, error: "file_required" }, 400);
      if (file.size > MAX_SIZE_BYTES) return json({ success: false, error: "file_too_large", limit_bytes: MAX_SIZE_BYTES }, 400);
      const version = (String(form.get("version") ?? "").trim()) || "1.0";
      const bytes = new Uint8Array(await file.arrayBuffer());
      const fileName = file.name || "document";
      const mime = file.type || "application/octet-stream";

      if (action === "create") {
        const title = String(form.get("title") ?? "").trim();
        if (!title) return json({ success: false, error: "title_required" }, 400);
        const docCode = (String(form.get("doc_code") ?? "").trim()) || null;
        const audience = (String(form.get("audience") ?? "staff").trim()) || "staff";

        const { data: doc, error: docErr } = await sb.from("portal_documents").insert({
          title,
          doc_code: docCode,
          description: (String(form.get("description") ?? "").trim()) || null,
          category: (String(form.get("category") ?? "").trim()) || "General",
          audience,
          created_by: staff.id,
        }).select("*").single();
        if (docErr) {
          const msg = /portal_documents_doc_code_key|duplicate key/.test(docErr.message) ? "doc_code already in use" : docErr.message;
          return json({ success: false, error: msg }, 400);
        }

        const path = `${doc.id}/${Date.now()}-${safeName(fileName)}`;
        const { error: upErr } = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
        if (upErr) { await sb.from("portal_documents").delete().eq("id", doc.id); return json({ success: false, error: "storage_upload_failed", detail: upErr.message }, 500); }

        const { data: fileRow, error: fErr } = await sb.from("portal_document_files").insert({
          document_id: doc.id, version, storage_path: path, file_name: fileName, file_size: file.size,
          mime_type: mime, change_summary: (String(form.get("change_summary") ?? "").trim()) || "Initial version.",
          is_current: true, created_by: staff.id, created_by_name: staff.name,
        }).select("*").single();
        if (fErr) return json({ success: false, error: fErr.message }, 400);

        await sb.from("portal_documents").update({ current_file_id: fileRow.id, updated_at: new Date().toISOString() }).eq("id", doc.id);
        return json({ success: true, document: { ...doc, current_file_id: fileRow.id }, file: fileRow });
      }

      if (action === "add_version") {
        const documentId = String(form.get("document_id") ?? "");
        if (!documentId) return json({ success: false, error: "document_id required" }, 400);
        const { data: doc } = await sb.from("portal_documents").select("id").eq("id", documentId).maybeSingle();
        if (!doc) return json({ success: false, error: "document_not_found" }, 404);

        const path = `${documentId}/${Date.now()}-${safeName(fileName)}`;
        const { error: upErr } = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
        if (upErr) return json({ success: false, error: "storage_upload_failed", detail: upErr.message }, 500);

        const { data: fileRow, error: fErr } = await sb.from("portal_document_files").insert({
          document_id: documentId, version, storage_path: path, file_name: fileName, file_size: file.size,
          mime_type: mime, change_summary: (String(form.get("change_summary") ?? "").trim()) || null,
          is_current: true, created_by: staff.id, created_by_name: staff.name,
        }).select("*").single();
        if (fErr) {
          await sb.storage.from(BUCKET).remove([path]).catch(() => undefined);
          const msg = /portal_document_files_document_id_version_key|duplicate key/.test(fErr.message) ? `version "${version}" already exists` : fErr.message;
          return json({ success: false, error: msg }, 400);
        }
        await sb.from("portal_document_files").update({ is_current: false }).eq("document_id", documentId).neq("id", fileRow.id);
        await sb.from("portal_documents").update({ current_file_id: fileRow.id, updated_at: new Date().toISOString() }).eq("id", documentId);
        return json({ success: true, file: fileRow });
      }

      return json({ success: false, error: `Unknown multipart action: ${action}` }, 400);
    }

    // ---------- JSON actions ----------
    const body = await req.json();
    const action = body?.action as string;

    if (action === "list") {
      const { data: docs, error } = await sb.from("portal_documents")
        .select("id, doc_code, title, description, category, audience, current_file_id, is_published, is_archived, created_at, updated_at")
        .order("category").order("title");
      if (error) return json({ success: false, error: error.message }, 400);
      const fileIds = (docs ?? []).map((d) => d.current_file_id).filter(Boolean) as string[];
      let filesById: Record<string, unknown> = {};
      if (fileIds.length) {
        const { data: files } = await sb.from("portal_document_files")
          .select("id, version, file_name, file_size, mime_type, created_at, created_by_name").in("id", fileIds);
        filesById = Object.fromEntries((files ?? []).map((f) => [f.id, f]));
      }
      const enriched = (docs ?? []).map((d) => ({ ...d, current_file: d.current_file_id ? (filesById[d.current_file_id] ?? null) : null }));
      return json({ success: true, documents: enriched });
    }

    if (action === "get") {
      const { id } = body;
      if (!id) return json({ success: false, error: "id required" }, 400);
      const { data: doc, error } = await sb.from("portal_documents").select("*").eq("id", id).maybeSingle();
      if (error) return json({ success: false, error: error.message }, 400);
      if (!doc) return json({ success: false, error: "document_not_found" }, 404);
      const { data: files } = await sb.from("portal_document_files").select("*").eq("document_id", id).order("created_at", { ascending: false });
      return json({ success: true, document: doc, files: files ?? [] });
    }

    if (action === "update_meta") {
      const staff = await requireStaff(body.staff_id ?? null);
      if (!staff) return json({ success: false, error: "invalid_or_inactive_staff" }, 401);
      const { id } = body;
      if (!id) return json({ success: false, error: "id required" }, 400);
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
      if (typeof body.category === "string" && body.category.trim()) patch.category = body.category.trim();
      if (typeof body.audience === "string" && ["staff", "vendor", "customer", "all"].includes(body.audience)) patch.audience = body.audience;
      if (body.description !== undefined) patch.description = body.description?.trim() || null;
      if (body.doc_code !== undefined) patch.doc_code = body.doc_code?.trim() || null;
      if (typeof body.is_published === "boolean") patch.is_published = body.is_published;
      const { data: doc, error } = await sb.from("portal_documents").update(patch).eq("id", id).select("*").single();
      if (error) {
        const msg = /portal_documents_doc_code_key|duplicate key/.test(error.message) ? "doc_code already in use" : error.message;
        return json({ success: false, error: msg }, 400);
      }
      return json({ success: true, document: doc });
    }

    if (action === "archive") {
      const staff = await requireStaff(body.staff_id ?? null);
      if (!staff) return json({ success: false, error: "invalid_or_inactive_staff" }, 401);
      const { id } = body;
      if (!id) return json({ success: false, error: "id required" }, 400);
      const { data: doc, error } = await sb.from("portal_documents")
        .update({ is_archived: true, is_published: false, updated_at: new Date().toISOString() })
        .eq("id", id).select("*").single();
      if (error) return json({ success: false, error: error.message }, 400);
      return json({ success: true, document: doc });
    }

    // download_url (forced attachment) and view_url (inline, browser renders it
    // in a tab — used for HTML guides / PDFs). Both resolve the same file.
    if (action === "download_url" || action === "view_url") {
      const staff = await requireStaff(body.staff_id ?? null);
      if (!staff) return json({ success: false, error: "invalid_or_inactive_staff" }, 401);
      let storagePath: string | null = null;
      let fileName: string | null = null;
      let mimeType: string | null = null;
      if (body.file_id) {
        const { data: f } = await sb.from("portal_document_files").select("storage_path, file_name, mime_type").eq("id", body.file_id).maybeSingle();
        storagePath = f?.storage_path ?? null; fileName = f?.file_name ?? null; mimeType = f?.mime_type ?? null;
      } else if (body.document_id) {
        const { data: d } = await sb.from("portal_documents").select("current_file_id").eq("id", body.document_id).maybeSingle();
        if (d?.current_file_id) {
          const { data: f } = await sb.from("portal_document_files").select("storage_path, file_name, mime_type").eq("id", d.current_file_id).maybeSingle();
          storagePath = f?.storage_path ?? null; fileName = f?.file_name ?? null; mimeType = f?.mime_type ?? null;
        }
      }
      if (!storagePath) return json({ success: false, error: "file_not_found" }, 404);
      const signOpts = action === "download_url" ? { download: fileName ?? undefined } : undefined;
      const ttl = action === "view_url" ? 600 : 120;
      const { data: signed, error } = await sb.storage.from(BUCKET).createSignedUrl(storagePath, ttl, signOpts);
      if (error || !signed) return json({ success: false, error: error?.message ?? "sign_failed" }, 400);
      // For inline viewing of HTML guides we return the file content directly:
      // Storage serves HTML as text/plain + nosniff (anti-XSS), so a signed URL
      // would render as raw source. The UI renders this content in a sandboxed
      // <iframe srcdoc> instead. (PDFs / images render fine from the signed URL.)
      let content: string | null = null;
      if (action === "view_url" && mimeType === "text/html") {
        const { data: blob } = await sb.storage.from(BUCKET).download(storagePath);
        if (blob) content = await blob.text();
      }
      return json({ success: true, url: signed.signedUrl, file_name: fileName, mime_type: mimeType, content });
    }

    return json({ success: false, error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
