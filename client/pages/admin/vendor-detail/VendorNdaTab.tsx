/**
 * VendorNdaTab — now the "Agreements" tab.
 *
 * Covers both agreement types sharing the nda_templates /
 * vendor_nda_signatures stack:
 *   - nda  — Vendor Confidentiality and Non-Solicitation Agreement
 *   - gvsa — General Vendor Service Agreement
 *
 * Plus the NDA clause-3.4 pre-existing client declarations review queue
 * (vendor_client_declarations): staff approve/reject with notes.
 */

import { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Download,
  Calendar,
  Globe,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Paperclip,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { TabProps } from "./types";

type AgreementType = "nda" | "gvsa";

const AGREEMENT_META: Record<AgreementType, { label: string; short: string }> = {
  nda: { label: "Confidentiality & Non-Solicitation Agreement", short: "NDA" },
  gvsa: { label: "General Vendor Service Agreement", short: "GVSA" },
};

interface NdaSignature {
  id: string;
  nda_template_id: string;
  agreement_type: AgreementType;
  signed_full_name: string;
  signed_email: string | null;
  signed_at: string;
  signer_ip: string | null;
  signer_user_agent: string | null;
  is_current: boolean;
  signed_html_snapshot: string;
  superseded_at: string | null;
  superseded_reason: string | null;
  created_at: string;
}

interface NdaTemplate {
  id: string;
  version_label: string;
  jurisdiction: string;
  title: string;
  body_html: string;
  effective_from: string;
  is_active: boolean;
  agreement_type: AgreementType;
}

interface EvidenceFile {
  path: string;
  name: string;
  size_bytes: number;
  content_type: string;
}

interface Declaration {
  id: string;
  client_name: string;
  relationship_details: string | null;
  first_engaged_date: string | null;
  evidence_files: EvidenceFile[];
  status: "pending" | "approved" | "rejected";
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export default function VendorNdaTab({ vendorData }: TabProps) {
  const vendorId = vendorData.vendor.id;
  const [loading, setLoading] = useState(true);
  const [signatures, setSignatures] = useState<NdaSignature[]>([]);
  const [activeTemplates, setActiveTemplates] = useState<Record<string, NdaTemplate>>({});
  const [templates, setTemplates] = useState<Record<string, NdaTemplate>>({});
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [reviewing, setReviewing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: sigs }, { data: actives }, { data: decls }] = await Promise.all([
      supabase
        .from("vendor_nda_signatures")
        .select(
          "id, nda_template_id, agreement_type, signed_full_name, signed_email, signed_at, signer_ip, signer_user_agent, is_current, signed_html_snapshot, superseded_at, superseded_reason, created_at",
        )
        .eq("vendor_id", vendorId)
        .order("signed_at", { ascending: false }),
      supabase
        .from("nda_templates")
        .select("*")
        .eq("is_active", true)
        .eq("jurisdiction", "global"),
      supabase
        .from("vendor_client_declarations")
        .select(
          "id, client_name, relationship_details, first_engaged_date, evidence_files, status, review_notes, reviewed_at, created_at",
        )
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false }),
    ]);

    const activeMap: Record<string, NdaTemplate> = {};
    for (const t of (actives ?? []) as NdaTemplate[]) activeMap[t.agreement_type] = t;

    // Pull templates referenced by signatures so we can label versions
    const tplIds = Array.from(
      new Set((sigs ?? []).map((s) => s.nda_template_id).filter(Boolean)),
    );
    const tplMap: Record<string, NdaTemplate> = {};
    if (tplIds.length > 0) {
      const { data: tpls } = await supabase
        .from("nda_templates")
        .select("*")
        .in("id", tplIds);
      for (const t of tpls ?? []) tplMap[(t as NdaTemplate).id] = t as NdaTemplate;
    }

    setSignatures((sigs ?? []) as NdaSignature[]);
    setActiveTemplates(activeMap);
    setTemplates(tplMap);
    setDeclarations((decls ?? []) as Declaration[]);
    setLoading(false);
  }, [vendorId]);

  useEffect(() => {
    load();
  }, [load]);

  const reviewDeclaration = async (decl: Declaration, status: "approved" | "rejected") => {
    const notes = window.prompt(
      status === "approved"
        ? `Approve "${decl.client_name}" as a pre-existing client? Optional note for the vendor:`
        : `Reject "${decl.client_name}"? Note for the vendor (recommended):`,
      decl.review_notes ?? "",
    );
    if (notes === null) return; // cancelled
    setReviewing(decl.id);
    try {
      const { data: userData } = await supabase.auth.getUser();
      let staffId: string | null = null;
      if (userData.user) {
        const { data } = await supabase
          .from("staff_users")
          .select("id")
          .eq("auth_user_id", userData.user.id)
          .maybeSingle();
        staffId = data?.id ?? null;
      }
      const { error } = await supabase
        .from("vendor_client_declarations")
        .update({
          status,
          review_notes: notes.trim() || null,
          reviewed_at: new Date().toISOString(),
          reviewed_by_staff_id: staffId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", decl.id);
      if (error) {
        window.alert(`Failed to update declaration: ${error.message}`);
        return;
      }
      await load();
    } finally {
      setReviewing(null);
    }
  };

  const openEvidence = async (file: EvidenceFile) => {
    const { data, error } = await supabase.storage
      .from("vendor-declarations")
      .createSignedUrl(file.path, 60 * 10);
    if (error || !data?.signedUrl) {
      window.alert(`Could not open file: ${error?.message ?? "no URL"}`);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const downloadSnapshot = (sig: NdaSignature) => {
    const docLabel = AGREEMENT_META[sig.agreement_type]?.short ?? "agreement";
    const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Cethos ${docLabel} — signed copy (${vendorData.vendor.full_name ?? ""})</title>
<style>body{font-family:Georgia,serif;max-width:780px;margin:40px auto;padding:0 24px;line-height:1.55;color:#222}h1,h2,h3{font-family:-apple-system,BlinkMacSystemFont,sans-serif}.meta{background:#f6f6f6;padding:14px 18px;border-left:3px solid #888;margin:24px 0;font-family:-apple-system,monospace;font-size:13px}.meta b{display:inline-block;width:140px}</style>
</head><body>
<div class="meta">
  <div><b>Document:</b> ${escapeHtml(AGREEMENT_META[sig.agreement_type]?.label ?? sig.agreement_type)}</div>
  <div><b>Signed by:</b> ${escapeHtml(sig.signed_full_name)}</div>
  <div><b>Email:</b> ${escapeHtml(sig.signed_email ?? "—")}</div>
  <div><b>Signed at:</b> ${new Date(sig.signed_at).toUTCString()}</div>
  <div><b>Signer IP:</b> ${escapeHtml(sig.signer_ip ?? "—")}</div>
  <div><b>User agent:</b> ${escapeHtml(sig.signer_user_agent ?? "—")}</div>
  <div><b>Signature ID:</b> ${sig.id}</div>
</div>
${sig.signed_html_snapshot}
</body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cethos-${sig.agreement_type}-${vendorData.vendor.full_name?.replace(/\s+/g, "-") || vendorId}-${sig.signed_at.slice(0, 10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {(Object.keys(AGREEMENT_META) as AgreementType[]).map((type) => (
        <AgreementBlock
          key={type}
          type={type}
          signatures={signatures.filter((s) => s.agreement_type === type)}
          activeTemplate={activeTemplates[type] ?? null}
          templates={templates}
          onDownload={downloadSnapshot}
        />
      ))}

      {/* Clause 3.4 declarations */}
      <section className="bg-white border border-gray-200 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">
          Pre-existing client declarations ({declarations.length})
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          NDA clause 3.4 — clients the vendor claims pre-date their first Cethos
          engagement. Approved clients are exempt from the non-solicitation
          restrictions; undeclared relationships are presumed to have arisen
          through Cethos.
        </p>
        {declarations.length === 0 ? (
          <p className="text-xs text-gray-500">No declarations submitted.</p>
        ) : (
          <div className="space-y-2">
            {declarations.map((d) => (
              <div key={d.id} className="p-3 border border-gray-100 rounded">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap text-sm">
                      <span className="font-medium text-gray-900">{d.client_name}</span>
                      <DeclStatusChip status={d.status} />
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Submitted {new Date(d.created_at).toLocaleDateString()}
                      {d.first_engaged_date && <> · First engaged {d.first_engaged_date}</>}
                      {d.reviewed_at && <> · Reviewed {new Date(d.reviewed_at).toLocaleDateString()}</>}
                    </div>
                    {d.relationship_details && (
                      <p className="text-xs text-gray-600 mt-1">{d.relationship_details}</p>
                    )}
                    {d.review_notes && (
                      <p className="text-xs text-gray-500 mt-1 italic">Review note: "{d.review_notes}"</p>
                    )}
                    {(d.evidence_files ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {d.evidence_files.map((f) => (
                          <button
                            key={f.path}
                            onClick={() => openEvidence(f)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 hover:bg-teal-50 text-gray-700 text-[11px]"
                          >
                            <Paperclip className="w-2.5 h-2.5" /> {f.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {d.status !== "approved" && (
                      <button
                        onClick={() => reviewDeclaration(d, "approved")}
                        disabled={reviewing === d.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100 disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3 h-3" /> Approve
                      </button>
                    )}
                    {d.status !== "rejected" && (
                      <button
                        onClick={() => reviewDeclaration(d, "rejected")}
                        disabled={reviewing === d.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 disabled:opacity-50"
                      >
                        <XCircle className="w-3 h-3" /> Reject
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DeclStatusChip({ status }: { status: Declaration["status"] }) {
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700">
        <CheckCircle2 className="w-2.5 h-2.5" /> Approved
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">
        <XCircle className="w-2.5 h-2.5" /> Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">
      <Clock className="w-2.5 h-2.5" /> Pending
    </span>
  );
}

function AgreementBlock({
  type,
  signatures,
  activeTemplate,
  templates,
  onDownload,
}: {
  type: AgreementType;
  signatures: NdaSignature[];
  activeTemplate: NdaTemplate | null;
  templates: Record<string, NdaTemplate>;
  onDownload: (sig: NdaSignature) => void;
}) {
  const meta = AGREEMENT_META[type];
  const currentSig = signatures.find((s) => s.is_current);
  const upToDate =
    currentSig && activeTemplate && currentSig.nda_template_id === activeTemplate.id;

  // No template published yet (e.g. GVSA pre-launch) and nothing signed
  // — show a single muted row instead of a red "missing" banner.
  if (!activeTemplate && signatures.length === 0) {
    return (
      <section className="p-4 rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-500">
        <span className="font-medium text-gray-700">{meta.label}:</span>{" "}
        no active template published yet.
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">{meta.label}</h3>

      {/* Status banner */}
      <div
        className={`p-4 rounded-lg border flex items-start gap-3 ${
          upToDate
            ? "bg-green-50 border-green-200"
            : currentSig
              ? "bg-amber-50 border-amber-200"
              : "bg-red-50 border-red-200"
        }`}
      >
        {upToDate ? (
          <ShieldCheck className="w-5 h-5 text-green-700 mt-0.5 flex-shrink-0" />
        ) : (
          <ShieldAlert className="w-5 h-5 text-amber-700 mt-0.5 flex-shrink-0" />
        )}
        <div className="flex-1">
          {upToDate && currentSig && (
            <>
              <div className="text-sm font-semibold text-green-900">
                Current {meta.short} on file — version{" "}
                {templates[currentSig.nda_template_id]?.version_label ?? "?"}
              </div>
              <div className="text-xs text-green-800 flex items-center gap-3 mt-0.5 flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Signed {new Date(currentSig.signed_at).toLocaleString()}
                </span>
                <span>·</span>
                <span>By {currentSig.signed_full_name}</span>
                {currentSig.signer_ip && (
                  <>
                    <span>·</span>
                    <span className="font-mono">{currentSig.signer_ip}</span>
                  </>
                )}
              </div>
            </>
          )}
          {!upToDate && currentSig && (
            <>
              <div className="text-sm font-semibold text-amber-900">
                Signed an older version — re-sign required
              </div>
              <div className="text-xs text-amber-800 mt-0.5">
                Last signed on{" "}
                {new Date(currentSig.signed_at).toLocaleDateString()} (version{" "}
                {templates[currentSig.nda_template_id]?.version_label ?? "?"}
                ). Active template is now{" "}
                {activeTemplate?.version_label ?? "?"}. Vendor will be prompted
                to re-sign on next portal visit (14-day grace, then blocking).
              </div>
            </>
          )}
          {!currentSig && (
            <>
              <div className="text-sm font-semibold text-red-900">
                No {meta.short} on file
              </div>
              <div className="text-xs text-red-800 mt-0.5">
                The clickwrap signing page is at{" "}
                <code>/{type === "nda" ? "nda" : "gvsa"}</code> in the vendor
                portal.
              </div>
            </>
          )}
        </div>
        {currentSig && (
          <button
            onClick={() => onDownload(currentSig)}
            className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded border ${
              upToDate
                ? "text-green-800 bg-white border-green-300 hover:bg-green-100"
                : "text-amber-800 bg-white border-amber-300 hover:bg-amber-100"
            }`}
          >
            <Download className="w-3.5 h-3.5" /> Download
          </button>
        )}
      </div>

      {/* Active template */}
      {activeTemplate && (
        <section className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-start justify-between mb-3 pb-3 border-b border-gray-100">
            <div>
              <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-500" />
                Active template — {activeTemplate.title}
              </h4>
              <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-3">
                <span>Version {activeTemplate.version_label}</span>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <Globe className="w-3 h-3" /> {activeTemplate.jurisdiction}
                </span>
                <span>·</span>
                <span>
                  Effective{" "}
                  {new Date(activeTemplate.effective_from).toLocaleDateString()}
                </span>
              </p>
            </div>
          </div>
          <details>
            <summary className="text-xs text-teal-700 hover:text-teal-900 cursor-pointer">
              Show template body
            </summary>
            <div
              className="prose prose-sm max-w-none text-gray-800 mt-3"
              dangerouslySetInnerHTML={{ __html: activeTemplate.body_html }}
            />
          </details>
        </section>
      )}

      {/* Signature history */}
      <section className="bg-white border border-gray-200 rounded-lg p-5">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">
          Signature history ({signatures.length})
        </h4>
        {signatures.length === 0 ? (
          <p className="text-xs text-gray-500">No signatures recorded.</p>
        ) : (
          <div className="space-y-2">
            {signatures.map((s) => {
              const tpl = templates[s.nda_template_id];
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between text-xs p-3 border border-gray-100 rounded"
                >
                  <div>
                    <div className="font-medium text-gray-900">
                      {s.signed_full_name}
                      <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                        {tpl?.version_label ?? "?"}
                      </span>
                      {s.is_current && (
                        <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">
                          Current
                        </span>
                      )}
                    </div>
                    <div className="text-gray-500 mt-0.5">
                      {new Date(s.signed_at).toLocaleString()}
                      {s.signer_ip && (
                        <>
                          {" · "}
                          <span className="font-mono">{s.signer_ip}</span>
                        </>
                      )}
                      {s.superseded_at && (
                        <>
                          {" · "}
                          <span className="text-amber-700">
                            Superseded{" "}
                            {new Date(s.superseded_at).toLocaleDateString()}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => onDownload(s)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-teal-700 hover:bg-teal-50 rounded"
                  >
                    <Download className="w-3 h-3" />
                    Download
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
