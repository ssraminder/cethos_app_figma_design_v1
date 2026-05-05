// AdminProjectDetail.tsx
//
// View + light edit (name, vendor notes) of an internal project. Lists all
// quotes and orders linked to the project so staff can see the full history
// of work for a recurring client engagement.
//
// Source of truth for the project number that's surfaced to vendors.
// vendor_notes typed here flows to the vendor's job-detail "Project" banner.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Briefcase,
  Building,
  Download,
  FileText,
  Loader2,
  Pencil,
  ShoppingCart,
  Trash2,
  Upload,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

const _SB_URL = import.meta.env.VITE_SUPABASE_URL as string;
const _SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function sbGet(path: string): Promise<Response> {
  let token = _SB_KEY;
  try {
    const s = localStorage.getItem("cethos-auth");
    if (s) token = JSON.parse(s)?.access_token || _SB_KEY;
  } catch {}
  return fetch(`${_SB_URL}/rest/v1/${path}`, {
    headers: { apikey: _SB_KEY, Authorization: `Bearer ${token}` },
  });
}

interface Project {
  id: string;
  project_number: string;
  client_project_number: string | null;
  name: string | null;
  vendor_notes: string | null;
  glossary_storage_path: string | null;
  style_guide_storage_path: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  customer_id: string;
  company_id: string | null;
}

interface CustomerLite {
  id: string;
  full_name: string | null;
  email: string | null;
  company_name: string | null;
}

interface CompanyLite {
  id: string;
  name: string;
}

type TaskKind = "quote" | "order";

