/**
 * AdminSopDetail — /admin/sops/:id
 *
 * One SOP with its full version history. The selected version renders as
 * Markdown. Drafts can be edited and then approved ("Approve & Activate"),
 * which supersedes the previously active version and stamps approver + date —
 * that approval is the ISO 17100 §3.1.1 signoff. Non-draft versions are
 * immutable (enforced by a DB trigger, not just the UI).
 */

import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import {
  Loader2,
  ArrowLeft,
  Pencil,
  Save,
  X as XIcon,
  CheckCircle2,
  History,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAdminAuthContext } from "@/context/AdminAuthContext";
import { toast } from "sonner";
import { ConfirmDialog, useConfirmDialog } from "@/components/admin/ConfirmDialog";
import { sopStatusChip } from "./AdminSops";

interface SopVersion {
  id: string;
  sop_id: string;
  version_number: number;
  content_md: string;
  change_summary: string | null;
  status: "draft" | "active" | "superseded" | "retired";
  effective_date: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  created_at: string;
  created_by_name: string | null;
}

interface Sop {
  id: string;
  slug: string;
  sop_number: string;
  title: string;
  category: string;
  iso_clause_reference: string | null;
  current_version_id: string | null;
  is_archived: boolean;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

export default function AdminSopDetail() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAdminAuthContext();
  const staffId = (session as any)?.staffId ?? null;

  const [sop, setSop] = useState<Sop | null>(null);
  const [versions, setVersions] = useState<SopVersion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const { confirm, state: confirmState, handleAnswer } = useConfirmDialog();

  const load = async (keepSelection = false) => {
    if (!id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-sops", {
        body: { action: "get", sop_id: id },
      });
      if (error || !data?.success) {
        toast.error(data?.error ?? error?.message ?? "Failed to load SOP");
        return;
      }
      setSop(data.sop);
      setVersions(data.versions ?? []);
      if (!keepSelection || !selectedId) {
        setSelectedId(data.sop.current_version_id ?? data.versions?.[0]?.id ?? null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const selected = versions.find((v) => v.id === selectedId) ?? null;
  const latestNumber = versions.reduce((m, v) => Math.max(m, v.version_number), 0);

  const startEdit = () => {
    if (!selected) return;
    setEditContent(selected.content_md);
    setEditSummary("");
    setEditing(true);
  };

  const handleSaveDraft = async () => {
    if (!sop || !staffId || !editContent.trim()) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-sops", {
        body: {
          action: "save_draft",
          sop_id: sop.id,
          content_md: editContent,
          change_summary: editSummary || null,
          staff_id: staffId,
        },
      });
      if (error || !data?.success) {
        toast.error(data?.error ?? error?.message ?? "Failed to save draft");
        return;
      }
      toast.success(
        data.updated_existing_draft
          ? `Draft v${data.version.version_number} updated`
          : `New draft v${data.version.version_number} created`,
      );
      setEditing(false);
      setSelectedId(data.version.id);
      await load(true);
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async () => {
    if (!selected || !staffId) return;
    const ok = await confirm({
      title: `Approve & activate v${selected.version_number}?`,
      message:
        "This records you as the approver and makes this the official current version. The content can never be edited again — future changes need a new version.",
      confirmLabel: "Approve & Activate",
    });
    if (!ok) return;
    setActivating(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-sops", {
        body: { action: "activate", version_id: selected.id, staff_id: staffId },
      });
      if (error || !data?.success) {
        toast.error(data?.error ?? error?.message ?? "Failed to activate");
        return;
      }
      toast.success(`v${data.version.version_number} is now the active version`);
      await load(true);
    } finally {
      setActivating(false);
    }
  };

  if (loading && !sop) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (!sop) {
    return <div className="p-6 text-slate-500">SOP not found.</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Link to="/admin/sops" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> All SOPs
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-slate-500">{sop.sop_number}</span>
            <h1 className="text-2xl font-bold text-slate-900">{sop.title}</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {sop.category}
            {sop.iso_clause_reference ? ` · ${sop.iso_clause_reference}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {!editing && selected && (
            <button
              onClick={startEdit}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Pencil className="w-4 h-4" />
              {selected.status === "draft" ? "Edit draft" : "Edit (new version)"}
            </button>
          )}
          {!editing && selected?.status === "draft" && (
            <button
              onClick={handleActivate}
              disabled={activating}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {activating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Approve &amp; Activate
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_290px]">
        <div className="rounded-xl border border-slate-200 bg-white">
          {selected && selected.id !== sop.current_version_id && !editing && (
            <div className="border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-sm text-amber-800">
              You are viewing v{selected.version_number} ({selected.status}) — not the current version.
            </div>
          )}
          {selected?.status === "draft" && !editing && (
            <div className="border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-sm text-amber-800">
              This is a draft. It is not the official procedure until someone approves and activates it.
            </div>
          )}

          {editing ? (
            <div className="space-y-4 p-5">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={26}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-teal-500 focus:outline-none"
              />
              <input
                value={editSummary}
                onChange={(e) => setEditSummary(e.target.value)}
                placeholder="What changed and why (shown in version history)"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
              />
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setEditing(false)}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <XIcon className="w-4 h-4" /> Cancel
                </button>
                <button
                  onClick={handleSaveDraft}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save draft
                </button>
              </div>
            </div>
          ) : selected ? (
            <article className="prose prose-slate max-w-none p-6 prose-headings:scroll-mt-4">
              <ReactMarkdown>{selected.content_md}</ReactMarkdown>
            </article>
          ) : (
            <div className="p-6 text-slate-500">No versions.</div>
          )}
        </div>

        <aside>
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
              <History className="w-4 h-4" /> Version history
            </div>
            <ul className="divide-y divide-slate-100">
              {versions.map((v) => (
                <li key={v.id}>
                  <button
                    onClick={() => {
                      setSelectedId(v.id);
                      setEditing(false);
                    }}
                    className={`w-full px-4 py-3 text-left hover:bg-slate-50 ${v.id === selectedId ? "bg-teal-50/60" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-900">v{v.version_number}</span>
                      {sopStatusChip(v.status)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {v.status === "draft"
                        ? `Created ${fmtDate(v.created_at)}${v.created_by_name ? ` by ${v.created_by_name}` : ""}`
                        : `Approved ${fmtDate(v.approved_at)}${v.approved_by_name ? ` by ${v.approved_by_name}` : ""}`}
                    </div>
                    {v.change_summary && (
                      <div className="mt-1 line-clamp-2 text-xs text-slate-400">{v.change_summary}</div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-3 px-1 text-xs text-slate-400">
            Approved versions are frozen — the database refuses edits. Changes always create a new version (latest: v{latestNumber}).
          </p>
        </aside>
      </div>
      <ConfirmDialog state={confirmState} onAnswer={handleAnswer} />
    </div>
  );
}
