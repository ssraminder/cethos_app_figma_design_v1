/**
 * AdminSops — /admin/sops
 *
 * Versioned Standard Operating Procedures (ISO 17100 §3.1.1 documented
 * processes). Lists all SOPs grouped by category with their current-version
 * status. SOPs are written in plain language; every change creates a new
 * version, and activating a version records who approved it and when.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus, BookOpen, X as XIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAdminAuthContext } from "@/context/AdminAuthContext";
import { toast } from "sonner";
import { SopExportButton } from "@/components/admin/SopExportButton";

interface SopVersionSummary {
  id: string;
  version_number: number;
  document_version: string | null;
  status: "draft" | "active" | "superseded" | "retired";
  effective_date: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
}

interface Sop {
  id: string;
  slug: string;
  sop_number: string;
  title: string;
  category: string;
  iso_clause_reference: string | null;
  is_archived: boolean;
  updated_at: string;
  current_version: SopVersionSummary | null;
}

export function sopStatusChip(status: string | undefined, versionLabel?: string) {
  const label = versionLabel ? `${versionLabel} ${status}` : (status ?? "—");
  const cls =
    status === "active"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status === "draft"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : status === "superseded"
          ? "bg-slate-100 text-slate-600 border-slate-200"
          : "bg-red-50 text-red-700 border-red-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

export default function AdminSops() {
  const navigate = useNavigate();
  const { session } = useAdminAuthContext();
  const staffId = (session as any)?.staffId ?? null;

  const [sops, setSops] = useState<Sop[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("Human Resources");
  const [newIsoRef, setNewIsoRef] = useState("");
  const [newContent, setNewContent] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-sops", {
        body: { action: "list" },
      });
      if (error || !data?.success) {
        toast.error(data?.error ?? error?.message ?? "Failed to load SOPs");
        return;
      }
      setSops(data.sops ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!newTitle.trim() || !newContent.trim()) {
      toast.error("Title and content are required");
      return;
    }
    if (!staffId) {
      toast.error("No staff session");
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-sops", {
        body: {
          action: "create_sop",
          title: newTitle,
          category: newCategory,
          iso_clause_reference: newIsoRef || null,
          content_md: newContent,
          staff_id: staffId,
        },
      });
      if (error || !data?.success) {
        toast.error(data?.error ?? error?.message ?? "Failed to create SOP");
        return;
      }
      toast.success(`${data.sop.sop_number} created as draft`);
      setShowCreate(false);
      setNewTitle("");
      setNewContent("");
      navigate(`/admin/sops/${data.sop.id}`);
    } finally {
      setCreating(false);
    }
  };

  const visible = sops.filter((s) => !s.is_archived);
  const categories = [...new Set(visible.map((s) => s.category))].sort();

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-teal-600" />
            Standard Operating Procedures
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Plain-language procedures, fully versioned. Activating a version records the ISO approval.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          <Plus className="w-4 h-4" /> New SOP
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-12 text-center text-slate-500">
          No SOPs yet. Create the first one.
        </div>
      ) : (
        categories.map((cat) => (
          <div key={cat} className="mb-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-2">{cat}</h2>
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 w-24">Number</th>
                    <th className="px-4 py-2.5">Title</th>
                    <th className="px-4 py-2.5 w-44">ISO reference</th>
                    <th className="px-4 py-2.5 w-36">Status</th>
                    <th className="px-4 py-2.5 w-32">Effective</th>
                    <th className="px-4 py-2.5 w-28 text-right">Export</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visible
                    .filter((s) => s.category === cat)
                    .map((s) => (
                      <tr
                        key={s.id}
                        onClick={() => navigate(`/admin/sops/${s.id}`)}
                        className="cursor-pointer hover:bg-slate-50"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{s.sop_number}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{s.title}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{s.iso_clause_reference ?? "—"}</td>
                        <td className="px-4 py-3">
                          {sopStatusChip(
                            s.current_version?.status,
                            s.current_version
                              ? `v${s.current_version.document_version ?? s.current_version.version_number}`
                              : undefined,
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {s.current_version?.effective_date ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <SopExportButton
                            sopId={s.id}
                            sopNumber={s.sop_number}
                            title={s.title}
                            versionId={s.current_version?.id}
                            compact
                          />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-slate-900">New SOP</h3>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Title</label>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="How we …"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Category</label>
                  <input
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">ISO reference (optional)</label>
                  <input
                    value={newIsoRef}
                    onChange={(e) => setNewIsoRef(e.target.value)}
                    placeholder="ISO 17100:2015 §…"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Content (Markdown — use the simplest language possible)
                </label>
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={12}
                  placeholder={"# Why this exists\n\n…"}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-teal-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 px-5 py-4">
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                Create draft
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
