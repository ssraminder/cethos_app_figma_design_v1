import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { RefreshCw, ShieldCheck, ShieldAlert, ShieldX, Clock, Ban, Loader2 } from "lucide-react";
import { format } from "date-fns";
import type { TabProps } from "./types";
import { getLanguageName } from "./data/languages";

// Matches cvp_translator_domains.domain CHECK + submit-application list.
// Labels kept short; staff see these many times a day.
const DOMAIN_LABELS: Record<string, string> = {
  legal: "Legal",
  certified_official: "Certified / Official",
  immigration: "Immigration",
  medical: "Medical",
  life_sciences: "Life Sciences",
  pharmaceutical: "Pharmaceutical",
  financial: "Financial",
  insurance: "Insurance",
  technical: "Technical",
  it_software: "IT & Software",
  automotive_engineering: "Automotive & Engineering",
  energy: "Energy",
  marketing_advertising: "Marketing & Advertising",
  literary_publishing: "Literary & Publishing",
  academic_scientific: "Academic & Scientific",
  government_public: "Government & Public",
  business_corporate: "Business & Corporate",
  gaming_entertainment: "Gaming & Entertainment",
  media_journalism: "Media & Journalism",
  tourism_hospitality: "Tourism & Hospitality",
  general: "General",
  other: "Other",
};

interface TranslatorDomainRow {
  id: string;
  translator_id: string;
  source_language_id: string;
  target_language_id: string;
  domain: string;
  status:
    | "pending"
    | "in_review"
    | "approved"
    | "rejected"
    | "skip_manual_review"
    | "revoked";
  approval_source: "application" | "self_request" | "staff_manual";
  approved_at: string | null;
  rejected_at: string | null;
  cooldown_until: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined from languages table (we fetch these in a second query and merge).
  _src_code?: string;
  _tgt_code?: string;
}

interface LangRow {
  id: string;
  code: string;
  name: string;
}

const STATUS_STYLES: Record<
  TranslatorDomainRow["status"],
  { label: string; className: string; Icon: typeof ShieldCheck }
> = {
  approved: {
    label: "Approved",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Icon: ShieldCheck,
  },
  pending: {
    label: "Pending",
    className: "bg-gray-50 text-gray-700 border-gray-200",
    Icon: Clock,
  },
  in_review: {
    label: "In review",
    className: "bg-amber-50 text-amber-700 border-amber-200",
    Icon: ShieldAlert,
  },
  rejected: {
    label: "Rejected",
    className: "bg-red-50 text-red-700 border-red-200",
    Icon: ShieldX,
  },
  revoked: {
    label: "Revoked",
    className: "bg-gray-100 text-gray-500 border-gray-300",
    Icon: ShieldX,
  },
  skip_manual_review: {
    label: "Skip (manual)",
    className: "bg-sky-50 text-sky-700 border-sky-200",
    Icon: ShieldCheck,
  },
};

const SOURCE_LABELS: Record<TranslatorDomainRow["approval_source"], string> = {
  application: "via application",
  self_request: "via vendor request",
  staff_manual: "staff manual",
};

/**
 * VendorDomainsTab — read-only matrix of domain approvals for a vendor.
 *
 * T1 scope: view only. Staff "Add manual approval" + "Revoke" actions
 * are deferred until T2.
 *
 * Data source: cvp_translator_domains, joined with languages by id for
 * human-readable lang pair labels. We fetch the translator row first
 * (by vendor_id = vendor.id via email match, since cvp_translators has
 * no direct vendor_id FK today — this is the vendor-get-profile pattern).
 */
