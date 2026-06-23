// AdminNonconformityDetail — the auditable CAPA record: nonconformity ->
// root-cause analysis -> corrective/preventive actions -> effectiveness check ->
// closure, with the immutable quality_event_log timeline. Reads via
// quality-read:get_nonconformity, writes via manage-quality.

import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Loader2, Plus, RefreshCw, ExternalLink, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { StatusBadge } from "@/components/admin/StatusBadge";
import AddCapaModal from "@/components/admin/quality/AddCapaModal";
import { toast } from "sonner";

const SEV_STYLE: Record<string, string> = {
  low: "bg-gray-100 text-gray-700", medium: "bg-amber-100 text-amber-800",
  high: "bg-red-100 text-red-800", critical: "bg-red-200 text-red-900",
};
const SevBadge = ({ s }: { s: string }) => <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${SEV_STYLE[s] || SEV_STYLE.low}`}>{s}</span>;
const NC_STATUSES = ["open", "investigating", "capa_planned", "capa_in_progress", "verifying", "closed"];
const CAPA_STATUSES = ["open", "in_progress", "done", "verified", "cancelled"];
const fmtDateTime = (d?: string | null) => (d ? new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—");

export default function AdminNonconformityDetail() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<any>(null);
  const [showCapa, setShowCapa] = useState(false);

  const [rootCause, setRootCause] = useState("");
  const [rcMethod, setRcMethod] = useState("5_whys");
  const [closureSummary, setClosureSummary] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("quality-read", { body: { action: "get_nonconformity", id } });
      if (error) throw error;
      if (res?.success === false) throw new Error(res.error);
      setData(res?.result ?? null);
      setRootCause(res?.result?.nonconformity?.root_cause ?? "");
      setRcMethod(res?.result?.nonconformity?.root_cause_method ?? "5_whys");
    } catch (err: any) {
      toast.error(`Failed to load nonconformity: ${err?.message ?? "unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const call = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("manage-quality", { body });
      if (error) throw error;
      if (res?.success === false) throw new Error(res.error);
      toast.success(ok);
      await load();
    } catch (err: any) {
      toast.error(`Action failed: ${err?.message ?? "unknown error"}`);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-[#f6f9fc] flex items-center justify-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!data?.nonconformity) return <div className="min-h-screen bg-[#f6f9fc] p-6 text-gray-500">Nonconformity not found.</div>;

  const nc = data.nonconformity;
  const complaint = data.complaint;
  const capas: any[] = data.capa_actions ?? [];
  const timeline: any[] = data.timeline ?? [];

  return (
    <div className="min-h-screen bg-[#f6f9fc] p-6">
      <Link to="/admin/quality" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"><ArrowLeft className="w-4 h-4" /> Back to Quality &amp; performance</Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">{nc.nc_number}</h1>
            <SevBadge s={nc.severity} />
            <StatusBadge status={nc.status} />
          </div>
          <p className="text-gray-700 mt-1">{nc.title}</p>
          <p className="text-xs text-gray-500 mt-1">
            Source: {nc.source?.replace(/_/g, " ")} · Discovered {fmtDate(nc.discovered_at)}
            {nc.vendor_name && <> · Linguist: <Link to={`/admin/vendors/${nc.vendor_id}?tab=performance`} className="text-teal-700 hover:underline">{nc.vendor_name}</Link></>}
            {nc.order_number && <> · {nc.order_number}</>}
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"><RefreshCw className="w-4 h-4" /> Refresh</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {nc.description && (
            <section className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-2">Description</h2>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{nc.description}</p>
            </section>
          )}

          {complaint && (
            <section className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-2">Linked complaint</h2>
              <p className="text-sm text-gray-700"><span className="font-medium">{complaint.complaint_number}</span> — {complaint.summary}</p>
            </section>
          )}

          {/* Root cause */}
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Root-cause analysis</h2>
            <div className="flex gap-3 mb-2">
              <select value={rcMethod} onChange={(e) => setRcMethod(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="5_whys">5 whys</option><option value="fishbone">Fishbone</option><option value="other">Other</option>
              </select>
              {nc.root_cause_at && <span className="text-xs text-gray-400 self-center">Recorded {fmtDate(nc.root_cause_at)}</span>}
            </div>
            <textarea value={rootCause} onChange={(e) => setRootCause(e.target.value)} rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Why did this happen? Identify the underlying cause." />
            <div className="mt-2">
              <button disabled={busy || !rootCause.trim()} onClick={() => call({ action: "set_root_cause", id, root_cause: rootCause, method: rcMethod }, "Root cause saved.")}
                className="px-3 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50">Save root cause</button>
            </div>
          </section>

          {/* CAPA actions */}
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">CAPA actions</h2>
              <button onClick={() => setShowCapa(true)} className="flex items-center gap-1 text-sm text-teal-700 hover:underline"><Plus className="w-4 h-4" /> Add action</button>
            </div>
            {capas.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500">No CAPA actions yet.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {capas.map((ca) => (
                  <div key={ca.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">{ca.action_type}</span>
                        <span className="text-sm font-medium text-gray-900">{ca.capa_number}</span>
                        <StatusBadge status={ca.status} />
                      </div>
                      <span className="text-xs text-gray-500">Due {fmtDate(ca.due_date)}</span>
                    </div>
                    <p className="text-sm text-gray-700 mt-1">{ca.description}</p>
                    <div className="text-xs text-gray-400 mt-1">Owner: {ca.owner_name ?? "—"}{ca.effectiveness_result ? ` · Effectiveness: ${ca.effectiveness_result}` : ""}</div>
                    <div className="flex items-center gap-2 mt-2">
                      <select value={ca.status} disabled={busy} onChange={(e) => call({ action: "update_capa", payload: { id: ca.id, status: e.target.value } }, "CAPA updated.")}
                        className="border border-gray-300 rounded-lg px-2 py-1 text-xs">
                        {CAPA_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                      </select>
                      {(ca.status === "done" || ca.status === "verified") && (
                        <select value={ca.effectiveness_result ?? ""} disabled={busy}
                          onChange={(e) => call({ action: "update_capa", payload: { id: ca.id, effectiveness_result: e.target.value } }, "Effectiveness recorded.")}
                          className="border border-gray-300 rounded-lg px-2 py-1 text-xs">
                          <option value="">Effectiveness…</option><option value="pending">Pending</option><option value="effective">Effective</option><option value="not_effective">Not effective</option>
                        </select>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right column: status control + timeline */}
        <div className="space-y-6">
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Status</h2>
            <select value={nc.status} disabled={busy}
              onChange={(e) => call({ action: "update_nc_status", id, status: e.target.value, summary: e.target.value === "closed" ? closureSummary : null }, "Status updated.")}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2">
              {NC_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </select>
            <textarea value={closureSummary} onChange={(e) => setClosureSummary(e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Closure summary (when closing)" />
          </section>

          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">Audit trail <ShieldCheck className="w-4 h-4 text-gray-300" /></h2>
            <ol className="space-y-3">
              {timeline.map((e) => (
                <li key={e.id} className="text-xs border-l-2 border-gray-200 pl-3">
                  <div className="text-gray-900 font-medium">{e.entity_type} · {e.action.replace(/_/g, " ")}</div>
                  <div className="text-gray-500">{e.prior_status ? `${e.prior_status} → ${e.new_status ?? "—"}` : (e.new_status ?? "")}</div>
                  <div className="text-gray-400">{fmtDateTime(e.performed_at)}</div>
                </li>
              ))}
              {timeline.length === 0 && <li className="text-xs text-gray-400">No events yet.</li>}
            </ol>
          </section>
        </div>
      </div>

      {id && <AddCapaModal open={showCapa} onClose={() => setShowCapa(false)} nonconformityId={id} onCreated={load} />}
    </div>
  );
}
