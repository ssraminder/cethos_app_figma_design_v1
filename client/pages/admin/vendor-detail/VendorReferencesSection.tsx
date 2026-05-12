/**
 * VendorReferencesSection
 *
 * Admin trigger + display for post-onboarding reference requests.
 * Parallel to the references panel on RecruitmentDetail (CVP-side),
 * but for already-onboarded vendors via the vendor-request-references
 * edge function.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Mail,
  Send,
  Star,
  StarOff,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface VendorReferenceRequest {
  id: string;
  request_token: string;
  request_token_expires_at: string;
  staff_message: string | null;
  status: string;
  contacts_submitted_at: string | null;
  created_at: string;
}

interface VendorReference {
  id: string;
  request_id: string;
  reference_name: string;
  reference_email: string;
  reference_company: string | null;
  reference_relationship: string | null;
  feedback_text: string | null;
  feedback_rating: number | null;
  feedback_received_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  status: string;
  created_at: string;
}

interface Props {
  vendorId: string;
  staffId?: string | null;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    requested: { bg: "bg-blue-100", fg: "text-blue-800", label: "Requested" },
    received: { bg: "bg-emerald-100", fg: "text-emerald-800", label: "Received" },
    declined: { bg: "bg-gray-100", fg: "text-gray-700", label: "Declined" },
    expired: { bg: "bg-amber-100", fg: "text-amber-800", label: "Expired" },
    invalid: { bg: "bg-red-100", fg: "text-red-700", label: "Invalid" },
  };
  const s = map[status] ?? { bg: "bg-gray-100", fg: "text-gray-600", label: status };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${s.bg} ${s.fg}`}>
      {s.label}
    </span>
  );
}

function Rating({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-gray-400">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) =>
        n <= value ? (
          <Star key={n} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
        ) : (
          <StarOff key={n} className="w-3.5 h-3.5 text-gray-300" />
        ),
      )}
    </span>
  );
}

export default function VendorReferencesSection({ vendorId, staffId }: Props) {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<VendorReferenceRequest[]>([]);
  const [references, setReferences] = useState<VendorReference[]>([]);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [staffMessage, setStaffMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expandedFeedback, setExpandedFeedback] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    const [reqRes, refRes] = await Promise.all([
      supabase
        .from("vendor_reference_requests")
        .select("id, request_token, request_token_expires_at, staff_message, status, contacts_submitted_at, created_at")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false }),
      supabase
        .from("vendor_references")
        .select("id, request_id, reference_name, reference_email, reference_company, reference_relationship, feedback_text, feedback_rating, feedback_received_at, declined_at, decline_reason, status, created_at")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false }),
    ]);
    setLoading(false);
    if (reqRes.error) toast.error(`Could not load reference requests: ${reqRes.error.message}`);
    if (refRes.error) toast.error(`Could not load references: ${refRes.error.message}`);
    setRequests((reqRes.data ?? []) as VendorReferenceRequest[]);
    setReferences((refRes.data ?? []) as VendorReference[]);
  }, [vendorId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function sendRequest() {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("vendor-request-references", {
        body: {
          vendor_id: vendorId,
          staff_id: staffId ?? null,
          staff_message: staffMessage.trim() || null,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Could not send request");
      toast.success(data.data?.email_sent ? "Reference request sent." : "Request created (email suppressed).");
      setShowRequestForm(false);
      setStaffMessage("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send request");
    } finally {
      setSubmitting(false);
    }
  }

  const latestRequest = requests[0] ?? null;
  const refsByRequest = new Map<string, VendorReference[]>();
  for (const r of references) {
    const arr = refsByRequest.get(r.request_id) ?? [];
    arr.push(r);
    refsByRequest.set(r.request_id, arr);
  }

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">
            References — vendor-side
            {references.length > 0 && (
              <span className="ml-2 text-xs font-normal text-gray-500">
                {references.length} on file
              </span>
            )}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setShowRequestForm((s) => !s)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-600 rounded hover:bg-teal-700"
        >
          <Send className="w-3.5 h-3.5" />
          {showRequestForm ? "Cancel" : "Request references"}
        </button>
      </div>

      {showRequestForm && (
        <div className="mb-4 p-4 border border-teal-200 bg-teal-50/40 rounded-lg">
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Optional message to vendor
          </label>
          <textarea
            value={staffMessage}
            onChange={(e) => setStaffMessage(e.target.value)}
            rows={4}
            placeholder="Leave blank to use the default copy — or explain why we're asking (e.g. tier upgrade, ISO 17100 evidence refresh)."
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:border-teal-500 focus:ring-2 focus:ring-teal-200 outline-none resize-y"
            maxLength={1000}
          />
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={sendRequest}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-600 rounded hover:bg-teal-700 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {submitting ? "Sending…" : "Send request"}
            </button>
          </div>
          <p className="text-[11px] text-gray-500 mt-2">
            The vendor receives an email with a 14-day link. They submit 1–3 contacts; each contact gets their own 21-day feedback link.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      ) : requests.length === 0 ? (
        <p className="text-xs text-gray-400 italic">
          No reference requests yet. Click "Request references" to send the vendor an email asking for 2–3 contacts.
        </p>
      ) : (
        <div className="space-y-4">
          {latestRequest && (
            <div className="p-3 rounded-lg border border-gray-200 bg-gray-50/40 text-xs">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-gray-900">
                    Latest request — {new Date(latestRequest.created_at).toLocaleString()}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    Status: {latestRequest.status}
                    {latestRequest.contacts_submitted_at && ` · contacts received ${new Date(latestRequest.contacts_submitted_at).toLocaleDateString()}`}
                    {" · expires "}{new Date(latestRequest.request_token_expires_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
              {latestRequest.staff_message && (
                <p className="mt-2 text-[11px] text-gray-700 italic">"{latestRequest.staff_message}"</p>
              )}
            </div>
          )}

          {references.length === 0 ? (
            <p className="text-xs text-gray-400 italic">
              Vendor hasn't submitted their reference contacts yet.
            </p>
          ) : (
            <div className="border border-gray-200 rounded divide-y divide-gray-100">
              {references.map((r) => {
                const expanded = !!expandedFeedback[r.id];
                return (
                  <div key={r.id} className="p-3">
                    <button
                      type="button"
                      className="w-full flex items-start justify-between gap-3 text-left"
                      onClick={() => setExpandedFeedback((s) => ({ ...s, [r.id]: !s[r.id] }))}
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        {expanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-gray-900 truncate">
                            {r.reference_name}
                            {r.reference_company && (
                              <span className="ml-1 text-gray-500 font-normal">· {r.reference_company}</span>
                            )}
                          </div>
                          <div className="text-[11px] text-gray-500 mt-0.5 truncate">
                            {r.reference_email}
                            {r.reference_relationship && <span> · {r.reference_relationship}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Rating value={r.feedback_rating} />
                        <StatusBadge status={r.status} />
                      </div>
                    </button>

                    {expanded && (
                      <div className="ml-5 mt-3 text-xs space-y-2">
                        {r.feedback_received_at && (
                          <div className="text-[11px] text-gray-500 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Received {new Date(r.feedback_received_at).toLocaleString()}
                          </div>
                        )}
                        {r.declined_at && (
                          <div className="text-[11px] text-gray-500 flex items-center gap-1">
                            <XCircle className="w-3 h-3 text-gray-500" />
                            Declined {new Date(r.declined_at).toLocaleString()}
                          </div>
                        )}
                        {r.feedback_text && (
                          <p className="text-xs text-gray-700 whitespace-pre-wrap">{r.feedback_text}</p>
                        )}
                        {r.decline_reason && (
                          <p className="text-xs text-gray-600 italic">Decline reason: {r.decline_reason}</p>
                        )}
                        {!r.feedback_text && !r.declined_at && (
                          <p className="text-[11px] text-gray-400 italic flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Waiting for response.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {requests.length > 1 && (
            <p className="text-[11px] text-gray-500 italic">
              {requests.length - 1} earlier request{requests.length > 2 ? "s" : ""} on file.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
