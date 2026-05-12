import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save, Pause, Play, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface NegotiationSettings {
  id: number;
  mode: "hitl" | "mixed" | "auto";
  auto_confidence_threshold: number;
  auto_max_uplift_pct: number;
  auto_max_deadline_extension_hours: number;
  auto_only_for_services: string[];
  notify_staff_email: string | null;
  require_unanimous_confidence: boolean;
  paused: boolean;
  updated_at: string;
}

const MODE_DESCRIPTIONS: Record<NegotiationSettings["mode"], string> = {
  hitl: "AI recommends; every action requires staff approval. Safest, no surprises.",
  mixed: "AI auto-executes when its confidence is above the threshold AND inside the bounds. Otherwise falls back to staff review.",
  auto: "AI executes every recommendation as long as it's inside the bounds. Staff reviews only what AI escalates.",
};

export default function NegotiationAutomationSettings() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<NegotiationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<{
    total: number;
    auto: number;
    hitl: number;
    last_24h: number;
  } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("negotiation_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (data) setSettings(data as NegotiationSettings);

    // 24h activity summary
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count: total } = await supabase
      .from("vendor_negotiation_decisions")
      .select("id", { count: "exact", head: true });
    const { count: auto } = await supabase
      .from("vendor_negotiation_decisions")
      .select("id", { count: "exact", head: true })
      .eq("mode", "auto");
    const { count: hitl } = await supabase
      .from("vendor_negotiation_decisions")
      .select("id", { count: "exact", head: true })
      .eq("mode", "hitl");
    const { count: last24h } = await supabase
      .from("vendor_negotiation_decisions")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since);
    setStats({
      total: total ?? 0,
      auto: auto ?? 0,
      hitl: hitl ?? 0,
      last_24h: last24h ?? 0,
    });
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const save = async (patch: Partial<NegotiationSettings>) => {
    if (!settings) return;
    setSaving(true);
    const { error } = await supabase
      .from("negotiation_settings")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", 1);
    setSaving(false);
    if (error) {
      toast.error(`Failed to save: ${error.message}`);
      return;
    }
    setSettings({ ...settings, ...patch } as NegotiationSettings);
    toast.success("Settings saved");
  };

  if (loading || !settings) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <button
          onClick={() => navigate("/admin/settings")}
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Settings
        </button>
        <h1 className="text-2xl font-semibold text-gray-900 mb-2 flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-violet-600" />
          Negotiation Automation
        </h1>
        <p className="text-sm text-gray-600 mb-8">
          Controls how the AI negotiator handles vendor counter-offers. Hard
          bounds are always enforced server-side — Claude can never propose
          above the margin ceiling or below the anti-lowball floor.
        </p>

        {/* Pause kill switch */}
        <div className={`mb-6 p-4 rounded-lg border ${settings.paused ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className={`text-sm font-semibold ${settings.paused ? "text-red-900" : "text-green-900"}`}>
                {settings.paused ? "Negotiator is PAUSED" : "Negotiator is active"}
              </div>
              <p className={`text-xs ${settings.paused ? "text-red-700" : "text-green-700"}`}>
                {settings.paused
                  ? "All recommendations and auto-executions are blocked. The button below will still record, but nothing fires."
                  : "Recommendations are generated on demand. Auto-execution honors the mode below."}
              </p>
            </div>
            <button
              onClick={() => save({ paused: !settings.paused })}
              disabled={saving}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 ${
                settings.paused
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "bg-red-600 hover:bg-red-700 text-white"
              }`}
            >
              {settings.paused ? <><Play className="w-4 h-4" /> Resume</> : <><Pause className="w-4 h-4" /> Pause</>}
            </button>
          </div>
        </div>

        {/* Mode selector */}
        <section className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Operating Mode</h2>
          <div className="space-y-2">
            {(["hitl", "mixed", "auto"] as const).map((m) => (
              <label
                key={m}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  settings.mode === m ? "border-violet-500 bg-violet-50" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name="mode"
                  value={m}
                  checked={settings.mode === m}
                  onChange={() => save({ mode: m })}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900 capitalize">{m}</div>
                  <div className="text-xs text-gray-600">{MODE_DESCRIPTIONS[m]}</div>
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* Auto bounds */}
        <section className={`bg-white border border-gray-200 rounded-lg p-5 mb-6 ${settings.mode === "hitl" ? "opacity-50" : ""}`}>
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Auto-execution bounds</h2>
          <p className="text-xs text-gray-500 mb-4">
            {settings.mode === "hitl"
              ? "These only apply when Mode is Mixed or Auto."
              : "Auto only fires when the recommendation is inside all of these bounds."}
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Confidence threshold (Mixed mode only)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0.5}
                  max={1.0}
                  step={0.05}
                  value={settings.auto_confidence_threshold}
                  onChange={(e) => save({ auto_confidence_threshold: Number(e.target.value) })}
                  disabled={saving || settings.mode === "hitl"}
                  className="flex-1"
                />
                <span className="text-sm font-mono tabular-nums w-12 text-right">
                  {Math.round(settings.auto_confidence_threshold * 100)}%
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Mixed mode: only auto-execute when Claude's confidence is at or above this. Lower = more auto, higher = more HITL.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Max uplift % over original (for auto-accept)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0.00}
                  max={0.30}
                  step={0.01}
                  value={settings.auto_max_uplift_pct}
                  onChange={(e) => save({ auto_max_uplift_pct: Number(e.target.value) })}
                  disabled={saving || settings.mode === "hitl"}
                  className="flex-1"
                />
                <span className="text-sm font-mono tabular-nums w-12 text-right">
                  {Math.round(settings.auto_max_uplift_pct * 100)}%
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Auto only accepts a counter if the rate is within this % above the original offer. Higher uplifts always need staff review.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Max deadline extension (hours)
              </label>
              <input
                type="number"
                min={0}
                max={168}
                value={settings.auto_max_deadline_extension_hours}
                onChange={(e) => save({ auto_max_deadline_extension_hours: Number(e.target.value) })}
                disabled={saving || settings.mode === "hitl"}
                className="w-24 px-3 py-1.5 border border-gray-300 rounded text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Auto only accepts a counter that extends the deadline by less than this many hours.
              </p>
            </div>
          </div>
        </section>

        {/* Service scope */}
        <section className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Service Scope</h2>
          <p className="text-xs text-gray-500 mb-3">
            Empty list = <span className="font-medium">all services</span> participate in auto. Add specific services here to restrict.
          </p>
          <div className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded p-3">
            {settings.auto_only_for_services.length === 0 ? (
              <span className="text-green-700 font-medium">✓ Auto enabled for all services</span>
            ) : (
              <span>Restricted to {settings.auto_only_for_services.length} service(s)</span>
            )}
          </div>
        </section>

        {/* Notification */}
        <section className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Notifications</h2>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Staff email for daily auto-action digest + HITL 1-hour reminders
          </label>
          <input
            type="email"
            value={settings.notify_staff_email ?? ""}
            onChange={(e) => setSettings({ ...settings, notify_staff_email: e.target.value })}
            onBlur={() => save({ notify_staff_email: settings.notify_staff_email })}
            placeholder="e.g. pm@cethos.com"
            className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm"
          />
        </section>

        {/* Activity */}
        {stats && (
          <section className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Activity</h2>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-semibold text-gray-900 tabular-nums">{stats.total}</div>
                <div className="text-xs text-gray-500">All-time decisions</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-violet-700 tabular-nums">{stats.auto}</div>
                <div className="text-xs text-gray-500">Auto-executed</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-blue-700 tabular-nums">{stats.hitl}</div>
                <div className="text-xs text-gray-500">HITL</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-amber-700 tabular-nums">{stats.last_24h}</div>
                <div className="text-xs text-gray-500">Last 24h</div>
              </div>
            </div>
          </section>
        )}

        {saving && (
          <div className="fixed bottom-4 right-4 px-3 py-1.5 bg-gray-900 text-white rounded text-xs flex items-center gap-1.5">
            <Save className="w-3 h-3" /> Saving…
          </div>
        )}
      </div>
    </div>
  );
}
