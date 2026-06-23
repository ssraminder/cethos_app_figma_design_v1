// RecruitmentApprovalQueue — live admin report of applicants who can be
// approved now (Ready) and engaged applicants who still need a qualifying basis
// (Need More Info). Reads recruitment-approval-queue on load + auto-refreshes
// every 2 minutes, so it always reflects current portal data. Each row links to
// the applicant's recruitment detail page to action.

import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  ShieldCheck, Loader2, RefreshCw, Search, ExternalLink, AlertTriangle, Stethoscope, ChevronRight,
} from "lucide-react";

interface QueueRow {
  id: string;
  application_number: string;
  full_name: string | null;
  country: string | null;
  status: string | null;
  target_langs: string | null;
  clinical: boolean;
  has_nda: boolean;
  approval_route: string | null;
  refs_received: number | null;
  real_passed_combos: number | null;
}

type Tab = "ready" | "needInfo";

const ROUTE_HINT: Record<string, string> = {
  "References (5+ yrs)": "Open References → confirm the letter documents 5+ yrs → Approve",
  "Degree (verified)": "Degree verified in QMS → Approve if a translation degree",
  "Degree (verify)": "Open Supporting Documents → verify the uploaded degree → Approve",
};

export default function RecruitmentApprovalQueue() {
  const [ready, setReady] = useState<QueueRow[]>([]);
  const [needInfo, setNeedInfo] = useState<QueueRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [tab, setTab] = useState<Tab>("ready");
  const [search, setSearch] = useState("");
  const [coaOnly, setCoaOnly] = useState(false);
  const [noNdaOnly, setNoNdaOnly] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("recruitment-approval-queue", { body: {} });
      if (error) throw new Error(error.message);
      const d = data as { success: boolean; ready?: QueueRow[]; needInfo?: QueueRow[]; counts?: Record<string, number>; error?: string };
      if (!d?.success) throw new Error(d?.error || "Failed to load");
      setReady(d.ready ?? []);
      setNeedInfo(d.needInfo ?? []);
      setCounts(d.counts ?? {});
      setRefreshedAt(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 120000); // auto-refresh every 2 minutes
    return () => clearInterval(t);
  }, [load]);

  const rows = tab === "ready" ? ready : needInfo;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (coaOnly && !r.clinical) return false;
      if (noNdaOnly && r.has_nda) return false;
      if (!q) return true;
      return (
        r.application_number.toLowerCase().includes(q) ||
        (r.full_name || "").toLowerCase().includes(q) ||
        (r.country || "").toLowerCase().includes(q) ||
        (r.target_langs || "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, coaOnly, noNdaOnly]);

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-cyan-600" />
          <h1 className="text-2xl font-semibold text-gray-900">Recruitment Approval Queue</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">
            {refreshedAt ? `Updated ${refreshedAt.toLocaleTimeString()}` : ""} · live, auto every 2 min
          </span>
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-md px-2.5 py-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Always-current list straight from the portal — no spreadsheet to regenerate. Click any applicant to verify and approve.
      </p>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 mb-4">
        <button
          onClick={() => setTab("ready")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === "ready" ? "border-cyan-600 text-cyan-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          Ready to Approve <span className="ml-1 text-xs bg-gray-100 rounded-full px-2 py-0.5">{counts.ready ?? ready.length}</span>
        </button>
        <button
          onClick={() => setTab("needInfo")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === "needInfo" ? "border-cyan-600 text-cyan-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          Need More Info <span className="ml-1 text-xs bg-gray-100 rounded-full px-2 py-0.5">{counts.needInfo ?? needInfo.length}</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, App #, country, language…"
            className="w-full text-sm border border-gray-300 rounded-md pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
        <label className="inline-flex items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" checked={coaOnly} onChange={(e) => setCoaOnly(e.target.checked)} className="rounded" />
          COA / clinical only
        </label>
        <label className="inline-flex items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" checked={noNdaOnly} onChange={(e) => setNoNdaOnly(e.target.checked)} className="rounded" />
          Missing NDA only
        </label>
        <span className="text-xs text-gray-400">{filtered.length} shown</span>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-3">{error}</div>
      )}

      {loading && ready.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-10 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading queue…
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-3 py-2">Application</th>
                <th className="text-left font-medium px-3 py-2">Country</th>
                <th className="text-left font-medium px-3 py-2">Target language(s)</th>
                <th className="text-center font-medium px-3 py-2">COA</th>
                <th className="text-center font-medium px-3 py-2">NDA</th>
                <th className="text-left font-medium px-3 py-2">{tab === "ready" ? "Route — what to do" : "Why / what to request"}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r) => (
                <tr key={r.id} className={`hover:bg-gray-50 ${r.clinical ? "bg-rose-50/40" : ""}`}>
                  <td className="px-3 py-2 align-top">
                    <Link to={`/admin/recruitment/${r.id}`} className="font-medium text-gray-900 hover:text-cyan-700">
                      {(r.full_name || "(no name)").trim()}
                    </Link>
                    <div className="text-xs text-gray-400 font-mono">{r.application_number}</div>
                  </td>
                  <td className="px-3 py-2 align-top text-gray-600">{r.country || "—"}</td>
                  <td className="px-3 py-2 align-top text-gray-600">{r.target_langs || "(not set)"}</td>
                  <td className="px-3 py-2 align-top text-center">
                    {r.clinical ? <Stethoscope className="h-4 w-4 text-rose-500 inline" /> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2 align-top text-center">
                    {r.has_nda ? (
                      <span className="text-xs text-green-700">Yes</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
                        <AlertTriangle className="h-3.5 w-3.5" /> No
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-gray-600">
                    {tab === "ready" ? (
                      <>
                        <span className="inline-block text-xs font-medium bg-cyan-50 text-cyan-700 rounded px-2 py-0.5 mb-0.5">{r.approval_route}</span>
                        <div className="text-xs text-gray-500">{r.approval_route ? ROUTE_HINT[r.approval_route] : ""}</div>
                      </>
                    ) : (
                      <div className="text-xs text-gray-500">
                        {r.real_passed_combos ? `Passed ${r.real_passed_combos} real test(s); ` : ""}
                        {r.refs_received ? `${r.refs_received} reference(s) in. ` : ""}
                        Request a translation degree OR references confirming 5+ yrs.
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-right">
                    <Link to={`/admin/recruitment/${r.id}`} className="inline-flex items-center text-cyan-600 hover:text-cyan-800">
                      Open <ChevronRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-gray-400">No applicants match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-3 flex items-center gap-1">
        <ExternalLink className="h-3 w-3" /> Ready = approvable now with on-file evidence (verify, ensure NDA, Approve). Need More Info = engaged but no qualifying basis yet — reach out for a degree or 5-yr references.
      </p>
    </div>
  );
}
