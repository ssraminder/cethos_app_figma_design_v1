import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  Plus,
  Edit2,
  Trash2,
  Link2,
  Loader2,
  X,
  Check,
  AlertTriangle,
} from "lucide-react";

interface Redirect {
  id: string;
  from_path: string;
  to_path: string;
  type: "301" | "302";
  created_at: string;
}

export default function RedirectManager() {
  const [redirects, setRedirects] = useState<Redirect[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ from_path: "", to_path: "", type: "301" as "301" | "302" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchRedirects = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("redirects")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRedirects(data || []);
    } catch (err) {
      console.error("Failed to fetch redirects:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRedirects();
  }, []);

  const validateRedirect = (): boolean => {
    setFormError("");
    if (!formData.from_path.trim() || !formData.to_path.trim()) {
      setFormError("Both paths are required.");
      return false;
    }
    if (formData.from_path === formData.to_path) {
      setFormError("From and To paths cannot be the same (redirect loop).");
      return false;
    }
    // Check for existing chain that might create a cycle
    const existing = redirects.find(
      (r) => r.to_path === formData.from_path && r.from_path === formData.to_path
    );
    if (existing) {
      setFormError("This would create a redirect loop with an existing rule.");
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateRedirect()) return;
    setSaving(true);

    try {
      const payload = {
        from_path: formData.from_path.trim(),
        to_path: formData.to_path.trim(),
        type: formData.type,
      };

      if (editingId) {
        const { error } = await supabase.from("redirects").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("redirects").insert(payload);
        if (error) throw error;
      }

      resetForm();
      fetchRedirects();
    } catch (err) {
      console.error("Save failed:", err);
      setFormError("Failed to save redirect. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (redirect: Redirect) => {
    setEditingId(redirect.id);
    setFormData({
      from_path: redirect.from_path,
      to_path: redirect.to_path,
      type: redirect.type,
    });
    setShowForm(true);
    setFormError("");
  };

  const handleDelete = async (redirect: Redirect) => {
    if (!confirm(`Delete redirect from "${redirect.from_path}"?`)) return;
    try {
      const { error } = await supabase.from("redirects").delete().eq("id", redirect.id);
      if (error) throw error;
      fetchRedirects();
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} redirect(s)?`)) return;
    try {
      const { error } = await supabase.from("redirects").delete().in("id", Array.from(selectedIds));
      if (error) throw error;
      setSelectedIds(new Set());
      fetchRedirects();
    } catch (err) {
      console.error("Bulk delete failed:", err);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ from_path: "", to_path: "", type: "301" });
    setFormError("");
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#0f172a]">Redirects</h1>
          <p className="text-sm text-[#64748b] mt-1">
            Manage URL redirect rules
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-[#0d9488] hover:bg-[#0f766e] rounded-md transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Redirect
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-white border border-[#e2e8f0] rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-[#0f172a]">
              {editingId ? "Edit Redirect" : "New Redirect"}
            </h3>
            <button onClick={resetForm} className="text-[#64748b] hover:text-[#0f172a]">
              <X className="w-4 h-4" />
            </button>
          </div>

          {formError && (
            <div className="flex items-center gap-2 px-3 py-2 mb-4 bg-red-50 border border-red-200 rounded-md text-sm text-[#dc2626]">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {formError}
            </div>
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#0f172a] mb-1">From Path</label>
                <input
                  type="text"
                  value={formData.from_path}
                  onChange={(e) => setFormData({ ...formData, from_path: e.target.value })}
                  className="w-full px-3 py-2 border border-[#e2e8f0] rounded-md text-sm focus:ring-2 focus:ring-[#0d9488] outline-none"
                  placeholder="/old-page"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0f172a] mb-1">To Path</label>
                <input
                  type="text"
                  value={formData.to_path}
                  onChange={(e) => setFormData({ ...formData, to_path: e.target.value })}
                  className="w-full px-3 py-2 border border-[#e2e8f0] rounded-md text-sm focus:ring-2 focus:ring-[#0d9488] outline-none"
                  placeholder="/new-page"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0f172a] mb-1">Type</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as "301" | "302" })}
                  className="w-full px-3 py-2 border border-[#e2e8f0] rounded-md text-sm focus:ring-2 focus:ring-[#0d9488] outline-none"
                >
                  <option value="301">301 Permanent</option>
                  <option value="302">302 Temporary</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={resetForm}
                className="px-4 py-2 text-sm text-[#64748b] hover:bg-slate-100 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-[#0d9488] hover:bg-[#0f766e] disabled:opacity-50 rounded-md transition-colors font-medium"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {editingId ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Redirects Table */}
      <div className="bg-white border border-[#e2e8f0] rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 animate-pulse">
                <div className="w-5 h-5 bg-gray-200 rounded" />
                <div className="flex-1 h-4 bg-gray-200 rounded" />
                <div className="w-8 h-4 bg-gray-100 rounded" />
                <div className="flex-1 h-4 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        ) : redirects.length === 0 ? (
          <div className="py-16 text-center">
            <Link2 className="w-12 h-12 text-[#94a3b8] mx-auto mb-4" />
            <h3 className="text-lg font-medium text-[#0f172a] mb-1">No redirects yet</h3>
            <p className="text-sm text-[#64748b] mb-4">
              Add your first redirect rule to manage URL changes.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm text-white bg-[#0d9488] hover:bg-[#0f766e] rounded-md transition-colors font-medium"
            >
              <Plus className="w-4 h-4" />
              Add Redirect
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === redirects.length && redirects.length > 0}
                    onChange={() => {
                      if (selectedIds.size === redirects.length) setSelectedIds(new Set());
                      else setSelectedIds(new Set(redirects.map((r) => r.id)));
                    }}
                    className="rounded border-gray-300 text-[#0d9488] focus:ring-[#0d9488]"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[#64748b] uppercase tracking-wider">
                  From
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[#64748b] uppercase tracking-wider w-16">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[#64748b] uppercase tracking-wider">
                  To
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[#64748b] uppercase tracking-wider hidden sm:table-cell">
                  Created
                </th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {redirects.map((redirect) => (
                <tr key={redirect.id} className="hover:bg-[#f8fafc] transition-colors group">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(redirect.id)}
                      onChange={() => toggleSelect(redirect.id)}
                      className="rounded border-gray-300 text-[#0d9488] focus:ring-[#0d9488]"
                    />
                  </td>
                  <td className="px-4 py-3 text-sm text-[#0f172a] font-mono">{redirect.from_path}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${
                      redirect.type === "301"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-amber-100 text-amber-700"
                    }`}>
                      {redirect.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-[#64748b] font-mono">{redirect.to_path}</td>
                  <td className="px-4 py-3 text-sm text-[#64748b] hidden sm:table-cell">
                    {redirect.created_at
                      ? new Date(redirect.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : ""}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleEdit(redirect)}
                        className="p-1.5 text-[#64748b] hover:text-[#0d9488] hover:bg-slate-100 rounded transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(redirect)}
                        className="p-1.5 text-[#64748b] hover:text-[#dc2626] hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Bulk Delete Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#0f172a] text-white rounded-lg shadow-xl px-6 py-3 flex items-center gap-4 z-50">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <button
            onClick={handleBulkDelete}
            className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
