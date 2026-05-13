/**
 * AdminIsoQuizzes — /admin/iso-quizzes
 *
 * CRUD for the ISO 17100 competence MCQ question bank
 * (iso_competence_quizzes). Staff use this to grow the bank,
 * deactivate questions that stop discriminating, and seed per-domain
 * question pools for domain_competence.
 *
 * Vendors don't see this page — they only see the runner on
 * /iso-evidence/:token.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Search,
  CheckCircle2,
  XCircle,
  X as XIcon,
  Save,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

type CompetenceSlug =
  | "linguistic_textual_competence"
  | "research_competence"
  | "cultural_competence"
  | "technical_competence"
  | "domain_competence";

const COMPETENCE_LABELS: Record<CompetenceSlug, string> = {
  linguistic_textual_competence: "Linguistic & textual",
  research_competence: "Research",
  cultural_competence: "Cultural",
  technical_competence: "Technical",
  domain_competence: "Domain",
};

interface QuizOption {
  value: string;
  label: string;
}

interface Quiz {
  id: string;
  competence_slug: CompetenceSlug;
  domain: string | null;
  question: string;
  options: QuizOption[];
  correct_option: string;
  explanation: string | null;
  difficulty: "easy" | "medium" | "hard";
  active: boolean;
  created_at: string;
  updated_at: string;
}

const EMPTY_DRAFT: Partial<Quiz> = {
  competence_slug: "linguistic_textual_competence",
  domain: null,
  question: "",
  options: [
    { value: "a", label: "" },
    { value: "b", label: "" },
    { value: "c", label: "" },
    { value: "d", label: "" },
  ],
  correct_option: "a",
  explanation: "",
  difficulty: "medium",
  active: true,
};

export default function AdminIsoQuizzes() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Quiz[]>([]);
  const [filter, setFilter] = useState<{
    competence: "all" | CompetenceSlug;
    domain: string;
    search: string;
    active: "all" | "active" | "inactive";
  }>({ competence: "all", domain: "", search: "", active: "active" });

  // Editor modal state
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<Quiz>>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("iso_competence_quizzes")
      .select("*")
      .order("competence_slug", { ascending: true })
      .order("created_at", { ascending: true });
    setLoading(false);
    if (error) {
      toast.error(`Could not load quiz bank: ${error.message}`);
      return;
    }
    setRows((data ?? []) as Quiz[]);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter.competence !== "all" && r.competence_slug !== filter.competence) return false;
      if (filter.domain.trim() && (r.domain ?? "").toLowerCase() !== filter.domain.trim().toLowerCase()) return false;
      if (filter.active === "active" && !r.active) return false;
      if (filter.active === "inactive" && r.active) return false;
      if (filter.search.trim()) {
        const q = filter.search.trim().toLowerCase();
        if (!r.question.toLowerCase().includes(q) && !(r.explanation ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, filter]);

  const countsByCompetence = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const r of rows) {
      if (!r.active) continue;
      acc[r.competence_slug] = (acc[r.competence_slug] ?? 0) + 1;
    }
    return acc;
  }, [rows]);

  function openNew() {
    setDraft({ ...EMPTY_DRAFT, options: EMPTY_DRAFT.options?.map((o) => ({ ...o })) });
    setEditorError(null);
    setEditorOpen(true);
  }

  function openEdit(q: Quiz) {
    setDraft({
      ...q,
      options: q.options.map((o) => ({ ...o })),
    });
    setEditorError(null);
    setEditorOpen(true);
  }

  async function handleDelete(q: Quiz) {
    if (!window.confirm(`Delete this question? This is a hard delete — toggle Active off instead if you want to keep history.`)) return;
    const { error } = await supabase.from("iso_competence_quizzes").delete().eq("id", q.id);
    if (error) { toast.error(`Delete failed: ${error.message}`); return; }
    toast.success("Question deleted");
    refresh();
  }

  async function handleToggleActive(q: Quiz) {
    const { error } = await supabase
      .from("iso_competence_quizzes")
      .update({ active: !q.active })
      .eq("id", q.id);
    if (error) { toast.error(`Could not toggle: ${error.message}`); return; }
    refresh();
  }

  async function handleSave() {
    setEditorError(null);
    // Validation
    if (!draft.question?.trim()) { setEditorError("Question text is required."); return; }
    if (!draft.options || draft.options.length < 2) { setEditorError("At least 2 options required."); return; }
    if (draft.options.some((o) => !o.value?.trim() || !o.label?.trim())) {
      setEditorError("Every option needs both a value and a label.");
      return;
    }
    const optionValues = draft.options.map((o) => o.value);
    if (new Set(optionValues).size !== optionValues.length) {
      setEditorError("Option values must be unique (a, b, c, d, e…).");
      return;
    }
    if (!draft.correct_option || !optionValues.includes(draft.correct_option)) {
      setEditorError("Correct option must match one of the option values.");
      return;
    }
    if (!draft.competence_slug) { setEditorError("Pick a competence."); return; }

    setSaving(true);
    const payload = {
      competence_slug: draft.competence_slug,
      domain: draft.domain?.trim() || null,
      question: draft.question.trim(),
      options: draft.options,
      correct_option: draft.correct_option,
      explanation: draft.explanation?.trim() || null,
      difficulty: draft.difficulty ?? "medium",
      active: draft.active ?? true,
    };

    let err;
    if (draft.id) {
      ({ error: err } = await supabase
        .from("iso_competence_quizzes")
        .update(payload)
        .eq("id", draft.id));
    } else {
      ({ error: err } = await supabase
        .from("iso_competence_quizzes")
        .insert(payload));
    }
    setSaving(false);
    if (err) { setEditorError(err.message); return; }
    toast.success(draft.id ? "Question updated" : "Question added");
    setEditorOpen(false);
    refresh();
  }

  function updateOption(idx: number, patch: Partial<QuizOption>) {
    const opts = [...(draft.options ?? [])];
    opts[idx] = { ...opts[idx], ...patch };
    setDraft({ ...draft, options: opts });
  }
  function addOption() {
    const opts = [...(draft.options ?? [])];
    const nextLetter = String.fromCharCode("a".charCodeAt(0) + opts.length);
    opts.push({ value: nextLetter, label: "" });
    setDraft({ ...draft, options: opts });
  }
  function removeOption(idx: number) {
    const opts = [...(draft.options ?? [])];
    opts.splice(idx, 1);
    setDraft({ ...draft, options: opts });
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">ISO 17100 competence quizzes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Question bank powering the auto-graded MCQ quizzes vendors take on <code className="text-xs">/iso-evidence/:token</code>. 8 random questions per attempt; pass at 80%.
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-teal-600 rounded hover:bg-teal-700"
        >
          <Plus className="w-4 h-4" /> New question
        </button>
      </div>

      {/* Counts per competence */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {(Object.keys(COMPETENCE_LABELS) as CompetenceSlug[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter((f) => ({ ...f, competence: f.competence === k ? "all" : k }))}
            className={`text-left p-3 rounded-lg border ${filter.competence === k ? "border-teal-400 bg-teal-50/40" : "border-gray-200 hover:border-gray-300"}`}
          >
            <div className="text-xs font-medium text-gray-700">{COMPETENCE_LABELS[k]}</div>
            <div className="text-xl font-semibold text-gray-900 mt-1">{countsByCompetence[k] ?? 0}</div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">active</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <div className="flex items-center gap-1.5 px-2 py-1.5 border border-gray-300 rounded">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={filter.search}
            onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
            placeholder="Search questions / explanations…"
            className="outline-none border-0 bg-transparent text-sm w-64"
          />
        </div>
        <input
          type="text"
          value={filter.domain}
          onChange={(e) => setFilter((f) => ({ ...f, domain: e.target.value }))}
          placeholder="Filter by domain (e.g. legal)"
          className="px-2 py-1.5 border border-gray-300 rounded text-sm w-44"
        />
        <select
          value={filter.active}
          onChange={(e) => setFilter((f) => ({ ...f, active: e.target.value as "all" | "active" | "inactive" }))}
          className="px-2 py-1.5 border border-gray-300 rounded text-sm"
        >
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
          <option value="all">All</option>
        </select>
        <span className="text-xs text-gray-500 ml-auto">{filtered.length} of {rows.length} shown</span>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-sm text-gray-500 p-8 border border-dashed border-gray-200 rounded-lg">
          No questions match. {rows.length === 0 ? "Click \"New question\" to seed the bank." : "Try a different filter."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((q) => (
            <div key={q.id} className={`p-4 border rounded-lg ${q.active ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50/40"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide mb-1">
                    <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">{COMPETENCE_LABELS[q.competence_slug]}</span>
                    {q.domain && <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700">{q.domain}</span>}
                    <span className={`px-1.5 py-0.5 rounded ${q.difficulty === "easy" ? "bg-emerald-50 text-emerald-700" : q.difficulty === "hard" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>{q.difficulty}</span>
                    {!q.active && <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700">inactive</span>}
                  </div>
                  <p className="text-sm font-medium text-gray-900">{q.question}</p>
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {q.options.map((o) => (
                      <li key={o.value} className={`flex items-center gap-1.5 ${o.value === q.correct_option ? "text-emerald-700 font-medium" : "text-gray-600"}`}>
                        {o.value === q.correct_option ? <CheckCircle2 className="w-3 h-3 shrink-0" /> : <span className="w-3 h-3 inline-block" />}
                        <span className="font-mono">{o.value})</span> {o.label}
                      </li>
                    ))}
                  </ul>
                  {q.explanation && (
                    <p className="mt-2 text-xs text-gray-500 italic">{q.explanation}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <button type="button" onClick={() => openEdit(q)} className="inline-flex items-center gap-1 text-xs text-teal-700 hover:text-teal-900">
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                  <button type="button" onClick={() => handleToggleActive(q)} className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900">
                    {q.active ? <XCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                    {q.active ? "Deactivate" : "Activate"}
                  </button>
                  <button type="button" onClick={() => handleDelete(q)} className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800">
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor modal */}
      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">{draft.id ? "Edit question" : "New question"}</h3>
              <button type="button" onClick={() => setEditorOpen(false)} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-4 overflow-y-auto flex-1 space-y-4">
              {editorError && (
                <div className="p-3 rounded border border-red-200 bg-red-50 text-sm text-red-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{editorError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Competence</label>
                  <select
                    value={draft.competence_slug ?? "linguistic_textual_competence"}
                    onChange={(e) => setDraft({ ...draft, competence_slug: e.target.value as CompetenceSlug })}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                  >
                    {(Object.keys(COMPETENCE_LABELS) as CompetenceSlug[]).map((k) => (
                      <option key={k} value={k}>{COMPETENCE_LABELS[k]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Difficulty</label>
                  <select
                    value={draft.difficulty ?? "medium"}
                    onChange={(e) => setDraft({ ...draft, difficulty: e.target.value as "easy" | "medium" | "hard" })}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                  >
                    <option value="easy">easy</option>
                    <option value="medium">medium</option>
                    <option value="hard">hard</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Domain <span className="text-gray-400 font-normal">(optional — for per-domain pools, only used with domain_competence)</span>
                </label>
                <input
                  type="text"
                  value={draft.domain ?? ""}
                  onChange={(e) => setDraft({ ...draft, domain: e.target.value })}
                  placeholder="e.g. Legal, Medical, Marketing"
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Question</label>
                <textarea
                  value={draft.question ?? ""}
                  onChange={(e) => setDraft({ ...draft, question: e.target.value })}
                  rows={3}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Options <span className="text-gray-400 font-normal">(tick the correct one)</span>
                </label>
                <div className="space-y-1.5">
                  {(draft.options ?? []).map((o, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <input
                        type="radio"
                        name="correct"
                        checked={draft.correct_option === o.value}
                        onChange={() => setDraft({ ...draft, correct_option: o.value })}
                        className="mt-2"
                      />
                      <input
                        type="text"
                        value={o.value}
                        onChange={(e) => updateOption(i, { value: e.target.value })}
                        className="w-12 px-2 py-1.5 border border-gray-300 rounded text-sm font-mono"
                        maxLength={3}
                      />
                      <input
                        type="text"
                        value={o.label}
                        onChange={(e) => updateOption(i, { label: e.target.value })}
                        placeholder="Option text"
                        className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => removeOption(i)}
                        disabled={(draft.options ?? []).length <= 2}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded disabled:opacity-40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addOption}
                    disabled={(draft.options ?? []).length >= 6}
                    className="text-xs text-teal-700 hover:text-teal-900 disabled:opacity-40"
                  >
                    + Add option
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Explanation <span className="text-gray-400 font-normal">(shown after submission)</span>
                </label>
                <textarea
                  value={draft.explanation ?? ""}
                  onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
                  rows={2}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.active ?? true}
                  onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                />
                Active (vendors can be served this question)
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-gray-100">
              <button type="button" onClick={() => setEditorOpen(false)} disabled={saving} className="px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-300 rounded hover:bg-gray-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-teal-600 rounded hover:bg-teal-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
