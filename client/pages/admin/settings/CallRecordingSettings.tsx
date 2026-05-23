import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminSettingsLayout from "@/components/admin/settings/AdminSettingsLayout";
import SettingsCard from "@/components/admin/settings/SettingsCard";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  Loader2,
  Play,
  Sparkles,
  RefreshCw,
  Plus,
  Pencil,
  Trash2,
  Tag,
  Ban,
  X,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────────────────── */

interface CallLabel {
  id: string;
  name: string;
  color: string;
  transcription_mode: "auto" | "manual" | "skip";
  sort_order: number;
  call_count: number;
  created_at: string;
}

interface TranscriptionStats {
  total_recordings: number;
  transcribed: number;
  summarized: number;
  pending: number;
  labeled: number;
  unlabeled: number;
}

const SETTING_KEYS = ["call_transcription_mode", "call_auto_summarize"];

const PRESET_COLORS = [
  "#2563EB", "#16A34A", "#9333EA", "#F59E0B", "#EF4444",
  "#0891B2", "#D946EF", "#6B7280", "#EA580C", "#4F46E5",
];

const MODE_CONFIG = {
  auto:   { label: "Auto",   icon: Sparkles, color: "text-green-700",  bg: "bg-green-50",  border: "border-green-200" },
  manual: { label: "Manual", icon: Play,     color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200" },
  skip:   { label: "Skip",   icon: Ban,      color: "text-gray-500",   bg: "bg-gray-50",   border: "border-gray-200" },
};

/* ── Component ─────────────────────────────────────────────────────────── */

export default function CallRecordingSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);

  // Global settings
  const [globalMode, setGlobalMode] = useState<"auto" | "manual">("manual");
  const [autoSummarize, setAutoSummarize] = useState(true);
  const [origGlobalMode, setOrigGlobalMode] = useState<"auto" | "manual">("manual");
  const [origAutoSummarize, setOrigAutoSummarize] = useState(true);

  // Labels
  const [labels, setLabels] = useState<CallLabel[]>([]);
  const [editingLabel, setEditingLabel] = useState<Partial<CallLabel> | null>(null);
  const [savingLabel, setSavingLabel] = useState(false);
  const [deletingLabelId, setDeletingLabelId] = useState<string | null>(null);

  // Backfill controls
  const [batchSize, setBatchSize] = useState(10);
  const [dateFrom, setDateFrom] = useState("");
  const [backfillLabelIds, setBackfillLabelIds] = useState<string[]>([]);

  // Stats
  const [stats, setStats] = useState<TranscriptionStats | null>(null);

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

  useEffect(() => {
    const session = JSON.parse(localStorage.getItem("staffSession") || "{}");
    if (!session.loggedIn) navigate("/admin/login");
    fetchAll();
  }, []);

  const fetchAll = () => {
    fetchSettings();
    fetchLabels();
    fetchStats();
  };

  /* ── Fetch ───────────────────────────────────────────────────────────── */

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("setting_key, setting_value")
        .in("setting_key", SETTING_KEYS);
      if (error) throw error;

      const s = (data || []).reduce((a, r) => { a[r.setting_key] = r.setting_value; return a; }, {} as Record<string, string>);
      const m = s.call_transcription_mode === "auto" ? "auto" : "manual";
      const sum = s.call_auto_summarize !== "false";

      setGlobalMode(m as "auto" | "manual");
      setAutoSummarize(sum);
      setOrigGlobalMode(m as "auto" | "manual");
      setOrigAutoSummarize(sum);
    } catch { toast.error("Failed to load settings"); }
    finally { setLoading(false); }
  };

  const fetchLabels = async () => {
    try {
      const { data, error } = await supabase.rpc("comms_list_call_labels");
      if (!error && data) setLabels(data as CallLabel[]);
    } catch { /* non-critical */ }
  };

  const fetchStats = async () => {
    try {
      const { data, error } = await supabase.rpc("comms_get_transcription_stats");
      if (!error && data) setStats(data as TranscriptionStats);
    } catch { /* non-critical */ }
  };

  /* ── Save global settings ────────────────────────────────────────────── */

  const hasChanges = globalMode !== origGlobalMode || autoSummarize !== origAutoSummarize;

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const u of [
        { setting_key: "call_transcription_mode", setting_value: globalMode },
        { setting_key: "call_auto_summarize", setting_value: String(autoSummarize) },
      ]) {
        const { error } = await supabase.from("app_settings").upsert(u, { onConflict: "setting_key" });
        if (error) throw error;
      }
      setOrigGlobalMode(globalMode);
      setOrigAutoSummarize(autoSummarize);
      toast.success("Settings saved");
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  };

  /* ── Label CRUD ──────────────────────────────────────────────────────── */

  const handleSaveLabel = async () => {
    if (!editingLabel?.name?.trim()) { toast.error("Label name is required"); return; }
    setSavingLabel(true);
    try {
      const { error } = await supabase.rpc("comms_upsert_call_label", {
        p_id: editingLabel.id || null,
        p_name: editingLabel.name.trim(),
        p_color: editingLabel.color || "#6B7280",
        p_transcription_mode: editingLabel.transcription_mode || "manual",
        p_sort_order: editingLabel.sort_order ?? labels.length,
      });
      if (error) throw error;
      setEditingLabel(null);
      fetchLabels();
      toast.success(editingLabel.id ? "Label updated" : "Label created");
    } catch (err: any) {
      toast.error(err?.message?.includes("unique") ? "Label name already exists" : "Failed to save label");
    } finally { setSavingLabel(false); }
  };

  const handleDeleteLabel = async (id: string) => {
    setDeletingLabelId(id);
    try {
      const { error } = await supabase.rpc("comms_delete_call_label", { p_id: id });
      if (error) throw error;
      fetchLabels();
      toast.success("Label deleted");
    } catch { toast.error("Failed to delete label"); }
    finally { setDeletingLabelId(null); }
  };

  const handleQuickModeChange = async (label: CallLabel, newMode: "auto" | "manual" | "skip") => {
    try {
      const { error } = await supabase.rpc("comms_upsert_call_label", {
        p_id: label.id,
        p_name: label.name,
        p_color: label.color,
        p_transcription_mode: newMode,
        p_sort_order: label.sort_order,
      });
      if (error) throw error;
      setLabels(prev => prev.map(l => l.id === label.id ? { ...l, transcription_mode: newMode } : l));
    } catch { toast.error("Failed to update mode"); }
  };

  /* ── Backfill ────────────────────────────────────────────────────────── */

  const handleBackfill = async () => {
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const payload: Record<string, unknown> = { batch_size: batchSize, force: true };
      if (dateFrom) payload.date_from = new Date(dateFrom).toISOString();
      if (backfillLabelIds.length > 0) payload.label_ids = backfillLabelIds;

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/rc-auto-transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify(payload),
      });
      const result = await resp.json();

      if (result.ok) {
        const msg = `Processed ${result.processed}: ${result.transcribed} transcribed, ${result.summarized} summarized`;
        setBackfillResult(msg);
        toast.success(msg);
        fetchStats();
      } else {
        toast.error(result.error || "Backfill failed");
        setBackfillResult(`Error: ${result.error}`);
      }
    } catch (err) {
      toast.error("Failed to run backfill");
    } finally { setBackfilling(false); }
  };

  const toggleBackfillLabel = (id: string) => {
    setBackfillLabelIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  };

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <AdminSettingsLayout
      title="Call Recording & Transcription"
      description="Configure transcription, AI summarization, and call labels"
      breadcrumbs={[
        { label: "Settings", href: "/admin/settings" },
        { label: "Call Recording" },
      ]}
      loading={loading}
    >
      <div className="space-y-6">

        {/* ── Stats ──────────────────────────────────────────────── */}
        {stats && (
          <SettingsCard title="Recording Stats">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatBox value={stats.total_recordings} label="Total Recordings" bg="bg-gray-50" color="text-gray-900" />
              <StatBox value={stats.transcribed}      label="Transcribed"      bg="bg-green-50" color="text-green-700" />
              <StatBox value={stats.summarized}       label="Summarized"       bg="bg-amber-50" color="text-amber-700" />
              <StatBox value={stats.pending}          label="Pending"          bg="bg-blue-50"  color="text-blue-700" />
            </div>
          </SettingsCard>
        )}

        {/* ── Call Labels ────────────────────────────────────────── */}
        <SettingsCard
          title="Call Labels"
          description="Label calls and control transcription per label"
          actions={
            <button
              onClick={() => setEditingLabel({ name: "", color: PRESET_COLORS[labels.length % PRESET_COLORS.length], transcription_mode: "manual", sort_order: labels.length })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" /> Add Label
            </button>
          }
        >
          {/* Label editor modal */}
          {editingLabel && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-gray-900">
                  {editingLabel.id ? "Edit Label" : "New Label"}
                </h4>
                <button onClick={() => setEditingLabel(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={editingLabel.name || ""}
                    onChange={e => setEditingLabel({ ...editingLabel, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="e.g., Sales"
                  />
                </div>

                {/* Color */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={editingLabel.color || "#6B7280"}
                      onChange={e => setEditingLabel({ ...editingLabel, color: e.target.value })}
                      className="w-10 h-9 border border-gray-300 rounded cursor-pointer"
                    />
                    <div className="flex gap-1 flex-wrap">
                      {PRESET_COLORS.map(c => (
                        <button
                          key={c}
                          onClick={() => setEditingLabel({ ...editingLabel, color: c })}
                          className={`w-6 h-6 rounded-full border-2 ${editingLabel.color === c ? "border-gray-900" : "border-transparent"}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Transcription mode */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Transcription</label>
                  <select
                    value={editingLabel.transcription_mode || "manual"}
                    onChange={e => setEditingLabel({ ...editingLabel, transcription_mode: e.target.value as "auto" | "manual" | "skip" })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="auto">Auto — transcribe automatically</option>
                    <option value="manual">Manual — use buttons</option>
                    <option value="skip">Skip — never transcribe</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setEditingLabel(null)}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveLabel}
                  disabled={savingLabel}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingLabel && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {editingLabel.id ? "Update" : "Create"}
                </button>
              </div>
            </div>
          )}

          {/* Label list */}
          {labels.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">
              No labels yet. Add a label to categorize calls and control transcription.
            </p>
          ) : (
            <div className="space-y-2">
              {labels.map(label => {
                const mc = MODE_CONFIG[label.transcription_mode];
                return (
                  <div key={label.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: label.color }} />
                      <span className="font-medium text-gray-900">{label.name}</span>
                      <span className="text-xs text-gray-500">{label.call_count} calls</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Quick mode toggle */}
                      <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                        {(["auto", "manual", "skip"] as const).map(m => {
                          const cfg = MODE_CONFIG[m];
                          const active = label.transcription_mode === m;
                          return (
                            <button
                              key={m}
                              onClick={() => handleQuickModeChange(label, m)}
                              className={`px-2.5 py-1 flex items-center gap-1 transition-colors ${
                                active ? `${cfg.bg} ${cfg.color} font-semibold` : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                              }`}
                            >
                              <cfg.icon className="w-3 h-3" />
                              {cfg.label}
                            </button>
                          );
                        })}
                      </div>

                      <button
                        onClick={() => setEditingLabel({ ...label })}
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteLabel(label.id)}
                        disabled={deletingLabelId === label.id}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded disabled:opacity-50"
                      >
                        {deletingLabelId === label.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SettingsCard>

        {/* ── Global Default (unlabeled calls) ───────────────────── */}
        <SettingsCard
          title="Unlabeled Calls"
          description="Default transcription mode for calls without a label"
        >
          <div className="flex items-center gap-4">
            {(["manual", "auto"] as const).map(m => {
              const cfg = MODE_CONFIG[m];
              const active = globalMode === m;
              return (
                <label
                  key={m}
                  className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer flex-1 transition-all ${
                    active ? `${cfg.border} ${cfg.bg}` : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="globalMode"
                    checked={active}
                    onChange={() => setGlobalMode(m)}
                    className="sr-only"
                  />
                  <cfg.icon className={`w-5 h-5 ${active ? cfg.color : "text-gray-400"}`} />
                  <div>
                    <div className={`font-semibold ${active ? cfg.color : "text-gray-600"}`}>{cfg.label}</div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {m === "auto"
                        ? "Unlabeled recordings transcribed automatically"
                        : "Unlabeled recordings require manual buttons"}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </SettingsCard>

        {/* ── Auto-Summarize Toggle ──────────────────────────────── */}
        <SettingsCard
          title="AI Summarization"
          description="Generate bullet-point summaries using Claude Haiku 4.5"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900">Auto-summarize after transcription</div>
              <p className="text-sm text-gray-600 mt-1">
                Each transcript is summarized into 3-5 bullet points
                covering caller identity, request, action items, and outcome.
              </p>
            </div>
            <button
              onClick={() => setAutoSummarize(!autoSummarize)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                autoSummarize ? "bg-violet-600" : "bg-gray-200"
              }`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                autoSummarize ? "translate-x-5" : "translate-x-0"
              }`} />
            </button>
          </div>
        </SettingsCard>

        {/* ── Save Button ────────────────────────────────────────── */}
        {hasChanges && (
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        )}

        {/* ── Backfill ───────────────────────────────────────────── */}
        <SettingsCard
          title="Backfill Existing Recordings"
          description="Process recordings that haven't been transcribed yet"
        >
          <div className="space-y-4">
            {/* Controls row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Batch size */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Batch Size</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={batchSize}
                  onChange={e => setBatchSize(Math.max(1, Math.min(50, Number(e.target.value))))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">Max 50 per batch</p>
              </div>

              {/* Date from */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">From Date (optional)</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">Only process calls after this date</p>
              </div>

              {/* Estimated cost */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Est. Cost</label>
                <div className="px-3 py-2 bg-gray-50 rounded-md text-sm font-mono text-gray-700 border border-gray-200">
                  ~${(batchSize * 0.008 * 3).toFixed(2)} – ${(batchSize * 0.008 * 5).toFixed(2)}
                </div>
                <p className="text-xs text-gray-500 mt-1">Assumes 3-5 min avg per call</p>
              </div>
            </div>

            {/* Filter by labels */}
            {labels.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Filter by Labels (optional — empty = all pending)
                </label>
                <div className="flex flex-wrap gap-2">
                  {labels.map(l => {
                    const selected = backfillLabelIds.includes(l.id);
                    return (
                      <button
                        key={l.id}
                        onClick={() => toggleBackfillLabel(l.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                          selected
                            ? "border-gray-900 bg-gray-900 text-white"
                            : "border-gray-300 text-gray-600 hover:border-gray-400"
                        }`}
                      >
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: selected ? "#fff" : l.color }}
                        />
                        {l.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Run button + result */}
            <div className="flex items-center justify-between border-t border-gray-100 pt-4">
              <div className="text-sm text-gray-600">
                {stats
                  ? `${stats.pending} recordings pending transcription`
                  : "Click to process recordings"}
              </div>
              <button
                onClick={handleBackfill}
                disabled={backfilling || (stats?.pending === 0)}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                {backfilling ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                {backfilling ? "Processing..." : "Run Backfill"}
              </button>
            </div>

            {backfillResult && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                {backfillResult}
              </div>
            )}
          </div>
        </SettingsCard>

        {/* ── Cost Estimate ──────────────────────────────────────── */}
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
      </div>
    </AdminSettingsLayout>
  );
}

/* ── Helper components ──────────────────────────────────────────────────── */

function StatBox({ value, label, bg, color }: { value: number; label: string; bg: string; color: string }) {
  return (
    <div className={`${bg} rounded-lg p-4 text-center`}>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-sm text-gray-600">{label}</div>
    </div>
  );
}
