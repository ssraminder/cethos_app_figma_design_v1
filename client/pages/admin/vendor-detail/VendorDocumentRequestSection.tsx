/**
 * VendorDocumentRequestSection
 *
 * Admin trigger + display for ISO 17100 evidence requests sent to an
 * already-onboarded vendor. Mirrors VendorReferencesSection's pattern.
 *
 * - Reads the latest vendor_document_requests row (one active per vendor;
 *   the supersede trigger keeps older opens off the surface).
 * - Modal lets staff tick/untick file + profile-field items, edit subject
 *   and body, and send. Smart pre-select reads the latest ISO assessment
 *   evidence for `null` / `[]` markers and ticks the matching items.
 * - On send, calls vendor-request-documents which inserts the row, sends
 *   the Brevo email, and audits to notification_log.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Send,
  FileSearch,
  Clock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  X as XIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  ISO_REQUEST_ITEMS,
  ISO_REQUEST_GROUPS,
  buildDocsEmailBody,
  suggestRequestSlugsFromAssessment,
  type IsoRequestItem,
} from "@/lib/iso17100";

interface DocumentRequest {
  id: string;
  vendor_id: string;
  request_token: string;
  request_token_expires_at: string;
  staff_message: string | null;
  subject: string | null;
  requested_items: Array<{
    slug: string;
    label: string;
    kind: "file" | "profile_field";
    completed_at: string | null;
    declined_at?: string | null;
    decline_reason?: string | null;
  }>;
  source_assessment_id: string | null;
  status: "draft" | "sent" | "partial" | "completed" | "expired" | "superseded";
  completed_at: string | null;
  created_at: string;
}

interface LatestAssessment {
  id: string;
  result: Record<string, unknown> | null;
  overall_verdict: string | null;
  created_at: string;
}

interface Props {
  vendorId: string;
  vendorFirstName: string;
  staffId?: string | null;
}

const STATUS_STYLE: Record<DocumentRequest["status"], { bg: string; fg: string; label: string }> = {
  draft: { bg: "bg-gray-100", fg: "text-gray-700", label: "Draft" },
  sent: { bg: "bg-blue-100", fg: "text-blue-800", label: "Sent" },
  partial: { bg: "bg-amber-100", fg: "text-amber-800", label: "Partial" },
  completed: { bg: "bg-emerald-100", fg: "text-emerald-800", label: "Completed" },
  expired: { bg: "bg-gray-100", fg: "text-gray-500", label: "Expired" },
  superseded: { bg: "bg-gray-100", fg: "text-gray-500", label: "Superseded" },
};

function StatusBadge({ status }: { status: DocumentRequest["status"] }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${s.bg} ${s.fg}`}>
      {s.label}
    </span>
  );
}

export default function VendorDocumentRequestSection({ vendorId, vendorFirstName, staffId }: Props) {
  const [loading, setLoading] = useState(true);
  // latestRequest = most recent ACTIVE request (sent/partial/completed/…) that
  // tracks the vendor's actual submission. draftRequest = the auto-created
  // "smart draft" pending staff send. Kept separate so a fresh draft doesn't
  // shadow the vendor's real progress in the panel.
  const [latestRequest, setLatestRequest] = useState<DocumentRequest | null>(null);
  const [draftRequest, setDraftRequest] = useState<DocumentRequest | null>(null);
  const [latestAssessment, setLatestAssessment] = useState<LatestAssessment | null>(null);
  const [history, setHistory] = useState<DocumentRequest[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [staffMessage, setStaffMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [sending, setSending] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [reqRes, asmRes] = await Promise.all([
      supabase
        .from("vendor_document_requests")
        .select("id, vendor_id, request_token, request_token_expires_at, staff_message, subject, requested_items, source_assessment_id, status, completed_at, created_at")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false }),
      supabase
        .from("vendor_iso17100_assessments")
        .select("id, result, overall_verdict, created_at")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    setLoading(false);
    if (reqRes.error) toast.error(`Could not load document requests: ${reqRes.error.message}`);
    const requests = (reqRes.data ?? []) as DocumentRequest[];
    const draft = requests.find((r) => r.status === "draft") ?? null;
    const active = requests.find((r) => r.status !== "draft") ?? null;
    setDraftRequest(draft);
    setLatestRequest(active);
    setHistory(requests.filter((r) => r.id !== draft?.id && r.id !== active?.id));
    setLatestAssessment((asmRes.data ?? null) as LatestAssessment | null);
  }, [vendorId]);

  useEffect(() => { refresh(); }, [refresh]);

  const openModal = () => {
    // 1) If an auto-created draft exists, prefer ITS items (the assessment
    //    edge function already picked them based on the snapshot).
    // 2) Otherwise pull from the latest assessment evidence.
    // 3) Otherwise fall back to the generic baseline.
    let initial: string[];
    if (draftRequest && draftRequest.requested_items.length > 0) {
      initial = draftRequest.requested_items.map((it) => it.slug);
    } else {
      const suggested = latestAssessment
        ? suggestRequestSlugsFromAssessment(latestAssessment.result as { criteria?: Record<string, { evidence?: string[] }> } | null)
        : [];
      initial = suggested.length > 0
        ? suggested
        : ["degree_translation_studies", "professional_translation_cert", "language_proficiency", "profile_native_languages", "profile_years_experience", "profile_specializations"];
    }
    setSelectedSlugs(initial);
    setStaffMessage("");
    setSubject("Cethos — documents needed for your translator profile (ISO 17100)");
    setBodyHtml(
      buildDocsEmailBody({
        vendorFirstName,
        selectedSlugs: initial,
        uploadLinkUrl: "{{LINK}}",
        expiryDays: 14,
        staffMessage: null,
      }),
    );
    setModalOpen(true);
  };

  const toggleSlug = (slug: string) => {
    setSelectedSlugs((prev) => {
      const next = prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug];
      setBodyHtml(
        buildDocsEmailBody({
          vendorFirstName,
          selectedSlugs: next,
          uploadLinkUrl: "{{LINK}}",
          expiryDays: 14,
          staffMessage: staffMessage.trim() || null,
        }),
      );
      return next;
    });
  };

  const onStaffMessageChange = (v: string) => {
    setStaffMessage(v);
    setBodyHtml(
      buildDocsEmailBody({
        vendorFirstName,
        selectedSlugs,
        uploadLinkUrl: "{{LINK}}",
        expiryDays: 14,
        staffMessage: v.trim() || null,
      }),
    );
  };

  async function handleSend() {
    if (selectedSlugs.length === 0) {
      toast.error("Pick at least one item");
      return;
    }
    const items = selectedSlugs
      .map((slug) => ISO_REQUEST_ITEMS.find((d) => d.slug === slug))
      .filter((it): it is IsoRequestItem => !!it)
      .map((it) => ({
        slug: it.slug,
        label: it.label,
        kind: it.kind,
        profile_column: it.profile_column,
        rationale: it.rationale,
        quiz_competence: it.quiz_competence,
        quiz_domain: it.quiz_domain,
      }));

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("vendor-request-documents", {
        body: {
          vendor_id: vendorId,
          requested_items: items,
          // Use the server's branded email-shell template (Cethos logo,
          // house styling, footer) — it also builds the correct
          // vendor-portal upload link from the fresh request_token. The
          // staff note flows in via staff_message; the item list + subject
          // are rendered server-side. (Previously we sent a hand-built
          // body_html whose "{{LINK}}" placeholder the function never
          // substituted — shipping a dead button and an unbranded email.)
          staff_message: staffMessage.trim() || null,
          staff_id: staffId ?? null,
          source_assessment_id: latestAssessment?.id ?? null,
          expiry_days: 14,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Could not send request");
      toast.success(
        data.data?.email_sent
          ? "Document request sent."
          : `Request created (email failed: ${data.data?.email_error ?? "unknown"}).`,
      );
      setModalOpen(false);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send request");
    } finally {
      setSending(false);
    }
  }

  const hasOpenRequest = latestRequest && ["sent", "partial"].includes(latestRequest.status);
  const hasDraft = !!draftRequest;
  const insufficientEvidence = latestAssessment?.overall_verdict === "insufficient_evidence";
  const showSmartHint = insufficientEvidence && !hasOpenRequest && !hasDraft;

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileSearch className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">
            ISO 17100 evidence — document requests
          </h3>
        </div>
        <button
          type="button"
          onClick={openModal}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded ${hasDraft ? "bg-amber-600 hover:bg-amber-700" : "bg-indigo-600 hover:bg-indigo-700"}`}
        >
          <Send className="w-3.5 h-3.5" />
          {hasDraft ? "Review draft & send" : hasOpenRequest ? "Send new request" : "Request documents"}
        </button>
      </div>

      {hasDraft && (
        <div className="mb-3 p-3 rounded-lg border border-amber-200 bg-amber-50 flex items-start gap-2 text-xs">
          <Sparkles className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-amber-900">
            <strong>Smart draft ready</strong> — {draftRequest!.requested_items.length} item{draftRequest!.requested_items.length === 1 ? "" : "s"} auto-selected from the latest insufficient-evidence assessment. Review and click <em>Review draft &amp; send</em> to email the vendor.
          </div>
        </div>
      )}

      {showSmartHint && (
        <div className="mb-3 p-3 rounded-lg border border-purple-200 bg-purple-50 flex items-start gap-2 text-xs">
          <Sparkles className="w-3.5 h-3.5 text-purple-600 mt-0.5 shrink-0" />
          <div className="text-purple-900">
            The latest ISO 17100 assessment came back <strong>insufficient evidence</strong>. Click <em>Request documents</em> — items the AI flagged as missing will be pre-ticked.
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      ) : !latestRequest && !draftRequest ? (
        <p className="text-xs text-gray-400 italic">
          No document requests yet. Click "Request documents" to email the vendor a checklist with a 14-day upload link.
        </p>
      ) : !latestRequest ? (
        <p className="text-xs text-gray-500">
          A smart draft is ready above — review and send it to email the vendor. No vendor submission to track yet.
        </p>
      ) : (
        <>
          <div className="p-3 rounded-lg border border-gray-200 bg-gray-50/40 text-xs">
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <div className="font-medium text-gray-900">
                Latest request — {new Date(latestRequest.created_at).toLocaleString()}
              </div>
              <StatusBadge status={latestRequest.status} />
            </div>
            <div className="text-[11px] text-gray-500">
              {latestRequest.requested_items.length} item{latestRequest.requested_items.length === 1 ? "" : "s"} requested
              {" · expires "}{new Date(latestRequest.request_token_expires_at).toLocaleDateString()}
              {latestRequest.completed_at && ` · completed ${new Date(latestRequest.completed_at).toLocaleDateString()}`}
            </div>
            {latestRequest.staff_message && (
              <p className="mt-2 text-[11px] text-gray-700 italic">"{latestRequest.staff_message}"</p>
            )}

            {/* Per-item submission detail: uploaded / declined-with-reason / filled */}
            <ul className="mt-3 space-y-1.5">
              {latestRequest.requested_items.map((it) => {
                const declined = !!it.declined_at;
                const done = !!it.completed_at;
                return (
                  <li key={it.slug} className="flex items-start gap-2 text-[11px]">
                    {declined ? (
                      <XIcon className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                    ) : done ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                    )}
                    <span className="flex-1">
                      <span className={declined ? "text-gray-700" : done ? "text-gray-700" : "text-gray-800"}>
                        {it.label}
                        <span className="ml-1 text-[10px] text-gray-400">
                          {it.kind === "profile_field" ? "(profile field)" : "(file)"}
                        </span>
                      </span>
                      {declined ? (
                        <span className="block text-amber-700 mt-0.5">
                          Declined{it.decline_reason ? `: "${it.decline_reason}"` : " (no reason given)"}
                        </span>
                      ) : done ? (
                        <span className="block text-gray-500 mt-0.5">
                          {it.kind === "profile_field"
                            ? "Filled in their profile."
                            : "Uploaded — open it from the Evidence locker on the QMS tab (AI-screened)."}
                        </span>
                      ) : (
                        <span className="block text-gray-400 mt-0.5">Awaiting submission.</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {history.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowHistory((s) => !s)}
                className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 uppercase tracking-wider"
              >
                {showHistory ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                Past requests ({history.length})
              </button>
              {showHistory && (
                <div className="mt-2 border border-gray-100 rounded divide-y divide-gray-100">
                  {history.map((r) => (
                    <div key={r.id} className="flex items-center justify-between px-3 py-2 text-xs">
                      <div className="text-gray-700">
                        {new Date(r.created_at).toLocaleString()}
                        <span className="text-gray-400 ml-2">· {r.requested_items.length} item{r.requested_items.length === 1 ? "" : "s"}</span>
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Request ISO 17100 evidence</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Tick what the vendor still owes you. A branded Cethos email is sent.
                </p>
              </div>
              <button onClick={() => setModalOpen(false)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-md">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-4 overflow-y-auto flex-1 space-y-4">
              {hasOpenRequest && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-800">
                  An open request already exists for this vendor. Sending a new one will <strong>supersede</strong> it.
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-gray-700 mb-2">ISO 17100 competence file</p>
                <p className="text-[11px] text-gray-500 mb-3">
                  References are handled separately (use the <em>Request references</em> button below). NDA is gated separately on the vendor portal — not in this list.
                </p>
                <div className="space-y-3">
                  {ISO_REQUEST_GROUPS.map((g) => {
                    const groupItems = ISO_REQUEST_ITEMS.filter((d) => d.group === g.key);
                    if (groupItems.length === 0) return null;
                    return (
                      <div key={g.key}>
                        <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1">{g.label}</p>
                        <div className="space-y-1">
                          {groupItems.map((dt) => (
                            <label key={dt.slug} className="flex items-start gap-2 text-xs p-2 rounded hover:bg-gray-50 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedSlugs.includes(dt.slug)}
                                onChange={() => toggleSlug(dt.slug)}
                                className="mt-0.5"
                              />
                              <span>
                                <span className="font-medium text-gray-900">
                                  {dt.label}
                                  <span className="ml-1 text-[10px] text-gray-400 font-normal">
                                    {dt.kind === "profile_field" ? "(profile field)" : "(file)"}
                                  </span>
                                </span>
                                <span className="block text-gray-500">{dt.rationale}</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Optional message to vendor (prepends to default body)
                </label>
                <textarea
                  value={staffMessage}
                  onChange={(e) => onStaffMessageChange(e.target.value)}
                  rows={3}
                  placeholder="Leave blank for default copy."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  maxLength={1000}
                />
              </div>

              <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-[11px] text-gray-600">
                The vendor receives the standard <strong>branded Cethos email</strong> (logo + house styling),
                listing the items ticked above with a secure upload button. Your optional message appears at the top.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-gray-100">
              <button
                onClick={() => setModalOpen(false)}
                disabled={sending}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending || selectedSlugs.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50"
              >
                {sending && <Loader2 className="w-4 h-4 animate-spin" />}
                Send request
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
