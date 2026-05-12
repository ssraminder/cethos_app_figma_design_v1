import { useEffect, useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Download,
  Calendar,
  Globe,
  FileText,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { TabProps } from "./types";

interface NdaSignature {
  id: string;
  nda_template_id: string;
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
}

export default function VendorNdaTab({ vendorData }: TabProps) {
  const vendorId = vendorData.vendor.id;
  const [loading, setLoading] = useState(true);
  const [signatures, setSignatures] = useState<NdaSignature[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<NdaTemplate | null>(null);
  const [templates, setTemplates] = useState<Record<string, NdaTemplate>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data: sigs } = await supabase
        .from("vendor_nda_signatures")
        .select(
          "id, nda_template_id, signed_full_name, signed_email, signed_at, signer_ip, signer_user_agent, is_current, signed_html_snapshot, superseded_at, superseded_reason, created_at",
        )
        .eq("vendor_id", vendorId)
        .order("signed_at", { ascending: false });

      const { data: active } = await supabase
        .from("nda_templates")
        .select("*")
        .eq("is_active", true)
        .eq("jurisdiction", "global")
        .maybeSingle();

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

      if (cancelled) return;
      setSignatures((sigs ?? []) as NdaSignature[]);
      setActiveTemplate((active ?? null) as NdaTemplate | null);
      setTemplates(tplMap);
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  const currentSig = signatures.find((s) => s.is_current);
  const upToDate =
    currentSig && activeTemplate && currentSig.nda_template_id === activeTemplate.id;

  const downloadSnapshot = (sig: NdaSignature) => {
    const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Cethos NDA — signed copy (${vendorData.vendor.full_name ?? ""})</title>
<style>body{font-family:Georgia,serif;max-width:780px;margin:40px auto;padding:0 24px;line-height:1.55;color:#222}h1,h2,h3{font-family:-apple-system,BlinkMacSystemFont,sans-serif}.meta{background:#f6f6f6;padding:14px 18px;border-left:3px solid #888;margin:24px 0;font-family:-apple-system,monospace;font-size:13px}.meta b{display:inline-block;width:140px}</style>
</head><body>
<div class="meta">
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
    a.download = `cethos-nda-${vendorData.vendor.full_name?.replace(/\s+/g, "-") || vendorId}-${sig.signed_at.slice(0, 10)}.html`;
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
    <div className="space-y-6">
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
                Current NDA on file — version{" "}
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
                to re-sign on next portal visit.
              </div>
            </>
          )}
          {!currentSig && (
            <>
              <div className="text-sm font-semibold text-red-900">
                No NDA on file
              </div>
              <div className="text-xs text-red-800 mt-0.5">
                Vendor must sign before being eligible for ISO 17100 work. The
                clickwrap signing page is at <code>/nda</code> in their portal.
              </div>
            </>
          )}
        </div>
        {currentSig && (
          <button
            onClick={() => downloadSnapshot(currentSig)}
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
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-500" />
                Active NDA template
              </h3>
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
        <h3 className="text-sm font-semibold text-gray-900 mb-3">
          Signature history ({signatures.length})
        </h3>
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
                    onClick={() => downloadSnapshot(s)}
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
