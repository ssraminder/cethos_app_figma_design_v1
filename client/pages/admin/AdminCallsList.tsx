import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Loader2,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  Send,
  MessageSquare,
  ExternalLink,
  Mic,
  User as UserIcon,
  Play,
  Pause,
  FileText,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useStaffAuth } from "@/context/StaffAuthContext";
import { formatDistanceToNow, format } from "date-fns";

const PAGE_SIZE = 50;

interface CallRow {
  id: string;
  rc_session_id: string;
  direction: "Inbound" | "Outbound";
  from_number: string | null;
  from_number_e164: string | null;
  from_name: string | null;
  to_number: string | null;
  to_number_e164: string | null;
  to_name: string | null;
  staff_user_id: string | null;
  staff_full_name: string | null;
  customer_id: string | null;
  customer_company_name: string | null;
  customer_email: string | null;
  started_at: string;
  duration_sec: number | null;
  result: string | null;
  has_recording: boolean;
  note_count: number;
  total_count: number;
}

interface SmsTemplate {
  id: string;
  key: string;
  label: string;
  body: string;
  variables: string[];
  generates_upload_token: boolean;
}

interface CallNote {
  id: string;
  body: string;
  staff_user_id: string | null;
  staff_full_name: string | null;
  created_at: string;
  updated_at: string;
}

interface CallDetail {
  call: CallRow & {
    matched_source: string | null;
    rc_extension_id: string | null;
    recording_url: string | null;
    recording_id: string | null;
    ended_at: string | null;
    transcript: string | null;
    transcript_at: string | null;
    summary: string | null;
    summary_at: string | null;
  };
  notes: CallNote[];
  recent_sms: Array<{
    id: string;
    to_number: string;
    body: string;
    status: string;
    sent_at: string | null;
    template_key: string | null;
  }>;
}

