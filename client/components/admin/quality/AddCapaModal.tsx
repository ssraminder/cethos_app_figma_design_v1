// AddCapaModal — add a corrective/preventive action under a nonconformity.
// Calls manage-quality:create_capa.

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  nonconformityId: string;
  onCreated?: (capa: any) => void;
}

const TYPES = [
  { value: "correction", label: "Correction (immediate fix)" },
  { value: "corrective", label: "Corrective (address root cause)" },
  { value: "preventive", label: "Preventive (stop recurrence)" },
];

export default function AddCapaModal({ open, onClose, nonconformityId, onCreated }: Props) {
  const [actionType, setActionType] = useState("corrective");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [effDue, setEffDue] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const submit = async () => {
    if (!description.trim()) {
      toast.error("Description is required.");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        nonconformity_id: nonconformityId, action_type: actionType, description,
        due_date: dueDate || null, effectiveness_due: effDue || null,
      };
      const { data, error } = await supabase.functions.invoke("manage-quality", {
        body: { action: "create_capa", payload },
      });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || "Create failed");
      toast.success(`CAPA ${data?.result?.capa_number ?? ""} added.`);
      onCreated?.(data?.result);
      onClose();
    } catch (err: any) {
      toast.error(`Failed to add CAPA: ${err?.message ?? "unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Add CAPA action</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Action type</label>
            <select value={actionType} onChange={(e) => setActionType(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description *</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="What will be done" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Due date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Effectiveness check by</label>
              <input type="date" value={effDue} onChange={(e) => setEffDue(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Add action
          </button>
        </div>
      </div>
    </div>
  );
}
