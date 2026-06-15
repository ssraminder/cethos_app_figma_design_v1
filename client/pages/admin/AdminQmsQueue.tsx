/**
 * AdminQmsQueue — /admin/qms/queue
 *
 * Reviews the latest auto-qualification run (qms-auto-qualify) and releases
 * auto-qualify rows into real qms records. The Apply action is gated
 * server-side: SOP-001 must be approved & active (the §3.1.1 signoff), and
 * the releasing staff member becomes qualified_by on every record while the
 * evidence stays machine-labelled (automated_pipeline_v1).
 *
 * Tabs: Auto-qualify / Escalate (human queue) / Chase (no CV) / Errors.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Loader2,
  ShieldCheck,
  AlertTriangle,
  FileQuestion,
  XCircle,
  ChevronDown,
  ChevronRight,
  PlayCircle,
  Mail,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAdminAuthContext } from "@/context/AdminAuthContext";
import { toast } from "sonner";
import { ConfirmDialog, useConfirmDialog } from "@/components/admin/ConfirmDialog";

type Decision = "auto_qualify" | "escalate" | "chase" | "error";

interface RunRow {
  id: string;
  mode: string;
  status: string;
  prompt_version: string;
  model: string | null;
  vendor_count: number | null;
  started_at: string;
}

interface ResultRow {
  id: string;
  vendor_id: string;
  status: string;
  decision: string | null;
  roles: string[] | null;
  basis_code: string | null;
  confidence: number | null;
  reasons: string[] | null;
  flags: string[] | null;
  applied_at: string | null;
  error: string | null;
  vendor: { name: string | null; email: string | null } | null;
}

const TABS: Array<{ key: Decision; label: string; icon: typeof ShieldCheck }> = [
  { key: "auto_qualify", label: "Auto-qualify", icon: ShieldCheck },
  { key: "escalate", label: "Needs human review", icon: AlertTriangle },
  { key: "chase", label: "No CV (chase)", icon: FileQuestion },
  { key: "error", label: "Errors", icon: XCircle },
];

const BASIS_LABELS: Record<string, string> = {
  t_a_degree_translation: "§3.1.4(a) translation degree",
  t_b_degree_other_plus_2y: "§3.1.4(b) degree + 2y",
  t_c_5y_experience: "§3.1.4(c) 5y experience",
};

export default function AdminQmsQueue() {
  const { session } = useAdminAuthContext();
  const staffId = (session as any)?.staffId ?? null;
  const { confirm, state: confirmState, handleAnswer } = useConfirmDialog();

  const [run, setRun] = useState<RunRow | null>(null);
  const [report, setReport] = useState<Record<string, any> | null>(null);
  const [tab, setTab] = useState<Decision>("auto_qualify");
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [chasing, setChasing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const invoke = async (body: Record<string, unknown>, fn = "qms-auto-qualify") => {
    const { data, error } = await supabase.functions.invoke(fn, { body });
    if (error) {
      // supabase.functions.invoke wraps non-2xx as FunctionsHttpError; pull the JSON body.
      const ctx = (error as any)?.context;
      try {
        const parsed = ctx ? await ctx.json() : null;
        if (parsed) return parsed;
      } catch { /* fall through */ }
      return { success: false, error: error.message };
    }
    return data;
  };

  const loadRun = async () => {
    setLoading(true);
    try {
      const r = await invoke({ action: "latest_run" });
      if (!r?.success || !r.run) {
        toast.error(r?.error ?? "No auto-qualification run found");
        return;
      }
      setRun(r.run);
      const rep = await invoke({ action: "report", run_id: r.run.id });
      if (rep?.success) setReport(rep);
      await loadResults(r.run.id, tab);
    } finally {
      setLoading(false);
    }
  };

  const loadResults = async (runId: string, decision: Decision) => {
    const r = await invoke({ action: "list_results", run_id: runId, decision, limit: 200 });
    if (!r?.success) {
      toast.error(r?.error ?? "Failed to load results");
      return;
    }
    setRows(r.results ?? []);
    setTotal(r.total ?? 0);
  };

  useEffect(() => { loadRun(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { if (run) loadResults(run.id, tab); /* eslint-disable-next-line */ }, [tab]);

  const unapplied = rows.filter((r) => r.decision === "auto_qualify" && !r.applied_at).length;

  const handleApply = async () => {
    if (!run || !staffId) return;
    const ok = await confirm({
      title: "Release auto-qualifications?",
      message:
        "This writes real qualification records (NDA bridge + evidence + role qualifications + language pairs) for every unapplied auto-qualify row, with you recorded as the releasing approver. Requires SOP-001 to be active.",
      confirmLabel: "Apply batch",
    });
    if (!ok) return;
    setApplying(true);
    try {
      let totalApplied = 0;
      for (let guard = 0; guard < 20; guard++) {
        const r = await invoke({ action: "apply", run_id: run.id, staff_id: staffId, limit: 25 });
        if (!r?.success) {
          if (r?.code === "SOP_NOT_ACTIVE") {
            toast.error(r.error, { duration: 8000 });
          } else {
            toast.error(r?.error ?? "Apply failed");
          }
          return;
        }
        totalApplied += r.applied ?? 0;
        if ((r.failed ?? []).length) {
          toast.warning(`${r.failed.length} row(s) failed — see reasons in the queue`, { duration: 8000 });
        }
        if ((r.remaining ?? 0) === 0) break;
      }
      toast.success(`${totalApplied} vendor(s) qualified`);
      await loadResults(run.id, tab);
    } finally {
      setApplying(false);
    }
  };

  // Document chase: chase tab → no-CV vendors; escalate tab → the
  // insufficient-evidence subset. Both fan out vendor-request-documents.
  const chaseCohort = tab === "chase" ? "chase" : "insufficient_evidence";
  const canChase = tab === "chase" || tab === "escalate";

  const handleChase = async () => {
    if (!run || !staffId) return;
    const pv = await invoke({ action: "preview", run_id: run.id, cohort: chaseCohort }, "qms-request-documents-bulk");
    if (!pv?.success) { toast.error(pv?.error ?? "Preview failed"); return; }
    if ((pv.eligible ?? 0) === 0) {
      toast.info(`No eligible vendors to request from${pv.already_requested ? ` (${pv.already_requested} already have an open request)` : ""}.`);
      return;
    }
    const itemLabels = (pv.items ?? []).map((i: { label: string }) => i.label).join("; ");
    const ok = await confirm({
      title: `Request documents from ${pv.eligible} vendor${pv.eligible === 1 ? "" : "s"}?`,
      message:
        `Each vendor gets a secure 30-day upload link asking for: ${itemLabels}. ` +
        `Sent in batches of 25. ${pv.already_requested ?? 0} vendor(s) with an open request are skipped (the reminder cron carries those forward).`,
      confirmLabel: `Send to ${pv.eligible}`,
    });
    if (!ok) return;
    setChasing(true);
    try {
      let totalSent = 0;
      let totalFailed = 0;
      for (let guard = 0; guard < 40; guard++) {
        const r = await invoke({ action: "send", run_id: run.id, cohort: chaseCohort, staff_id: staffId, limit: 25 }, "qms-request-documents-bulk");
        if (!r?.success) { toast.error(r?.error ?? "Send failed"); break; }
        totalSent += r.sent ?? 0;
        totalFailed += (r.failed ?? []).length;
        if ((r.remaining ?? 0) === 0) break;
      }
      if (totalFailed) toast.warning(`${totalFailed} request(s) failed to send.`, { duration: 8000 });
      toast.success(`Document request sent to ${totalSent} vendor(s).`);
    } finally {
      setChasing(false);
    }
  };

  const decisionCounts = (report?.by_decision ?? {}) as Record<string, number>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-teal-600" />
            Qualification Queue
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {run
              ? `Run ${run.id.slice(0, 8)} · ${run.prompt_version} · ${run.model ?? ""} · ${run.vendor_count ?? "?"} vendors · started ${new Date(run.started_at).toLocaleString()}`
              : "Latest auto-qualification run"}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Procedure: <Link to="/admin/sops" className="underline hover:text-slate-600">SOP-001 — How we qualify translators and revisers</Link>
          </p>
        </div>
        {tab === "auto_qualify" && (
          <button
            onClick={handleApply}
            disabled={applying || unapplied === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
            Apply {unapplied} auto-qualification{unapplied === 1 ? "" : "s"}
          </button>
        )}
        {canChase && (
          <button
            onClick={handleChase}
            disabled={chasing}
            title={tab === "chase"
              ? "Email no-CV vendors a secure link to upload their CV + credentials"
              : "Email insufficient-evidence vendors a secure link to upload degree / experience / certification evidence"}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {chasing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            Request documents
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        {TABS.map(({ key, label, icon: Icon }) => {
          const count = key === "error" ? (report?.by_status?.error ?? 0) : (decisionCounts[key] ?? 0);
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium ${
                tab === key ? "border-teal-600 bg-teal-50 text-teal-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
              <span className="ml-1 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{count}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-12 text-center text-slate-500">Nothing in this bucket.</div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 w-8"></th>
                <th className="px-4 py-2.5">Vendor</th>
                <th className="px-4 py-2.5 w-56">Basis</th>
                <th className="px-4 py-2.5 w-24">Confidence</th>
                <th className="px-4 py-2.5 w-32">Roles</th>
                <th className="px-4 py-2.5 w-40">Flags / status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <>
                  <tr key={r.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                    <td className="px-4 py-3 text-slate-400">
                      {expanded === r.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/vendors/${r.vendor_id}?tab=qms`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-slate-900 hover:text-teal-700 hover:underline"
                      >
                        {r.vendor?.name ?? r.vendor_id.slice(0, 8)}
                      </Link>
                      {r.vendor?.email && <div className="text-xs text-slate-400">{r.vendor.email}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{r.basis_code ? (BASIS_LABELS[r.basis_code] ?? r.basis_code) : "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{r.confidence != null ? Number(r.confidence).toFixed(2) : "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{(r.roles ?? []).join(", ") || "—"}</td>
                    <td className="px-4 py-3">
                      {r.applied_at ? (
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">applied</span>
                      ) : (
                        <span className="text-xs text-slate-500">{(r.flags ?? []).join(", ") || (r.error ? "error" : "—")}</span>
                      )}
                    </td>
                  </tr>
                  {expanded === r.id && (
                    <tr key={`${r.id}-detail`} className="bg-slate-50/60">
                      <td></td>
                      <td colSpan={5} className="px-4 py-3">
                        <ul className="list-disc pl-4 space-y-1 text-xs text-slate-600">
                          {(r.reasons ?? []).map((reason, i) => (<li key={i}>{reason}</li>))}
                          {r.error && <li className="text-red-600">{r.error}</li>}
                        </ul>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
          <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
            Showing {rows.length} of {total}. Escalated vendors: review the reasons, then record manually via the vendor's QMS tab.
          </div>
        </div>
      )}
      <ConfirmDialog state={confirmState} onAnswer={handleAnswer} />
    </div>
  );
}
