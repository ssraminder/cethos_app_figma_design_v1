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
import remarkGfm from "remark-gfm";
import {
  Loader2,
  ArrowLeft,
  Pencil,
  Save,
  X as XIcon,
  CheckCircle2,
  History,
  ChevronDown,
  CalendarDays,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAdminAuthContext } from "@/context/AdminAuthContext";
import { toast } from "sonner";
import { ConfirmDialog, useConfirmDialog } from "@/components/admin/ConfirmDialog";
import { sopStatusChip } from "./AdminSops";
import { SopExportButton } from "@/components/admin/SopExportButton";

interface SopVersion {
  id: string;
  sop_id: string;
  version_number: number;
  document_version: string | null;
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
    // Date-only values (effective_date = "YYYY-MM-DD") must be read as local time.
    // `new Date("2026-06-24")` is parsed as UTC midnight and renders a day earlier
    // in negative-offset timezones; appending a local time component avoids the shift.
    // Full timestamps (approved_at, created_at) keep their own offset.
    const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// The audit-facing version label. document_version (e.g. "5.0") is authoritative;
// version_number is only the internal ordering counter, shown as a fallback.
function verLabel(v: { document_version: string | null; version_number: number }): string {
  return `v${v.document_version ?? v.version_number}`;
}

// SOP bodies historically hand-typed a version-history table
// (| Version | Date | Summary | Approved By |) at the top of content_md. That
// duplicates the portal's structured version panel + banner above and goes
// stale on frozen versions (e.g. SOP-019 v4.0 still shows a bogus "1.0 (Draft)"
// row). We render that table from the DB now, so strip the hand-typed one out of
// the markdown before display — fixing the stale labels everywhere at once
// without re-cutting any version. Removes the table block plus an immediately
// preceding "Version history / Revision history / Document control" heading.
function stripVersionTable(md: string): string {
  if (!md) return md;
  const lines = md.split(/\r?\n/);
  const isHeaderRow = (l: string) =>
    /^\s*\|.*\bversion\b.*\|.*\bapprov/i.test(l);
  const isDelimiterRow = (l: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.includes("-");
  const isBodyRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);

  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isHeaderRow(lines[i]) && i + 1 < lines.length && isDelimiterRow(lines[i + 1])) {
      i++; // consume the delimiter row
      while (i + 1 < lines.length && isBodyRow(lines[i + 1])) i++; // consume body rows
      // Drop a preceding version/revision heading that now has no table under it.
      let j = out.length - 1;
      while (j >= 0 && out[j].trim() === "") j--;
      if (j >= 0 && /^#{1,6}\s+(version|revision|document control|change)/i.test(out[j].trim())) {
        out.length = j;
      }
      continue;
    }
    out.push(lines[i]);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
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
  const [historyOpen, setHistoryOpen] = useState(false);
  // Approve & Activate dialog — lets the approver set/backdate the effective date.
  const [activateOpen, setActivateOpen] = useState(false);
  const [activateDate, setActivateDate] = useState(todayISO());
  const [activateDocVer, setActivateDocVer] = useState("1.0");
  // Inline effective-date correction for already-recorded versions.
  const [editDateId, setEditDateId] = useState<string | null>(null);
  const [editDateValue, setEditDateValue] = useState("");
  const [savingDate, setSavingDate] = useState(false);
  // Inline document-version correction for already-recorded versions.
  const [editVerId, setEditVerId] = useState<string | null>(null);
  const [editVerValue, setEditVerValue] = useState("");
  const [savingVer, setSavingVer] = useState(false);
  const { state: confirmState, handleAnswer } = useConfirmDialog();

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

  const openActivate = () => {
    if (!selected) return;
    setActivateDate(todayISO());
    setActivateDocVer(selected.document_version ?? `${selected.version_number}.0`);
    setActivateOpen(true);
  };

