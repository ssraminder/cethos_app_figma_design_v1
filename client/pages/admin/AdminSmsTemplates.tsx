import { useCallback, useEffect, useState } from "react";
import {
  MessageSquare,
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  Save,
  ToggleLeft,
  ToggleRight,
  Link2,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

interface SmsTemplate {
  id: string;
  key: string;
  label: string;
  body: string;
  variables: string[];
  generates_upload_token: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface DraftTemplate {
  id?: string;
  key: string;
  label: string;
  body: string;
  variables: string[];
  generates_upload_token: boolean;
  active: boolean;
}

const EMPTY_DRAFT: DraftTemplate = {
  key: "",
  label: "",
  body: "",
  variables: [],
  generates_upload_token: false,
  active: true,
};

// Pull {{var}} tokens out of the body to auto-suggest variables
function extractVariables(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /\{\{\s*(\w+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
  }
  return out;
}

export default function AdminSmsTemplates() {
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<DraftTemplate | null>(null);
  const [editingExisting, setEditingExisting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("comms_list_all_sms_templates");
    setLoading(false);
    if (error) {
      console.error("comms_list_all_sms_templates failed", error);
      return;
    }
    setTemplates((data || []) as SmsTemplate[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  const startCreate = () => {
    setEditing({ ...EMPTY_DRAFT });
    setEditingExisting(false);
  };

  const startEdit = (t: SmsTemplate) => {
    setEditing({
      id: t.id,
      key: t.key,
      label: t.label,
      body: t.body,
      variables: [...t.variables],
      generates_upload_token: t.generates_upload_token,
      active: t.active,
    });
    setEditingExisting(true);
  };

  const handleDelete = async (t: SmsTemplate) => {
    if (!confirm(`Delete template "${t.label}"? This cannot be undone from the UI.`)) return;
    const { error } = await supabase.rpc("comms_soft_delete_sms_template", { p_id: t.id });
    if (error) {
      alert("Delete failed: " + error.message);
      return;
    }
    await load();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4 flex items-center gap-4">
        <MessageSquare className="w-5 h-5 text-gray-700" />
        <h1 className="text-xl font-semibold text-gray-900">SMS templates</h1>
        <span className="text-sm text-gray-500">
          ({templates.length} — {templates.filter((t) => t.active).length} active)
        </span>
        <div className="flex-1" />
        <button
          onClick={startCreate}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> New template
        </button>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            No templates yet. Click "New template" to create your first preset.
          </div>
        ) : (
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2">Label</th>
                  <th className="text-left px-4 py-2">Key</th>
                  <th className="text-left px-4 py-2">Variables</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-right px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-900">{t.label}</div>
                      <div className="text-xs text-gray-500 line-clamp-1">{t.body}</div>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-700">{t.key}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {t.variables.map((v) => (
                          <span key={v} className="text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded font-mono">
                            {v}
                          </span>
                        ))}
                        {t.generates_upload_token && (
                          <span
                            title="upload_url is auto-filled by the edge function"
                            className="text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                          >
                            <Link2 className="w-3 h-3" /> upload_url
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      {t.active ? (
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded inline-flex items-center gap-1">
                          <ToggleRight className="w-3 h-3" /> Active
                        </span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded inline-flex items-center gap-1">
                          <ToggleLeft className="w-3 h-3" /> Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => startEdit(t)}
                        className="text-blue-600 hover:bg-blue-50 p-1 rounded"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(t)}
                        className="text-red-600 hover:bg-red-50 p-1 rounded ml-1"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Variable docs */}
        <div className="mt-6 bg-blue-50 border border-blue-100 rounded p-4 text-sm text-blue-900">
          <div className="font-semibold mb-1 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> How variables work
          </div>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>Use <code className="bg-blue-100 px-1 rounded">{`{{variable_name}}`}</code> in the body. The composer auto-detects every variable used.</li>
            <li>Variables are filled in by the staff member when sending. Missing values block the send (so the customer never gets a literal <code>{`{{first_name}}`}</code>).</li>
            <li>Check <strong>upload_url auto-fill</strong> if the template uses <code className="bg-blue-100 px-1 rounded">{`{{upload_url}}`}</code> — the edge function will substitute the secure upload page URL automatically.</li>
            <li><strong>Reply STOP to opt out</strong> is a US/CA compliance requirement for A2P SMS — keep it in customer-facing templates.</li>
          </ul>
        </div>
      </div>

      {editing && (
        <TemplateEditor
          draft={editing}
          isExisting={editingExisting}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function TemplateEditor({
  draft,
  isExisting,
  onClose,
  onSaved,
}: {
  draft: DraftTemplate;
  isExisting: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [d, setD] = useState<DraftTemplate>(draft);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const autoVars = extractVariables(d.body);
  // Keep variables aligned with what's actually used in body
  useEffect(() => {
    setD((prev) => ({ ...prev, variables: extractVariables(prev.body) }));
  }, [d.body]);

  // Live preview with placeholder values
  const previewBody = d.body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => {
    if (k === "upload_url" && d.generates_upload_token) return "https://portal.cethos.com/secure-upload";
    return `[${k}]`;
  });

  const save = async () => {
    setErr(null);
    if (!d.key.trim() || !d.label.trim() || !d.body.trim()) {
      setErr("Key, label, and body are all required.");
      return;
    }
    setSaving(true);
    if (isExisting && d.id) {
      const { error } = await supabase.rpc("comms_update_sms_template", {
        p_id: d.id,
        p_label: d.label,
        p_body: d.body,
        p_variables: d.variables,
        p_generates_upload_token: d.generates_upload_token,
        p_active: d.active,
      });
      setSaving(false);
      if (error) {
        setErr(error.message);
        return;
      }
    } else {
      const { error } = await supabase.rpc("comms_create_sms_template", {
        p_key: d.key,
        p_label: d.label,
        p_body: d.body,
        p_variables: d.variables,
        p_generates_upload_token: d.generates_upload_token,
        p_active: d.active,
      });
      setSaving(false);
      if (error) {
        setErr(error.message);
        return;
      }
    }
    await onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative ml-auto w-full max-w-2xl bg-white shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {isExisting ? "Edit template" : "New template"}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs text-gray-500 font-medium">
              Key <span className="text-gray-400">(snake_case, immutable)</span>
            </label>
            <input
              value={d.key}
              onChange={(e) => setD({ ...d, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
              disabled={isExisting}
              placeholder="e.g. order_ready_pickup"
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm font-mono disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">Label (shown in composer)</label>
            <input
              value={d.label}
              onChange={(e) => setD({ ...d, label: e.target.value })}
              placeholder="e.g. Order ready for pickup"
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">
              Body <span className="text-gray-400">(use {`{{variable}}`} for placeholders)</span>
            </label>
            <textarea
              value={d.body}
              onChange={(e) => setD({ ...d, body: e.target.value })}
              rows={5}
              placeholder="Hi {{first_name}}, your order is ready for pickup."
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
            <div className="text-xs text-gray-500 mt-1">
              Length: {d.body.length} chars
              {d.body.length > 160 && (
                <span className="text-orange-600 ml-1">
                  · over 160 chars — may be sent as multiple SMS segments
                </span>
              )}
            </div>
          </div>

          {autoVars.length > 0 && (
            <div className="bg-gray-50 border rounded p-3">
              <div className="text-xs text-gray-500 mb-1">Detected variables (auto-filled):</div>
              <div className="flex flex-wrap gap-1">
                {autoVars.map((v) => (
                  <span key={v} className="text-xs bg-white border px-2 py-0.5 rounded font-mono">
                    {v}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={d.generates_upload_token}
                onChange={(e) => setD({ ...d, generates_upload_token: e.target.checked })}
              />
              <span>
                Auto-fill <code className="text-xs bg-gray-100 px-1 rounded">upload_url</code> with the secure upload page URL
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={d.active}
                onChange={(e) => setD({ ...d, active: e.target.checked })}
              />
              <span>Active (shown in the SMS composer)</span>
            </label>
          </div>

          {d.body && (
            <div className="border-t pt-4">
              <div className="text-xs text-gray-500 mb-1">Preview (variables shown as [name]):</div>
              <div className="bg-gray-50 rounded p-3 text-sm whitespace-pre-wrap text-gray-800 font-sans">
                {previewBody}
              </div>
            </div>
          )}

          {err && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isExisting ? "Save changes" : "Create template"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