interface Task {
  kind: TaskKind;
  id: string;
  number: string;
  status: string | null;
  total: number;
  currency: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  paid: "bg-green-100 text-green-700",
  balance_due: "bg-amber-100 text-amber-700",
  delivered: "bg-blue-100 text-blue-700",
  in_progress: "bg-blue-100 text-blue-700",
  quote_ready: "bg-gray-100 text-gray-700",
  cancelled: "bg-red-100 text-red-700",
  void: "bg-red-100 text-red-700",
};

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const cls = STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function AdminProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [customer, setCustomer] = useState<CustomerLite | null>(null);
  const [company, setCompany] = useState<CompanyLite | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Inline edit state ──
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [saving, setSaving] = useState(false);
  // ── Asset upload state ──
  const [uploadingType, setUploadingType] = useState<"glossary" | "style_guide" | null>(null);

  type ProjectPatch = Partial<
    Pick<Project, "name" | "vendor_notes" | "glossary_storage_path" | "style_guide_storage_path">
  >;

  const updateProject = async (patch: ProjectPatch) => {
    if (!project) return false;
    setSaving(true);
    const { data, error: err } = await supabase
      .from("internal_projects")
      .update(patch)
      .eq("id", project.id)
      .select(
        "name, vendor_notes, glossary_storage_path, style_guide_storage_path, updated_at",
      )
      .single();
    setSaving(false);
    if (err || !data) {
      toast.error(err?.message || "Failed to save");
      return false;
    }
    setProject({ ...project, ...data } as Project);
    return true;
  };

  // ── Asset upload helpers ──
  const ASSET_FOLDER: Record<"glossary" | "style_guide", string> = {
    glossary: "glossary",
    style_guide: "style-guide",
  };
  const ASSET_COLUMN: Record<"glossary" | "style_guide", "glossary_storage_path" | "style_guide_storage_path"> = {
    glossary: "glossary_storage_path",
    style_guide: "style_guide_storage_path",
  };
  const ASSET_LABEL: Record<"glossary" | "style_guide", string> = {
    glossary: "Glossary",
    style_guide: "Style guide",
  };

  const uploadAsset = async (type: "glossary" | "style_guide", file: File) => {
    if (!project) return;
    setUploadingType(type);
    try {
      // Sanitize filename — strip path separators, keep extension
      const safeName = file.name.replace(/[\/\\]/g, "_").slice(0, 200);
      const newPath = `${project.id}/${ASSET_FOLDER[type]}/${safeName}`;

      // If a previous file exists at a different path, delete it first.
      const oldPath = project[ASSET_COLUMN[type]];
      if (oldPath && oldPath !== newPath) {
        await supabase.storage.from("project-assets").remove([oldPath]);
      }

      const { error: upErr } = await supabase.storage
        .from("project-assets")
        .upload(newPath, file, { upsert: true, cacheControl: "3600" });
      if (upErr) {
        toast.error(upErr.message);
        return;
      }

      const ok = await updateProject({ [ASSET_COLUMN[type]]: newPath } as ProjectPatch);
      if (ok) toast.success(`${ASSET_LABEL[type]} uploaded`);
    } finally {
      setUploadingType(null);
    }
  };

  const removeAsset = async (type: "glossary" | "style_guide") => {
    if (!project) return;
    const path = project[ASSET_COLUMN[type]];
    if (!path) return;
    if (!window.confirm(`Remove ${ASSET_LABEL[type].toLowerCase()}? This cannot be undone.`)) return;
    setUploadingType(type);
    try {
      await supabase.storage.from("project-assets").remove([path]);
      const ok = await updateProject({ [ASSET_COLUMN[type]]: null } as ProjectPatch);
      if (ok) toast.success(`${ASSET_LABEL[type]} removed`);
    } finally {
      setUploadingType(null);
    }
  };

  const downloadAsset = async (path: string) => {
    const { data, error: err } = await supabase.storage
      .from("project-assets")
      .createSignedUrl(path, 3600);
    if (err || !data?.signedUrl) {
      toast.error(err?.message || "Failed to generate download link");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const filenameFromPath = (path: string | null) => {
    if (!path) return null;
    return path.split("/").pop() ?? path;
  };

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      const projRes = await sbGet(
        `internal_projects?select=id,project_number,client_project_number,name,vendor_notes,glossary_storage_path,style_guide_storage_path,is_active,created_at,updated_at,customer_id,company_id&id=eq.${id}&limit=1`,
      );

      if (cancelled) return;
      if (!projRes.ok) {
        setError(`HTTP ${projRes.status}`);
        setLoading(false);
        return;
      }
      const projRows: any[] = await projRes.json();
      if (!projRows.length) {
        setError("Project not found");
        setLoading(false);
        return;
      }
      const proj = projRows[0] as Project;
      setProject(proj);

      const [custRes, compRes, ordRes, quoteRes] = await Promise.all([
        sbGet(`customers?select=id,full_name,email,company_name&id=eq.${proj.customer_id}&limit=1`),
        proj.company_id
          ? sbGet(`companies?select=id,name&id=eq.${proj.company_id}&limit=1`)
          : Promise.resolve(null),
        sbGet(`orders?select=id,order_number,status,total_amount,currency,created_at&internal_project_id=eq.${id}&order=created_at.desc`),
        sbGet(`quotes?select=id,quote_number,status,total,currency,created_at&internal_project_id=eq.${id}&order=created_at.desc`),
      ]);
      if (cancelled) return;

      if (custRes.ok) { const r: any[] = await custRes.json(); setCustomer(r[0] ?? null); }
      if (compRes?.ok) { const r: any[] = await compRes.json(); setCompany(r[0] ?? null); }

      // Merge orders + quotes into a single Tasks list. An order created from a
      // quote shares the same internal_project_id; we surface both so staff can
      // see the full lineage. Quotes that converted into orders show the order
      // entry — staff can drill into either to see the relationship.
      const ordRows: any[] = ordRes.ok ? await ordRes.json() : [];
      const quoteRows: any[] = quoteRes.ok ? await quoteRes.json() : [];
      const orderTasks: Task[] = ordRows.map((o: any) => ({
        kind: "order",
        id: o.id,
        number: o.order_number,
        status: o.status,
        total: Number(o.total_amount) || 0,
        currency: o.currency,
        created_at: o.created_at,
      }));
      const quoteTasks: Task[] = quoteRows.map((q: any) => ({
        kind: "quote",
        id: q.id,
        number: q.quote_number,
        status: q.status,
        total: Number(q.total) || 0,
        currency: q.currency,
        created_at: q.created_at,
      }));
      const merged = [...orderTasks, ...quoteTasks].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      );
      setTasks(merged);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto">
        <div className="text-sm text-gray-500">Loading project…</div>
      </div>
    );
  }
  if (error || !project) {
    return (
      <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto">
        <Link to="/admin/orders" className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-md p-4 text-sm">
          {error || "Project not found"}
        </div>
      </div>
    );
  }

  const orderCount = tasks.filter((t) => t.kind === "order").length;
  const quoteCount = tasks.filter((t) => t.kind === "quote").length;

  return (
    <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto">
      <Link
        to="/admin/orders"
        className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Orders
      </Link>

      {/* Header */}
      <div className="bg-white border rounded-lg p-5 mb-6">
        <div className="flex items-start gap-3">
          <Briefcase className="w-6 h-6 text-teal-600 mt-1 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">
              {project.project_number}
            </h1>
            {project.client_project_number && (
              <p className="text-sm text-gray-700 mt-1">
                Client label:{" "}
                <span className="font-medium">{project.client_project_number}</span>
              </p>
            )}
            {/* Internal name — staff-only, never shown to vendors */}
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              {editingName ? (
                <>
                  <input
                    type="text"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    placeholder="Internal name (staff-only)"
                    className="flex-1 min-w-0 max-w-md rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    autoFocus
                  />
                  <button
                    onClick={async () => {
                      const trimmed = nameDraft.trim();
                      const ok = await updateProject({ name: trimmed || null });
                      if (ok) setEditingName(false);
                    }}
                    disabled={saving}
                    className="px-3 py-1 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => {
                      setEditingName(false);
                      setNameDraft(project.name ?? "");
                    }}
                    disabled={saving}
                    className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-700">
                    {project.name || (
                      <span className="italic text-gray-400">
                        No internal name
                      </span>
                    )}
                  </p>
                  <button
                    onClick={() => {
                      setNameDraft(project.name ?? "");
                      setEditingName(true);
                    }}
                    className="text-xs text-teal-600 hover:text-teal-700 inline-flex items-center gap-1"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit
                  </button>
                </>
              )}
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-xs text-gray-500 mb-0.5">
                  {company ? "Company" : "Customer"}
                </div>
                <div className="font-medium text-gray-900 flex items-center gap-1">
                  <Building className="w-3.5 h-3.5 text-gray-400" />
                  {company?.name ||
                    customer?.company_name ||
                    customer?.full_name ||
                    customer?.email ||
                    "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-0.5">Tasks</div>
                <div className="font-medium text-gray-900">
                  {orderCount} order{orderCount === 1 ? "" : "s"}
                  {quoteCount > 0 && (
                    <span className="text-gray-500">
                      {" "}
                      · {quoteCount} quote{quoteCount === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-0.5">Created</div>
                <div className="font-medium text-gray-900">
                  {format(new Date(project.created_at), "MMM d, yyyy")}
                </div>
              </div>
            </div>
            {/* Vendor notes — flow to vendor's job-detail Project banner */}
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded text-sm">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-medium text-amber-900">
                  Vendor notes
                  <span className="ml-2 text-amber-700 font-normal italic">
                    visible to vendors on this project's job detail
                  </span>
                </div>
                {!editingNotes && (
                  <button
                    onClick={() => {
                      setNotesDraft(project.vendor_notes ?? "");
                      setEditingNotes(true);
                    }}
                    className="text-xs text-teal-700 hover:text-teal-800 inline-flex items-center gap-1"
                  >
                    <Pencil className="w-3 h-3" />
                    {project.vendor_notes ? "Edit" : "Add notes"}
                  </button>
                )}
              </div>
              {editingNotes ? (
                <>
                  <textarea
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    placeholder="Notes vendors should see — terminology, style preferences, prior decisions, etc."
                    rows={5}
                    className="w-full rounded-md border border-amber-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    autoFocus
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={async () => {
                        const trimmed = notesDraft.trim();
                        const ok = await updateProject({
                          vendor_notes: trimmed || null,
                        });
                        if (ok) setEditingNotes(false);
                      }}
                      disabled={saving}
                      className="px-3 py-1 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded disabled:opacity-50"
                    >
                      {saving ? "Saving…" : "Save notes"}
                    </button>
                    <button
                      onClick={() => {
                        setEditingNotes(false);
                        setNotesDraft(project.vendor_notes ?? "");
                      }}
                      disabled={saving}
                      className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : project.vendor_notes ? (
                <div className="text-amber-900 whitespace-pre-wrap">
                  {project.vendor_notes}
                </div>
              ) : (
                <div className="text-amber-700 italic">
                  No notes yet. Add notes here so vendors maintain consistency
                  across recurring tasks for this project.
                </div>
              )}
            </div>

            {/* Assets — glossary + style guide files. Surfaced to vendors via
                vendor-get-job-detail as reference files. */}
            <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded text-sm">
              <div className="text-xs font-medium text-gray-700 mb-2">
                Assets
                <span className="ml-2 text-gray-500 font-normal italic">
                  vendors download these alongside source files
                </span>
              </div>
              <div className="space-y-2">
                {(["glossary", "style_guide"] as const).map((type) => {
                  const path = project[ASSET_COLUMN[type]];
                  const filename = filenameFromPath(path);
                  const isUploading = uploadingType === type;
                  return (
                    <div
                      key={type}
                      className="flex items-center gap-2 flex-wrap"
                    >
                      <span className="text-xs font-medium text-gray-600 w-24 shrink-0">
                        {ASSET_LABEL[type]}
                      </span>
                      {filename ? (
                        <>
                          <button
                            onClick={() => path && downloadAsset(path)}
                            className="inline-flex items-center gap-1 text-sm text-teal-700 hover:text-teal-800 underline truncate max-w-xs"
                            title={filename}
                          >
                            <Download className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{filename}</span>
                          </button>
                          <label className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-700 hover:text-gray-900 bg-white border border-gray-300 rounded cursor-pointer">
                            <Upload className="w-3 h-3" />
                            Replace
                            <input
                              type="file"
                              className="hidden"
                              disabled={isUploading}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) uploadAsset(type, f);
                                e.target.value = "";
                              }}
                            />
                          </label>
                          <button
                            onClick={() => removeAsset(type)}
                            disabled={isUploading}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-700 hover:text-red-800 disabled:opacity-50"
                          >
                            <Trash2 className="w-3 h-3" />
                            Remove
                          </button>
                        </>
                      ) : (
                        <label className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-700 hover:text-gray-900 bg-white border border-gray-300 rounded cursor-pointer">
                          <Upload className="w-3 h-3" />
                          Upload {ASSET_LABEL[type].toLowerCase()}
                          <input
                            type="file"
                            className="hidden"
                            disabled={isUploading}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) uploadAsset(type, f);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                      {isUploading && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Up to 50 MB per file. PDF, Word, Excel, ODT, ODS, TXT, CSV, MD.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tasks */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">Tasks</h2>
        </div>
        {tasks.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            No quotes or orders linked to this project yet.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {tasks.map((t) => {
              const href =
                t.kind === "order"
                  ? `/admin/orders/${t.id}`
                  : `/admin/quotes/${t.id}`;
              const Icon = t.kind === "order" ? ShoppingCart : FileText;
              return (
                <li key={`${t.kind}-${t.id}`}>
                  <Link
                    to={href}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50"
                  >
                    <Icon
                      className={`w-4 h-4 ${
                        t.kind === "order" ? "text-teal-600" : "text-gray-400"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">
                          {t.number}
                        </span>
                        <span className="text-xs uppercase tracking-wide text-gray-400">
                          {t.kind}
                        </span>
                        <StatusBadge status={t.status} />
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {format(new Date(t.created_at), "MMM d, yyyy")}
                      </div>
                    </div>
                    <div className="text-sm font-medium text-gray-900 tabular-nums">
                      {t.currency || "CAD"}{" "}
                      {t.total.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
