// VendorPerformanceTab — per-linguist 360: the qms.linguist_performance_snapshot
// rollup, recent performance events, this linguist's nonconformities/CAPA, the
// qualification status, and any open re-qualification review. Reads via
// quality-read:linguist_performance. "Log complaint" prefills this vendor.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, RefreshCw, Plus, AlertTriangle, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { StatusBadge } from "@/components/admin/StatusBadge";
import LogComplaintModal from "@/components/admin/quality/LogComplaintModal";
import { toast } from "sonner";

const SEV_STYLE: Record<string, string> = {
  low: "bg-gray-100 text-gray-700", medium: "bg-amber-100 text-amber-800",
  high: "bg-red-100 text-red-800", critical: "bg-red-200 text-red-900",
};
const SevBadge = ({ s }: { s: string }) => <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${SEV_STYLE[s] || SEV_STYLE.low}`}>{s}</span>;
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—");

function Metric({ label, value, danger }: { label: string; value: any; danger?: boolean }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${danger ? "text-red-600" : "text-gray-900"}`}>{value}</div>
    </div>
  );
}

export default function VendorPerformanceTab({ vendorData }: { vendorData: any; onRefresh?: () => void }) {
  const vendorId = vendorData?.vendor?.id;
  const vendorName = vendorData?.vendor?.business_name || vendorData?.vendor?.full_name;
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [showComplaint, setShowComplaint] = useState(false);

  const load = useCallback(async () => {
    if (!vendorId) return;
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("quality-read", { body: { action: "linguist_performance", vendor_id: vendorId } });
      if (error) throw error;
      if (res?.success === false) throw new Error(res.error);
      setData(res?.result ?? null);
    } catch (err: any) {
      toast.error(`Failed to load performance: ${err?.message ?? "unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, [vendorId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center py-12 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const s = data?.snapshot ?? {};
  const events: any[] = data?.recent_events ?? [];
  const ncs: any[] = data?.nonconformities ?? [];
  const review = data?.open_review;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Performance &amp; quality monitoring</h2>
        <div className="flex gap-2">
          <button onClick={() => setShowComplaint(true)} className="flex items-center gap-1 px-3 py-2 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700"><Plus className="w-4 h-4" /> Log complaint</button>
          <button onClick={load} className="flex items-center gap-1 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"><RefreshCw className="w-4 h-4" /> Refresh</button>
        </div>
      </div>

      {review && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm">
          <AlertTriangle className="w-4 h-4" /> Open re-qualification review ({review.reason?.replace(/_/g, " ")}) — opened {fmtDate(review.created_at)}.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <Metric label="Projects" value={s.projects_completed ?? 0} />
        <Metric label="On-time" value={s.on_time_pct == null ? "—" : `${s.on_time_pct}%`} danger={s.on_time_pct != null && s.on_time_pct < 85} />
        <Metric label="Revisions" value={s.revision_findings ?? 0} />
        <Metric label="Complaints" value={s.client_complaints ?? 0} danger={(s.client_complaints ?? 0) > 0} />
        <Metric label="Compliments" value={s.client_compliments ?? 0} />
        <Metric label="Late" value={s.late_deliveries ?? 0} />
        <Metric label="High-sev" value={s.high_severity_events ?? 0} danger={(s.high_severity_events ?? 0) > 0} />
      </div>

      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-900">Nonconformities &amp; CAPA</div>
        {ncs.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-500">No nonconformities for this linguist.</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
              <th className="text-left px-4 py-2">NC</th><th className="text-left px-4 py-2">Title</th>
              <th className="text-left px-4 py-2">Severity</th><th className="text-left px-4 py-2">Status</th><th></th>
            </tr></thead>
            <tbody>
              {ncs.map((n) => (
                <tr key={n.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-900">{n.nc_number}</td>
                  <td className="px-4 py-2 text-gray-600 truncate max-w-xs">{n.title}</td>
                  <td className="px-4 py-2"><SevBadge s={n.severity} /></td>
                  <td className="px-4 py-2"><StatusBadge status={n.status} /></td>
                  <td className="px-4 py-2 text-right"><Link to={`/admin/quality/nc/${n.id}`} className="inline-flex items-center gap-1 text-xs text-teal-700 hover:underline">Open <ExternalLink className="w-3 h-3" /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-900">Recent performance events</div>
        {events.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-500">No performance events recorded yet.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {events.map((e) => (
              <li key={e.id} className="px-4 py-2 flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium text-gray-900">{e.event_type.replace(/_/g, " ")}</span>
                  {e.severity && <span className="ml-2"><SevBadge s={e.severity} /></span>}
                  <span className="text-gray-500 ml-2">{e.description}</span>
                </div>
                <span className="text-xs text-gray-400">{e.project_reference ?? ""} · {fmtDate(e.occurred_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <LogComplaintModal open={showComplaint} onClose={() => setShowComplaint(false)} onCreated={load}
        prefill={{ vendor_id: vendorId, vendor_name: vendorName }} />
    </div>
  );
}
