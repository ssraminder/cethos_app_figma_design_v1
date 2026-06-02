// StaffNotesPanel — internal-only notes block shared by AdminQuoteDetail and
// AdminOrderDetail. Lists notes (newest first), supports add/edit/delete via
// the manage-staff-notes edge function. Customers and vendors never see this
// surface; it's mounted only inside admin routes.

import { useEffect, useState } from "react";
import { Loader2, MessageSquare, Trash2, Edit2, X, Save } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAdminAuthContext } from "@/context/AdminAuthContext";
import { toast } from "sonner";

export type StaffNoteEntityType = "quote" | "order";

interface StaffNote {
  id: string;
  body: string;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

function fmtLocal(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  } catch { return iso; }
}

export default function StaffNotesPanel({
  entityType,
  entityId,
}: {
  entityType: StaffNoteEntityType;
  entityId: string | null | undefined;
}) {
  const { session } = useAdminAuthContext();
  const staffId = (session as any)?.staffId ?? null;
  const [notes, setNotes] = useState<StaffNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [newBody, setNewBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  const load = async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-staff-notes", {
        body: { action: "list", entity_type: entityType, entity_id: entityId },
      });
      if (error || !data?.success) {
        toast.error(data?.error ?? error?.message ?? "Failed to load notes");
        return;
      }
      setNotes(data.notes ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [entityType, entityId]);

  const handleAdd = async () => {
    if (!newBody.trim()) return;
    if (!staffId) { toast.error("No staff session"); return; }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-staff-notes", {
        body: { action: "create", entity_type: entityType, entity_id: entityId, body: newBody, staff_id: staffId },
      });
      if (error || !data?.success) {
        toast.error(data?.error ?? error?.message ?? "Failed to add note");
        return;
      }
      setNewBody("");
      setNotes([data.note, ...notes]);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSave = async (id: string) => {
    if (!editBody.trim()) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-staff-notes", {
        body: { action: "update", id, body: editBody, staff_id: staffId },
      });
      if (error || !data?.success) {
        toast.error(data?.error ?? error?.message ?? "Failed to save");
        return;
      }
      setNotes(notes.map((n) => (n.id === id ? data.note : n)));
      setEditId(null);
      setEditBody("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this note?")) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-staff-notes", {
        body: { action: "delete", id, staff_id: staffId },
      });
      if (error || !data?.success) {
        toast.error(data?.error ?? error?.message ?? "Failed to delete");
        return;
      }
      setNotes(notes.filter((n) => n.id !== id));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="w-4 h-4 text-amber-700" />
        <h3 className="text-sm font-semibold text-amber-900">Staff notes (internal)</h3>
        <span className="text-xs text-amber-700/70">Not shown to customers or vendors</span>
      </div>

      <div className="space-y-2 mb-3">
        <textarea
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          placeholder="Add an internal note for the team…"
          rows={2}
          className="w-full border border-amber-200 bg-white rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-amber-200"
        />
        <div className="flex justify-end">
          <button
            onClick={handleAdd}
            disabled={!newBody.trim() || submitting || !staffId}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs rounded disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            Add note
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-amber-800/80 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : notes.length === 0 ? (
        <div className="text-sm text-amber-800/60 italic">No staff notes yet.</div>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded border border-amber-200 bg-white p-2.5">
              {editId === n.id ? (
                <div className="space-y-2">
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={2}
                    className="w-full border border-amber-200 rounded px-2 py-1.5 text-sm"
                  />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setEditId(null); setEditBody(""); }}
                      className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1">
                      <X className="w-3 h-3" /> Cancel
                    </button>
                    <button onClick={() => handleEditSave(n.id)} disabled={submitting}
                      className="px-2 py-1 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded inline-flex items-center gap-1 disabled:opacity-50">
                      <Save className="w-3 h-3" /> Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-sm text-gray-800 whitespace-pre-wrap">{n.body}</div>
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-gray-500">
                    <span>
                      {n.created_by_name || "Staff"} · {fmtLocal(n.created_at)}
                      {n.updated_at !== n.created_at && <span className="ml-1 italic">(edited {fmtLocal(n.updated_at)})</span>}
                    </span>
                    <div className="flex gap-2">
                      <button onClick={() => { setEditId(n.id); setEditBody(n.body); }} className="text-gray-400 hover:text-amber-700">
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button onClick={() => handleDelete(n.id)} className="text-gray-400 hover:text-red-600">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
