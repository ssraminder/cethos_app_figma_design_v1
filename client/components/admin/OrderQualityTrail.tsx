// OrderQualityTrail — shows the complaints + nonconformities/CAPA linked to an
// order (the "Quality review" trail on the project). Reads via
// quality-read:list_for_order. Linking is set when a complaint/NC is logged
// against this order in the Quality hub.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldAlert, Loader2, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Complaint {
  id: string; complaint_number: string; severity: string; status: string;
  summary: string; category: string; nonconformity_id: string | null;
}
interface Capa { capa_number: string; status: string }
interface NC {
  id: string; nc_number: string; title: string; severity: string; status: string;
  capa_count: number; capas?: Capa[];
}

const sevCls: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};
const chip = (t: string, cls: string) =>
  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{t}</span>;

export default function OrderQualityTrail({ orderId }: { orderId: string }) {
  const [loading, setLoading] = useState(true);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [ncs, setNcs] = useState<NC[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase.functions.invoke("quality-read", {
          body: { action: "list_for_order", order_id: orderId },
        });
        if (!active) return;
        const r = (data?.result as { complaints?: Complaint[]; nonconformities?: NC[] }) ?? {};
        setComplaints(r.complaints ?? []);
        setNcs(r.nonconformities ?? []);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [orderId]);

  const total = complaints.length + ncs.length;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-teal-600" />
          <h3 className="text-sm font-semibold text-gray-900">Quality — Complaints &amp; CAPA</h3>
          {total > 0 && <span className="text-[11px] font-medium text-gray-500">({total})</span>}
        </div>
        <Link to="/admin/quality" className="text-xs text-teal-600 hover:underline">Quality hub →</Link>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : total === 0 ? (
        <p className="text-xs text-gray-500">No complaints or nonconformities are linked to this order.</p>
      ) : (
        <div className="space-y-2">
          {complaints.map((c) => (
            <div key={c.id} className="border border-gray-100 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono text-gray-500">{c.complaint_number}</span>
                <span className="text-[11px] text-gray-400 uppercase tracking-wide">Complaint</span>
                {chip(c.severity, sevCls[c.severity] ?? sevCls.low)}
                {chip(c.status.replace(/_/g, " "), "bg-slate-100 text-slate-600")}
              </div>
              <div className="text-sm text-gray-800 mt-0.5">{c.summary}</div>
            </div>
          ))}
          {ncs.map((n) => (
            <Link key={n.id} to={`/admin/quality/nc/${n.id}`}
              className="flex items-start justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2 hover:bg-gray-50">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-gray-500">{n.nc_number}</span>
                  <span className="text-[11px] text-gray-400 uppercase tracking-wide">Nonconformity</span>
                  {chip(n.severity, sevCls[n.severity] ?? sevCls.low)}
                  {chip(n.status.replace(/_/g, " "), "bg-slate-100 text-slate-600")}
                  {n.capa_count > 0 && chip(`${n.capa_count} CAPA`, "bg-teal-50 text-teal-700")}
                </div>
                <div className="text-sm text-gray-800 mt-0.5">{n.title}</div>
                {n.capas && n.capas.length > 0 && (
                  <div className="text-[11px] text-gray-500 mt-1">
                    {n.capas.map((ca) => `${ca.capa_number} (${ca.status.replace(/_/g, " ")})`).join(" · ")}
                  </div>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-0.5" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
