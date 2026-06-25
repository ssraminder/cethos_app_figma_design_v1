/**
 * AdminDocuments — /admin/documents
 *
 * Internal "Documents & Manuals" library. Each document has an audience
 * (staff / vendor / customer / all) and full file-version history. Files are
 * stored in the private `portal-documents` bucket and served as short-lived
 * signed URLs. All access goes through the manage-portal-documents edge fn.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Loader2, Plus, Files, X as XIcon, Download, Upload, History,
  Pencil, Archive, ChevronDown, ChevronRight, Eye,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAdminAuthContext } from "@/context/AdminAuthContext";
import { toast } from "sonner";

const AUDIENCES = ["staff", "vendor", "customer", "all"] as const;
type Audience = (typeof AUDIENCES)[number];

interface DocFile {
  id: string;
  version: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  change_summary?: string | null;
  created_at: string;
  created_by_name: string | null;
}
interface PortalDoc {
  id: string;
  doc_code: string | null;
  title: string;
  description: string | null;
  category: string;
  audience: Audience;
  current_file_id: string | null;
  is_published: boolean;
  is_archived: boolean;
  updated_at: string;
  current_file: DocFile | null;
}

function bytes(n: number | null | undefined): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
function when(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
  catch { return iso; }
}

// Files browsers render in a tab (so we can offer "View" instead of download).
const isViewable = (mime: string | null | undefined): boolean =>
  !!mime && (mime === "text/html" || mime === "application/pdf" || mime.startsWith("image/"));

const audienceChip = (a: string) => {
  const cls = a === "vendor" ? "bg-teal-50 text-teal-700 border-teal-200"
    : a === "customer" ? "bg-indigo-50 text-indigo-700 border-indigo-200"
    : a === "all" ? "bg-purple-50 text-purple-700 border-purple-200"
    : "bg-slate-100 text-slate-700 border-slate-200";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>{a}</span>;
};

export default function AdminDocuments() {
  const { session } = useAdminAuthContext();
  const staffId = (session as any)?.staffId ?? null;

  const [docs, setDocs] = useState<PortalDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, DocFile[]>>({});

  const [showCreate, setShowCreate] = useState(false);
  const [editDoc, setEditDoc] = useState<PortalDoc | null>(null);
  const [versionDoc, setVersionDoc] = useState<PortalDoc | null>(null);
  const [viewing, setViewing] = useState<{ title: string; html: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-portal-documents", { body: { action: "list" } });
      if (error || !data?.success) { toast.error(data?.error ?? error?.message ?? "Failed to load documents"); return; }
      setDocs(data.documents ?? []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const grouped = useMemo(() => {
    const m = new Map<string, PortalDoc[]>();
    for (const d of docs) { if (!m.has(d.category)) m.set(d.category, []); m.get(d.category)!.push(d); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [docs]);

  const download = async (opts: { file_id?: string; document_id?: string }) => {
    const { data, error } = await supabase.functions.invoke("manage-portal-documents", { body: { action: "download_url", staff_id: staffId, ...opts } });
    if (error || !data?.success) { toast.error(data?.error ?? "Could not get download link"); return; }
    window.open(data.url, "_blank", "noopener,noreferrer");
  };

  // View a renderable file. HTML guides come back as `content` and render in a
  // sandboxed in-portal iframe; PDFs / images open in a new tab from the URL.
  const view = async (opts: { file_id?: string; document_id?: string }, title: string) => {
    const { data, error } = await supabase.functions.invoke("manage-portal-documents", { body: { action: "view_url", staff_id: staffId, ...opts } });
    if (error || !data?.success) { toast.error(data?.error ?? "Could not open document"); return; }
    if (data.content) setViewing({ title, html: data.content });
    else if (data.url) window.open(data.url, "_blank", "noopener,noreferrer");
    else toast.error("Nothing to view");
  };

  const togglePublish = async (d: PortalDoc) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("manage-portal-documents", { body: { action: "update_meta", id: d.id, is_published: !d.is_published, staff_id: staffId } });
    setBusy(false);
    if (error || !data?.success) { toast.error(data?.error ?? "Update failed"); return; }
    setDocs((prev) => prev.map((x) => (x.id === d.id ? { ...x, is_published: !d.is_published } : x)));
  };

  const archive = async (d: PortalDoc) => {
    if (!window.confirm(`Archive "${d.title}"? It will be hidden and unpublished.`)) return;
    const { data, error } = await supabase.functions.invoke("manage-portal-documents", { body: { action: "archive", id: d.id, staff_id: staffId } });
    if (error || !data?.success) { toast.error(data?.error ?? "Archive failed"); return; }
    toast.success("Archived"); load();
  };

  const toggleHistory = async (d: PortalDoc) => {
    if (expanded === d.id) { setExpanded(null); return; }
    setExpanded(d.id);
    if (!history[d.id]) {
      const { data } = await supabase.functions.invoke("manage-portal-documents", { body: { action: "get", id: d.id } });
      if (data?.success) setHistory((h) => ({ ...h, [d.id]: data.files ?? [] }));
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Files className="w-5 h-5 text-teal-600" />
          <h1 className="text-xl font-semibold text-gray-900">Documents &amp; Manuals</h1>
        </div>
        <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700">
          <Plus className="w-4 h-4" /> Add document
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-5">Internal documents, guides and manuals. Tag each with an audience and publish it to the matching portal.</p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : docs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">No documents yet. Click “Add document” to upload the first one.</div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([category, items]) => (
            <div key={category}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">{category}</h2>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white">
                {items.map((d) => (
                  <div key={d.id} className={d.is_archived ? "opacity-50" : ""}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <button onClick={() => toggleHistory(d)} className="text-gray-400 hover:text-gray-600" title="Version history">
                        {expanded === d.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-900">{d.title}</span>
                          {d.doc_code && <span className="text-[11px] text-gray-400 font-mono">{d.doc_code}</span>}
                          {audienceChip(d.audience)}
                          {d.is_archived && <span className="text-[11px] text-red-500">archived</span>}
                        </div>
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          {d.current_file ? `v${d.current_file.version} · ${d.current_file.file_name} · ${bytes(d.current_file.file_size)}` : "no file"} · updated {when(d.updated_at)}
                        </div>
                      </div>
                      <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none" title="Publish to the audience's portal">
                        <input type="checkbox" checked={d.is_published} disabled={busy || d.is_archived} onChange={() => togglePublish(d)} className="accent-teal-600" />
                        Published
                      </label>
                      <div className="flex items-center gap-1">
                        {isViewable(d.current_file?.mime_type) && (
                          <button onClick={() => view({ document_id: d.id }, d.title)} disabled={!d.current_file_id} className="p-1.5 text-gray-400 hover:text-teal-600 disabled:opacity-30" title="View"><Eye className="w-4 h-4" /></button>
                        )}
                        <button onClick={() => download({ document_id: d.id })} disabled={!d.current_file_id} className="p-1.5 text-gray-400 hover:text-teal-600 disabled:opacity-30" title="Download current"><Download className="w-4 h-4" /></button>
                        <button onClick={() => setVersionDoc(d)} className="p-1.5 text-gray-400 hover:text-teal-600" title="Upload new version"><Upload className="w-4 h-4" /></button>
                        <button onClick={() => setEditDoc(d)} className="p-1.5 text-gray-400 hover:text-teal-600" title="Edit details"><Pencil className="w-4 h-4" /></button>
                        {!d.is_archived && <button onClick={() => archive(d)} className="p-1.5 text-gray-400 hover:text-red-600" title="Archive"><Archive className="w-4 h-4" /></button>}
                      </div>
                    </div>
                    {expanded === d.id && (
                      <div className="px-12 pb-3 -mt-1">
                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1"><History className="w-3 h-3" /> Version history</div>
                        {!history[d.id] ? <div className="text-xs text-gray-400">Loading…</div> : (
                          <div className="space-y-1">
                            {history[d.id].map((f) => (
                              <div key={f.id} className="flex items-center justify-between text-xs text-gray-600 border border-gray-100 rounded px-2 py-1">
                                <span><span className="font-medium">v{f.version}</span> — {f.file_name} · {bytes(f.file_size)} · {when(f.created_at)}{f.created_by_name ? ` · ${f.created_by_name}` : ""}{f.change_summary ? ` · ${f.change_summary}` : ""}</span>
                                <span className="flex items-center gap-2 shrink-0">
                                  {isViewable(f.mime_type) && (
                                    <button onClick={() => view({ file_id: f.id }, `${d.title} (v${f.version})`)} className="inline-flex items-center gap-1 text-teal-600 hover:underline"><Eye className="w-3 h-3" /> View</button>
                                  )}
                                  <button onClick={() => download({ file_id: f.id })} className="inline-flex items-center gap-1 text-teal-600 hover:underline"><Download className="w-3 h-3" /> Download</button>
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateModal staffId={staffId} onClose={() => setShowCreate(false)} onDone={() => { setShowCreate(false); load(); }} />}
      {editDoc && <EditModal doc={editDoc} staffId={staffId} onClose={() => setEditDoc(null)} onDone={() => { setEditDoc(null); load(); }} />}
      {versionDoc && <VersionModal doc={versionDoc} staffId={staffId} onClose={() => setVersionDoc(null)} onDone={() => { setVersionDoc(null); setHistory((h) => { const c = { ...h }; delete c[versionDoc.id]; return c; }); load(); }} />}
      {viewing && <ViewerModal title={viewing.title} html={viewing.html} onClose={() => setViewing(null)} />}
    </div>
  );
}

// In-portal viewer for HTML guides. The content is rendered in a fully
// sandboxed iframe (no scripts) so a guide can be read without downloading.
function ViewerModal({ title, html, onClose }: { title: string; html: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
      <div className="bg-white rounded-xl w-[94vw] h-[94vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 shrink-0">
          <h3 className="text-sm font-semibold text-gray-900 truncate">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" title="Close (Esc)"><XIcon className="w-5 h-5" /></button>
        </div>
        <iframe title={title} srcDoc={html} sandbox="" className="flex-1 w-full border-0 bg-white" />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>{children}</div>;
}
const inputCls = "w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none";

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><XIcon className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CreateModal({ staffId, onClose, onDone }: { staffId: string | null; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("General");
  const [audience, setAudience] = useState<Audience>("staff");
  const [version, setVersion] = useState("1.0");
  const [docCode, setDocCode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (!file) { toast.error("Choose a file"); return; }
    if (!staffId) { toast.error("No staff session"); return; }
    setSaving(true);
    const fd = new FormData();
    fd.append("action", "create");
    fd.append("staff_id", staffId);
    fd.append("title", title.trim());
    fd.append("description", description.trim());
    fd.append("category", category.trim() || "General");
    fd.append("audience", audience);
    fd.append("version", version.trim() || "1.0");
    if (docCode.trim()) fd.append("doc_code", docCode.trim());
    fd.append("file", file);
    const { data, error } = await supabase.functions.invoke("manage-portal-documents", { body: fd });
    setSaving(false);
    if (error || !data?.success) { toast.error(data?.error ?? error?.message ?? "Upload failed"); return; }
    toast.success("Document added"); onDone();
  };

  return (
    <ModalShell title="Add document" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Title *"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Vendor CV & Document Upload Guide" /></Field>
        <Field label="Description"><textarea className={inputCls} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category"><input className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="General" /></Field>
          <Field label="Audience"><select className={inputCls} value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>{AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}</select></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Version"><input className={inputCls} value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0" /></Field>
          <Field label="Doc code"><input className={inputCls} value={docCode} onChange={(e) => setDocCode(e.target.value)} placeholder="CTH-VPG-001" /></Field>
        </div>
        <Field label="File *"><input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-xs text-gray-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200" /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} disabled={saving} className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:opacity-50">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Add</button>
        </div>
      </div>
    </ModalShell>
  );
}

function EditModal({ doc, staffId, onClose, onDone }: { doc: PortalDoc; staffId: string | null; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState(doc.title);
  const [description, setDescription] = useState(doc.description ?? "");
  const [category, setCategory] = useState(doc.category);
  const [audience, setAudience] = useState<Audience>(doc.audience);
  const [docCode, setDocCode] = useState(doc.doc_code ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("manage-portal-documents", {
      body: { action: "update_meta", id: doc.id, staff_id: staffId, title, description, category, audience, doc_code: docCode },
    });
    setSaving(false);
    if (error || !data?.success) { toast.error(data?.error ?? "Update failed"); return; }
    toast.success("Saved"); onDone();
  };

  return (
    <ModalShell title="Edit document" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Title"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Description"><textarea className={inputCls} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category"><input className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} /></Field>
          <Field label="Audience"><select className={inputCls} value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>{AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}</select></Field>
        </div>
        <Field label="Doc code"><input className={inputCls} value={docCode} onChange={(e) => setDocCode(e.target.value)} /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} disabled={saving} className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:opacity-50">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save</button>
        </div>
      </div>
    </ModalShell>
  );
}

function VersionModal({ doc, staffId, onClose, onDone }: { doc: PortalDoc; staffId: string | null; onClose: () => void; onDone: () => void }) {
  const [version, setVersion] = useState("");
  const [changeSummary, setChangeSummary] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!version.trim()) { toast.error("Version label is required"); return; }
    if (!file) { toast.error("Choose a file"); return; }
    if (!staffId) { toast.error("No staff session"); return; }
    setSaving(true);
    const fd = new FormData();
    fd.append("action", "add_version");
    fd.append("staff_id", staffId);
    fd.append("document_id", doc.id);
    fd.append("version", version.trim());
    fd.append("change_summary", changeSummary.trim());
    fd.append("file", file);
    const { data, error } = await supabase.functions.invoke("manage-portal-documents", { body: fd });
    setSaving(false);
    if (error || !data?.success) { toast.error(data?.error ?? error?.message ?? "Upload failed"); return; }
    toast.success(`Version ${version.trim()} uploaded`); onDone();
  };

  return (
    <ModalShell title={`New version — ${doc.title}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-gray-500">Current: {doc.current_file ? `v${doc.current_file.version}` : "none"}. The new upload becomes the current version; previous versions are kept.</p>
        <Field label="Version label *"><input className={inputCls} value={version} onChange={(e) => setVersion(e.target.value)} placeholder="e.g. 1.1" /></Field>
        <Field label="What changed?"><textarea className={inputCls} rows={2} value={changeSummary} onChange={(e) => setChangeSummary(e.target.value)} /></Field>
        <Field label="File *"><input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-xs text-gray-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200" /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} disabled={saving} className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:opacity-50">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload</button>
        </div>
      </div>
    </ModalShell>
  );
}
