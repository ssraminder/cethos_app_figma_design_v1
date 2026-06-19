// VendorRosterTab — staff view of an agency's BLINDED linguist roster.
// Staff see only: handle, competence label, language pairs, domains, roles,
// eligibility flag. Never real names / CVs / evidence. Staff can raise an
// evidence demand for a linguist; the agency releases docs into the locker.

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAdminAuthContext } from "@/context/AdminAuthContext";
import { toast } from "sonner";
import {
  Loader2, ShieldCheck, CheckCircle2, AlertCircle, FileSearch, Download, Inbox,
} from "lucide-react";
import type { TabProps } from "./types";

interface SafeLinguist {
  id: string;
  handle: string;
  competence_label: string | null;
  is_active: boolean;
  iso_attested: boolean;
  is_eligible: boolean;
  language_pairs: { source_language: string; target_language: string }[];
  domains: string[];
  roles: string[];
}
interface Demand {
  id: string; roster_linguist_id: string; handle: string | null;
  reason: string | null; status: string; raised_at: string; released_at: string | null;
}
interface Release {
  id: string; demand_id: string; evidence_kind: string | null;
  original_filename: string | null; file_mime: string | null; file_size: number | null; released_at: string;
}

export default function VendorRosterTab({ vendorData }: TabProps) {
  const vendorId = vendorData.vendor.id;
  const { session } = useAdminAuthContext();
  const staffId = (session as any)?.staffId ?? null;

  const [loading, setLoading] = useState(true);
  const [roster, setRoster] = useState<SafeLinguist[]>([]);
  const [demands, setDemands] = useState<Demand[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [error, setError] = useState("");
  const [demandTarget, setDemandTarget] = useState<SafeLinguist | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-roster-read", {
        body: { vendor_id: vendorId, staff_id: staffId },
      });
      if (error || !data?.success) { setError(data?.error || error?.message || "Failed to load roster"); }
      else {
        setRoster(data.roster ?? []);
        setDemands(data.demands ?? []);
        setReleases(data.releases ?? []);
        setError("");
      }
    } finally { setLoading(false); }
  }, [vendorId, staffId]);

  useEffect(() => { load(); }, [load]);

  const downloadRelease = async (releaseId: string) => {
    const { data, error } = await supabase.functions.invoke("admin-download-released-evidence", {
      body: { release_id: releaseId, staff_id: staffId },
    });
    if (error || !data?.success) { toast.error(data?.error || "Download failed"); return; }
    window.open(data.signed_url, "_blank");
  };

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>;

  const releasesByDemand = (demandId: string) => releases.filter((r) => r.demand_id === demandId);

  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-sm text-slate-700">
        <p className="font-medium flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-teal-600" /> Blinded roster</p>
        <p className="mt-1">
          This agency's roster is private. You see only an opaque handle, competence basis, language pairs,
          specializations and a readiness flag — never names, CVs, or evidence. To obtain ISO competence evidence
          for a specific linguist, raise a demand; the agency releases the documents into the locker below.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      )}

      {roster.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">This agency hasn't added any roster linguists yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="text-left px-3 py-2">Handle</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Competence</th>
                <th className="text-left px-3 py-2">Roles</th>
                <th className="text-left px-3 py-2">Pairs</th>
                <th className="text-left px-3 py-2">Specializations</th>
                <th className="text-right px-3 py-2">Evidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {roster.map((l) => (
                <tr key={l.id} className={l.is_active ? "" : "opacity-50"}>
                  <td className="px-3 py-2 font-medium text-gray-900">{l.handle}</td>
                  <td className="px-3 py-2">
                    {l.is_eligible ? (
                      <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 className="w-3.5 h-3.5" /> Ready</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-600"><AlertCircle className="w-3.5 h-3.5" /> Incomplete</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{l.competence_label ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-600">{l.roles.length ? l.roles.join(", ") : "—"}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {l.language_pairs.length ? l.language_pairs.map((p) => `${p.source_language}→${p.target_language}`).join(", ") : "—"}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{l.domains.length ? l.domains.join(", ") : "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => setDemandTarget(l)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100">
                      <FileSearch className="w-3.5 h-3.5" /> Demand evidence
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Demands + released-evidence locker */}
      {demands.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2"><Inbox className="w-4 h-4" /> Evidence demands</h4>
          <div className="space-y-2">
            {demands.map((d) => {
              const rels = releasesByDemand(d.id);
              return (
                <div key={d.id} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm">
                      <span className="font-medium text-gray-900">{d.handle ?? "Linguist"}</span>
                      {d.reason && <span className="text-gray-500"> — {d.reason}</span>}
                      <span className="text-[11px] text-gray-400 ml-2">{new Date(d.raised_at).toLocaleDateString()}</span>
                    </div>
                    <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${
                      d.status === "released" ? "bg-green-50 text-green-700 border border-green-200"
                      : d.status === "cancelled" ? "bg-gray-100 text-gray-500"
                      : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                      {d.status}
                    </span>
                  </div>
                  {rels.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {rels.map((r) => (
                        <button key={r.id} onClick={() => downloadRelease(r.id)}
                          className="flex items-center gap-2 text-xs text-teal-700 hover:underline">
                          <Download className="w-3.5 h-3.5" /> {r.original_filename ?? "evidence file"}
                          {r.evidence_kind ? ` (${r.evidence_kind})` : ""}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {demandTarget && (
        <DemandModal linguist={demandTarget} vendorId={vendorId} staffId={staffId}
          onClose={() => setDemandTarget(null)} onRaised={async () => { setDemandTarget(null); await load(); }} />
      )}
    </div>
  );
}

function DemandModal({ linguist, staffId, onClose, onRaised }: {
  linguist: SafeLinguist; vendorId: string; staffId: string | null;
  onClose: () => void; onRaised: () => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-raise-evidence-demand", {
        body: { roster_linguist_id: linguist.id, reason: reason.trim() || null, staff_id: staffId },
      });
      if (error || !data?.success) { toast.error(data?.error || "Failed to raise demand"); return; }
      toast.success("Evidence demand sent to the agency.");
      onRaised();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Demand evidence — {linguist.handle}</h3>
        </div>
        <div className="px-6 py-4 space-y-3">
          <p className="text-sm text-gray-600">
            The agency will be asked to release the ISO 17100 competence evidence for this linguist into the
            audit locker. They've contractually agreed to produce it on demand.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason / context (optional)</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
              placeholder="e.g. Client audit request for order ORD-2026-…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Send demand
          </button>
        </div>
      </div>
    </div>
  );
}
