// NewNonconformityModal — raise a nonconformity (ISO §4.6 / SOP §9), either
// standalone (internal/audit) or escalated from a complaint (prefill carries the
// complaint id + its vendor). Calls manage-quality:create_nonconformity.

import { useState } from "react";
import { X, Loader2, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface Prefill {
  source_complaint_id?: string;
  complaint_number?: string;
  vendor_id?: string;
  vendor_name?: string;
  order_id?: string;
  order_number?: string;
  title?: string;
  source?: string;
  severity?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (nc: any) => void;
  prefill?: Prefill;
}

const SOURCES = ["complaint", "revision_finding", "late_delivery", "internal_audit", "quality_issue", "other"];
const SEVERITIES = ["low", "medium", "high", "critical"];

export default function NewNonconformityModal({ open, onClose, onCreated, prefill }: Props) {
  const [title, setTitle] = useState(prefill?.title ?? "");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState(prefill?.source ?? (prefill?.source_complaint_id ? "complaint" : "internal_audit"));
  const [severity, setSeverity] = useState(prefill?.severity ?? "medium");
  const [saving, setSaving] = useState(false);

  const [vendorId, setVendorId] = useState<string | null>(prefill?.vendor_id ?? null);
  const [vendorLabel, setVendorLabel] = useState<string | null>(prefill?.vendor_name ?? null);
  const [vendorQuery, setVendorQuery] = useState("");
  const [vendorResults, setVendorResults] = useState<any[]>([]);

  const [orderId, setOrderId] = useState<string | null>(prefill?.order_id ?? null);
  const [orderLabel, setOrderLabel] = useState<string | null>(prefill?.order_number ?? null);
  const [orderQuery, setOrderQuery] = useState("");
  const [orderResults, setOrderResults] = useState<any[]>([]);

  if (!open) return null;

  const searchVendors = async () => {
    if (!vendorQuery.trim()) return;
    const { data } = await supabase
      .from("vendors").select("id, full_name, email")
      .or(`full_name.ilike.%${vendorQuery}%,email.ilike.%${vendorQuery}%`).limit(8);
    setVendorResults(data ?? []);
  };

  const searchOrders = async () => {
    if (!orderQuery.trim()) return;
    const { data } = await supabase
      .from("orders").select("id, order_number, client_project_number")
      .or(`order_number.ilike.%${orderQuery}%,client_project_number.ilike.%${orderQuery}%`)
      .order("created_at", { ascending: false }).limit(8);
    setOrderResults(data ?? []);
  };

  const submit = async () => {
    if (!title.trim()) {
      toast.error("Title is required.");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title, description: description || null, source, severity,
        source_complaint_id: prefill?.source_complaint_id ?? null,
        vendor_id: vendorId, order_id: orderId,
      };
      const { data, error } = await supabase.functions.invoke("manage-quality", {
        body: { action: "create_nonconformity", payload },
      });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || "Create failed");
      toast.success(`Nonconformity ${data?.result?.nc_number ?? ""} raised.`);
      onCreated?.(data?.result);
      onClose();
    } catch (err: any) {
      toast.error(`Failed to raise nonconformity: ${err?.message ?? "unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Raise a nonconformity</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {prefill?.complaint_number && (
            <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              Escalated from complaint <span className="font-medium text-gray-700">{prefill.complaint_number}</span>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Short title of the nonconformity" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Source</label>
              <select value={source} onChange={(e) => setSource(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                {SOURCES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Severity</label>
              <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Linked order / project (optional)</label>
            {orderId ? (
              <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <span>{orderLabel || orderId}</span>
                {!prefill?.order_id && (
                  <button onClick={() => { setOrderId(null); setOrderLabel(null); }} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                )}
              </div>
            ) : (
              <div>
                <div className="flex gap-2">
                  <input value={orderQuery} onChange={(e) => setOrderQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && searchOrders()}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Search order # or client project number" />
                  <button onClick={searchOrders} className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"><Search className="w-4 h-4" /></button>
                </div>
                {orderResults.length > 0 && (
                  <div className="mt-1 border border-gray-200 rounded-lg divide-y">
                    {orderResults.map((o) => (
                      <button key={o.id} onClick={() => { setOrderId(o.id); setOrderLabel(o.order_number + (o.client_project_number ? ` · ${o.client_project_number}` : "")); setOrderResults([]); }}
                        className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                        {o.order_number} {o.client_project_number && <span className="text-gray-400">· {o.client_project_number}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Linked linguist (optional)</label>
            {vendorId ? (
              <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <span>{vendorLabel || vendorId}</span>
                {!prefill?.vendor_id && (
                  <button onClick={() => { setVendorId(null); setVendorLabel(null); }} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                )}
              </div>
            ) : (
              <div>
                <div className="flex gap-2">
                  <input value={vendorQuery} onChange={(e) => setVendorQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && searchVendors()}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Search vendor by name or email" />
                  <button onClick={searchVendors} className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"><Search className="w-4 h-4" /></button>
                </div>
                {vendorResults.length > 0 && (
                  <div className="mt-1 border border-gray-200 rounded-lg divide-y">
                    {vendorResults.map((v) => (
                      <button key={v.id} onClick={() => { setVendorId(v.id); setVendorLabel(v.full_name || v.email); setVendorResults([]); }}
                        className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                        {v.full_name} <span className="text-gray-400">· {v.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Raise nonconformity
          </button>
        </div>
      </div>
    </div>
  );
}
