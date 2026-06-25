// LogComplaintModal — staff intake for a client/quality complaint (ISO §4.6).
// Calls manage-quality:create_complaint. When opened from a vendor's Performance
// tab the vendor is prefilled; standalone it offers a lightweight vendor search.

import { useState } from "react";
import { X, Loader2, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface Prefill {
  vendor_id?: string;
  vendor_name?: string;
  order_id?: string;
  order_number?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (complaint: any) => void;
  prefill?: Prefill;
}

const SOURCES = ["client", "internal_qa", "reviser", "pm", "audit", "other"];
const VIA = ["email", "phone", "portal", "meeting", "other"];
const CATEGORIES = ["accuracy", "terminology", "formatting", "timeliness", "confidentiality", "service", "other"];
const SEVERITIES = ["low", "medium", "high", "critical"];

export default function LogComplaintModal({ open, onClose, onCreated, prefill }: Props) {
  const [summary, setSummary] = useState("");
  const [detail, setDetail] = useState("");
  const [source, setSource] = useState("client");
  const [via, setVia] = useState("email");
  const [category, setCategory] = useState("accuracy");
  const [severity, setSeverity] = useState("medium");
  const [complainantName, setComplainantName] = useState("");
  const [complainantEmail, setComplainantEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const [vendorId, setVendorId] = useState<string | null>(prefill?.vendor_id ?? null);
  const [vendorLabel, setVendorLabel] = useState<string | null>(prefill?.vendor_name ?? null);
  const [vendorQuery, setVendorQuery] = useState("");
  const [vendorResults, setVendorResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const [orderId, setOrderId] = useState<string | null>(prefill?.order_id ?? null);
  const [orderLabel, setOrderLabel] = useState<string | null>(prefill?.order_number ?? null);
  const [orderQuery, setOrderQuery] = useState("");
  const [orderResults, setOrderResults] = useState<any[]>([]);

  if (!open) return null;

  const searchVendors = async () => {
    if (!vendorQuery.trim()) return;
    setSearching(true);
    try {
      const { data } = await supabase
        .from("vendors")
        .select("id, full_name, email")
        .or(`full_name.ilike.%${vendorQuery}%,email.ilike.%${vendorQuery}%`)
        .limit(8);
      setVendorResults(data ?? []);
    } finally {
      setSearching(false);
    }
  };

  const searchOrders = async () => {
    if (!orderQuery.trim()) return;
    const { data } = await supabase
      .from("orders")
      .select("id, order_number, client_project_number")
      .or(`order_number.ilike.%${orderQuery}%,client_project_number.ilike.%${orderQuery}%`)
      .order("created_at", { ascending: false })
      .limit(8);
    setOrderResults(data ?? []);
  };

  const submit = async () => {
    if (!summary.trim()) {
      toast.error("Summary is required.");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        source, received_via: via, category, severity,
        summary, detail: detail || null,
        complainant_name: complainantName || null,
        complainant_email: complainantEmail || null,
        vendor_id: vendorId,
        order_id: orderId,
      };
      const { data, error } = await supabase.functions.invoke("manage-quality", {
        body: { action: "create_complaint", payload },
      });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || "Create failed");
      toast.success(`Complaint ${data?.result?.complaint_number ?? ""} logged.`);
      onCreated?.(data?.result);
      onClose();
    } catch (err: any) {
      toast.error(`Failed to log complaint: ${err?.message ?? "unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Log a complaint</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Summary *</label>
            <input value={summary} onChange={(e) => setSummary(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="One-line description of the complaint" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Detail</label>
            <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="What happened, who reported it, any evidence" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Source</label>
              <select value={source} onChange={(e) => setSource(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                {SOURCES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Received via</label>
              <select value={via} onChange={(e) => setVia(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                {VIA.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                {CATEGORIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Severity</label>
              <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Complainant name</label>
              <input value={complainantName} onChange={(e) => setComplainantName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Complainant email</label>
              <input value={complainantEmail} onChange={(e) => setComplainantEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
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
                  <button onClick={searchVendors} className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                    {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </button>
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
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Log complaint
          </button>
        </div>
      </div>
    </div>
  );
}
