// SplitStepModal — partition one workflow step across multiple assignees.
// Ported from the Cethos Design System prototype (workflow-split/SplitModal.jsx);
// demo data is replaced with real Supabase queries against quote_files +
// vendors + staff_users. Submits to the split-step edge function.

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  Loader2,
  X,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  FileText,
} from "lucide-react";

interface QuoteFile {
  id: string;
  original_filename: string;
  custom_label: string | null;
  word_count: number | null;
  page_count: number | null;
}

// quote_files itself doesn't carry word/page counts — those live on
// ai_analysis_results keyed by quote_file_id (or quote-wide rows with a
// null quote_file_id, for older orders). We do a separate lookup so the
// modal can display per-file volume next to each filename.
interface AiCount {
  quote_file_id: string | null;
  word_count: number | null;
  page_count: number | null;
}

interface Vendor {
  id: string;
  full_name: string;
  email: string | null;
}

interface Staff {
  id: string;
  full_name: string;
  email: string | null;
}

type AssigneeKind = "vendor" | "staff";

interface Partition {
  uid: string;
  files: string[];
  assigneeKind: AssigneeKind;
  vendor_id: string;
  assigned_staff_id: string;
  rate: string;
  currency: string;
  /** Date in yyyy-MM-dd (HTML <input type="date">). */
  deadline: string;
  /** Time in HH:mm 24-hour (e.g. "17:00"). Combined with `deadline` + the
   *  user's local timezone offset when the payload is built. */
  deadline_time: string;
}

/* === 30-minute time slots for the deadline picker. 48 options total. ====== */
const TIME_OPTIONS: Array<{ value: string; label: string }> = (() => {
  const out: Array<{ value: string; label: string }> = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const hh12 = h % 12 === 0 ? 12 : h % 12;
      const ap = h < 12 ? "AM" : "PM";
      const label = `${hh12}:${String(m).padStart(2, "0")} ${ap}`;
      out.push({ value, label });
    }
  }
  return out;
})();

/** Browser's local IANA timezone (e.g. "America/Toronto"). */
const LOCAL_TZ_IANA = Intl.DateTimeFormat().resolvedOptions().timeZone;
/** Short abbr (e.g. "EDT", "PDT") for the badge. */
const LOCAL_TZ_ABBR = (() => {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
})();

interface Props {
  open: boolean;
  onClose: () => void;
  onSplit: () => void | Promise<void>; // refetch hook
  parentStep: {
    id: string;
    name: string;
    step_number: number;
    service_name: string | null;
    source_language_name: string | null;
    target_language_name: string | null;
    deadline: string | null;
    vendor_currency: string | null;
  };
  orderId: string;
}

let _uid = 0;
const newPartition = (
  defaultCurrency: string,
  defaultDeadline: string,
  defaultDeadlineTime: string,
): Partition => ({
  uid: `p${++_uid}`,
  files: [],
  assigneeKind: "vendor",
  vendor_id: "",
  assigned_staff_id: "",
  rate: "",
  currency: defaultCurrency,
  deadline: defaultDeadline,
  deadline_time: defaultDeadlineTime,
});

