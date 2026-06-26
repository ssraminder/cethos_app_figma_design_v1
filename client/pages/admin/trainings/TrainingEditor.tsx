import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { createTraining, saveLessons } from "@/lib/trainings";
import { LessonBlocks, type Block } from "./LessonBlocks";

const TEMPLATES: Record<string, object> = {
  prose: { type: "prose", md: "## Heading\n\nWrite the lesson text here. **Bold** and lists work." },
  steps: {
    type: "steps",
    title: "Section title",
    steps: [
      { title: "Step one", body: "What to do." },
      { title: "Step two", body: "What to do next." },
    ],
  },
  example: {
    type: "example",
    title: "See a worked example",
    intro: "Optional intro line.",
    items: [
      { label: "Wrong", text: "The wrong way.", tone: "muted" },
      { label: "Right", text: "The right way.", note: "Why it's right.", tone: "info" },
    ],
  },
  callout: { type: "callout", variant: "rule", title: "Key rule", body: "The rule that matters most." },
  comparison: {
    type: "comparison",
    title: "Do vs don't",
    columns: [
      { label: "Do", tone: "good", items: ["First do", "Second do"] },
      { label: "Don't", tone: "bad", items: ["First don't", "Second don't"] },
    ],
  },
};

interface LessonDraft {
  key: number;
  title: string;
  minutes: number;
  json: string;
}

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm";

let keySeq = 1;
const newLesson = (): LessonDraft => ({ key: keySeq++, title: "", minutes: 5, json: "[]" });

export default function TrainingEditor() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [audience, setAudience] = useState<"staff" | "linguist">("staff");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [lessons, setLessons] = useState<LessonDraft[]>([newLesson()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patchLesson(key: number, patch: Partial<LessonDraft>) {
    setLessons((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function move(idx: number, dir: -1 | 1) {
    setLessons((ls) => {
      const n = [...ls];
      const j = idx + dir;
      if (j < 0 || j >= n.length) return ls;
      [n[idx], n[j]] = [n[j], n[idx]];
      return n;
    });
  }
  function addTemplate(key: number, type: string) {
    setLessons((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        let arr: unknown[] = [];
        try {
          const p = JSON.parse(l.json || "[]");
          if (Array.isArray(p)) arr = p;
        } catch {
          arr = [];
        }
        arr.push(TEMPLATES[type]);
        return { ...l, json: JSON.stringify(arr, null, 2) };
      }),
    );
  }

  function parseBlocks(json: string): { blocks: Block[] | null; err: string | null } {
    try {
      const p = JSON.parse(json || "[]");
      if (!Array.isArray(p)) return { blocks: null, err: "Content must be a JSON array of blocks." };
      return { blocks: p as Block[], err: null };
    } catch (e: any) {
      return { blocks: null, err: e?.message ?? "Invalid JSON" };
    }
  }

  async function save() {
    setError(null);
    if (!title.trim()) return setError("Give the training a title.");
    const cleaned = lessons.filter((l) => l.title.trim());
    if (cleaned.length === 0) return setError("Add at least one lesson with a title.");
    for (const l of cleaned) {
      const { err } = parseBlocks(l.json);
      if (err) return setError(`Lesson “${l.title}”: ${err}`);
    }
    setSaving(true);
    try {
      const t = await createTraining({ title, audience, category, description });
      await saveLessons(
        t.id,
        cleaned.map((l) => ({
          title: l.title,
          estimated_minutes: l.minutes,
          content_blocks: parseBlocks(l.json).blocks ?? [],
        })),
      );
      navigate(`/admin/trainings/${t.slug}`);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link to="/admin/trainings" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> All trainings
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">New training</h1>
      <p className="text-sm text-gray-600 mb-5">
        Create a training. It saves to the trainings hub and is assignable; Vendor
        trainings also surface in the vendor portal.
      </p>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-5 grid gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          <span className="block text-gray-600 mb-1">Title</span>
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Medical Terminology Basics" />
        </label>
        <label className="text-sm">
          <span className="block text-gray-600 mb-1">Type (who it's for)</span>
          <select className={inputCls} value={audience} onChange={(e) => setAudience(e.target.value as "staff" | "linguist")}>
            <option value="staff">Staff</option>
            <option value="linguist">Vendor</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-gray-600 mb-1">Category</span>
          <input className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. quality, compliance, coa" />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="block text-gray-600 mb-1">Description</span>
          <textarea className={inputCls} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One or two sentences shown on the training card." />
        </label>
      </div>

      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Lessons</h2>
        <button type="button" onClick={() => setLessons((ls) => [...ls, newLesson()])} className="inline-flex items-center gap-1.5 text-sm text-teal-700 hover:text-teal-900">
          <Plus className="w-4 h-4" /> Add lesson
        </button>
      </div>

      <div className="space-y-4">
        {lessons.map((l, idx) => {
          const { blocks, err } = parseBlocks(l.json);
          return (
            <div key={l.key} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex-none w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-xs font-medium flex items-center justify-center">{idx + 1}</span>
                <input className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm" value={l.title} onChange={(e) => patchLesson(l.key, { title: e.target.value })} placeholder="Lesson title" />
                <input type="number" min={1} className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" value={l.minutes} onChange={(e) => patchLesson(l.key, { minutes: Number(e.target.value) || 1 })} title="Estimated minutes" />
                <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30" title="Move up"><ArrowUp className="w-4 h-4" /></button>
                <button type="button" onClick={() => move(idx, 1)} disabled={idx === lessons.length - 1} className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30" title="Move down"><ArrowDown className="w-4 h-4" /></button>
                <button type="button" onClick={() => setLessons((ls) => ls.filter((x) => x.key !== l.key))} className="p-1.5 text-gray-400 hover:text-red-600" title="Remove lesson"><Trash2 className="w-4 h-4" /></button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                <span className="text-xs text-gray-500 mr-1">Add block:</span>
                {Object.keys(TEMPLATES).map((type) => (
                  <button key={type} type="button" onClick={() => addTemplate(l.key, type)} className="text-xs border border-gray-200 rounded-md px-2 py-1 text-gray-700 hover:bg-gray-50 capitalize">{type}</button>
                ))}
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <div>
                  <textarea
                    className={`w-full border rounded-lg px-3 py-2 text-xs font-mono leading-relaxed ${err ? "border-red-300" : "border-gray-300"}`}
                    rows={10}
                    value={l.json}
                    onChange={(e) => patchLesson(l.key, { json: e.target.value })}
                    spellCheck={false}
                  />
                  {err ? (
                    <p className="text-xs text-red-600 mt-1">{err}</p>
                  ) : (
                    <p className="text-xs text-gray-400 mt-1">{Array.isArray(blocks) ? blocks.length : 0} block(s)</p>
                  )}
                </div>
                <div className="border border-gray-100 rounded-lg p-3 bg-gray-50/50 min-h-[6rem]">
                  <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">Preview</div>
                  {blocks && blocks.length > 0 ? (
                    <LessonBlocks blocks={blocks} />
                  ) : (
                    <p className="text-sm text-gray-400">Add a block to preview it.</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-5 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
          <CheckCircle2 className="w-4 h-4" />
          {saving ? "Creating…" : "Create training"}
        </button>
        <Link to="/admin/trainings" className="text-sm text-gray-600 hover:text-gray-900">Cancel</Link>
      </div>
    </div>
  );
}