  const handleActivate = async () => {
    if (!selected || !staffId) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(activateDate)) {
      toast.error("Pick a valid effective date");
      return;
    }
    if (!activateDocVer.trim()) {
      toast.error("Enter a version number");
      return;
    }
    setActivating(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-sops", {
        body: { action: "activate", version_id: selected.id, staff_id: staffId, effective_date: activateDate, document_version: activateDocVer.trim() },
      });
      if (error || !data?.success) {
        toast.error(data?.error ?? error?.message ?? "Failed to activate");
        return;
      }
      setActivateOpen(false);
      toast.success(`${verLabel(data.version)} is now active — effective ${fmtDate(data.version.effective_date)}`);
      await load(true);
    } finally {
      setActivating(false);
    }
  };

  const startEditDate = (v: SopVersion) => {
    setEditDateId(v.id);
    setEditDateValue(v.effective_date ?? todayISO());
  };

  const handleSetEffectiveDate = async (versionId: string) => {
    if (!staffId) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(editDateValue)) {
      toast.error("Pick a valid effective date");
      return;
    }
    setSavingDate(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-sops", {
        body: { action: "set_effective_date", version_id: versionId, effective_date: editDateValue, staff_id: staffId },
      });
      if (error || !data?.success) {
        toast.error(data?.error ?? error?.message ?? "Failed to update effective date");
        return;
      }
      toast.success(`Effective date set to ${fmtDate(data.version.effective_date)}`);
      setEditDateId(null);
      await load(true);
    } finally {
      setSavingDate(false);
    }
  };

  const startEditVer = (v: SopVersion) => {
    setEditVerId(v.id);
    setEditVerValue(v.document_version ?? `${v.version_number}.0`);
  };

  const handleSetDocumentVersion = async (versionId: string) => {
    if (!staffId) return;
    if (!editVerValue.trim()) {
      toast.error("Enter a version number");
      return;
    }
    setSavingVer(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-sops", {
        body: { action: "set_document_version", version_id: versionId, document_version: editVerValue.trim(), staff_id: staffId },
      });
      if (error || !data?.success) {
        toast.error(data?.error ?? error?.message ?? "Failed to update version");
        return;
      }
      toast.success(`Version set to ${verLabel(data.version)}`);
      setEditVerId(null);
      await load(true);
    } finally {
      setSavingVer(false);
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
          {selected && (
            <SopExportButton
              sopId={sop.id}
              sopNumber={sop.sop_number}
              title={sop.title}
              versionId={selected.id}
            />
          )}
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
              onClick={openActivate}
              disabled={activating}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {activating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Approve &amp; Activate
            </button>
          )}
        </div>
      </div>

      {/* Version history — collapsible, on top, so the document below gets the full column width */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white">
        <button
          onClick={() => setHistoryOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <span className="flex flex-wrap items-center gap-2">
            <History className="w-4 h-4" /> Version history
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
              {versions.length}
            </span>
            {selected && (
              <span className="text-xs font-normal text-slate-400">
                · viewing {verLabel(selected)} ({selected.status})
              </span>
            )}
          </span>
          <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
        </button>
        {historyOpen && (
          <div className="border-t border-slate-200 p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {versions.map((v) => (
                <div
                  key={v.id}
                  className={`rounded-lg border p-3 ${v.id === selectedId ? "border-teal-300 bg-teal-50/60" : "border-slate-200"}`}
                >
                  <button
                    onClick={() => {
                      setSelectedId(v.id);
                      setEditing(false);
                    }}
                    className="block w-full text-left"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-900">
                        {verLabel(v)}
                        <span className="ml-1.5 text-xs font-normal text-slate-400">seq {v.version_number}</span>
                      </span>
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
                  {v.status !== "draft" && (
                    <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
                      {editVerId === v.id ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <input
                            value={editVerValue}
                            onChange={(e) => setEditVerValue(e.target.value)}
                            placeholder="e.g. 5.0"
                            className="w-20 rounded border border-slate-300 px-2 py-1 text-xs focus:border-teal-500 focus:outline-none"
                          />
                          <button
                            onClick={() => handleSetDocumentVersion(v.id)}
                            disabled={savingVer}
                            className="rounded bg-teal-600 px-2 py-1 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                          >
                            {savingVer ? "…" : "Save"}
                          </button>
                          <button
                            onClick={() => setEditVerId(null)}
                            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500">Version {verLabel(v)}</span>
                          <button
                            onClick={() => startEditVer(v)}
                            className="inline-flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700"
                            title="Correct the audit-facing version label"
                          >
                            <Pencil className="h-3 w-3" /> Edit
                          </button>
                        </div>
                      )}
                      {editDateId === v.id ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <input
                            type="date"
                            value={editDateValue}
                            onChange={(e) => setEditDateValue(e.target.value)}
                            className="rounded border border-slate-300 px-2 py-1 text-xs focus:border-teal-500 focus:outline-none"
                          />
                          <button
                            onClick={() => handleSetEffectiveDate(v.id)}
                            disabled={savingDate}
                            className="rounded bg-teal-600 px-2 py-1 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                          >
                            {savingDate ? "…" : "Save"}
                          </button>
                          <button
                            onClick={() => setEditDateId(null)}
                            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-xs text-slate-500">
                            <CalendarDays className="h-3.5 w-3.5" /> Effective {fmtDate(v.effective_date)}
                          </span>
                          <button
                            onClick={() => startEditDate(v)}
                            className="inline-flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700"
                            title="Correct the effective date — for SOPs that existed before they were entered into the portal"
                          >
                            <Pencil className="h-3 w-3" /> Edit
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-3 px-1 text-xs text-slate-400">
              Approved versions are frozen — the database refuses content edits; changes always create a new version (latest: v{latestNumber}). The effective date can be corrected to reflect when the document actually took effect.
            </p>
          </div>
        )}
      </div>

      {/* Authoritative version banner — rendered from the DB columns, which are
          the single source of truth. The document body no longer restates these. */}
      {selected && (
        <div className="mb-4 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border border-slate-200 bg-slate-50/70 px-5 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Version</div>
            <div className="text-lg font-bold text-slate-900">{verLabel(selected)}</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Status</div>
            <div className="mt-0.5">{sopStatusChip(selected.status)}</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Effective date</div>
            <div className="mt-0.5 text-sm font-medium text-slate-700">
              {selected.status === "draft" ? "On approval" : fmtDate(selected.effective_date)}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Approved by</div>
            <div className="mt-0.5 text-sm font-medium text-slate-700">
              {selected.approved_by_name ?? "—"}
              {selected.approved_at ? ` · ${fmtDate(selected.approved_at)}` : ""}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white">
        {selected && selected.id !== sop.current_version_id && !editing && (
            <div className="border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-sm text-amber-800">
              You are viewing {verLabel(selected)} ({selected.status}) — not the current version.
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
            <article className="prose prose-slate max-w-none p-6 prose-headings:scroll-mt-4 prose-table:block prose-table:overflow-x-auto prose-th:whitespace-nowrap prose-th:break-normal prose-th:align-top prose-td:break-normal prose-td:align-top">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripVersionTable(selected.content_md)}</ReactMarkdown>
            </article>
          ) : (
            <div className="p-6 text-slate-500">No versions.</div>
          )}
      </div>

      {activateOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">
              Approve &amp; activate {verLabel({ document_version: activateDocVer || selected.document_version, version_number: selected.version_number })}?
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              This records you as the approver and makes this the official current version. The content can never be
              edited again — future changes need a new version.
            </p>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              Version number
              <input
                value={activateDocVer}
                onChange={(e) => setActivateDocVer(e.target.value)}
                placeholder="e.g. 2.0"
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
              />
              <span className="mt-1 block text-xs font-normal text-slate-400">
                The document's controlled version, shown to staff and auditors (independent of the internal sequence number).
              </span>
            </label>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              Effective date
              <input
                type="date"
                value={activateDate}
                onChange={(e) => setActivateDate(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
              />
              <span className="mt-1 block text-xs font-normal text-slate-400">
                Backdate this to when the document actually took effect if the SOP existed before it was entered into
                the portal.
              </span>
            </label>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setActivateOpen(false)}
                disabled={activating}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleActivate}
                disabled={activating}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {activating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Approve &amp; Activate
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog state={confirmState} onAnswer={handleAnswer} />
    </div>
  );
}