export function SplitStepModal({ open, onClose, onSplit, parentStep, orderId }: Props) {
  const defaultCurrency = parentStep.vendor_currency ?? "CAD";
  /* Derive both date + time from the parent step deadline if it has one,
   * snapping the time to the nearest 30-min slot. Otherwise fall back to
   * 5:00 PM local time (matches the prior hardcoded behaviour). */
  const defaultDeadline = parentStep.deadline ? new Date(parentStep.deadline).toLocaleDateString("en-CA") : "";
  const defaultDeadlineTime = (() => {
    if (!parentStep.deadline) return "17:00";
    const d = new Date(parentStep.deadline);
    const h = d.getHours();
    const m = d.getMinutes() >= 45 ? 0 : d.getMinutes() >= 15 ? 30 : 0;
    const hh = d.getMinutes() >= 45 ? (h + 1) % 24 : h;
    return `${String(hh).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  })();

  const [files, setFiles] = useState<QuoteFile[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [partitions, setPartitions] = useState<Partition[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [addMenuFor, setAddMenuFor] = useState<string | null>(null);

  // Initial load when modal opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setPartitions([newPartition(defaultCurrency, defaultDeadline, defaultDeadlineTime)]);

    (async () => {
      try {
        // Resolve the order's quote_id first so we can scope quote_files.
        const { data: orderRow, error: orderErr } = await supabase
          .from("orders")
          .select("quote_id")
          .eq("id", orderId)
          .maybeSingle();
        if (orderErr) throw orderErr;
        if (!orderRow?.quote_id) throw new Error("Order has no associated quote");

        const [filesRes, aiRes, vendorsRes, staffRes] = await Promise.all([
          supabase
            .from("quote_files")
            .select("id, original_filename, custom_label")
            .eq("quote_id", orderRow.quote_id)
            .is("deleted_at", null)
            .order("original_filename"),
          supabase
            .from("ai_analysis_results")
            .select("quote_file_id, word_count, page_count")
            .eq("quote_id", orderRow.quote_id)
            .is("deleted_at", null),
          supabase
            .from("vendors")
            .select("id, full_name, email")
            .eq("status", "active")
            .order("full_name")
            .limit(500),
          supabase
            .from("staff_users")
            .select("id, full_name, email")
            .eq("is_active", true)
            .order("full_name"),
        ]);
        if (cancelled) return;
        if (filesRes.error) throw filesRes.error;
        if (vendorsRes.error) throw vendorsRes.error;
        if (staffRes.error) throw staffRes.error;

        // Merge ai counts (per-file rows) onto the file list. Quote-wide
        // rows (quote_file_id IS NULL) are ignored here — the modal shows
        // per-file numbers and falls back to "—" if absent.
        const aiByFile = new Map<string, { wc: number | null; pc: number | null }>();
        for (const a of (aiRes.data ?? []) as AiCount[]) {
          if (a.quote_file_id) {
            aiByFile.set(a.quote_file_id, { wc: a.word_count, pc: a.page_count });
          }
        }
        const filesWithCounts: QuoteFile[] = (filesRes.data ?? []).map((f: any) => ({
          ...f,
          word_count: aiByFile.get(f.id)?.wc ?? null,
          page_count: aiByFile.get(f.id)?.pc ?? null,
        }));
        setFiles(filesWithCounts);
        setVendors(vendorsRes.data ?? []);
        setStaff(staffRes.data ?? []);
      } catch (e: any) {
        console.error("SplitStepModal load failed:", e);
        toast.error(e?.message ?? "Failed to load split form");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId]);

  const assignedIds = useMemo(() => new Set(partitions.flatMap((p) => p.files)), [partitions]);
  const unassigned = useMemo(() => files.filter((f) => !assignedIds.has(f.id)), [files, assignedIds]);
  const allAssigned = unassigned.length === 0 && files.length > 0;
  const everyPartHasFile = partitions.every((p) => p.files.length > 0);
  const everyPartHasAssignee = partitions.every((p) =>
    p.assigneeKind === "vendor" ? Boolean(p.vendor_id) : Boolean(p.assigned_staff_id),
  );
  const canSave = allAssigned && everyPartHasFile && everyPartHasAssignee && partitions.length >= 2 && !submitting;

  const update = (uid: string, patch: Partial<Partition>) =>
    setPartitions((ps) => ps.map((p) => (p.uid === uid ? { ...p, ...patch } : p)));
  const addFile = (uid: string, fid: string) => {
    setPartitions((ps) => ps.map((p) => (p.uid === uid ? { ...p, files: [...p.files, fid] } : p)));
    setAddMenuFor(null);
  };
  const removeFile = (uid: string, fid: string) =>
    setPartitions((ps) => ps.map((p) => (p.uid === uid ? { ...p, files: p.files.filter((x) => x !== fid) } : p)));

  async function handleSubmit() {
    if (!canSave) return;
    setSubmitting(true);
    try {
      const payload = {
        parent_step_id: parentStep.id,
        partitions: partitions.map((p) => {
          const isVendor = p.assigneeKind === "vendor";
          const rateNum = p.rate ? Number(p.rate) : undefined;
          return {
            quote_file_ids: p.files,
            assignee_kind: p.assigneeKind,
            vendor_id: isVendor ? p.vendor_id : undefined,
            assigned_staff_id: !isVendor ? p.assigned_staff_id : undefined,
            /* Combine yyyy-MM-dd date + HH:mm time in the user's local timezone,
             * then serialize as UTC ISO. Falls back to 5 PM if the time slot
             * is somehow empty (matches the prior default). */
            deadline: p.deadline
              ? new Date(`${p.deadline}T${p.deadline_time || "17:00"}:00`).toISOString()
              : undefined,
            vendor_rate: isVendor && Number.isFinite(rateNum) ? rateNum : undefined,
            vendor_rate_unit: isVendor && Number.isFinite(rateNum) ? ("per_word" as const) : undefined,
            vendor_currency: isVendor ? p.currency : undefined,
          };
        }),
      };
      const { data, error } = await supabase.functions.invoke("split-step", { body: payload });
      if (error) throw error;
      if (data && (data as any).error) throw new Error((data as any).detail || (data as any).error);
      toast.success(`Split into ${partitions.length} partitions`);
      await onSplit();
      onClose();
    } catch (e: any) {
      console.error("split-step invocation failed:", e);
      toast.error(e?.message ?? "Failed to split step");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const titleSegments = [
    `Step ${parentStep.step_number} · ${parentStep.name}`,
    parentStep.source_language_name && parentStep.target_language_name
      ? `${parentStep.source_language_name} → ${parentStep.target_language_name}`
      : null,
    `${files.length} file${files.length === 1 ? "" : "s"}`,
  ].filter(Boolean);

  return createPortal(
    <div
      className="fixed inset-0 z-[80] bg-slate-900/40 flex items-start justify-center p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-xl shadow-lg w-full max-w-4xl overflow-hidden border border-slate-200 my-8 flex flex-col max-h-[calc(100vh-4rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-start justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Split step across multiple assignees</h3>
            <p className="text-[13px] text-slate-500 mt-0.5">{titleSegments.join(" · ")}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="p-12 grid place-items-center text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <>
            {/* Body: two-pane. flex-1 + min-h-0 so the grid claims remaining flex space
                and child overflow-y-auto actually scrolls inside the modal instead of
                pushing the footer off-screen. */}
            <div className="grid grid-cols-[300px_1fr] gap-0 flex-1 min-h-0">
              {/* Left: files */}
              <div className="border-r border-slate-100 p-5 bg-slate-50/50 overflow-y-auto">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">
                  Order files
                </div>
                <div className="space-y-2">
                  {files.length === 0 && (
                    <div className="text-[13px] text-slate-400 italic">No files on this order.</div>
                  )}
                  {files.map((f) => {
                    const where = partitions.find((p) => p.files.includes(f.id));
                    const idx = where ? partitions.indexOf(where) + 1 : null;
                    return (
                      <div
                        key={f.id}
                        className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] ${
                          where ? "border-slate-200 bg-slate-100 opacity-60" : "border-slate-200 bg-white"
                        }`}
                      >
                        <FileText
                          className={`w-4 h-4 flex-shrink-0 ${where ? "text-cethos-teal" : "text-slate-300"}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-[12.5px] text-slate-700 truncate">
                            {f.custom_label ?? f.original_filename}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {f.page_count ? `${f.page_count} pp` : "— pp"} ·{" "}
                            {f.word_count ? `${f.word_count.toLocaleString()} w` : "— w"}
                          </div>
                        </div>
                        {where && (
                          <span className="text-[10px] font-bold text-cethos-teal bg-cethos-teal/10 px-1.5 py-0.5 rounded">
                            P{idx}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
                  All files must end up in exactly one partition before save.
                </p>
              </div>

              {/* Right: partitions */}
              <div className="p-5 overflow-y-auto bg-white">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">
                  Partitions
                </div>
                <div className="space-y-3">
                  {partitions.map((p, i) => (
                    <PartitionCard
                      key={p.uid}
                      p={p}
                      idx={i + 1}
                      files={files}
                      unassigned={unassigned}
                      vendors={vendors}
                      staff={staff}
                      addMenuOpen={addMenuFor === p.uid}
                      onToggleAddMenu={() => setAddMenuFor(addMenuFor === p.uid ? null : p.uid)}
                      onAddFile={(fid) => addFile(p.uid, fid)}
                      onRemoveFile={(fid) => removeFile(p.uid, fid)}
                      onUpdate={(patch) => update(p.uid, patch)}
                      onDelete={() => setPartitions((ps) => ps.filter((x) => x.uid !== p.uid))}
                      canDelete={partitions.length > 1}
                    />
                  ))}
                </div>
                <button
                  onClick={() =>
                    setPartitions((ps) => [...ps, newPartition(defaultCurrency, defaultDeadline, defaultDeadlineTime)])
                  }
                  className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-slate-300 text-[13px] font-medium text-slate-500 hover:border-cethos-teal hover:text-cethos-teal transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add another partition
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 px-6 py-4 border-t border-slate-100 bg-white">
              <div
                className={`flex items-center gap-2 text-[13px] font-medium mb-3 ${
                  allAssigned ? "text-emerald-600" : "text-amber-600"
                }`}
              >
                {allAssigned ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                {allAssigned
                  ? `All ${files.length} files assigned`
                  : `${unassigned.length} file${unassigned.length === 1 ? "" : "s"} not yet assigned to any partition`}
              </div>
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!canSave}
                  className={`px-4 py-2 text-sm font-medium rounded-lg border border-transparent ${
                    canSave
                      ? "bg-cethos-teal-600 text-white hover:bg-cethos-teal-500"
                      : "bg-slate-200 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin inline -mt-0.5 mr-1.5" />}
                  Save split ({partitions.length})
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

interface PartitionCardProps {
  p: Partition;
  idx: number;
  files: QuoteFile[];
  unassigned: QuoteFile[];
  vendors: Vendor[];
  staff: Staff[];
  addMenuOpen: boolean;
  onToggleAddMenu: () => void;
  onAddFile: (fid: string) => void;
  onRemoveFile: (fid: string) => void;
  onUpdate: (patch: Partial<Partition>) => void;
  onDelete: () => void;
  canDelete: boolean;
}

function PartitionCard({
  p,
  idx,
  files,
  unassigned,
  vendors,
  staff,
  addMenuOpen,
  onToggleAddMenu,
  onAddFile,
  onRemoveFile,
  onUpdate,
  onDelete,
  canDelete,
}: PartitionCardProps) {
  const isExternal = p.assigneeKind === "vendor";
  const sel =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] text-slate-700 bg-white focus:outline-none focus:border-cethos-teal-600 focus:ring-2 focus:ring-cethos-teal-600/20";
  const fileById = (id: string) => files.find((f) => f.id === id);

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/60 rounded-t-lg">
        <span className="text-[12px] font-bold text-slate-500">Partition {idx}</span>
        <button
          onClick={onDelete}
          disabled={!canDelete}
          className={`p-1 rounded ${
            canDelete ? "text-slate-400 hover:text-red-600 hover:bg-red-50" : "text-slate-200 cursor-not-allowed"
          }`}
          title={canDelete ? "Delete this partition" : "Need at least 2 partitions"}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-4 space-y-3">
        {/* Files */}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Files</div>
          <div className="flex flex-wrap gap-1.5">
            {p.files.map((fid) => {
              const f = fileById(fid);
              return (
                <span
                  key={fid}
                  className="inline-flex items-center gap-1.5 bg-cethos-teal-600/10 text-cethos-teal-600 text-[12px] font-medium pl-2 pr-1 py-1 rounded-md"
                >
                  <span className="font-mono">{f?.original_filename ?? fid}</span>
                  <button onClick={() => onRemoveFile(fid)} className="hover:bg-cethos-teal-600/20 rounded p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
            <div className="relative">
              <button
                onClick={onToggleAddMenu}
                disabled={unassigned.length === 0}
                className={`inline-flex items-center gap-1 text-[12px] font-medium px-2 py-1 rounded-md border border-dashed ${
                  unassigned.length === 0
                    ? "border-slate-200 text-slate-300 cursor-not-allowed"
                    : "border-slate-300 text-slate-500 hover:border-cethos-teal-600 hover:text-cethos-teal-600"
                }`}
              >
                <Plus className="w-3 h-3" /> Add file…
              </button>
              {addMenuOpen && unassigned.length > 0 && (
                <div className="absolute left-0 top-full mt-1 z-20 bg-white rounded-lg border border-slate-200 shadow-lg py-1 min-w-[220px] max-h-60 overflow-y-auto">
                  {unassigned.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => onAddFile(f.id)}
                      className="w-full text-left px-3 py-1.5 text-[12.5px] font-mono text-slate-700 hover:bg-slate-50 truncate"
                    >
                      {f.original_filename}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Assignee */}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Assignee</div>
          <div className="flex gap-4 mb-2.5">
            {([
              ["vendor", "External vendor"],
              ["staff", "In-house staff"],
            ] as Array<[AssigneeKind, string]>).map(([val, label]) => (
              <label key={val} className="flex items-center gap-2 text-[13px] text-slate-700 cursor-pointer">
                <span
                  className={`w-4 h-4 rounded-full border-2 grid place-items-center ${
                    p.assigneeKind === val ? "border-cethos-teal-600" : "border-slate-300"
                  }`}
                >
                  {p.assigneeKind === val && <span className="w-2 h-2 rounded-full bg-cethos-teal-600" />}
                </span>
                <input
                  type="radio"
                  className="sr-only"
                  checked={p.assigneeKind === val}
                  onChange={() => onUpdate({ assigneeKind: val })}
                />
                {label}
              </label>
            ))}
          </div>

          {isExternal ? (
            <div className="space-y-2">
              <select
                className={sel}
                value={p.vendor_id}
                onChange={(e) => onUpdate({ vendor_id: e.target.value })}
              >
                <option value="">Vendor — search…</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.full_name}
                    {v.email ? ` (${v.email})` : ""}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <input
                    className={sel}
                    placeholder="Rate (optional)"
                    type="number"
                    step="0.001"
                    min="0"
                    value={p.rate}
                    onChange={(e) => onUpdate({ rate: e.target.value })}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">/word</span>
                </div>
                <select className={sel} value={p.currency} onChange={(e) => onUpdate({ currency: e.target.value })}>
                  <option>CAD</option>
                  <option>USD</option>
                  <option>EUR</option>
                  <option>GBP</option>
                  <option>INR</option>
                </select>
              </div>
              <DeadlinePicker
                date={p.deadline}
                time={p.deadline_time}
                onChange={(patch) => onUpdate(patch)}
                sel={sel}
              />
              <p className="text-[11px] text-slate-400">
                Rate is optional — leave blank to set later via Manage Payable on the child step.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <select
                className={sel}
                value={p.assigned_staff_id}
                onChange={(e) => onUpdate({ assigned_staff_id: e.target.value })}
              >
                <option value="">Staff member — search…</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                    {s.email ? ` (${s.email})` : ""}
                  </option>
                ))}
              </select>
              <DeadlinePicker
                date={p.deadline}
                time={p.deadline_time}
                onChange={(patch) => onUpdate(patch)}
                sel={sel}
              />
              <p className="text-[11px] text-slate-400">In-house work has no payable — rate fields hidden.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * DeadlinePicker — date + 30-min time slot + timezone badge.
 *
 * Stores date as yyyy-MM-dd and time as HH:mm 24-hour. The submit handler
 * combines them into a full ISO datetime in the user's local timezone before
 * sending to the edge function.
 * ============================================================================ */
interface DeadlinePickerProps {
  date: string;
  time: string;
  onChange: (patch: { deadline?: string; deadline_time?: string }) => void;
  sel: string;
}

function DeadlinePicker({ date, time, onChange, sel }: DeadlinePickerProps) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Deadline
      </div>
      <div className="grid grid-cols-[1.4fr_1fr_auto] gap-2 items-center">
        <input
          className={sel}
          type="date"
          value={date}
          onChange={(e) => onChange({ deadline: e.target.value })}
          aria-label="Deadline date"
        />
        <select
          className={sel}
          value={time || "17:00"}
          onChange={(e) => onChange({ deadline_time: e.target.value })}
          disabled={!date}
          aria-label="Deadline time"
          title={!date ? "Pick a date first" : "Deadline time"}
        >
          {TIME_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <span
          className="text-[11px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-1.5 rounded-md whitespace-nowrap"
          title={LOCAL_TZ_IANA}
        >
          {LOCAL_TZ_ABBR || "Local"}
        </span>
      </div>
    </div>
  );
}
