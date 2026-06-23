// AdminQualityHub — the Quality & performance landing page (ISO §3.1.8 / §4.6,
// IQVIA "CAPA Management & Complaints Handling"). Reads via quality-read:dashboard
// + list_complaints. Lets staff log complaints, escalate them to nonconformities,
// and drill into the NC/CAPA detail. "Linguists to watch" surfaces the
// qms.linguist_performance_snapshot rollup.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, RefreshCw, Plus, AlertTriangle, ClipboardList, ShieldCheck, UserCog, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { StatCard } from "@/components/admin/StatCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import LogComplaintModal from "@/components/admin/quality/LogComplaintModal";
import NewNonconformityModal from "@/components/admin/quality/NewNonconformityModal";
import { toast } from "sonner";

const SEV_STYLE: Record<string, string> = {
  low: "bg-gray-100 text-gray-700",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-red-100 text-red-800",
  critical: "bg-red-200 text-red-900",
};
function SevBadge({ s }: { s: string }) {
  return <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${SEV_STYLE[s] || SEV_STYLE.low}`}>{s}</span>;
}
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—");

export default function AdminQualityHub() {
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<any>(null);
  const [complaints, setComplaints] = useState<any[]>([]);
  const [showComplaint, setShowComplaint] = useState(false);
  const [ncModal, setNcModal] = useState<any | null>(null); // prefill or {} for blank

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, compRes] = await Promise.all([
        supabase.functions.invoke("quality-read", { body: { action: "dashboard" } }),
        supabase.functions.invoke("quality-read", { body: { action: "list_complaints" } }),
      ]);
      if (dashRes.error) throw dashRes.error;
      if (dashRes.data?.success === false) throw new Error(dashRes.data.error);
      setDashboard(dashRes.data?.result ?? null);
      setComplaints((compRes.data?.result ?? []).filter((c: any) => ["new", "triaged"].includes(c.status)));
    } catch (err: any) {
      toast.error(`Failed to load quality data: ${err?.message ?? "unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const m = dashboard?.metrics ?? {};
  const register: any[] = dashboard?.register ?? [];
  const watch: any[] = dashboard?.linguists_to_watch ?? [];

  return (
    <div className="min-h-screen bg-[#f6f9fc] p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-teal-600" />
            Quality &amp; performance
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Complaints, nonconformities &amp; CAPA, and per-linguist performance monitoring — every change audit-logged.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowComplaint(true)} className="flex items-center gap-2 px-3 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700">
            <Plus className="w-4 h-4" /> Log complaint
          </button>
          <button onClick={() => setNcModal({})} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
            <Plus className="w-4 h-4" /> New nonconformity
          </button>
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Open complaints" value={m.open_complaints ?? 0} icon={AlertTriangle} color="amber" loading={loading} />
        <StatCard label="Open nonconformities" value={m.open_nonconformities ?? 0} icon={ClipboardList} color="indigo" loading={loading} />
        <StatCard label="CAPA due ≤14d" value={m.capa_due_14d ?? 0} icon={ShieldCheck} color="teal" loading={loading}
          subtext={m.capa_overdue ? `${m.capa_overdue} overdue` : undefined} valueColor={m.capa_overdue ? "text-red-600" : undefined} />
        <StatCard label="Linguists under review" value={m.linguists_under_review ?? 0} icon={UserCog} color="red" loading={loading} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <div className="space-y-6">
          {/* Open complaints */}
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-900">Open complaints</div>
            {complaints.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500">No open complaints.</div>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
                  <th className="text-left px-4 py-2">Complaint</th><th className="text-left px-4 py-2">Linguist</th>
                  <th className="text-left px-4 py-2">Category</th><th className="text-left px-4 py-2">Severity</th>
                  <th className="text-left px-4 py-2">Status</th><th className="text-right px-4 py-2">Action</th>
                </tr></thead>
                <tbody>
                  {complaints.map((c) => (
                    <tr key={c.id} className="border-b border-gray-100">
                      <td className="px-4 py-2"><div className="font-medium text-gray-900">{c.complaint_number}</div><div className="text-gray-500 truncate max-w-xs">{c.summary}</div></td>
                      <td className="px-4 py-2 text-gray-600">{c.vendor_name ?? "—"}</td>
                      <td className="px-4 py-2 text-gray-600">{c.category ?? "—"}</td>
                      <td className="px-4 py-2"><SevBadge s={c.severity} /></td>
                      <td className="px-4 py-2"><StatusBadge status={c.status} /></td>
                      <td className="px-4 py-2 text-right">
                        <button onClick={() => setNcModal({ source_complaint_id: c.id, complaint_number: c.complaint_number, vendor_id: c.vendor_id, vendor_name: c.vendor_name, title: c.summary, severity: c.severity, source: "complaint" })}
                          className="text-xs px-2.5 py-1 border border-gray-300 rounded-lg hover:bg-gray-50">Raise NC</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* NC + CAPA register */}
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-900 flex items-center gap-2">
              Open nonconformities &amp; CAPA
              <ShieldCheck className="w-4 h-4 text-gray-300" /><span className="text-xs font-normal text-gray-400">audit-logged</span>
            </div>
            {register.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500">No open nonconformities.</div>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
                  <th className="text-left px-4 py-2">Nonconformity</th><th className="text-left px-4 py-2">Linguist</th>
                  <th className="text-left px-4 py-2">Severity</th><th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Next CAPA due</th><th className="text-right px-4 py-2"></th>
                </tr></thead>
                <tbody>
                  {register.map((n) => (
                    <tr key={n.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2"><div className="font-medium text-gray-900">{n.nc_number}</div><div className="text-gray-500 truncate max-w-xs">{n.title}</div></td>
                      <td className="px-4 py-2 text-gray-600">{n.vendor_name ?? "—"}</td>
                      <td className="px-4 py-2"><SevBadge s={n.severity} /></td>
                      <td className="px-4 py-2"><StatusBadge status={n.status} /></td>
                      <td className="px-4 py-2 text-gray-600">{fmtDate(n.next_due)}</td>
                      <td className="px-4 py-2 text-right">
                        <Link to={`/admin/quality/nc/${n.id}`} className="inline-flex items-center gap-1 text-xs text-teal-700 hover:underline">Open <ExternalLink className="w-3 h-3" /></Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Linguists to watch */}
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-900">Linguists to watch</div>
            {watch.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500">No linguists with quality signals yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
                  <th className="text-left px-4 py-2">Linguist</th><th className="text-right px-4 py-2">On-time</th>
                  <th className="text-right px-4 py-2">Revisions</th><th className="text-right px-4 py-2">Complaints</th>
                  <th className="text-right px-4 py-2">Late</th><th className="text-left px-4 py-2 pl-6">Status</th><th></th>
                </tr></thead>
                <tbody>
                  {watch.map((w) => (
                    <tr key={w.vendor_id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium text-gray-900">{w.vendor_name}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{w.on_time_pct == null ? "—" : `${w.on_time_pct}%`}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{w.revision_findings}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{w.client_complaints}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{w.late_deliveries}</td>
                      <td className="px-4 py-2 pl-6">{w.under_review ? <StatusBadge status="draft_review" label="Under review" /> : <StatusBadge status="active" label="Qualified" />}</td>
                      <td className="px-4 py-2 text-right">
                        <Link to={`/admin/vendors/${w.vendor_id}?tab=performance`} className="inline-flex items-center gap-1 text-xs text-teal-700 hover:underline">View <ExternalLink className="w-3 h-3" /></Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}

      <LogComplaintModal open={showComplaint} onClose={() => setShowComplaint(false)} onCreated={load} />
      {ncModal && <NewNonconformityModal open={true} onClose={() => setNcModal(null)} onCreated={load} prefill={ncModal} />}
    </div>
  );
}
