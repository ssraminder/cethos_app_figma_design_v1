// VendorCommunicationTab — staff send a free-form (optionally AI-drafted) email
// to a vendor FROM vm@cethos.com and read the conversation thread. Replies land
// back at the vm@cethos.com inbox and are captured against the vendor by
// cvp-inbound-email (Phase 1: capture + notify). Reused on the vendor profile
// (a "Communication" tab) and on the standalone /admin/vendors/communication page.

import { useEffect, useState, useCallback } from "react";
import { Loader2, Send, Sparkles, RefreshCw, ArrowRight, ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface ThreadItem {
  kind: "outbound" | "inbound";
  id: string;
  at: string;
  subject: string | null;
  body: string | null;
  from?: string | null;
  summary?: string | null;
  acknowledged?: boolean;
}

interface Props {
  vendorId: string;
  vendorName?: string | null;
  vendorEmail?: string | null;
}

function fmt(at: string): string {
  try {
    return new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return at;
  }
}

export default function VendorCommunicationTab({ vendorId, vendorName, vendorEmail }: Props) {
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);

  const invoke = useCallback(async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("manage-vendor-communication", { body: payload });
    if (error) throw new Error((error as { message?: string }).message || "Request failed");
    if (data && (data as { success?: boolean }).success === false) {
      throw new Error((data as { error?: string }).error || "Request returned an error");
    }
    return (data as { data?: Record<string, unknown> }).data ?? {};
  }, []);

  const loadThread = useCallback(async () => {
    if (!vendorId) return;
    setLoading(true);
    try {
      const d = await invoke({ action: "list", vendorId });
      setThread((d.thread as ThreadItem[]) ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load conversation");
    } finally {
      setLoading(false);
    }
  }, [invoke, vendorId]);

  useEffect(() => {
    loadThread();
  }, [loadThread]);

  const aiDraft = async () => {
    setDrafting(true);
    try {
      const d = await invoke({ action: "preview", vendorId, useAIDraft: true, aiInstructions: bodyText, subject });
      if (d.aiDraftPlain) {
        setBodyText(String(d.aiDraftPlain));
        toast.success("AI draft ready — review and edit before sending.");
      } else {
        toast.error((d.aiError as string) || "No draft produced.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Draft failed");
    } finally {
      setDrafting(false);
    }
  };

  const send = async () => {
    if (!bodyText.trim()) {
      toast.error("Write a message first.");
      return;
    }
    setSending(true);
    try {
      const d = await invoke({ action: "send", vendorId, subject, body: bodyText });
      toast.success(`Sent from vm@cethos.com${d.via === "mailgun" ? " (via fallback)" : ""}.`);
      setBodyText("");
      setSubject("");
      await loadThread();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Vendor Communication</h3>
          <p className="text-xs text-gray-500">
            Email sent from <span className="font-mono">vm@cethos.com</span>
            {vendorEmail ? <> to <span className="font-medium">{vendorName || "vendor"}</span> &lt;{vendorEmail}&gt;</> : null}.
            Replies come back to our AI inbox and appear here.
          </p>
        </div>
        <button
          onClick={loadThread}
          className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 border border-gray-200 rounded-md px-2.5 py-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {/* Composer */}
      <div className="border border-gray-200 rounded-lg p-4 bg-white space-y-3">
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject (optional)"
          className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        />
        <textarea
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          placeholder="Write your message, or type a short instruction and click 'AI draft' to expand it…"
          rows={6}
          className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={aiDraft}
            disabled={drafting || sending}
            className="inline-flex items-center gap-1.5 text-sm border border-cyan-300 text-cyan-700 hover:bg-cyan-50 rounded-md px-3 py-2 disabled:opacity-50"
          >
            {drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            AI draft
          </button>
          <button
            onClick={send}
            disabled={sending || drafting || !bodyText.trim()}
            className="inline-flex items-center gap-1.5 text-sm bg-cyan-600 hover:bg-cyan-700 text-white rounded-md px-4 py-2 disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send from vm@cethos.com
          </button>
        </div>
      </div>

      {/* Thread */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading conversation…
        </div>
      ) : thread.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">No messages yet. Send the first one above.</p>
      ) : (
        <ol className="space-y-3">
          {thread.map((it) => {
            const outbound = it.kind === "outbound";
            return (
              <li
                key={`${it.kind}-${it.id}`}
                className={`border rounded-lg p-3 ${
                  outbound
                    ? "bg-cyan-50/40 border-cyan-200"
                    : !it.acknowledged
                    ? "bg-amber-50 border-amber-300"
                    : "bg-gray-50 border-gray-200"
                }`}
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className={`inline-flex items-center gap-1 font-semibold uppercase tracking-wide ${outbound ? "text-cyan-700" : "text-amber-700"}`}>
                    {outbound ? <><ArrowRight className="h-3 w-3" /> Sent</> : <><ArrowLeft className="h-3 w-3" /> Received</>}
                  </span>
                  <span className="ml-auto text-gray-500">{fmt(it.at)}</span>
                </div>
                <div className="mt-1 text-sm font-medium text-gray-900">{it.subject || "(no subject)"}</div>
                {!outbound && it.from && <div className="text-xs text-gray-500 mt-0.5">From: {it.from}</div>}
                {!outbound && it.summary && (
                  <div className="mt-1.5 text-xs text-amber-800 bg-white/70 border border-amber-200 rounded px-2 py-1">
                    <span className="font-semibold">AI summary:</span> {it.summary}
                  </div>
                )}
                {it.body && (
                  <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap line-clamp-6">{it.body}</p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
