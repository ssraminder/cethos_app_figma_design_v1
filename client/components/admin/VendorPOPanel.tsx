// VendorPOPanel — per-step vendor Purchase Order controls on the order
// workflow step card: PO number + Open/Invoiced status, Download, Resend (or
// Send if none yet), and an expandable send/audit log. Backed by the
// manage-vendor-po edge function.
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { FileText, Download, RefreshCw, Loader2, Send, ScrollText } from "lucide-react";
import { useAdminAuthContext } from "@/context/AdminAuthContext";

export interface VendorPOSummary {
  id: string;
  po_number: string;
  workflow_step_id: string;
  status: "open" | "invoiced" | "paid" | "draft";
  total: number | null;
  currency: string | null;
  sent_at: string | null;
  last_send_at: string | null;
  send_count: number;
  has_pdf: boolean;
}

interface PoLog {
  id: string;
  sent_to: string | null;
  status: string;
  source: string;
  error: string | null;
  created_at: string;
  triggered_by_name: string;
}

const STATUS_STYLE: Record<string, string> = {
  open: "bg-amber-50 text-amber-700 border-amber-200",
  invoiced: "bg-blue-50 text-blue-700 border-blue-200",
  paid: "bg-green-50 text-green-700 border-green-200",
  draft: "bg-gray-100 text-gray-600 border-gray-200",
};
const STATUS_LABEL: Record<string, string> = { open: "Open", invoiced: "Invoiced", paid: "Paid", draft: "Not sent" };

const fmtMoney = (n: number | null, c: string | null) => {
  if (n == null) return "";
  const sym = c === "CAD" ? "C$" : c === "EUR" ? "€" : "$";
  return `${sym}${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtWhen = (s: string | null) => (s ? new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—");

export default function VendorPOPanel({
  po,
  step,
  onChanged,
}: {
  po?: VendorPOSummary;
  step: { id: string; vendor_id: string | null; vendor_name?: string | null };
  onChanged: () => void;
}) {
  const { session: currentStaff } = useAdminAuthContext();
  const [busy, setBusy] = useState<null | "send" | "download">(null);
  const [showLog, setShowLog] = useState(false);
  const [logs, setLogs] = useState<PoLog[] | null>(null);
  const [logLoading, setLogLoading] = useState(false);

  if (!step.vendor_id) return null;

  const invoke = async (action: string, body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("manage-vendor-po", { body: { action, ...body } });
    if (error) throw new Error(error.message);
    if (data && data.success === false) throw new Error(data.error || "Request failed");
    return data;
  };

  const handleSend = async () => {
    setBusy("send");
    try {
      const res = await invoke("send", po?.id
        ? { po_id: po.id, triggered_by: currentStaff?.staffId }
        : { workflow_step_id: step.id, vendor_id: step.vendor_id, triggered_by: currentStaff?.staffId });
      toast.success(`PO ${res.po_number} sent to ${res.sent_to}`);
      if (showLog) await loadLogs(res.po_id);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Failed to send PO");
    } finally {
      setBusy(null);
    }
  };

  const handleDownload = async () => {
    if (!po?.id) return;
    setBusy("download");
    try {
      const res = await invoke("download", { po_id: po.id });
      window.open(res.url, "_blank", "noopener");
    } catch (e: any) {
      toast.error(e?.message || "Failed to get PO PDF");
    } finally {
      setBusy(null);
    }
  };

  const loadLogs = async (poId?: string) => {
    const id = poId || po?.id;
    if (!id) return;
    setLogLoading(true);
    try {
      const res = await invoke("logs", { po_id: id });
      setLogs(res.logs || []);
    } catch {
      setLogs([]);
    } finally {
      setLogLoading(false);
    }
  };

  const toggleLog = async () => {
    const next = !showLog;
    setShowLog(next);
    if (next && logs === null) await loadLogs();
  };

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700">
          <FileText className="w-3.5 h-3.5 text-teal-700" />
          Purchase Order
        </span>

        {po ? (
          <>
            <span className="text-xs font-semibold text-gray-900">{po.po_number}</span>
            <span className={`text-[11px] px-1.5 py-0.5 rounded border ${STATUS_STYLE[po.status] || STATUS_STYLE.draft}`}>
              {STATUS_LABEL[po.status] || po.status}
            </span>
            {po.total != null && <span className="text-[11px] text-gray-500">{fmtMoney(po.total, po.currency)}</span>}
            {po.send_count > 0 && (
              <span className="text-[11px] text-gray-400">Sent {po.send_count}× · last {fmtWhen(po.last_send_at)}</span>
            )}
            <div className="ml-auto flex items-center gap-1">
              <button type="button" onClick={handleDownload} disabled={busy !== null || !po.has_pdf}
                className="text-xs text-gray-500 hover:text-teal-700 inline-flex items-center gap-1 disabled:opacity-50" title="Download PO PDF">
                {busy === "download" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">Download</span>
              </button>
              <button type="button" onClick={handleSend} disabled={busy !== null}
                className="text-xs text-gray-500 hover:text-teal-700 inline-flex items-center gap-1 disabled:opacity-50" title="Re-send PO email to the vendor">
                {busy === "send" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">Resend</span>
              </button>
              <button type="button" onClick={toggleLog}
                className="text-xs text-gray-500 hover:text-teal-700 inline-flex items-center gap-1" title="Show PO send log">
                <ScrollText className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Log</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="text-[11px] text-gray-400 italic">No PO sent yet</span>
            <div className="ml-auto">
              <button type="button" onClick={handleSend} disabled={busy !== null}
                className="text-xs text-white bg-teal-600 hover:bg-teal-700 rounded px-2 py-1 inline-flex items-center gap-1 disabled:opacity-50" title="Generate and email a PO to the vendor">
                {busy === "send" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Send PO
              </button>
            </div>
          </>
        )}
      </div>

      {showLog && (
        <div className="mt-2 border-t border-gray-200 pt-2">
          {logLoading ? (
            <div className="text-[11px] text-gray-400 inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Loading log…</div>
          ) : logs && logs.length > 0 ? (
            <ul className="space-y-1">
              {logs.map((l) => (
                <li key={l.id} className="text-[11px] flex flex-wrap items-center gap-x-2 text-gray-600">
                  <span className="text-gray-400">{fmtWhen(l.created_at)}</span>
                  <span className={l.status === "sent" ? "text-green-700" : "text-red-600"}>{l.status === "sent" ? "Sent" : "Failed"}</span>
                  <span>→ {l.sent_to || "—"}</span>
                  <span className="text-gray-400">· {l.source === "manual" ? "Manual" : "Auto"} ({l.triggered_by_name})</span>
                  {l.error && <span className="text-red-500">· {l.error.slice(0, 80)}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-[11px] text-gray-400">No sends logged yet.</div>
          )}
        </div>
      )}
    </div>
  );
}
