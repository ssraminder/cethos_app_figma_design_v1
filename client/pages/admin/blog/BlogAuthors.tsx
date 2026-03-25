import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  Plus,
  Edit2,
  Trash2,
  Users,
  Loader2,
  X,
  Check,
  Linkedin,
} from "lucide-react";

interface Author {
  id: string;
  name: string;
  slug: string;
  title: string;
  email: string;
  bio: string;
  avatar_url: string;
  linkedin_url: string;
  created_at: string;
}

export default function BlogAuthors() {
  const [authors, setAuthors] = useState<Author[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    title: "",
    email: "",
    bio: "",
    avatar_url: "",
    linkedin_url: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchAuthors = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("cethosweb_blog_authors")
        .select("*")
        .order("name");

      if (error) throw error;
      setAuthors(data || []);
    } catch (err) {
      console.error("Failed to fetch authors:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuthors();
  }, []);

  const handleSave = async () => {
    if (!formData.name.trim()) return;
    setSaving(true);

    try {
      const generateSlug = (n: string) =>
        n.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").trim();

      const payload = {
        name: formData.name.trim(),
        slug: formData.slug.trim() || generateSlug(formData.name),
        title: formData.title.trim() || null,
        email: formData.email.trim() || null,
        bio: formData.bio.trim() || null,
        avatar_url: formData.avatar_url.trim() || null,
        linkedin_url: formData.linkedin_url.trim() || null,
      };

      if (editingId) {
        const { error } = await supabase.from("cethosweb_blog_authors").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("cethosweb_blog_authors").insert(payload);
        if (error) throw error;
      }

      resetForm();
      fetchAuthors();
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (author: Author) => {
    setEditingId(author.id);
    setFormData({
      name: author.name,
      slug: author.slug || "",
      title: author.title || "",
      email: author.email || "",
      bio: author.bio || "",
      avatar_url: author.avatar_url || "",
      linkedin_url: author.linkedin_url || "",
    });
    setShowForm(true);
  };

  const handleDelete = async (author: Author) => {
    if (!confirm(`Are you sure you want to delete "${author.name}"? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.from("cethosweb_blog_authors").delete().eq("id", author.id);
      if (error) throw error;
      fetchAuthors();
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ name: "", slug: "", title: "", email: "", bio: "", avatar_url: "", linkedin_url: "" });
  };

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="max-w-4xl mx-auto px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#0f172a]">Authors</h1>
          <p className="text-sm text-[#64748b] mt-1">Manage blog post authors</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-[#0d9488] hover:bg-[#0f766e] rounded-md transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Author
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-white border border-[#e2e8f0] rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-[#0f172a]">
              {editingId ? "Edit Author" : "New Author"}
            </h3>
            <button onClick={resetForm} className="text-[#64748b] hover:text-[#0f172a]">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#0f172a] mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-[#e2e8f0] rounded-md text-sm focus:ring-2 focus:ring-[#0d9488] outline-none"
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0f172a] mb-1">Title / Role</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border border-[#e2e8f0] rounded-md text-sm focus:ring-2 focus:ring-[#0d9488] outline-none"
                  placeholder="e.g. Content Director"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0f172a] mb-1">Bio</label>
              <textarea
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-[#e2e8f0] rounded-md text-sm focus:ring-2 focus:ring-[#0d9488] outline-none resize-none"
                placeholder="Short biography..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0f172a] mb-1">Avatar URL</label>
              <input
                type="url"
                value={formData.avatar_url}
                onChange={(e) => setFormData({ ...formData, avatar_url: e.target.value })}
                className="w-full px-3 py-2 border border-[#e2e8f0] rounded-md text-sm focus:ring-2 focus:ring-[#0d9488] outline-none"
                placeholder="https://..."
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#0f172a] mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-[#e2e8f0] rounded-md text-sm focus:ring-2 focus:ring-[#0d9488] outline-none"
                  placeholder="author@cethos.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0f172a] mb-1">LinkedIn URL</label>
                <input
                  type="url"
                  value={formData.linkedin_url}
                  onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
                  className="w-full px-3 py-2 border border-[#e2e8f0] rounded-md text-sm focus:ring-2 focus:ring-[#0d9488] outline-none"
                  placeholder="https://linkedin.com/in/..."
                />
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
                disabled={saving || !formData.name.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-[#0d9488] hover:bg-[#0f766e] disabled:opacity-50 rounded-md transition-colors font-medium"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {editingId ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Authors List */}
      <div className="bg-white border border-[#e2e8f0] rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 animate-pulse">
                <div className="w-12 h-12 bg-gray-200 rounded-full" />
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-32 mb-1" />
                  <div className="h-3 bg-gray-100 rounded w-48" />
                </div>
              </div>
            ))}
          </div>
        ) : authors.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="w-12 h-12 text-[#94a3b8] mx-auto mb-4" />
            <h3 className="text-lg font-medium text-[#0f172a] mb-1">No authors yet</h3>
            <p className="text-sm text-[#64748b] mb-4">Add your first author to start writing posts.</p>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm text-white bg-[#0d9488] hover:bg-[#0f766e] rounded-md transition-colors font-medium"
            >
              <Plus className="w-4 h-4" />
              Add Author
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {authors.map((author) => (
              <div
                key={author.id}
                className="flex items-center gap-4 px-6 py-4 hover:bg-[#f8fafc] transition-colors group"
              >
                {author.avatar_url ? (
                  <img
                    src={author.avatar_url}
                    alt={author.name}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-[#0d9488] flex items-center justify-center text-white text-sm font-medium">
                    {getInitials(author.name)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#0f172a]">{author.name}</p>
                  {author.email && (
                    <p className="text-xs text-[#64748b]">{author.email}</p>
                  )}
                  {author.bio && (
                    <p className="text-xs text-[#94a3b8] mt-0.5 truncate max-w-md">{author.bio}</p>
                  )}
                  {author.linkedin_url && (
                    <div className="flex items-center gap-3 mt-1">
                      <a
                        href={author.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#94a3b8] hover:text-[#0d9488] transition-colors"
                      >
                        <Linkedin className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleEdit(author)}
                    className="p-1.5 text-[#64748b] hover:text-[#0d9488] hover:bg-slate-100 rounded transition-colors"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(author)}
                    className="p-1.5 text-[#64748b] hover:text-[#dc2626] hover:bg-red-50 rounded transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