export default function VendorDomainsTab({ vendorData }: TabProps) {
  const { vendor } = vendorData;
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TranslatorDomainRow[]>([]);
  const [translatorId, setTranslatorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const handleRevoke = async (rowId: string, domainLabel: string) => {
    if (!confirm(`Revoke the ${domainLabel} approval? The vendor will no longer be eligible for jobs in this domain on this language pair.`)) {
      return;
    }
    setRevoking(rowId);
    try {
      const { error: updErr } = await supabase
        .from("cvp_translator_domains")
        .update({
          status: "revoked",
          updated_at: new Date().toISOString(),
        })
        .eq("id", rowId);
      if (updErr) throw new Error(updErr.message);
      toast.success(`${domainLabel} revoked`);
      setReloadKey((n) => n + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke");
    } finally {
      setRevoking(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // 1. Resolve cvp_translators.id by email match.
        const { data: trRow, error: trErr } = await supabase
          .from("cvp_translators")
          .select("id")
          .eq("email", vendor.email)
          .maybeSingle();
        if (trErr) throw new Error(trErr.message);
        if (!trRow) {
          if (!cancelled) {
            setTranslatorId(null);
            setRows([]);
          }
          return;
        }

        // 2. Fetch domain rows + the languages referenced.
        const { data: domainRows, error: dErr } = await supabase
          .from("cvp_translator_domains")
          .select(
            "id, translator_id, source_language_id, target_language_id, domain, status, approval_source, approved_at, rejected_at, cooldown_until, notes, created_at, updated_at",
          )
          .eq("translator_id", trRow.id)
          .order("status", { ascending: true })
          .order("domain", { ascending: true });
        if (dErr) throw new Error(dErr.message);

        const ids = Array.from(
          new Set(
            (domainRows ?? []).flatMap((r) => [
              r.source_language_id,
              r.target_language_id,
            ]),
          ),
        );
        const { data: langs } = ids.length
          ? await supabase
              .from("languages")
              .select("id, code, name")
              .in("id", ids)
          : { data: [] as LangRow[] };
        const langMap = new Map<string, LangRow>(
          ((langs ?? []) as LangRow[]).map((l) => [l.id, l]),
        );
        const hydrated = (domainRows ?? []).map((r) => ({
          ...(r as TranslatorDomainRow),
          _src_code: langMap.get(r.source_language_id)?.code,
          _tgt_code: langMap.get(r.target_language_id)?.code,
        }));

        if (!cancelled) {
          setTranslatorId(trRow.id);
          setRows(hydrated);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [vendor.email, reloadKey]);

  // Group rows by lang pair for the matrix view.
  const grouped = useMemo(() => {
    const map = new Map<string, TranslatorDomainRow[]>();
    for (const r of rows) {
      const key = `${r.source_language_id}|${r.target_language_id}`;
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    return Array.from(map.entries()).map(([key, rs]) => {
      const [srcId, tgtId] = key.split("|");
      const first = rs[0];
      return {
        pairKey: key,
        srcId,
        tgtId,
        srcCode: first._src_code,
        tgtCode: first._tgt_code,
        rows: rs,
      };
    });
  }, [rows]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading domain approvals…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
        <p className="text-sm text-red-600">Failed to load: {error}</p>
      </div>
    );
  }

  if (!translatorId) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
        <h3 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">
          Approved Domains
        </h3>
        <p className="text-sm text-gray-500">
          This vendor does not have a CETHOS Vendor Portal translator record
          yet. Domain approvals appear here after an application is approved
          through Recruitment.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Approved Domains ({rows.length})
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Domains this vendor can take jobs in, per language pair. Writes
            happen through the recruitment approval flow and the vendor
            portal Request-Test feature.
          </p>
        </div>
      </div>

      {grouped.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-8">
          No domain approvals recorded yet.
        </p>
      )}

      <div className="space-y-4">
        {grouped.map((g) => (
          <div
            key={g.pairKey}
            className="border border-gray-100 rounded-lg overflow-hidden"
          >
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-baseline gap-2">
              <span className="text-sm font-medium text-gray-900">
                {g.srcCode ? getLanguageName(g.srcCode) : "Unknown"} →{" "}
                {g.tgtCode ? getLanguageName(g.tgtCode) : "Unknown"}
              </span>
              <span className="text-xs text-gray-500 font-mono">
                ({g.srcCode} → {g.tgtCode})
              </span>
              <span className="ml-auto text-xs text-gray-500">
                {g.rows.length} domain{g.rows.length === 1 ? "" : "s"}
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-100 bg-white">
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">
                    Domain
                  </th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">
                    Source
                  </th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">
                    When
                  </th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {g.rows.map((r) => {
                  const s = STATUS_STYLES[r.status];
                  const Icon = s.Icon;
                  const cooldownActive =
                    r.status === "rejected" &&
                    r.cooldown_until &&
                    new Date(r.cooldown_until).getTime() > Date.now();
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-2 text-gray-800">
                        {DOMAIN_LABELS[r.domain] ?? r.domain}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${s.className}`}
                        >
                          <Icon className="w-3 h-3" />
                          {s.label}
                        </span>
                        {cooldownActive && r.cooldown_until && (
                          <div className="mt-1 text-[11px] text-gray-500">
                            Cooldown until{" "}
                            {format(new Date(r.cooldown_until), "MMM d, yyyy")}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600">
                        {SOURCE_LABELS[r.approval_source]}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">
                        {r.status === "approved" && r.approved_at
                          ? `Approved ${format(new Date(r.approved_at), "MMM d, yyyy")}`
                          : r.status === "rejected" && r.rejected_at
                          ? `Rejected ${format(new Date(r.rejected_at), "MMM d, yyyy")}`
                          : `Created ${format(new Date(r.created_at), "MMM d, yyyy")}`}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {(r.status === "approved" || r.status === "skip_manual_review") && (
                          <button
                            type="button"
                            onClick={() => handleRevoke(r.id, DOMAIN_LABELS[r.domain] ?? r.domain)}
                            disabled={revoking === r.id}
                            className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                            title="Revoke this domain approval"
                          >
                            {revoking === r.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Ban className="w-3.5 h-3.5" />
                            )}
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
