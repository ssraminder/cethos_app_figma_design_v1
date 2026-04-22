import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/lib/supabase";
import { useAdminAuthContext } from "@/context/AdminAuthContext";

interface Props {
  orderId: string;
  orderNumber: string;
}

interface Attachment {
  id: string;
  original_filename: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
}

interface Communication {
  id: string;
  kind: "client_email" | "staff_note" | "phone_summary";
  subject: string | null;
  body: string;
  email_date: string | null;
  created_at: string;
  created_by: string | null;
  author?: { full_name: string } | null;
  attachments: Attachment[];
}

interface InstructionsRow {
  id: string;
  order_id: string;
  instructions_text: string;
  change_summary: string | null;
  model_used: string | null;
  prompt_version: string | null;
  generated_at: string;
  generated_by: string | null;
  is_current: boolean;
  edited_by_staff: boolean;
  edited_at: string | null;
  edited_by: string | null;
  is_approved: boolean;
  approved_at: string | null;
  approved_by: string | null;
  vendor_notified_at: string | null;
  generator?: { full_name: string } | null;
  editor?: { full_name: string } | null;
  approver?: { full_name: string } | null;
}

const STORAGE_BUCKET = "quote-files";

export default function OrderCommunicationsTab({ orderId, orderNumber }: Props) {
  const { session: staff } = useAdminAuthContext();

  const [comms, setComms] = useState<Communication[]>([]);
  const [current, setCurrent] = useState<InstructionsRow | null>(null);
  const [history, setHistory] = useState<InstructionsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editText, setEditText] = useState<string>("");
  const [expandedComms, setExpandedComms] = useState<Set<string>>(new Set());

  // ─────────────────────────── Load ───────────────────────────
  const refresh = async () => {
    setLoading(true);
    try {
      const [commsRes, instrRes] = await Promise.all([
        supabase
          .from("order_communications")
          .select(
            `id, kind, subject, body, email_date, created_at, created_by,
             author:staff_users(full_name),
             attachments:order_communication_attachments(
               id, original_filename, storage_path, mime_type, file_size
             )`,
          )
          .eq("order_id", orderId)
          .order("created_at", { ascending: false }),
        supabase
          .from("order_ai_instructions")
          .select(
            `id, order_id, instructions_text, change_summary, model_used,
             prompt_version, generated_at, generated_by, is_current,
             edited_by_staff, edited_at, edited_by, is_approved, approved_at,
             approved_by, vendor_notified_at,
             generator:staff_users!order_ai_instructions_generated_by_fkey(full_name),
             editor:staff_users!order_ai_instructions_edited_by_fkey(full_name),
             approver:staff_users!order_ai_instructions_approved_by_fkey(full_name)`,
          )
          .eq("order_id", orderId)
          .order("generated_at", { ascending: false }),
      ]);

      if (commsRes.error) throw commsRes.error;
      if (instrRes.error) throw instrRes.error;

      setComms((commsRes.data || []) as Communication[]);
      const all = (instrRes.data || []) as InstructionsRow[];
      const cur = all.find((r) => r.is_current) || null;
      setCurrent(cur);
      setHistory(all.filter((r) => !r.is_current));
      setEditText(cur?.instructions_text || "");
    } catch (err) {
      console.error("Communications load failed:", err);
      toast.error("Failed to load client communications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const isDirty = useMemo(
    () => current != null && editText !== current.instructions_text,
    [editText, current],
  );

  // ─────────────────────────── Actions ───────────────────────────
  const generate = async () => {
    if (comms.length === 0) {
      toast.error("Add at least one client communication first.");
      return;
    }
    if (current && current.edited_by_staff && current.is_approved) {
      const ok = window.confirm(
        "This will replace the currently approved (and staff-edited) instructions with a freshly generated draft that vendors will not see until you re-approve. Continue?",
      );
      if (!ok) return;
    } else if (current && isDirty) {
      const ok = window.confirm(
        "You have unsaved edits. Regenerating will discard them. Continue?",
      );
      if (!ok) return;
    }

    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "generate-order-instructions",
        {
          body: {
            order_id: orderId,
            generated_by: staff?.staffId || null,
          },
        },
      );
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Generation failed");
      toast.success("Instructions generated. Review and approve when ready.");
      if (data.skipped_attachments?.length) {
        toast.warning(
          `Some attachments were not readable: ${data.skipped_attachments.join(
            ", ",
          )}`,
          { duration: 8000 },
        );
      }
      await refresh();
    } catch (err) {
      console.error("Generate error:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to generate instructions",
      );
    } finally {
      setGenerating(false);
    }
  };

  const saveEdits = async () => {
    if (!current || !isDirty) return;
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from("order_ai_instructions")
        .update({
          instructions_text: editText,
          edited_by_staff: true,
          edited_at: new Date().toISOString(),
          edited_by: staff?.staffId || null,
          // Editing an already-approved row revokes approval — staff must
          // re-approve so the vendor sees the new copy with a fresh timestamp.
          is_approved: false,
          approved_at: null,
          approved_by: null,
          vendor_notified_at: null,
        })
        .eq("id", current.id);
      if (error) throw error;
      toast.success("Edits saved. Approval was revoked — re-approve to push to vendors.");
      await refresh();
    } catch (err) {
      console.error("Save edit error:", err);
      toast.error("Failed to save edits");
    } finally {
      setSavingEdit(false);
    }
  };

  const approveAndNotify = async () => {
    if (!current) return;
    if (isDirty) {
      toast.error("Save your edits before approving.");
      return;
    }

    setApproving(true);
    try {
      // 1. Approve the row.
      const nowIso = new Date().toISOString();
      const { error: updErr } = await supabase
        .from("order_ai_instructions")
        .update({
          is_approved: true,
          approved_at: nowIso,
          approved_by: staff?.staffId || null,
        })
        .eq("id", current.id);
      if (updErr) throw updErr;

      // 2. Trigger vendor notification (skips if no active vendors).
      const { data: notifyData, error: notifyErr } =
        await supabase.functions.invoke(
          "notify-vendor-instructions-changed",
          { body: { instructions_id: current.id } },
        );
      if (notifyErr) {
        console.warn("Notify failed:", notifyErr);
        toast.warning(
          "Approved, but vendor notification failed. You can re-trigger it from this row.",
        );
      } else if (notifyData?.note === "no_active_vendors") {
        toast.success("Approved. No active vendors on this order yet — no email sent.");
      } else if (notifyData?.skipped === "already_notified") {
        toast.success("Approved. (Vendors were already notified for this version.)");
      } else {
        toast.success(
          `Approved and ${notifyData?.sent || 0} vendor email${notifyData?.sent === 1 ? "" : "s"} sent.`,
        );
      }
      await refresh();
    } catch (err) {
      console.error("Approve error:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to approve instructions",
      );
    } finally {
      setApproving(false);
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedComms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const downloadAttachment = async (att: Attachment) => {
    try {
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(att.storage_path, 60);
      if (error || !data?.signedUrl) throw error || new Error("No URL");
      window.open(data.signedUrl, "_blank");
    } catch (err) {
      console.error("Download error:", err);
      toast.error("Could not generate download link");
    }
  };

  // ─────────────────────────── Render ───────────────────────────
  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-12 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* AI INSTRUCTIONS CARD */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-teal-50/50 to-transparent">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-teal-100 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-teal-700" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                AI-generated job instructions
              </h2>
              <p className="text-xs text-gray-500">
                Vendors only see this once it's approved.
              </p>
            </div>
          </div>
          <button
            onClick={generate}
            disabled={generating || comms.length === 0}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title={comms.length === 0 ? "Add a communication first" : ""}
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {current ? "Regenerate" : "Generate"}
          </button>
        </div>

        {!current ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            <Sparkles className="w-8 h-8 mx-auto text-gray-300 mb-3" />
            No instructions generated yet.{" "}
            {comms.length === 0
              ? "Add at least one client communication below, then click Generate."
              : "Click Generate to create a vendor-ready brief from the communications below."}
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {/* Status row */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {current.is_approved ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                  <CheckCircle className="w-3 h-3" />
                  Approved · vendor-visible
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                  <AlertCircle className="w-3 h-3" />
                  Awaiting approval
                </span>
              )}
              {current.vendor_notified_at && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                  <Mail className="w-3 h-3" />
                  Vendors notified{" "}
                  {format(new Date(current.vendor_notified_at), "MMM d, h:mm a")}
                </span>
              )}
              {current.edited_by_staff && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                  Edited by {current.editor?.full_name || "staff"}
                </span>
              )}
            </div>

            {/* Change summary */}
            {current.change_summary && (
              <div className="border-l-4 border-teal-500 bg-teal-50/50 rounded-r px-3 py-2 text-sm text-gray-700">
                <span className="font-semibold text-teal-800">What changed:</span>{" "}
                {current.change_summary}
              </div>
            )}

            {/* Editable textarea */}
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={18}
              className="w-full font-mono text-sm border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />

            {/* Preview when not dirty */}
            {!isDirty && current.instructions_text && (
              <details className="border border-gray-200 rounded-lg">
                <summary className="px-3 py-2 text-xs font-medium text-gray-600 cursor-pointer hover:bg-gray-50">
                  Preview rendered
                </summary>
                <div className="px-4 py-3 prose prose-sm max-w-none">
                  <ReactMarkdown>{current.instructions_text}</ReactMarkdown>
                </div>
              </details>
            )}

            {/* Footer meta + actions */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <div className="text-xs text-gray-500 space-x-3">
                <span>
                  Generated{" "}
                  {format(new Date(current.generated_at), "MMM d, h:mm a")}
                </span>
                {current.generator?.full_name && (
                  <span>by {current.generator.full_name}</span>
                )}
                {current.model_used && (
                  <span className="font-mono">· {current.model_used}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isDirty && (
                  <>
                    <button
                      onClick={() => setEditText(current.instructions_text)}
                      className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Discard edits
                    </button>
                    <button
                      onClick={saveEdits}
                      disabled={savingEdit}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      {savingEdit && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      )}
                      Save edits
                    </button>
                  </>
                )}
                <button
                  onClick={approveAndNotify}
                  disabled={approving || isDirty || (current.is_approved && !!current.vendor_notified_at)}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 inline-flex items-center gap-1.5"
                  title={
                    isDirty
                      ? "Save edits first"
                      : current.is_approved && current.vendor_notified_at
                        ? "Already approved & notified"
                        : ""
                  }
                >
                  {approving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  {current.is_approved && current.vendor_notified_at
                    ? "Approved & sent"
                    : current.is_approved
                      ? "Re-send to vendors"
                      : "Approve & send to vendors"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="border-t border-gray-100">
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="w-full flex items-center gap-2 px-5 py-3 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              {showHistory ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
              Version history ({history.length})
            </button>
            {showHistory && (
              <div className="px-5 pb-5 space-y-2">
                {history.map((h) => (
                  <details
                    key={h.id}
                    className="border border-gray-200 rounded-lg"
                  >
                    <summary className="px-3 py-2 text-xs cursor-pointer hover:bg-gray-50 flex items-center justify-between">
                      <span className="text-gray-600">
                        {format(new Date(h.generated_at), "MMM d, yyyy h:mm a")}
                        {h.generator?.full_name && (
                          <> · by {h.generator.full_name}</>
                        )}
                        {h.is_approved && h.approved_at && (
                          <>
                            {" "}
                            · approved{" "}
                            {format(new Date(h.approved_at), "MMM d, h:mm a")}
                          </>
                        )}
                      </span>
                      {h.model_used && (
                        <span className="font-mono text-[10px] text-gray-400">
                          {h.model_used}
                        </span>
                      )}
                    </summary>
                    <div className="px-4 py-3 prose prose-sm max-w-none border-t border-gray-100 bg-gray-50/50">
                      <ReactMarkdown>{h.instructions_text}</ReactMarkdown>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* COMMUNICATIONS CARD */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
              <Mail className="w-4 h-4 text-blue-700" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Client communications
              </h2>
              <p className="text-xs text-gray-500">
                {comms.length} entr{comms.length === 1 ? "y" : "ies"} ·
                append-only log
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Add client email
          </button>
        </div>

        {comms.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            <Mail className="w-8 h-8 mx-auto text-gray-300 mb-3" />
            No client communications logged yet. Paste the first email to get
            started.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {comms.map((c) => {
              const expanded = expandedComms.has(c.id);
              const preview =
                c.body.length > 200 ? `${c.body.slice(0, 200)}…` : c.body;
              return (
                <li key={c.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-blue-50 text-blue-700">
                          {c.kind === "client_email"
                            ? "Client email"
                            : c.kind === "phone_summary"
                              ? "Phone summary"
                              : "Staff note"}
                        </span>
                        {c.subject && (
                          <span className="text-sm font-medium text-gray-900 truncate">
                            {c.subject}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1 flex items-center gap-3">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {c.email_date
                            ? format(
                                new Date(c.email_date),
                                "MMM d, yyyy h:mm a",
                              )
                            : format(
                                new Date(c.created_at),
                                "MMM d, yyyy h:mm a",
                              )}
                        </span>
                        {c.author?.full_name && (
                          <span>logged by {c.author.full_name}</span>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleExpanded(c.id)}
                      className="text-xs text-gray-500 hover:text-gray-900"
                    >
                      {expanded ? "Collapse" : "Expand"}
                    </button>
                  </div>

                  <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap break-words">
                    {expanded ? c.body : preview}
                  </div>

                  {c.attachments.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {c.attachments.map((a) => (
                        <button
                          key={a.id}
                          onClick={() => downloadAttachment(a)}
                          className="inline-flex items-center gap-1.5 px-2 py-1 text-xs bg-gray-50 border border-gray-200 rounded hover:bg-gray-100"
                          title={a.original_filename}
                        >
                          <FileText className="w-3.5 h-3.5 text-gray-500" />
                          <span className="max-w-[200px] truncate">
                            {a.original_filename}
                          </span>
                          {a.file_size != null && (
                            <span className="text-gray-400">
                              ({Math.round(a.file_size / 1024)} KB)
                            </span>
                          )}
                          <Download className="w-3 h-3 text-gray-400" />
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ADD COMMUNICATION MODAL */}
      {showAddModal && (
        <AddCommunicationModal
          orderId={orderId}
          orderNumber={orderNumber}
          staffId={staff?.staffId || null}
          onClose={() => setShowAddModal(false)}
          onSaved={() => {
            setShowAddModal(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

// ───────────────────────────── Add Modal ─────────────────────────────

interface AddProps {
  orderId: string;
  orderNumber: string;
  staffId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

interface PendingFile {
  file: File;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
}

function AddCommunicationModal({
  orderId,
  orderNumber,
  staffId,
  onClose,
  onSaved,
}: AddProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [emailDate, setEmailDate] = useState<string>(
    new Date().toISOString().slice(0, 16),
  );
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onPickFiles = (selected: FileList | null) => {
    if (!selected) return;
    setFiles((prev) => [
      ...prev,
      ...Array.from(selected).map((f) => ({
        file: f,
        status: "pending" as const,
      })),
    ]);
  };

  const removeFile = (i: number) =>
    setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (!body.trim()) {
      toast.error("Body is required");
      return;
    }
    setSaving(true);
    try {
      // 1. Insert communication.
      const { data: commRow, error: commErr } = await supabase
        .from("order_communications")
        .insert({
          order_id: orderId,
          kind: "client_email",
          subject: subject.trim() || null,
          body: body.trim(),
          email_date: emailDate ? new Date(emailDate).toISOString() : null,
          created_by: staffId,
        })
        .select()
        .single();
      if (commErr) throw commErr;

      // 2. Upload files + record attachments.
      for (let i = 0; i < files.length; i++) {
        const item = files[i];
        if (item.status !== "pending") continue;
        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i ? { ...f, status: "uploading" } : f,
          ),
        );
        try {
          const ts = Date.now();
          const safeName = item.file.name.replace(/[^\w.\-]+/g, "_");
          const storagePath = `orders/${orderId}/communications/${commRow.id}/${ts}_${safeName}`;
          const { error: upErr } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(storagePath, item.file);
          if (upErr) throw upErr;
          const { error: attErr } = await supabase
            .from("order_communication_attachments")
            .insert({
              communication_id: commRow.id,
              original_filename: item.file.name,
              storage_path: storagePath,
              mime_type: item.file.type || null,
              file_size: item.file.size,
            });
          if (attErr) throw attErr;
          setFiles((prev) =>
            prev.map((f, idx) =>
              idx === i ? { ...f, status: "success" } : f,
            ),
          );
        } catch (err) {
          console.error("Attachment upload failed:", err);
          setFiles((prev) =>
            prev.map((f, idx) =>
              idx === i
                ? {
                    ...f,
                    status: "error",
                    error: err instanceof Error ? err.message : "upload failed",
                  }
                : f,
            ),
          );
        }
      }

      const failed = files.filter((f) => f.status === "error").length;
      if (failed > 0) {
        toast.warning(
          `Saved communication, but ${failed} attachment${failed === 1 ? "" : "s"} failed to upload.`,
        );
      } else {
        toast.success("Client communication saved.");
      }
      onSaved();
    } catch (err) {
      console.error("Save communication error:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to save communication",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Add client email
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Order {orderNumber} · paste exactly what the client sent.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Subject (optional)
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Re: Translation request"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Email date
              </label>
              <input
                type="datetime-local"
                value={emailDate}
                onChange={(e) => setEmailDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Email body <span className="text-red-500">*</span>
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              placeholder="Paste the full email body here…"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Attachments (optional)
            </label>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onPickFiles(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-5 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50/40 transition-colors"
            >
              <Upload className="w-7 h-7 mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-600">
                Drag & drop or{" "}
                <span className="text-blue-600 font-medium">browse</span>
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Word docs, PDFs, images, plain text
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={(e) => onPickFiles(e.target.files)}
                className="hidden"
              />
            </div>

            {files.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {files.map((f, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-md text-sm"
                  >
                    <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="flex-1 truncate">{f.file.name}</span>
                    <span className="text-xs text-gray-400">
                      {Math.round(f.file.size / 1024)} KB
                    </span>
                    {f.status === "pending" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(i);
                        }}
                        className="p-0.5 text-gray-400 hover:text-red-500"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {f.status === "uploading" && (
                      <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                    )}
                    {f.status === "success" && (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    )}
                    {f.status === "error" && (
                      <span title={f.error}>
                        <AlertCircle className="w-4 h-4 text-red-500" />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t bg-gray-50">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !body.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save communication
          </button>
        </div>
      </div>
    </div>
  );
}
