/**
 * AdminTestSources — /admin/qms/test-sources (Test Sources tab of the QMS Hub).
 *
 * Versioned store of the English qualification-test source documents
 * (cvp_test_library). Every edit auto-creates a new immutable version
 * (cvp_test_source_versions, append-only) so an auditor can prove exactly which
 * source + version an applicant was tested on. All management goes through the
 * manage-test-sources edge function.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Loader2,
  FlaskConical,
  X as XIcon,
  History,
  Save,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAdminAuthContext } from "@/context/AdminAuthContext";
import { toast } from "sonner";
import { QmsFilterBar } from "@/components/admin/QmsFilterBar";

interface SourceListItem {
  id: string;
  title: string;
  domain: string;
  service_type: string;
  difficulty: string;
  is_active: boolean;
  version_number: number;
  source_language: string | null;
  target_language: string | null;
  times_used: number | null;
  last_used_at: string | null;
  updated_at: string | null;
  source_preview: string;
}

interface SourceVersion {
  id: string;
  version_number: number;
  title: string | null;
  source_text: string | null;
  instructions: string | null;
  reference_translation: string | null;
  ai_assessment_rubric: string | null;
  change_reason: string | null;
  created_by_name: string | null;
  created_at: string;
}

interface SourceFull extends SourceListItem {
  source_text: string | null;
  instructions: string | null;
  reference_translation: string | null;
  ai_assessment_rubric: string | null;
}

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";

const prettyDomain = (d: string) =>
  d.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function chip(text: string, cls: string) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>{text}</span>;
}

export default function AdminTestSources() {
  const { session } = useAdminAuthContext();
  const staffId = (session as any)?.staffId ?? null;

  const [sources, setSources] = useState<SourceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [domainFilter, setDomainFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-test-sources", { body: { action: "list" } });
      if (error || !data?.success) throw new Error(data?.error || error?.message || "Failed");
      setSources(data.sources ?? []);
    } catch (e: any) {
      toast.error(`Failed to load test sources: ${e.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const q = search.toLowerCase();
  const filtered = useMemo(
    () =>
      sources.filter(
        (s) =>
          (!activeOnly || s.is_active) &&
          (!domainFilter || s.domain === domainFilter) &&
          (!q ||
            s.title.toLowerCase().includes(q) ||
            s.domain.toLowerCase().includes(q) ||
            (s.target_language ?? "").toLowerCase().includes(q) ||
            s.source_preview.toLowerCase().includes(q)),
      ),
    [sources, q, activeOnly, domainFilter],
  );

  const domainOptions = useMemo(
    () =>
      [...new Set(sources.map((s) => s.domain))]
        .sort((a, b) => a.localeCompare(b))
        .map((d) => ({ value: d, label: prettyDomain(d) })),
    [sources],
  );

  const byDomain = useMemo(() => {
    const m = new Map<string, SourceListItem[]>();
    for (const s of filtered) {
      if (!m.has(s.domain)) m.set(s.domain, []);
      m.get(s.domain)!.push(s);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const activeCount = sources.filter((s) => s.is_active).length;

  return (
    <div className="max-w-6xl mx-auto px-6 py-6">
      {/* Page header */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-teal-600" /> Test Sources
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            English qualification-test samples — fully versioned. Every edit records a new immutable version.
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p><span className="font-semibold text-slate-700">{sources.length}</span> sources</p>
          <p>{activeCount} active</p>
        </div>
      </div>

      {/* Controls */}
      <div className="mt-4">
        <QmsFilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by title, domain, language, content…"
          resultCount={filtered.length}
          totalCount={sources.length}
          selects={[
            { id: "domain", label: "All domains", value: domainFilter, onChange: setDomainFilter, options: domainOptions },
          ]}
          toggles={[
            { id: "active", label: "Active only", checked: activeOnly, onChange: setActiveOnly },
          ]}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : byDomain.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-12 text-center text-slate-500 text-sm">
          {search ? `No test sources match "${search}"` : "No test sources found"}
        </div>
      ) : (
        <div className="space-y-6 pb-8">
          {byDomain.map(([domain, items]) => (
            <div key={domain}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                {prettyDomain(domain)} <span className="text-slate-400">· {items.length}</span>
              </h3>
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5">Title</th>
                      <th className="px-4 py-2.5 w-40 hidden md:table-cell">Target</th>
                      <th className="px-4 py-2.5 w-28 hidden lg:table-cell">Difficulty</th>
                      <th className="px-4 py-2.5 w-20">Version</th>
                      <th className="px-4 py-2.5 w-24">Status</th>
                      <th className="px-4 py-2.5 w-16 hidden lg:table-cell">Used</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((s) => (
                      <tr key={s.id} onClick={() => setSelectedId(s.id)} className="cursor-pointer hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">{s.title}</p>
                          <p className="text-xs text-slate-400 line-clamp-1">{s.source_preview}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 hidden md:table-cell">
                          {s.target_language ?? <span className="text-slate-400">Any (wildcard)</span>}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          {chip(s.difficulty, "bg-slate-100 text-slate-600 border-slate-200 capitalize")}
                        </td>
                        <td className="px-4 py-3">{chip(`v${s.version_number}`, "bg-teal-50 text-teal-700 border-teal-200")}</td>
                        <td className="px-4 py-3">
                          {s.is_active
                            ? chip("Active", "bg-emerald-50 text-emerald-700 border-emerald-200")
                            : chip("Inactive", "bg-slate-100 text-slate-500 border-slate-200")}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 hidden lg:table-cell">{s.times_used ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedId && (
        <SourceDetail
          id={selectedId}
          staffId={staffId}
          onClose={() => setSelectedId(null)}
          onSaved={() => { load(); }}
        />
      )}
    </div>
  );
}

// ── Detail / editor modal ─────────────────────────────────────────────────────

function SourceDetail({
  id, staffId, onClose, onSaved,
}: {
  id: string;
  staffId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [source, setSource] = useState<SourceFull | null>(null);
  const [versions, setVersions] = useState<SourceVersion[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [viewVersion, setViewVersion] = useState<SourceVersion | null>(null);

  // editable fields
  const [title, setTitle] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [instructions, setInstructions] = useState("");
  const [referenceTranslation, setReferenceTranslation] = useState("");
  const [rubric, setRubric] = useState("");
  const [changeReason, setChangeReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-test-sources", { body: { action: "get", id } });
      if (error || !data?.success) throw new Error(data?.error || error?.message || "Failed");
      const s: SourceFull = data.source;
      setSource(s);
      setVersions(data.versions ?? []);
      setTitle(s.title ?? "");
      setSourceText(s.source_text ?? "");
      setInstructions(s.instructions ?? "");
      setReferenceTranslation(s.reference_translation ?? "");
      setRubric(s.ai_assessment_rubric ?? "");
      setChangeReason("");
    } catch (e: any) {
      toast.error(`Failed to load source: ${e.message ?? e}`);
      onClose();
    } finally {
      setLoading(false);
    }
  }, [id, onClose]);

  useEffect(() => { load(); }, [load]);

  const dirty =
    !!source &&
    (title !== (source.title ?? "") ||
      sourceText !== (source.source_text ?? "") ||
      instructions !== (source.instructions ?? "") ||
      referenceTranslation !== (source.reference_translation ?? "") ||
      rubric !== (source.ai_assessment_rubric ?? ""));

  const save = async () => {
    if (!staffId) { toast.error("No staff session — cannot save."); return; }
    if (!sourceText.trim()) { toast.error("Source text is required."); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-test-sources", {
        body: {
          action: "save",
          id,
          title,
          source_text: sourceText,
          instructions,
          reference_translation: referenceTranslation,
          ai_assessment_rubric: rubric,
          change_reason: changeReason || null,
          staff_id: staffId,
        },
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || "Failed");
      if (data.unchanged) {
        toast.info("No changes to save.");
      } else {
        toast.success(`Saved as v${data.version?.version_number}.`);
        onSaved();
      }
      await load();
    } catch (e: any) {
      toast.error(`Save failed: ${e.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (is_active: boolean) => {
    if (!staffId) { toast.error("No staff session."); return; }
    try {
      const { data, error } = await supabase.functions.invoke("manage-test-sources", {
        body: { action: "set_active", id, is_active, staff_id: staffId },
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || "Failed");
      toast.success(is_active ? "Marked active." : "Marked inactive.");
      onSaved();
      await load();
    } catch (e: any) {
      toast.error(`Failed: ${e.message ?? e}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-2xl h-full bg-white shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {loading || !source ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : (
          <div>
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-start justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {chip(`v${source.version_number}`, "bg-teal-50 text-teal-700 border-teal-200")}
                  {source.is_active
                    ? chip("Active", "bg-emerald-50 text-emerald-700 border-emerald-200")
                    : chip("Inactive", "bg-slate-100 text-slate-500 border-slate-200")}
                  <span className="text-xs text-slate-400">{prettyDomain(source.domain)}</span>
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  {source.source_language ?? "English"} →{" "}
                  {source.target_language ?? "Any target (wildcard)"} · {source.service_type} · {source.difficulty}
                </p>
              </div>
              <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <Field label="Title">
                <input value={title} onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none" />
              </Field>

              <Field label="Source text (English sample sent to the applicant)">
                <textarea value={sourceText} onChange={(e) => setSourceText(e.target.value)} rows={10}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-teal-500 focus:outline-none" />
              </Field>

              <Field label="Instructions (shown to the translator)">
                <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none" />
              </Field>

              <Field label="Reference translation (NULL for wildcard rows)">
                <textarea value={referenceTranslation} onChange={(e) => setReferenceTranslation(e.target.value)} rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none" />
              </Field>

              <Field label="AI assessment rubric">
                <textarea value={rubric} onChange={(e) => setRubric(e.target.value)} rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-teal-500 focus:outline-none" />
              </Field>

              <Field label="Change reason (recorded on the new version)">
                <input value={changeReason} onChange={(e) => setChangeReason(e.target.value)}
                  placeholder="e.g. Fixed a typo in paragraph 2"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none" />
              </Field>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={save}
                  disabled={!dirty || saving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save as new version
                </button>
                {source.is_active ? (
                  <button onClick={() => setActive(false)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                    <Circle className="w-4 h-4" /> Deactivate
                  </button>
                ) : (
                  <button onClick={() => setActive(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                    <CheckCircle2 className="w-4 h-4" /> Activate
                  </button>
                )}
                <button onClick={() => setShowHistory((v) => !v)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                  <History className="w-4 h-4" /> {versions.length} version{versions.length !== 1 ? "s" : ""}
                </button>
              </div>

              {/* Version history */}
              {showHistory && (
                <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                  {versions.map((v) => (
                    <div key={v.id} className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {chip(`v${v.version_number}`, "bg-slate-100 text-slate-700 border-slate-200")}
                          <span className="text-xs text-slate-500">
                            {v.created_by_name ?? "system"} · {fmtDate(v.created_at)}
                          </span>
                        </div>
                        <button
                          onClick={() => setViewVersion(viewVersion?.id === v.id ? null : v)}
                          className="text-xs text-teal-600 hover:text-teal-700"
                        >
                          {viewVersion?.id === v.id ? "Hide" : "View"}
                        </button>
                      </div>
                      {v.change_reason && <p className="text-xs text-slate-500 mt-1">{v.change_reason}</p>}
                      {viewVersion?.id === v.id && (
                        <pre className="mt-2 whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs text-slate-700 max-h-64 overflow-y-auto">
                          {v.source_text ?? "(empty)"}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
