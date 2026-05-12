/**
 * IsoAssessmentSection
 *
 * Surfaces the vendor-iso17100-assess edge function in the admin
 * Documents tab. Shows the latest assessment (overall verdict + per-
 * criterion verdicts), a button to run a fresh assessment, and a
 * collapsible history of past runs.
 *
 * Phase B (this PR): trigger + display. Phase C (later): per-criterion
 * admin override fed back as few-shot examples.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  Clock,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

const CRITERIA: { key: string; label: string }[] = [
  { key: "qualifications", label: "Qualifications (§6.1.4)" },
  { key: "translation_competence", label: "Translation competence" },
  { key: "linguistic_textual_competence", label: "Linguistic & textual" },
  { key: "research_competence", label: "Research competence" },
  { key: "cultural_competence", label: "Cultural competence" },
  { key: "technical_competence", label: "Technical competence" },
  { key: "domain_competence", label: "Domain competence" },
];

type Verdict = "pass" | "partial" | "fail" | "insufficient_evidence" | null;

interface CriterionResult {
  verdict: Verdict;
  evidence?: string[];
  reasoning?: string;
}

interface AssessmentResult {
  overall?: Verdict;
  overall_reasoning?: string;
  criteria?: Record<string, CriterionResult>;
}

interface Assessment {
  id: string;
  created_at: string;
  model: string;
  prompt_version: string;
  overall_verdict: Verdict;
  result: AssessmentResult | null;
  corrected_at: string | null;
}

interface Props {
  vendorId: string;
  staffId?: string | null;
}

function verdictStyle(v: Verdict) {
  switch (v) {
    case "pass":
      return { bg: "bg-emerald-100", fg: "text-emerald-800", border: "border-emerald-200", icon: CheckCircle2, label: "Pass" };
    case "partial":
      return { bg: "bg-amber-100", fg: "text-amber-800", border: "border-amber-200", icon: AlertTriangle, label: "Partial" };
    case "fail":
      return { bg: "bg-red-100", fg: "text-red-800", border: "border-red-200", icon: XCircle, label: "Fail" };
    case "insufficient_evidence":
      return { bg: "bg-gray-100", fg: "text-gray-700", border: "border-gray-200", icon: HelpCircle, label: "Insufficient evidence" };
    default:
      return { bg: "bg-gray-50", fg: "text-gray-500", border: "border-gray-200", icon: HelpCircle, label: "—" };
  }
}

function VerdictPill({ verdict }: { verdict: Verdict }) {
  const s = verdictStyle(verdict);
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${s.bg} ${s.fg} ${s.border} border`}>
      <Icon className="w-3 h-3" />
      {s.label}
    </span>
  );
}

export default function IsoAssessmentSection({ vendorId, staffId }: Props) {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<Assessment[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedCriteria, setExpandedCriteria] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("vendor_iso17100_assessments")
      .select("id, created_at, model, prompt_version, overall_verdict, result, corrected_at")
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error(`Could not load ISO 17100 history: ${error.message}`);
      return;
    }
    setHistory((data ?? []) as Assessment[]);
  }, [vendorId]);

  useEffect(() => { refresh(); }, [refresh]);

  const runAssessment = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("vendor-iso17100-assess", {
        body: { vendor_id: vendorId, staff_id: staffId ?? null },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Assessment failed");
      toast.success(`Assessment complete: ${data.overall_verdict ?? "no verdict"}`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Assessment failed");
    } finally {
      setRunning(false);
    }
  };

  const latest = history[0] ?? null;
  const older = history.slice(1);

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-600" />
          <h3 className="text-sm font-semibold text-gray-900">ISO 17100:2015 — Translator competence assessment</h3>
        </div>
        <button
          type="button"
          onClick={runAssessment}
          disabled={running}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-purple-600 rounded hover:bg-purple-700 disabled:opacity-50"
        >
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {running ? "Running…" : latest ? "Run again" : "Run assessment"}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      ) : !latest ? (
        <div className="text-xs text-gray-500 italic">
          No assessment yet. Run one to get an LLM-driven verdict against §6.1.2 (competences) and §6.1.4 (qualifications).
        </div>
      ) : (
        <>
          {/* Latest verdict */}
          <div className="rounded-lg border border-gray-200 bg-gray-50/40 p-4 mb-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Overall</span>
                  <VerdictPill verdict={latest.overall_verdict} />
                </div>
                <div className="text-[11px] text-gray-500 mt-1">
                  {new Date(latest.created_at).toLocaleString()} · model {latest.model} · prompt {latest.prompt_version}
                  {latest.corrected_at && (
                    <span className="ml-1 text-amber-700">· corrected {new Date(latest.corrected_at).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
            </div>
            {latest.result?.overall_reasoning && (
              <p className="text-xs text-gray-700 mt-2">{latest.result.overall_reasoning}</p>
            )}
          </div>

          {/* Per-criterion grid */}
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
            {CRITERIA.map(({ key, label }) => {
              const c = latest.result?.criteria?.[key];
              const expanded = !!expandedCriteria[key];
              return (
                <div key={key} className="px-3 py-2.5">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between gap-3 text-left"
                    onClick={() => setExpandedCriteria((s) => ({ ...s, [key]: !s[key] }))}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                      <span className="text-xs font-medium text-gray-900 truncate">{label}</span>
                    </div>
                    <VerdictPill verdict={(c?.verdict as Verdict) ?? null} />
                  </button>
                  {expanded && (
                    <div className="ml-5 mt-2 space-y-1.5">
                      {c?.reasoning && (
                        <p className="text-[11px] text-gray-700">{c.reasoning}</p>
                      )}
                      {c?.evidence && c.evidence.length > 0 && (
                        <div className="text-[11px] text-gray-500">
                          <div className="font-medium text-gray-600 mb-0.5">Evidence:</div>
                          <ul className="list-disc list-inside space-y-0.5">
                            {c.evidence.map((e, i) => (
                              <li key={i}>{e}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {!c && (
                        <p className="text-[11px] text-gray-400 italic">No result for this criterion.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* History */}
          {older.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 uppercase tracking-wider"
                onClick={() => setShowHistory((s) => !s)}
              >
                {showHistory ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                <Clock className="w-3.5 h-3.5" />
                Past assessments ({older.length})
              </button>
              {showHistory && (
                <div className="mt-2 border border-gray-100 rounded divide-y divide-gray-100">
                  {older.map((a) => (
                    <div key={a.id} className="flex items-center justify-between px-3 py-2 text-xs">
                      <div className="text-gray-700">
                        {new Date(a.created_at).toLocaleString()}
                        <span className="text-gray-400 ml-2">· {a.model} · {a.prompt_version}</span>
                      </div>
                      <VerdictPill verdict={a.overall_verdict} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
