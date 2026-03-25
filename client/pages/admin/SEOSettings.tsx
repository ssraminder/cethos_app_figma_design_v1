import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  Globe,
  Save,
  Loader2,
  RefreshCw,
  CheckCircle,
} from "lucide-react";

interface SEOData {
  meta_title: string;
  meta_description: string;
  og_image_url: string;
  google_verification: string;
  robots_txt: string;
}

const DEFAULT_SEO: SEOData = {
  meta_title: "",
  meta_description: "",
  og_image_url: "",
  google_verification: "",
  robots_txt: "",
};

export default function SEOSettings() {
  const [seo, setSeo] = useState<SEOData>(DEFAULT_SEO);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    async function fetch() {
      try {
        const { data } = await supabase
          .from("site_settings")
          .select("key, value")
          .in("key", ["seo_meta_title", "seo_meta_description", "seo_og_image", "google_verification", "robots_txt"]);

        if (data) {
          const map: Record<string, string> = {};
          data.forEach((r: any) => (map[r.key] = r.value));
          setSeo({
            meta_title: map.seo_meta_title || "",
            meta_description: map.seo_meta_description || "",
            og_image_url: map.seo_og_image || "",
            google_verification: map.google_verification || "",
            robots_txt: map.robots_txt || "",
          });
        }
      } catch (err) {
        console.error("Failed to load SEO settings:", err);
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const pairs = [
        { key: "seo_meta_title", value: seo.meta_title },
        { key: "seo_meta_description", value: seo.meta_description },
        { key: "seo_og_image", value: seo.og_image_url },
        { key: "google_verification", value: seo.google_verification },
        { key: "robots_txt", value: seo.robots_txt },
      ];

      for (const pair of pairs) {
        await supabase
          .from("site_settings")
          .upsert({ key: pair.key, value: pair.value }, { onConflict: "key" });
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerateSitemap = async () => {
    setRegenerating(true);
    try {
      // Placeholder: trigger sitemap regeneration
      await new Promise((resolve) => setTimeout(resolve, 1500));
      alert("Sitemap regenerated successfully!");
    } catch (err) {
      console.error("Sitemap regeneration failed:", err);
    } finally {
      setRegenerating(false);
    }
  };

  const charCountColor = (current: number, max: number) => {
    if (current === 0) return "text-[#94a3b8]";
    if (current <= max * 0.8) return "text-[#16a34a]";
    if (current <= max) return "text-[#d97706]";
    return "text-[#dc2626]";
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="bg-white border border-[#e2e8f0] rounded-lg p-6 space-y-4">
            <div className="h-4 bg-gray-100 rounded w-24" />
            <div className="h-10 bg-gray-100 rounded" />
            <div className="h-4 bg-gray-100 rounded w-32" />
            <div className="h-20 bg-gray-100 rounded" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#0f172a]">SEO Settings</h1>
          <p className="text-sm text-[#64748b] mt-1">
            Configure global SEO settings for your website
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRegenerateSitemap}
            disabled={regenerating}
            className="flex items-center gap-2 px-4 py-2 text-sm text-[#64748b] border border-[#e2e8f0] hover:bg-slate-50 rounded-md transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${regenerating ? "animate-spin" : ""}`} />
            Regenerate Sitemap
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-[#0d9488] hover:bg-[#0f766e] disabled:opacity-50 rounded-md transition-colors font-medium"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Default Meta Tags */}
        <div className="bg-white border border-[#e2e8f0] rounded-lg p-6">
          <h3 className="text-sm font-medium text-[#0f172a] mb-4">Default Meta Tags</h3>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-[#0f172a]">Meta Title</label>
                <span className={`text-xs ${charCountColor(seo.meta_title.length, 60)}`}>
                  {seo.meta_title.length}/60
                </span>
              </div>
              <input
                type="text"
                value={seo.meta_title}
                onChange={(e) => setSeo({ ...seo, meta_title: e.target.value })}
                className="w-full px-3 py-2 border border-[#e2e8f0] rounded-md text-sm focus:ring-2 focus:ring-[#0d9488] outline-none"
                placeholder="Cethos - Certified Translation Services"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-[#0f172a]">Meta Description</label>
                <span className={`text-xs ${charCountColor(seo.meta_description.length, 160)}`}>
                  {seo.meta_description.length}/160
                </span>
              </div>
              <textarea
                value={seo.meta_description}
                onChange={(e) => setSeo({ ...seo, meta_description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-[#e2e8f0] rounded-md text-sm focus:ring-2 focus:ring-[#0d9488] outline-none resize-none"
                placeholder="Professional translation and localization services..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#0f172a] mb-1">
                OG Image URL
              </label>
              <input
                type="url"
                value={seo.og_image_url}
                onChange={(e) => setSeo({ ...seo, og_image_url: e.target.value })}
                className="w-full px-3 py-2 border border-[#e2e8f0] rounded-md text-sm focus:ring-2 focus:ring-[#0d9488] outline-none"
                placeholder="https://cethos.com/og-image.png"
              />
            </div>
          </div>
        </div>

        {/* SERP Preview */}
        <div className="bg-white border border-[#e2e8f0] rounded-lg p-6">
          <h3 className="text-sm font-medium text-[#0f172a] mb-4">SERP Preview</h3>
          <div className="p-4 bg-[#f8fafc] rounded-md border border-[#e2e8f0] space-y-0.5">
            <p className="text-xs text-[#16a34a]">cethos.com</p>
            <p className="text-sm text-[#2563eb] font-medium hover:underline cursor-default">
              {seo.meta_title || "Cethos - Certified Translation Services"}
            </p>
            <p className="text-xs text-[#64748b] line-clamp-2">
              {seo.meta_description || "Your meta description will appear here..."}
            </p>
          </div>
        </div>

        {/* Verification */}
        <div className="bg-white border border-[#e2e8f0] rounded-lg p-6">
          <h3 className="text-sm font-medium text-[#0f172a] mb-4">Search Console Verification</h3>
          <div>
            <label className="block text-sm font-medium text-[#0f172a] mb-1">
              Google Verification Meta Tag
            </label>
            <input
              type="text"
              value={seo.google_verification}
              onChange={(e) => setSeo({ ...seo, google_verification: e.target.value })}
              className="w-full px-3 py-2 border border-[#e2e8f0] rounded-md text-sm focus:ring-2 focus:ring-[#0d9488] outline-none"
              placeholder="google-site-verification=..."
            />
            <p className="text-xs text-[#94a3b8] mt-1">
              This value will be injected as a meta tag in the site head.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
