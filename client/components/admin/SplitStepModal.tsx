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
  deadline: string;
}

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
const newPartition = (defaultCurrency: string, defaultDeadline: string): Partition => ({
  uid: `p${++_uid}`,
  files: [],
  assigneeKind: "vendor",
  vendor_id: "",
  assigned_staff_id: "",
  rate: "",
  currency: defaultCurrency,
  deadline: defaultDeadline,
});

export function SplitStepModal({ open, onClose, onSplit, parentStep, orderId }: Props) {
  const defaultCurrency = parentStep.vendor_currency ?? "CAD";
  const defaultDeadline = parentStep.deadline ? parentStep.deadline.slice(0, 10) : "";

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
    setPartitions([newPartition(defaultCurrency, defaultDeadline)]);

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
            deadline: p.deadline ? new Date(p.deadline + "T17:00:00").toISOString() : undefined,
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
      className="fixed inset-0 z-[80] bg-slate-900/40 flex items-start justify-center p-6 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-xl shadow-lg w-full max-w-4xl overflow-hidden border border-slate-200 my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100">
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
            {/* Body: two-pane */}
            <div className="grid grid-cols-[300px_1fr] gap-0 max-h-[560px]">
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
                    setPartitions((ps) => [...ps, newPartition(defaultCurrency, defaultDeadline)])
                  }
                  className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-slate-300 text-[13px] font-medium text-slate-500 hover:border-cethos-teal hover:text-cethos-teal transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add another partition
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100">
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
              <input
                className={sel}
                type="date"
                value={p.deadline}
                onChange={(e) => onUpdate({ deadline: e.target.value })}
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
              <input
                className={sel}
                type="date"
                value={p.deadline}
                onChange={(e) => onUpdate({ deadline: e.target.value })}
              />
              <p className="text-[11px] text-slate-400">In-house work has no payable — rate fields hidden.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
