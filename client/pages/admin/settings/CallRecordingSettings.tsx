import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminSettingsLayout from "@/components/admin/settings/AdminSettingsLayout";
import SettingsCard from "@/components/admin/settings/SettingsCard";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Loader2, Play, Sparkles, RefreshCw } from "lucide-react";

const SETTING_KEYS = ["call_transcription_mode", "call_auto_summarize"];

export default function CallRecordingSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [autoSummarize, setAutoSummarize] = useState(true);
  const [originalMode, setOriginalMode] = useState<"manual" | "auto">("manual");
  const [originalAutoSummarize, setOriginalAutoSummarize] = useState(true);

  // Stats
  const [stats, setStats] = useState<{
    total_recordings: number;
    transcribed: number;
    summarized: number;
    pending: number;
  } | null>(null);

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

  useEffect(() => {
    const session = JSON.parse(localStorage.getItem("staffSession") || "{}");
    if (!session.loggedIn) navigate("/admin/login");
    fetchSettings();
    fetchStats();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("setting_key, setting_value")
        .in("setting_key", SETTING_KEYS);

      if (error) throw error;

      const settings = (data || []).reduce(
        (acc, row) => {
          acc[row.setting_key] = row.setting_value;
          return acc;
        },
        {} as Record<string, string>,
      );

      const m = (settings.call_transcription_mode === "auto" ? "auto" : "manual") as "manual" | "auto";
      const s = settings.call_auto_summarize !== "false";

      setMode(m);
      setAutoSummarize(s);
      setOriginalMode(m);
      setOriginalAutoSummarize(s);
    } catch (err) {
      console.error("Failed to fetch settings:", err);
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const { data, error } = await supabase.rpc("comms_get_transcription_stats");
      if (!error && data) {
        setStats(data);
      }
    } catch {
      // stats are optional, don't block
    }
  };

  const hasChanges = mode !== originalMode || autoSummarize !== originalAutoSummarize;

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = [
        { setting_key: "call_transcription_mode", setting_value: mode },
        { setting_key: "call_auto_summarize", setting_value: String(autoSummarize) },
      ];

      for (const u of updates) {
        const { error } = await supabase
          .from("app_settings")
          .upsert(u, { onConflict: "setting_key" });
        if (error) throw error;
      }

      setOriginalMode(mode);
      setOriginalAutoSummarize(autoSummarize);
      toast.success("Call recording settings saved");
    } catch (err) {
      console.error("Save error:", err);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleBackfill = async () => {
    setBackfilling(true);
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/rc-auto-transcribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ batch_size: 10, force: true }),
      });

      const result = await resp.json();

      if (result.ok) {
        toast.success(
          `Processed ${result.processed} recordings: ${result.transcribed} transcribed, ${result.summarized} summarized`,
        );
        fetchStats(); // Refresh stats
      } else {
        toast.error(result.error || "Backfill failed");
      }
    } catch (err) {
      console.error("Backfill error:", err);
      toast.error("Failed to run backfill");
    } finally {
      setBackfilling(false);
    }
  };

  return (
    <AdminSettingsLayout
      title="Call Recording & Transcription"
      description="Configure automatic transcription and AI summarization for call recordings"
      breadcrumbs={[
        { label: "Settings", href: "/admin/settings" },
        { label: "Call Recording" },
      ]}
      loading={loading}
    >
      <div className="space-y-6">
        {/* Stats Card */}
        {stats && (
          <SettingsCard title="Recording Stats" description="Current transcription coverage">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-gray-900">{stats.total_recordings}</div>
                <div className="text-sm text-gray-600">Total Recordings</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-green-700">{stats.transcribed}</div>
                <div className="text-sm text-green-600">Transcribed</div>
              </div>
              <div className="bg-amber-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-amber-700">{stats.summarized}</div>
                <div className="text-sm text-amber-600">Summarized</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-blue-700">{stats.pending}</div>
                <div className="text-sm text-blue-600">Pending</div>
              </div>
            </div>
          </SettingsCard>
        )}

        {/* Transcription Mode */}
        <SettingsCard
          title="Transcription Mode"
          description="Choose when call recordings are transcribed"
        >
          <div className="space-y-4">
            <label
              className={`flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                mode === "manual"
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="mode"
                value="manual"
                checked={mode === "manual"}
                onChange={() => setMode("manual")}
                className="mt-1"
              />
              <div>
                <div className="font-semibold text-gray-900 flex items-center gap-2">
                  <Play className="w-4 h-4" />
                  Manual (Button)
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  Staff click "Transcribe" and "Summarize" buttons on each call.
                  Best for selective transcription or cost control.
                </p>
              </div>
            </label>

            <label
              className={`flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                mode === "auto"
                  ? "border-violet-500 bg-violet-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="mode"
                value="auto"
                checked={mode === "auto"}
                onChange={() => setMode("auto")}
                className="mt-1"
              />
              <div>
                <div className="font-semibold text-gray-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Automatic
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  New recordings are automatically transcribed and summarized after each call sync.
                  Ideal for building an LLM knowledge base. Cost: ~$0.008/min.
                </p>
              </div>
            </label>
          </div>
        </SettingsCard>

        {/* Auto-Summarize Toggle */}
        <SettingsCard
          title="AI Summarization"
          description="Generate bullet-point summaries using Claude Haiku 4.5"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900">Auto-summarize after transcription</div>
              <p className="text-sm text-gray-600 mt-1">
                When enabled, each transcript is automatically summarized into 3-5 bullet points
                covering caller identity, request, action items, and outcome.
              </p>
            </div>
            <button
              onClick={() => setAutoSummarize(!autoSummarize)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
                autoSummarize ? "bg-violet-600" : "bg-gray-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  autoSummarize ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </SettingsCard>

        {/* Backfill */}
        <SettingsCard
          title="Backfill Existing Recordings"
          description="Process recordings that haven't been transcribed yet"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">
                {stats
                  ? `${stats.pending} recordings are waiting to be transcribed.`
                  : "Click to process up to 10 recordings at a time."}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Each batch processes up to 10 recordings. Run multiple times for large backlogs.
              </p>
            </div>
            <button
              onClick={handleBackfill}
              disabled={backfilling || (stats?.pending === 0)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              {backfilling ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {backfilling ? "Processing..." : "Run Backfill"}
            </button>
          </div>
        </SettingsCard>

        {/* Cost Info */}
        <SettingsCard title="Cost Estimate" description="Approximate API costs per minute of audio">
          <div className="bg-gray-50 rounded-lg p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600">
                  <th className="pb-2">Service</th>
                  <th className="pb-2">Provider</th>
                  <th className="pb-2 text-right">Cost/min</th>
                </tr>
              </thead>
              <tbody className="text-gray-900">
                <tr>
                  <td className="py-1">Transcription</td>
                  <td className="py-1 text-gray-600">ElevenLabs Scribe v1</td>
                  <td className="py-1 text-right font-mono">~$0.0065</td>
                </tr>
                <tr>
                  <td className="py-1">Summarization</td>
                  <td className="py-1 text-gray-600">Claude Haiku 4.5</td>
                  <td className="py-1 text-right font-mono">~$0.0015</td>
                </tr>
                <tr className="border-t border-gray-200 font-semibold">
                  <td className="pt-2">Total</td>
                  <td className="pt-2"></td>
                  <td className="pt-2 text-right font-mono">~$0.008</td>
                </tr>
              </tbody>
            </table>
          </div>
        </SettingsCard>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </AdminSettingsLayout>
  );
}
