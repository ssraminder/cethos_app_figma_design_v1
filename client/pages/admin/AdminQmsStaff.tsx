/**
 * AdminQmsStaff — /admin/qms/staff
 *
 * Documented competence for internal staff (ISO 17100 §3.1.7 project managers,
 * §3.1.6 in-house reviewers, and in-house linguists). Lists every active staff
 * member with their competence records and an add form. Staff are not vendors,
 * so this is separate from the vendor QMS tab.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, ShieldCheck, X as XIcon, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAdminAuthContext } from "@/context/AdminAuthContext";
import { toast } from "sonner";
import { ConfirmDialog, useConfirmDialog } from "@/components/admin/ConfirmDialog";
import { QmsFilterBar } from "@/components/admin/QmsFilterBar";

interface CompetenceRecord {
  id: string;
  function_code: string;
  iso_clause_reference: string | null;
  basis_kind: string;
  basis_summary: string;
  evidence_title: string | null;
  acquired_on: string | null;
  qualified_by_name: string | null;
  qualified_at: string;
}

interface StaffRow {
  id: string;
  full_name: string;
  email: string;
  role: string;
  competence: CompetenceRecord[];
}

const FUNCTIONS: Array<{ code: string; label: string }> = [
  { code: "project_manager", label: "Project Manager (§3.1.7)" },
  { code: "reviewer", label: "Reviewer (§3.1.6)" },
  { code: "translator", label: "Translator (§3.1.4)" },
  { code: "reviser", label: "Reviser (§3.1.5)" },
  { code: "vendor_manager", label: "Vendor Manager" },
  { code: "qms_admin", label: "QMS Admin" },
];
const BASIS_KINDS: Array<{ code: string; label: string }> = [
  { code: "formal_training", label: "Formal training" },
  { code: "higher_education", label: "Higher education" },
  { code: "on_the_job_training", label: "On-the-job training" },
  { code: "industry_experience", label: "Industry experience" },
  { code: "professional_membership", label: "Professional membership" },
  { code: "other", label: "Other" },
];
const fnLabel = (c: string) => FUNCTIONS.find((f) => f.code === c)?.label ?? c;
const basisLabel = (c: string) => BASIS_KINDS.find((b) => b.code === c)?.label ?? c;

export default function AdminQmsStaff() {
  const { session } = useAdminAuthContext();
  const staffId = (session as any)?.staffId ?? null;
  const { confirm, state: confirmState, handleAnswer } = useConfirmDialog();

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [formFor, setFormFor] = useState<StaffRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter((s) => {
      if (missingOnly && s.competence.length > 0) return false;
      if (q && !`${s.full_name} ${s.email} ${s.role}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [staff, search, missingOnly]);

  const [fnCode, setFnCode] = useState("project_manager");
  const [basisKind, setBasisKind] = useState("formal_training");
  const [basisSummary, setBasisSummary] = useState("");
  const [evidenceTitle, setEvidenceTitle] = useState("");
  const [acquiredOn, setAcquiredOn] = useState("");

  const invoke = async (b: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("manage-staff-competence", { body: b });
    if (error) return { success: false, error: error.message };
    return data;
  };

  const load = async () => {
    setLoading(true);
    try {
      const r = await invoke({ action: "list_all" });
      if (!r?.success) { toast.error(r?.error ?? "Failed to load"); return; }
      setStaff(r.staff ?? []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const openForm = (s: StaffRow) => {
    setFormFor(s);
    setFnCode("project_manager"); setBasisKind("formal_training");
    setBasisSummary(""); setEvidenceTitle(""); setAcquiredOn("");
  };

  const submit = async () => {
    if (!formFor || !staffId) return;
    if (!basisSummary.trim()) { toast.error("Describe how the competence was acquired"); return; }
    setSubmitting(true);
    try {
      const r = await invoke({
        action: "record",
        staff_id: formFor.id,
        function_code: fnCode,
        basis_kind: basisKind,
        basis_summary: basisSummary,
        evidence_title: evidenceTitle || null,
        acquired_on: acquiredOn || null,
        staff_id_acting: staffId,
      });
      if (!r?.success) { toast.error(r?.error ?? "Failed to record"); return; }
      toast.success(`Competence recorded for ${formFor.full_name}`);
      setFormFor(null);
      await load();
    } finally { setSubmitting(false); }
  };

  const withdraw = async (rec: CompetenceRecord, staffName: string) => {
    if (!staffId) return;
    const ok = await confirm({
      title: "Withdraw competence record?",
      message: `Withdraw "${fnLabel(rec.function_code)}" for ${staffName}? The record is kept (never deleted) but marked withdrawn.`,
      confirmLabel: "Withdraw",
      tone: "danger",
    });
    if (!ok) return;
    const r = await invoke({ action: "withdraw", id: rec.id, staff_id_acting: staffId });
    if (!r?.success) { toast.error(r?.error ?? "Failed"); return; }
    toast.success("Withdrawn");
    await load();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-teal-600" /> Staff Competence
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Documented competence for internal staff — project managers (§3.1.7), in-house reviewers (§3.1.6), and linguists.
        </p>
      </div>

      {!loading && staff.length > 0 && (
        <QmsFilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by staff name, email, role…"
          resultCount={filtered.length}
          totalCount={staff.length}
          toggles={[
            { id: "missing", label: "No competence on file", checked: missingOnly, onChange: setMissingOnly },
          ]}
        />
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500">
          {staff.length === 0 ? "No staff found." : "No staff match the current filters."}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((s) => (
            <div key={s.id} className="rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                <div>
                  <div className="font-medium text-slate-900">{s.full_name}</div>
                  <div className="text-xs text-slate-400">{s.email} · {s.role}</div>
                </div>
                <button
                  onClick={() => openForm(s)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Plus className="w-4 h-4" /> Record competence
                </button>
              </div>
              {s.competence.length === 0 ? (
                <div className="px-5 py-3 text-sm text-amber-700 bg-amber-50/50">
                  No documented competence on file.
                </div>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {s.competence.map((c) => (
                    <li key={c.id} className="flex items-start justify-between px-5 py-3">
                      <div className="text-sm">
                        <div className="font-medium text-slate-800">
                          {fnLabel(c.function_code)}
                          <span className="ml-2 text-xs font-normal text-slate-400">{c.iso_clause_reference}</span>
                        </div>
                        <div className="text-slate-600">{basisLabel(c.basis_kind)} — {c.basis_summary}</div>
                        {c.evidence_title && <div className="text-xs text-slate-400">Evidence: {c.evidence_title}</div>}
                        <div className="text-xs text-slate-400">
                          Recorded {new Date(c.qualified_at).toLocaleDateString()}{c.qualified_by_name ? ` by ${c.qualified_by_name}` : ""}
                        </div>
                      </div>
                      <button onClick={() => withdraw(c, s.full_name)} className="text-slate-400 hover:text-red-600" title="Withdraw">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {formFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-slate-900">Record competence — {formFor.full_name}</h3>
              <button onClick={() => setFormFor(null)} className="text-slate-400 hover:text-slate-600"><XIcon className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Function</label>
                  <select value={fnCode} onChange={(e) => setFnCode(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    {FUNCTIONS.map((f) => <option key={f.code} value={f.code}>{f.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">How acquired</label>
                  <select value={basisKind} onChange={(e) => setBasisKind(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    {BASIS_KINDS.map((b) => <option key={b.code} value={b.code}>{b.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Basis summary</label>
                <textarea value={basisSummary} onChange={(e) => setBasisSummary(e.target.value)} rows={3}
                  placeholder="e.g. 6 years managing translation projects at Cethos + internal PM onboarding."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Evidence title (optional)</label>
                  <input value={evidenceTitle} onChange={(e) => setEvidenceTitle(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Acquired on (optional)</label>
                  <input type="date" value={acquiredOn} onChange={(e) => setAcquiredOn(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 px-5 py-4">
              <button onClick={() => setFormFor(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={submit} disabled={submitting} className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50">
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Record
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog state={confirmState} onAnswer={handleAnswer} />
    </div>
  );
}
