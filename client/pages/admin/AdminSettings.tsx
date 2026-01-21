import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useBranding } from "../../context/BrandingContext";

interface StaffSession {
  email: string;
  staffId: string;
  staffName?: string;
  staffRole?: string;
  loggedIn: boolean;
}

interface BrandingFormData {
  companyName: string;
  logoUrl: string;
  logoDarkUrl: string;
  supportEmail: string;
  primaryColor: string;
}

export default function AdminSettings() {
  const navigate = useNavigate();
  const currentBranding = useBranding();
  const [session, setSession] = useState<StaffSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [formData, setFormData] = useState<BrandingFormData>({
    companyName: "",
    logoUrl: "",
    logoDarkUrl: "",
    supportEmail: "",
    primaryColor: "#3B82F6",
  });

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

  useEffect(() => {
    checkSession();
  }, []);

  useEffect(() => {
    // Load current branding into form once it's available
    if (!currentBranding.loading) {
      setFormData({
        companyName: currentBranding.companyName,
        logoUrl: currentBranding.logoUrl,
        logoDarkUrl: currentBranding.logoDarkUrl,
        supportEmail: currentBranding.supportEmail,
        primaryColor: currentBranding.primaryColor,
      });
    }
  }, [currentBranding.loading]);

  const checkSession = () => {
    const stored = localStorage.getItem("staffSession");

    if (!stored) {
      navigate("/admin/login", { replace: true });
      return;
    }

    try {
      const parsedSession = JSON.parse(stored) as StaffSession;

      if (!parsedSession.loggedIn) {
        navigate("/admin/login", { replace: true });
        return;
      }

      setSession(parsedSession);
      setLoading(false);
    } catch (err) {
      console.error("Invalid session:", err);
      navigate("/admin/login", { replace: true });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!session?.staffId) {
      setMessage({
        type: "error",
        text: "Session invalid. Please log in again.",
      });
      return;
    }

    // Validation
    if (!formData.companyName.trim()) {
      setMessage({ type: "error", text: "Company name is required" });
      return;
    }

    if (!formData.supportEmail.trim() || !formData.supportEmail.includes("@")) {
      setMessage({ type: "error", text: "Valid support email is required" });
      return;
    }

    if (!formData.primaryColor.match(/^#[0-9A-Fa-f]{6}$/)) {
      setMessage({
        type: "error",
        text: "Primary color must be a valid hex color (e.g., #3B82F6)",
      });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/update-branding`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            staffId: session.staffId,
            companyName: formData.companyName,
            logoUrl: formData.logoUrl,
            logoDarkUrl: formData.logoDarkUrl,
            supportEmail: formData.supportEmail,
            primaryColor: formData.primaryColor,
          }),
        },
      );

      const result = await response.json();

      if (result.success) {
        setMessage({
          type: "success",
          text: "Branding settings saved successfully! Refresh the page to see changes.",
        });
      } else {
        setMessage({
          type: "error",
          text: result.error || "Failed to save branding settings",
        });
      }
    } catch (err) {
      console.error("Save error:", err);
      setMessage({ type: "error", text: `Error: ${err}` });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Access control: only super_admin can access
  if (session?.staffRole !== "super_admin") {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => navigate("/admin/hitl")}
            className="mb-4 text-blue-600 hover:text-blue-800 font-medium"
          >
            ← Back to Queue
          </button>
          <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
            <h1 className="text-2xl font-bold text-red-900 mb-2">
              Access Denied
            </h1>
            <p className="text-red-700">
              Only super administrators can access this page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <button
            onClick={() => navigate("/admin/hitl")}
            className="mb-2 text-blue-600 hover:text-blue-800 font-medium"
          >
            ← Back to Queue
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              Branding Settings
            </h1>
            <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-medium">
              SUPER ADMIN
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Settings Navigation */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Settings Categories
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Pricing & Complexity */}
            <button
              onClick={() => navigate("/admin/settings/pricing")}
              className="text-left p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-md transition-all"
            >
              <h3 className="font-semibold text-gray-900 mb-1">
                Pricing Settings
              </h3>
              <p className="text-sm text-gray-600">
                Base rate, words per page, rounding
              </p>
            </button>

            <button
              onClick={() => navigate("/admin/settings/complexity")}
              className="text-left p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-md transition-all"
            >
              <h3 className="font-semibold text-gray-900 mb-1">
                Complexity Multipliers
              </h3>
              <p className="text-sm text-gray-600">
                Easy, medium, hard pricing multipliers
              </p>
            </button>

            <button
              onClick={() => navigate("/admin/settings/turnaround")}
              className="text-left p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-md transition-all"
            >
              <h3 className="font-semibold text-gray-900 mb-1">
                Turnaround & Rush
              </h3>
              <p className="text-sm text-gray-600">
                Standard delivery times and rush fees
              </p>
            </button>

            <button
              onClick={() => navigate("/admin/settings/document-types")}
              className="text-left p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-md transition-all"
            >
              <h3 className="font-semibold text-gray-900 mb-1">
                Document Types
              </h3>
              <p className="text-sm text-gray-600">
                Manage document categories and complexity
              </p>
            </button>

            <button
              onClick={() => navigate("/admin/settings/certifications")}
              className="text-left p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-md transition-all"
            >
              <h3 className="font-semibold text-gray-900 mb-1">
                Certification Types
              </h3>
              <p className="text-sm text-gray-600">
                Notarization, apostille, and other certifications
              </p>
            </button>

            <button
              onClick={() => navigate("/admin/settings/delivery")}
              className="text-left p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-md transition-all"
            >
              <h3 className="font-semibold text-gray-900 mb-1">
                Delivery Options
              </h3>
              <p className="text-sm text-gray-600">
                Digital and physical delivery methods
              </p>
            </button>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Branding Settings
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Settings Form */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Configure Branding
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Company Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.companyName}
                  onChange={(e) =>
                    setFormData({ ...formData, companyName: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Cethos"
                />
              </div>

              {/* Logo URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Logo URL (Light Mode)
                </label>
                <input
                  type="url"
                  value={formData.logoUrl}
                  onChange={(e) =>
                    setFormData({ ...formData, logoUrl: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://example.com/logo.png"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Leave empty to show company name as text
                </p>
              </div>

              {/* Logo Dark URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Logo URL (Dark Mode)
                </label>
                <input
                  type="url"
                  value={formData.logoDarkUrl}
                  onChange={(e) =>
                    setFormData({ ...formData, logoDarkUrl: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://example.com/logo-dark.png"
                />
              </div>

              {/* Support Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Support Email *
                </label>
                <input
                  type="email"
                  required
                  value={formData.supportEmail}
                  onChange={(e) =>
                    setFormData({ ...formData, supportEmail: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="support@cethos.com"
                />
              </div>

              {/* Primary Color */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Primary Color *
                </label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={formData.primaryColor}
                    onChange={(e) =>
                      setFormData({ ...formData, primaryColor: e.target.value })
                    }
                    className="h-10 w-20 border border-gray-300 rounded-md cursor-pointer"
                  />
                  <input
                    type="text"
                    required
                    value={formData.primaryColor}
                    onChange={(e) =>
                      setFormData({ ...formData, primaryColor: e.target.value })
                    }
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    placeholder="#3B82F6"
                    pattern="^#[0-9A-Fa-f]{6}$"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Hex color code (e.g., #3B82F6)
                </p>
              </div>

              {/* Messages */}
              {message && (
                <div
                  className={`p-4 rounded-md ${
                    message.type === "success"
                      ? "bg-green-50 border border-green-200 text-green-800"
                      : "bg-red-50 border border-red-200 text-red-800"
                  }`}
                >
                  {message.text}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={saving}
                className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {saving ? "Saving..." : "Save Branding Settings"}
              </button>
            </form>
          </div>

          {/* Live Preview */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Live Preview
            </h2>

            {/* Header Preview */}
            <div className="border-2 border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-white border-b border-gray-200 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {formData.logoUrl ? (
                      <img
                        src={formData.logoUrl}
                        alt={formData.companyName}
                        className="h-10 object-contain"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <h1
                        className="text-2xl font-bold"
                        style={{ color: formData.primaryColor }}
                      >
                        {formData.companyName.toUpperCase()}
                      </h1>
                    )}
                    <span className="text-gray-500">Staff Portal</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-600">
                      admin@example.com
                    </span>
                    <button className="text-sm text-red-600 hover:text-red-800 font-medium">
                      Logout
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-gray-50">
                <p className="text-sm text-gray-600">
                  This is how your header will appear across the admin portal.
                </p>
              </div>
            </div>

            {/* Customer Header Preview */}
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Customer-Facing Header
              </h3>
              <div className="border-2 border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-white border-b border-gray-200 px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {formData.logoUrl ? (
                        <img
                          src={formData.logoUrl}
                          alt={formData.companyName}
                          className="h-8 object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                          style={{ backgroundColor: formData.primaryColor }}
                        >
                          {formData.companyName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      {!formData.logoUrl && (
                        <span
                          className="text-xl font-bold"
                          style={{ color: formData.primaryColor }}
                        >
                          {formData.companyName.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-4 text-sm">
                      <button className="text-gray-600 hover:text-gray-800">
                        Help
                      </button>
                      <button className="text-gray-600 hover:text-gray-800">
                        Login
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Color Swatch Preview */}
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Primary Color Usage
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div
                  className="p-4 rounded-lg text-white font-medium text-center"
                  style={{ backgroundColor: formData.primaryColor }}
                >
                  Button
                </div>
                <div
                  className="p-4 rounded-lg border-2 font-medium text-center"
                  style={{
                    borderColor: formData.primaryColor,
                    color: formData.primaryColor,
                  }}
                >
                  Outline
                </div>
              </div>
            </div>

            {/* Contact Info */}
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Support Contact
              </h3>
              <p className="text-sm text-gray-600">{formData.supportEmail}</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
