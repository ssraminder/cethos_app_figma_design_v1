import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Upload,
  Search,
  Image,
  Trash2,
  Copy,
  X,
  Loader2,
  FileImage,
  CheckCircle,
} from "lucide-react";

interface MediaItem {
  name: string;
  id: string;
  url: string;
  size: number;
  created_at: string;
  alt_text?: string;
}

const BUCKET = "media";

export default function MediaLibrary() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchMedia = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.storage.from(BUCKET).list("", {
        limit: 100,
        sortBy: { column: "created_at", order: "desc" },
      });

      if (error) throw error;

      const mediaItems: MediaItem[] = (data || [])
        .filter((f) => !f.name.startsWith("."))
        .map((f) => ({
          name: f.name,
          id: f.id || f.name,
          url: supabase.storage.from(BUCKET).getPublicUrl(f.name).data.publicUrl,
          size: f.metadata?.size || 0,
          created_at: f.created_at || "",
        }));

      setItems(mediaItems);
    } catch (err) {
      console.error("Failed to fetch media:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);

    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop();
        const name = `${Date.now()}-${file.name}`;

        const { error } = await supabase.storage.from(BUCKET).upload(name, file, {
          contentType: file.type,
        });

        if (error) {
          console.error(`Upload failed for ${file.name}:`, error);
        }
      }
      fetchMedia();
    } catch (err) {
      console.error("Upload error:", err);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (item: MediaItem) => {
    if (!confirm(`Are you sure you want to delete "${item.name}"?`)) return;
    try {
      const { error } = await supabase.storage.from(BUCKET).remove([item.name]);
      if (error) throw error;
      setSelectedItem(null);
      fetchMedia();
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "Unknown";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const filteredItems = searchQuery
    ? items.filter((i) => i.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : items;

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#0f172a]">Media Library</h1>
          <p className="text-sm text-[#64748b] mt-1">
            Upload and manage images and files
          </p>
        </div>
      </div>

      {/* Upload Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files); }}
        className={`border-2 border-dashed rounded-lg p-6 mb-6 text-center transition-colors ${
          dragOver
            ? "border-[#0d9488] bg-teal-50"
            : "border-[#e2e8f0] bg-white hover:border-[#94a3b8]"
        }`}
      >
        {uploading ? (
          <div className="flex items-center justify-center gap-3">
            <Loader2 className="w-5 h-5 text-[#0d9488] animate-spin" />
            <span className="text-sm text-[#64748b]">Uploading...</span>
          </div>
        ) : (
          <div>
            <Upload className="w-8 h-8 text-[#94a3b8] mx-auto mb-2" />
            <p className="text-sm text-[#64748b]">
              Drag and drop files here, or{" "}
              <label className="text-[#0d9488] hover:text-[#0f766e] cursor-pointer font-medium">
                browse
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => handleUpload(e.target.files)}
                  className="hidden"
                />
              </label>
            </p>
            <p className="text-xs text-[#94a3b8] mt-1">
              JPG, PNG, WebP, GIF, SVG &middot; Max 10MB per file
            </p>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" />
        <input
          type="text"
          placeholder="Search files..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full max-w-sm pl-10 pr-4 py-2 border border-[#e2e8f0] rounded-md text-sm focus:ring-2 focus:ring-[#0d9488] outline-none bg-white"
        />
      </div>

      <div className="flex gap-6">
        {/* Grid */}
        <div className="flex-1">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="aspect-square bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-16 text-center bg-white border border-[#e2e8f0] rounded-lg">
              <FileImage className="w-12 h-12 text-[#94a3b8] mx-auto mb-4" />
              <h3 className="text-lg font-medium text-[#0f172a] mb-1">
                {searchQuery ? "No files found" : "No media yet"}
              </h3>
              <p className="text-sm text-[#64748b]">
                {searchQuery ? "Try a different search term." : "Upload your first file to get started."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={`group relative aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                    selectedItem?.id === item.id
                      ? "border-[#0d9488] ring-2 ring-[#0d9488]/20"
                      : "border-[#e2e8f0] hover:border-[#94a3b8]"
                  }`}
                >
                  <img
                    src={item.url}
                    alt={item.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-white text-xs truncate">{item.name}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedItem && (
          <div className="w-80 bg-white border border-[#e2e8f0] rounded-lg p-4 flex-shrink-0 h-fit sticky top-20">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-[#0f172a]">File Details</h3>
              <button
                onClick={() => setSelectedItem(null)}
                className="p-1 text-[#64748b] hover:text-[#0f172a] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <img
              src={selectedItem.url}
              alt={selectedItem.name}
              className="w-full h-40 object-cover rounded-md border border-[#e2e8f0] mb-4"
            />

            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-[#64748b]">Filename</p>
                <p className="text-[#0f172a] truncate">{selectedItem.name}</p>
              </div>
              <div>
                <p className="text-xs text-[#64748b]">Size</p>
                <p className="text-[#0f172a]">{formatSize(selectedItem.size)}</p>
              </div>
              {selectedItem.created_at && (
                <div>
                  <p className="text-xs text-[#64748b]">Uploaded</p>
                  <p className="text-[#0f172a]">
                    {new Date(selectedItem.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
              )}

              <div>
                <p className="text-xs text-[#64748b] mb-1">URL</p>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={selectedItem.url}
                    readOnly
                    className="flex-1 px-2 py-1.5 bg-[#f8fafc] border border-[#e2e8f0] rounded text-xs text-[#64748b] truncate"
                  />
                  <button
                    onClick={() => copyUrl(selectedItem.url)}
                    className="px-2 py-1.5 text-[#64748b] hover:text-[#0d9488] border border-[#e2e8f0] rounded hover:bg-slate-50 transition-colors"
                    title="Copy URL"
                  >
                    {copied ? <CheckCircle className="w-3.5 h-3.5 text-[#16a34a]" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => handleDelete(selectedItem)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#dc2626] border border-red-200 hover:bg-red-50 rounded-md transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