function formatDuration(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function callerLabel(row: CallRow): { name: string; phone: string | null } {
  if (row.direction === "Inbound") {
    return { name: row.from_name || row.customer_company_name || "Unknown", phone: row.from_number_e164 };
  }
  return { name: row.to_name || row.customer_company_name || "Unknown", phone: row.to_number_e164 };
}

function directionIcon(row: CallRow) {
  if (row.result?.toLowerCase().includes("missed") || row.result === "Voicemail") {
    return <PhoneMissed className="w-4 h-4 text-red-500" />;
  }
  if (row.direction === "Inbound") {
    return <PhoneIncoming className="w-4 h-4 text-emerald-600" />;
  }
  return <PhoneOutgoing className="w-4 h-4 text-blue-600" />;
}

export default function AdminCallsList() {
  const { staffUser } = useStaffAuth();
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [direction, setDirection] = useState<"" | "Inbound" | "Outbound">("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase.rpc("comms_list_call_logs", {
      p_limit: PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
      p_direction: direction || null,
      p_customer_id: null,
      p_staff_user_id: null,
      p_search: search || null,
      p_from_date: null,
      p_to_date: null,
    });
    setIsLoading(false);
    if (error) {
      console.error("comms_list_call_logs failed", error);
      return;
    }
    const rows = (data || []) as CallRow[];
    setCalls(rows);
    setTotal(rows[0]?.total_count ?? 0);
  }, [page, direction, search]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleSync = async () => {
    setSyncing(true);
    const { error } = await supabase.functions.invoke("rc-sync-calls", { body: {} });
    setSyncing(false);
    if (error) {
      console.error("rc-sync-calls failed", error);
      alert("Sync failed: " + error.message);
      return;
    }
    await fetch();
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Phone className="w-5 h-5 text-gray-700" />
          <h1 className="text-xl font-semibold text-gray-900">Calls</h1>
          <span className="text-sm text-gray-500">({total.toLocaleString()})</span>
        </div>
        <div className="flex-1" />
        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
        >
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Sync now
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border-b px-6 py-3 flex items-center gap-3">
        <select
          value={direction}
          onChange={(e) => { setDirection(e.target.value as "" | "Inbound" | "Outbound"); setPage(0); }}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm"
        >
          <option value="">All directions</option>
          <option value="Inbound">Inbound</option>
          <option value="Outbound">Outbound</option>
        </select>
        <form
          onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); setPage(0); }}
          className="relative flex-1 max-w-md"
        >
          <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search phone or name…"
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded"
          />
          {search && (
            <button
              type="button"
              onClick={() => { setSearchInput(""); setSearch(""); setPage(0); }}
              className="absolute right-2 top-1/2 -translate-y-1/2"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </form>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : calls.length === 0 ? (
          <div className="text-center py-20 text-gray-500">No calls match these filters.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b sticky top-0">
              <tr>
                <th className="text-left px-4 py-2 w-10"></th>
                <th className="text-left px-4 py-2">When</th>
                <th className="text-left px-4 py-2">Caller</th>
                <th className="text-left px-4 py-2">Customer</th>
                <th className="text-left px-4 py-2">Staff</th>
                <th className="text-left px-4 py-2">Duration</th>
                <th className="text-left px-4 py-2">Result</th>
                <th className="text-left px-4 py-2 w-16">Notes</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((row) => {
                const caller = callerLabel(row);
                return (
                  <tr
                    key={row.id}
                    onClick={() => setSelected(row.id)}
                    className="border-b hover:bg-blue-50 cursor-pointer"
                  >
                    <td className="px-4 py-2">{directionIcon(row)}</td>
                    <td className="px-4 py-2 whitespace-nowrap" title={format(new Date(row.started_at), "PPpp")}>
                      {formatDistanceToNow(new Date(row.started_at), { addSuffix: true })}
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-900">{caller.name}</div>
                      <div className="text-xs text-gray-500 font-mono">{caller.phone || "—"}</div>
                    </td>
                    <td className="px-4 py-2">
                      {row.customer_id ? (
                        <Link
                          to={`/admin/customers/${row.customer_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-blue-600 hover:underline inline-flex items-center gap-1"
                        >
                          {row.customer_company_name || row.customer_email}
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      ) : (
                        <span className="text-gray-400">Unlinked</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-700">{row.staff_full_name || "—"}</td>
                    <td className="px-4 py-2 text-gray-700">{formatDuration(row.duration_sec)}</td>
                    <td className="px-4 py-2 text-gray-700">{row.result || "—"}</td>
                    <td className="px-4 py-2 text-gray-700">
                      {row.note_count > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" /> {row.note_count}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="bg-white border-t px-6 py-3 flex items-center justify-between">
        <div className="text-sm text-gray-600">
          Page {page + 1} of {totalPages}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 inline-flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page + 1 >= totalPages}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 inline-flex items-center gap-1"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Detail drawer */}
      {selected && (
        <CallDetailDrawer
          callId={selected}
          staffUserId={staffUser?.id ?? null}
          onClose={() => setSelected(null)}
          onChanged={() => fetch()}
        />
      )}
    </div>
  );
}

function CallDetailDrawer({
  callId,
  staffUserId,
  onClose,
  onChanged,
}: {
  callId: string;
  staffUserId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<CallDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [smsTemplateKey, setSmsTemplateKey] = useState("");
  const [smsVars, setSmsVars] = useState<Record<string, string>>({});
  const [customSmsBody, setCustomSmsBody] = useState("");
  const [sendingSms, setSendingSms] = useState(false);
  const [smsResult, setSmsResult] = useState<string | null>(null);

  // Recording / Transcription / Summary state
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioRef] = useState<{ el: HTMLAudioElement | null }>({ el: null });
  const [transcribing, setTranscribing] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [transcriptLocal, setTranscriptLocal] = useState<string | null>(null);
  const [summaryLocal, setSummaryLocal] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [detailRes, tplRes] = await Promise.all([
      supabase.rpc("comms_get_call_detail", { p_call_id: callId }),
      supabase.rpc("comms_list_sms_templates"),
    ]);
    setLoading(false);
    if (detailRes.error) {
      console.error("comms_get_call_detail failed", detailRes.error);
      return;
    }
    setDetail(detailRes.data as CallDetail);
    setTemplates((tplRes.data || []) as SmsTemplate[]);
  }, [callId]);

  useEffect(() => { load(); }, [load]);

  const saveNote = async () => {
    if (!noteDraft.trim() || !staffUserId) return;
    setSavingNote(true);
    const { error } = await supabase.rpc("comms_add_call_note", {
      p_call_id: callId,
      p_staff_user_id: staffUserId,
      p_body: noteDraft.trim(),
    });
    setSavingNote(false);
    if (error) {
      alert("Failed to save note: " + error.message);
      return;
    }
    setNoteDraft("");
    await load();
    onChanged();
  };

  const selectedTemplate = templates.find((t) => t.key === smsTemplateKey);
  const previewBody = selectedTemplate
    ? selectedTemplate.body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => smsVars[k] ?? `{{${k}}}`)
    : "";

  const sendSms = async () => {
    const isCustom = !selectedTemplate && customSmsBody.trim();
    if (!detail || (!selectedTemplate && !isCustom)) return;
    const caller = detail.call.direction === "Inbound" ? detail.call.from_number_e164 : detail.call.to_number_e164;
    if (!caller) {
      alert("No phone number on this call");
      return;
    }
    setSendingSms(true);
    setSmsResult(null);
    const payload: Record<string, unknown> = {
      to_number: caller,
      staff_user_id: staffUserId,
      customer_id: detail.call.customer_id,
      call_log_id: callId,
    };
    if (selectedTemplate) {
      payload.template_key = selectedTemplate.key;
      payload.variables = smsVars;
    } else {
      payload.custom_body = customSmsBody.trim();
    }
    const { data, error } = await supabase.functions.invoke("rc-send-sms", {
      body: payload,
    });
    setSendingSms(false);
    if (error || !data?.ok) {
      setSmsResult("❌ " + (data?.error || error?.message || "Failed"));
      return;
    }
    setSmsResult("✓ SMS sent");
    setSmsTemplateKey("");
    setSmsVars({});
    setCustomSmsBody("");
    await load();
  };

  // Sync transcript/summary from detail when it loads
  useEffect(() => {
    if (detail) {
      setTranscriptLocal(detail.call.transcript || null);
      setSummaryLocal(detail.call.summary || null);
    }
  }, [detail?.call.transcript, detail?.call.summary]);

  const loadAudio = async () => {
    if (audioUrl || !detail?.call.has_recording) return;
    setAudioLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("rc-call-recording", {
        body: { call_id: callId, action: "audio" },
      });
      if (error) throw error;
      // data is a Blob from the invoke
      const url = URL.createObjectURL(data);
      setAudioUrl(url);
    } catch (e) {
      console.error("Failed to load audio:", e);
    } finally {
      setAudioLoading(false);
    }
  };

  const togglePlay = () => {
    if (!audioRef.el) return;
    if (isPlaying) {
      audioRef.el.pause();
      setIsPlaying(false);
    } else {
      audioRef.el.play();
      setIsPlaying(true);
    }
  };

  const handleTranscribe = async () => {
    setTranscribing(true);
    try {
      const { data, error } = await supabase.functions.invoke("rc-call-recording", {
        body: { call_id: callId, action: "transcribe" },
      });
      if (error) throw error;
      if (data?.ok && data.transcript) {
        setTranscriptLocal(data.transcript);
      } else {
        alert(data?.error || data?.message || "Transcription returned empty");
      }
    } catch (e: any) {
      alert("Transcription failed: " + (e.message || e));
    } finally {
      setTranscribing(false);
    }
  };

  const handleSummarize = async () => {
    setSummarizing(true);
    try {
      const { data, error } = await supabase.functions.invoke("rc-call-recording", {
        body: { call_id: callId, action: "summarize" },
      });
      if (error) throw error;
      if (data?.ok && data.summary) {
        setSummaryLocal(data.summary);
      } else {
        alert(data?.error || data?.message || "Summary returned empty");
      }
    } catch (e: any) {
      alert("Summarization failed: " + (e.message || e));
    } finally {
      setSummarizing(false);
    }
  };

  // Cleanup audio URL on unmount
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative ml-auto w-full max-w-2xl bg-white shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Call detail</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading || !detail ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs text-gray-500">Direction</div>
                <div className="font-medium flex items-center gap-1">
                  {directionIcon(detail.call)} {detail.call.direction}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">When</div>
                <div className="font-medium">{format(new Date(detail.call.started_at), "PPpp")}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">From</div>
                <div className="font-medium">{detail.call.from_name || "—"}</div>
                <div className="text-gray-500 font-mono text-xs">{detail.call.from_number_e164 || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">To</div>
                <div className="font-medium">{detail.call.to_name || "—"}</div>
                <div className="text-gray-500 font-mono text-xs">{detail.call.to_number_e164 || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Duration</div>
                <div className="font-medium">{formatDuration(detail.call.duration_sec)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Result</div>
                <div className="font-medium">{detail.call.result || "—"}</div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-gray-500">Linked customer</div>
                {detail.call.customer_id ? (
                  <Link
                    to={`/admin/customers/${detail.call.customer_id}`}
                    className="text-blue-600 hover:underline inline-flex items-center gap-1"
                  >
                    {detail.call.customer_company_name || detail.call.customer_email}
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                ) : (
                  <span className="text-gray-400">Unlinked</span>
                )}
                {detail.call.matched_source && (
                  <span className="text-xs text-gray-400 ml-2">
                    (matched via {detail.call.matched_source})
                  </span>
                )}
              </div>
              {detail.call.has_recording && (
                <div className="col-span-2">
                  <div className="text-xs text-gray-500 flex items-center gap-1 mb-2">
                    <Mic className="w-3 h-3" /> Recording
                  </div>

                  {/* Audio player */}
                  {!audioUrl ? (
                    <button
                      onClick={loadAudio}
                      disabled={audioLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
                    >
                      {audioLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                      {audioLoading ? "Loading…" : "Load recording"}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={togglePlay}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                      >
                        {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                        {isPlaying ? "Pause" : "Play"}
                      </button>
                      <audio
                        ref={(el) => { audioRef.el = el; }}
                        src={audioUrl}
                        onEnded={() => setIsPlaying(false)}
                        onPause={() => setIsPlaying(false)}
                        onPlay={() => setIsPlaying(true)}
                        controls
                        className="h-8 flex-1"
                      />
                    </div>
                  )}

                  {/* Transcribe button */}
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <button
                      onClick={handleTranscribe}
                      disabled={transcribing}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-violet-100 text-violet-700 rounded hover:bg-violet-200 disabled:opacity-50"
                    >
                      {transcribing ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                      {transcribing ? "Transcribing…" : transcriptLocal ? "Re-transcribe" : "Transcribe"}
                    </button>

                    {/* Summarize button — only when transcript exists */}
                    {transcriptLocal && (
                      <button
                        onClick={handleSummarize}
                        disabled={summarizing}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-100 text-amber-700 rounded hover:bg-amber-200 disabled:opacity-50"
                      >
                        {summarizing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        {summarizing ? "Summarizing…" : summaryLocal ? "Re-summarize" : "Summarize"}
                      </button>
                    )}
                  </div>

                  {/* Transcript display */}
                  {transcriptLocal && (
                    <div className="mt-3">
                      <div className="text-xs font-medium text-gray-500 mb-1">Transcript</div>
                      <div className="bg-gray-50 rounded p-3 text-sm whitespace-pre-wrap text-gray-700 max-h-60 overflow-y-auto">
                        {transcriptLocal}
                      </div>
                    </div>
                  )}

                  {/* Summary display */}
                  {summaryLocal && (
                    <div className="mt-3">
                      <div className="text-xs font-medium text-gray-500 mb-1">Summary</div>
                      <div className="bg-amber-50 border border-amber-100 rounded p-3 text-sm whitespace-pre-wrap text-gray-700">
                        {summaryLocal}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="border-t pt-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <MessageSquare className="w-4 h-4" /> Notes ({detail.notes.length})
              </h3>
              <div className="space-y-2 mb-3">
                {detail.notes.map((n) => (
                  <div key={n.id} className="bg-gray-50 rounded p-3 text-sm">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span>{n.staff_full_name || "Unknown"}</span>
                      <span title={format(new Date(n.created_at), "PPpp")}>
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap">{n.body}</div>
                  </div>
                ))}
                {detail.notes.length === 0 && (
                  <div className="text-xs text-gray-400 italic">No notes yet</div>
                )}
              </div>
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                rows={3}
                placeholder="Add a note about this call…"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
              <button
                onClick={saveNote}
                disabled={!noteDraft.trim() || savingNote || !staffUserId}
                className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {savingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserIcon className="w-4 h-4" />}
                Save note
              </button>
            </div>

            {/* SMS composer */}
            <div className="border-t pt-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Send className="w-4 h-4" /> Send SMS to caller
              </h3>
              <select
                value={smsTemplateKey}
                onChange={(e) => { setSmsTemplateKey(e.target.value); setCustomSmsBody(""); setSmsVars({}); setSmsResult(null); }}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mb-3"
              >
                <option value="">Pick a preset…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.key}>{t.label}</option>
                ))}
              </select>

              {selectedTemplate && (
                <>
                  {selectedTemplate.variables
                    .filter((v) => !(v === "upload_url" && selectedTemplate.generates_upload_token))
                    .map((v) => (
                      <div key={v} className="mb-2">
                        <label className="text-xs text-gray-500">{v}</label>
                        <input
                          value={smsVars[v] ?? ""}
                          onChange={(e) => setSmsVars((p) => ({ ...p, [v]: e.target.value }))}
                          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                        />
                      </div>
                    ))}
                  <div className="bg-gray-50 rounded p-3 text-sm whitespace-pre-wrap text-gray-700 mb-3">
                    {previewBody}
                  </div>
                </>
              )}

              {/* Custom message textarea — shown when no preset is selected */}
              {!selectedTemplate && (
                <>
                  <div className="text-xs text-gray-400 text-center mb-2">— or type a custom message —</div>
                  <textarea
                    value={customSmsBody}
                    onChange={(e) => { setCustomSmsBody(e.target.value); setSmsResult(null); }}
                    placeholder="Type your message…"
                    rows={3}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mb-3 resize-y"
                  />
                </>
              )}

              {/* Send button — visible when a preset is selected OR custom text is typed */}
              {(selectedTemplate || customSmsBody.trim()) && (
                <>
                  <button
                    onClick={sendSms}
                    disabled={sendingSms}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {sendingSms ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Send to {detail.call.direction === "Inbound" ? detail.call.from_number_e164 : detail.call.to_number_e164}
                  </button>
                  {smsResult && (
                    <div className="mt-2 text-sm">{smsResult}</div>
                  )}
                </>
              )}

              {/* Recent SMS to this caller */}
              {detail.recent_sms.length > 0 && (
                <div className="mt-4">
                  <div className="text-xs text-gray-500 mb-2">Recent SMS history</div>
                  <div className="space-y-1">
                    {detail.recent_sms.map((m) => (
                      <div key={m.id} className="text-xs border-l-2 border-gray-200 pl-2">
                        <span className={`mr-2 px-1.5 py-0.5 rounded text-[10px] ${
                          m.status === "sent" || m.status === "delivered"
                            ? "bg-emerald-100 text-emerald-700"
                            : m.status === "failed"
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-600"
                        }`}>{m.status}</span>
                        <span className="text-gray-500">
                          {m.sent_at ? formatDistanceToNow(new Date(m.sent_at), { addSuffix: true }) : "queued"}
                        </span>
                        <div className="text-gray-700 mt-1">{m.body}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
