import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAdminAuthContext } from "@/context/AdminAuthContext";
import {
  Save,
  ArrowLeft,
  Loader2,
  Trash2,
  Copy,
  MoreHorizontal,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Image,
  Globe,
  Settings2,
  Upload,
} from "lucide-react";

interface PostData {
  id?: string;
  title: string;
  slug: string;
  content: string;
  description: string;
  status: "draft" | "published" | "scheduled" | "archived";
  author_id: string;
  category_id: string;
  tags: string[];
  featured_image: string;
  featured_image_alt: string;
  meta_title: string;
  meta_description: string;
  canonical_url: string;
  published_at: string | null;
  read_time: string;
}

interface Author {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
}

const DEFAULT_POST: PostData = {
  title: "",
  slug: "",
  content: "",
  description: "",
  status: "draft",
  author_id: "",
  category_id: "",
  tags: [],
  featured_image: "",
  featured_image_alt: "",
  meta_title: "",
  meta_description: "",
  canonical_url: "",
  published_at: null,
  read_time: "",
};

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

function estimateReadTime(content: string): number {
  const words = content.replace(/<[^>]*>/g, "").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

export default function BlogPostEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session } = useAdminAuthContext();
  const isNew = !id || id === "new";

  const [post, setPost] = useState<PostData>(DEFAULT_POST);
  const [authors, setAuthors] = useState<Author[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved" | "">("");
  const [showOverflow, setShowOverflow] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  // Accordion sections
  const [sectionsOpen, setSectionsOpen] = useState({
    publish: true,
    settings: true,
    image: false,
    seo: false,
  });

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const overflowRef = useRef<HTMLDivElement>(null);

  // Close overflow menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setShowOverflow(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Fetch authors and categories
  useEffect(() => {
    async function fetchMeta() {
      const [authorsRes, catsRes] = await Promise.all([
        supabase.from("cethosweb_blog_authors").select("id, name").order("name"),
        supabase.from("cethosweb_blog_categories").select("id, name").order("name"),
      ]);
      setAuthors(authorsRes.data || []);
      setCategories(catsRes.data || []);
    }
    fetchMeta();
  }, []);

  // Fetch post if editing
  useEffect(() => {
    if (isNew) return;
    async function fetchPost() {
      const { data, error } = await supabase
        .from("cethosweb_blog_posts")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !data) {
        console.error("Failed to load post:", error);
        navigate("/admin/blog");
        return;
      }

      setPost({
        id: data.id,
        title: data.title || "",
        slug: data.slug || "",
        content: data.content || "",
        description: data.description || "",
        status: data.status || "draft",
        author_id: data.author_id || "",
        category_id: data.category_id || "",
        tags: data.tags || [],
        featured_image: data.featured_image || "",
        featured_image_alt: data.featured_image_alt || "",
        meta_title: data.meta_title || "",
        meta_description: data.meta_description || "",
        canonical_url: data.canonical_url || "",
        published_at: data.published_at,
        read_time: data.read_time || "",
      });
      setSlugEdited(true);
      setLoading(false);
    }
    fetchPost();
  }, [id, isNew, navigate]);

  // Auto-save every 30 seconds for drafts
  useEffect(() => {
    if (isNew || post.status !== "draft") return;
    autoSaveTimer.current = setInterval(() => {
      handleSave(true);
    }, 30000);
    return () => {
      if (autoSaveTimer.current) clearInterval(autoSaveTimer.current);
    };
  }, [post, isNew]);

  // Keyboard shortcut: Ctrl/Cmd+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [post]);

  const updateField = <K extends keyof PostData>(key: K, value: PostData[K]) => {
    setPost((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "title" && !slugEdited) {
        next.slug = generateSlug(value as string);
      }
      if (key === "content") {
        next.read_time = String(estimateReadTime(value as string));
      }
      return next;
    });
    setSaveStatus("unsaved");
  };

  const handleSave = async (isAutoSave = false) => {
    if (saving) return;
    setSaving(true);
    setSaveStatus("saving");

    try {
      const payload: any = {
        title: post.title,
        slug: post.slug,
        content: post.content,
        description: post.description,
        status: post.status,
        author_id: post.author_id || null,
        category_id: post.category_id || null,
        tags: post.tags,
        featured_image: post.featured_image || null,
        featured_image_alt: post.featured_image_alt || null,
        meta_title: post.meta_title || null,
        meta_description: post.meta_description || null,
        canonical_url: post.canonical_url || null,
        read_time: post.read_time || null,
        updated_at: new Date().toISOString(),
      };

      if (post.status === "published" && !post.published_at) {
        payload.published_at = new Date().toISOString();
      }

      if (post.status === "scheduled" && post.published_at) {
        payload.published_at = post.published_at;
      }

      if (isNew) {
        const { data, error } = await supabase
          .from("cethosweb_blog_posts")
          .insert(payload)
          .select("id")
          .single();

        if (error) throw error;
        if (data) {
          navigate(`/admin/blog/${data.id}/edit`, { replace: true });
        }
      } else {
        const { error } = await supabase
          .from("cethosweb_blog_posts")
          .update(payload)
          .eq("id", post.id);

        if (error) throw error;
      }

      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(""), 3000);
    } catch (err) {
      console.error("Save failed:", err);
      setSaveStatus("unsaved");
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async () => {
    if (!post.id) return;
    const { data, error } = await supabase
      .from("cethosweb_blog_posts")
      .insert({
        title: `${post.title} (Copy)`,
        slug: `${post.slug}-copy`,
        content: post.content,
        description: post.description,
        status: "draft",
        author_id: post.author_id || null,
        category_id: post.category_id || null,
        tags: post.tags,
        featured_image: post.featured_image || null,
        featured_image_alt: post.featured_image_alt || null,
        meta_title: post.meta_title || null,
        meta_description: post.meta_description || null,
        canonical_url: post.canonical_url || null,
        read_time: post.read_time || null,
      })
      .select("id")
      .single();

    if (!error && data) {
      navigate(`/admin/blog/${data.id}/edit`);
    }
  };

  const handleDelete = async () => {
    if (!post.id) return;
    if (!confirm(`Are you sure you want to delete "${post.title}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("cethosweb_blog_posts").delete().eq("id", post.id);
    if (!error) navigate("/admin/blog");
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !post.tags.includes(tag)) {
      updateField("tags", [...post.tags, tag]);
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    updateField("tags", post.tags.filter((t) => t !== tag));
  };

  const toggleSection = (key: keyof typeof sectionsOpen) => {
    setSectionsOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const charCountColor = (current: number, max: number) => {
    if (current === 0) return "text-[#94a3b8]";
    if (current <= max * 0.8) return "text-[#16a34a]";
    if (current <= max) return "text-[#d97706]";
    return "text-[#dc2626]";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-[#64748b]" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Editor Header */}
      <div className="bg-white border-b border-[#e2e8f0] px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link
            to="/admin/blog"
            className="p-1.5 text-[#64748b] hover:text-[#0f172a] hover:bg-slate-100 rounded-md transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <span className="text-sm text-[#64748b]">
            {isNew ? "New Post" : "Edit Post"}
          </span>
          {saveStatus && (
            <span
              className={`text-xs ${
                saveStatus === "saved"
                  ? "text-[#16a34a]"
                  : saveStatus === "saving"
                    ? "text-[#64748b]"
                    : "text-[#d97706]"
              }`}
            >
              {saveStatus === "saved"
                ? "Saved"
                : saveStatus === "saving"
                  ? "Saving..."
                  : "Unsaved changes"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-[#0d9488] hover:bg-[#0f766e] disabled:opacity-50 rounded-md transition-colors font-medium"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {isNew ? "Create" : "Update"}
          </button>

          {/* Overflow Menu */}
          {!isNew && (
            <div className="relative" ref={overflowRef}>
              <button
                onClick={() => setShowOverflow(!showOverflow)}
                className="p-2 text-[#64748b] hover:text-[#0f172a] hover:bg-slate-100 rounded-md transition-colors"
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>
              {showOverflow && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg border border-[#e2e8f0] shadow-lg py-1 z-50">
                  <button
                    onClick={() => { setShowOverflow(false); handleDuplicate(); }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[#64748b] hover:bg-slate-50 hover:text-[#0f172a] transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                    Duplicate Post
                  </button>
                  <hr className="my-1 border-[#e2e8f0]" />
                  <button
                    onClick={() => { setShowOverflow(false); handleDelete(); }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[#dc2626] hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Post
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Editor Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main Editor */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Title */}
            <input
              type="text"
              placeholder="Post title"
              value={post.title}
              onChange={(e) => updateField("title", e.target.value)}
              className="w-full text-3xl font-bold text-[#0f172a] placeholder-[#94a3b8] border-none outline-none bg-transparent"
            />

            {/* Slug */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[#64748b]">Slug:</span>
              <input
                type="text"
                value={post.slug}
                onChange={(e) => {
                  setSlugEdited(true);
                  updateField("slug", generateSlug(e.target.value));
                }}
                className="flex-1 px-2 py-1 border border-[#e2e8f0] rounded text-[#0f172a] text-sm focus:ring-1 focus:ring-[#0d9488] outline-none"
              />
            </div>

            {slugEdited && !isNew && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-700">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                Changing the slug may break existing links to this post.
              </div>
            )}

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-[#0f172a] mb-1.5">
                Description
              </label>
              <textarea
                value={post.description}
                onChange={(e) => updateField("description", e.target.value)}
                rows={3}
                className="w-full px-3.5 py-2.5 border border-[#e2e8f0] rounded-md text-sm text-[#0f172a] focus:ring-2 focus:ring-[#0d9488] focus:border-[#0d9488] outline-none resize-none"
                placeholder="A brief summary of the post..."
              />
            </div>

            {/* Content Editor */}
            <div>
              <label className="block text-sm font-medium text-[#0f172a] mb-1.5">
                Content
              </label>
              <textarea
                value={post.content}
                onChange={(e) => updateField("content", e.target.value)}
                rows={20}
                className="w-full px-3.5 py-2.5 border border-[#e2e8f0] rounded-md text-sm text-[#0f172a] focus:ring-2 focus:ring-[#0d9488] focus:border-[#0d9488] outline-none resize-y font-mono leading-relaxed"
                placeholder="Write your post content here. Markdown is supported..."
              />
              <p className="text-xs text-[#94a3b8] mt-1">
                {estimateReadTime(post.content)} min read &middot;{" "}
                {post.content.replace(/<[^>]*>/g, "").split(/\s+/).filter(Boolean).length} words
              </p>
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-80 border-l border-[#e2e8f0] bg-white overflow-y-auto flex-shrink-0 hidden lg:block">
          <div className="p-4 space-y-1">
            {/* Publish Settings */}
            <SidebarSection
              title="Publish Settings"
              icon={<Globe className="w-4 h-4" />}
              open={sectionsOpen.publish}
              onToggle={() => toggleSection("publish")}
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#64748b] mb-1">
                    Status
                  </label>
                  <select
                    value={post.status}
                    onChange={(e) => updateField("status", e.target.value as PostData["status"])}
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-md text-sm focus:ring-2 focus:ring-[#0d9488] outline-none"
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>

                {post.status === "scheduled" && (
                  <div>
                    <label className="block text-xs font-medium text-[#64748b] mb-1">
                      Publish Date
                    </label>
                    <input
                      type="datetime-local"
                      value={post.published_at ? new Date(post.published_at).toISOString().slice(0, 16) : ""}
                      onChange={(e) => updateField("published_at", e.target.value ? new Date(e.target.value).toISOString() : null)}
                      className="w-full px-3 py-2 border border-[#e2e8f0] rounded-md text-sm focus:ring-2 focus:ring-[#0d9488] outline-none"
                    />
                  </div>
                )}
              </div>
            </SidebarSection>

            {/* Post Settings */}
            <SidebarSection
              title="Post Settings"
              icon={<Settings2 className="w-4 h-4" />}
              open={sectionsOpen.settings}
              onToggle={() => toggleSection("settings")}
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#64748b] mb-1">
                    Category
                  </label>
                  <select
                    value={post.category_id}
                    onChange={(e) => updateField("category_id", e.target.value)}
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-md text-sm focus:ring-2 focus:ring-[#0d9488] outline-none"
                  >
                    <option value="">Select category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#64748b] mb-1">
                    Author
                  </label>
                  <select
                    value={post.author_id}
                    onChange={(e) => updateField("author_id", e.target.value)}
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-md text-sm focus:ring-2 focus:ring-[#0d9488] outline-none"
                  >
                    <option value="">Select author</option>
                    {authors.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-xs font-medium text-[#64748b] mb-1">
                    Tags
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-[#0f172a] rounded text-xs"
                      >
                        {tag}
                        <button
                          onClick={() => removeTag(tag)}
                          className="text-[#94a3b8] hover:text-[#dc2626] transition-colors"
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                      placeholder="Add tag..."
                      className="flex-1 px-2 py-1.5 border border-[#e2e8f0] rounded text-xs focus:ring-1 focus:ring-[#0d9488] outline-none"
                    />
                    <button
                      onClick={addTag}
                      className="px-2 py-1.5 bg-slate-100 text-[#64748b] hover:bg-slate-200 rounded text-xs transition-colors"
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#64748b] mb-1">
                    Read Time (minutes)
                  </label>
                  <input
                    type="number"
                    value={post.read_time}
                    onChange={(e) => updateField("read_time", e.target.value)}
                    min={1}
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-md text-sm focus:ring-2 focus:ring-[#0d9488] outline-none"
                  />
                </div>
              </div>
            </SidebarSection>

            {/* Featured Image */}
            <SidebarSection
              title="Featured Image"
              icon={<Image className="w-4 h-4" />}
              open={sectionsOpen.image}
              onToggle={() => toggleSection("image")}
            >
              <div className="space-y-3">
                {post.featured_image && (
                  <div className="rounded-md overflow-hidden border border-[#e2e8f0]">
                    <img
                      src={post.featured_image}
                      alt={post.featured_image_alt || "Featured"}
                      className="w-full h-32 object-cover"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-[#64748b] mb-1">
                    Image URL
                  </label>
                  <input
                    type="url"
                    value={post.featured_image}
                    onChange={(e) => updateField("featured_image", e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-md text-sm focus:ring-2 focus:ring-[#0d9488] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#64748b] mb-1">
                    Alt Text
                  </label>
                  <input
                    type="text"
                    value={post.featured_image_alt}
                    onChange={(e) => updateField("featured_image_alt", e.target.value)}
                    placeholder="Describe the image..."
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-md text-sm focus:ring-2 focus:ring-[#0d9488] outline-none"
                  />
                </div>
              </div>
            </SidebarSection>

            {/* SEO */}
            <SidebarSection
              title="SEO"
              icon={<Globe className="w-4 h-4" />}
              open={sectionsOpen.seo}
              onToggle={() => toggleSection("seo")}
            >
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-[#64748b]">Meta Title</label>
                    <span className={`text-xs ${charCountColor(post.meta_title.length, 60)}`}>
                      {post.meta_title.length}/60
                    </span>
                  </div>
                  <input
                    type="text"
                    value={post.meta_title}
                    onChange={(e) => updateField("meta_title", e.target.value)}
                    placeholder={post.title || "Meta title..."}
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-md text-sm focus:ring-2 focus:ring-[#0d9488] outline-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-[#64748b]">Meta Description</label>
                    <span className={`text-xs ${charCountColor(post.meta_description.length, 160)}`}>
                      {post.meta_description.length}/160
                    </span>
                  </div>
                  <textarea
                    value={post.meta_description}
                    onChange={(e) => updateField("meta_description", e.target.value)}
                    rows={3}
                    placeholder="Brief description for search engines..."
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-md text-sm focus:ring-2 focus:ring-[#0d9488] outline-none resize-none"
                  />
                </div>

                {/* SERP Preview */}
                <div className="p-3 bg-[#f8fafc] rounded-md border border-[#e2e8f0]">
                  <p className="text-xs text-[#64748b] mb-2 font-medium">SERP Preview</p>
                  <div className="space-y-0.5">
                    <p className="text-xs text-[#16a34a] truncate">
                      cethos.com/blog/{post.slug || "post-url"}
                    </p>
                    <p className="text-sm text-[#2563eb] font-medium truncate hover:underline cursor-default">
                      {post.meta_title || post.title || "Post Title"}
                    </p>
                    <p className="text-xs text-[#64748b] line-clamp-2">
                      {post.meta_description || post.description || "Post description will appear here..."}
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#64748b] mb-1">
                    Canonical URL
                  </label>
                  <input
                    type="url"
                    value={post.canonical_url}
                    onChange={(e) => updateField("canonical_url", e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 border border-[#e2e8f0] rounded-md text-sm focus:ring-2 focus:ring-[#0d9488] outline-none"
                  />
                </div>
              </div>
            </SidebarSection>
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarSection({
  title,
  icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-[#e2e8f0] rounded-md overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-[#0f172a] hover:bg-[#f8fafc] transition-colors"
      >
        {icon}
        <span className="flex-1 text-left">{title}</span>
        {open ? <ChevronDown className="w-4 h-4 text-[#94a3b8]" /> : <ChevronRight className="w-4 h-4 text-[#94a3b8]" />}
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-[#e2e8f0] pt-3">
          {children}
        </div>
      )}
    </div>
  );
}
