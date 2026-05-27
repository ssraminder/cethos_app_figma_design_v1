// Canonical transcript-segment model for the transcription system (v2).
//
// Every segment has a stable UUID assigned at first persist. Proofread,
// AI-translate, human-review xlsx import, inline edit, and reprocess all
// operate per-segment keyed by id. Speaker, start, end are immutable from
// segment creation forward; only `text` and `translations[lang]` change.

export const TRANSCRIPT_FORMAT_VERSION = 2 as const;

export type Word = {
  text: string;
  speaker_id?: string;
  start?: number;
  end?: number;
  type?: string; // "text" | "spacing" | "audio_event" | ...
};

export type Segment = {
  id: string;                                // stable UUID
  speaker_id: string | null;
  start: number;                             // ms
  end: number;                               // ms
  text: string;
  translations?: Record<string, string>;     // ISO 639-3 → translated text
  words?: Word[];                            // optional, preserved if STT supplied them
};

export type TranscriptJsonV2 = {
  format_version: 2;
  segments: Segment[];
  meta?: {
    provider?: string;
    language_code?: string;
    audio_duration?: number;
    language_probability?: number;
    [k: string]: unknown;
  };
  // Legacy denormalized field, kept for one release for callers that still
  // expect a flat words[] (delivery formats, audit views). Not the source of
  // truth — derived from segments[*].words on every write.
  words?: Word[];
};

// ── Raw STT shapes we accept in normalizeToSegments ──────────────────────────

type RawWord = {
  text?: string;
  word?: string;
  speaker?: string | number;
  speaker_id?: string | number;
  start?: number;
  end?: number;
  start_time?: number;
  end_time?: number;
  type?: string;
};

type RawUtterance = {
  speaker?: string | number;
  text?: string;
  start?: number;
  end?: number;
  words?: RawWord[];
};

type RawSegmentLike = {
  text?: string;
  start?: number;
  end?: number;
  speaker?: string | number;
  speaker_id?: string | number;
  words?: RawWord[];
};

export type RawTranscriptJson = {
  words?: RawWord[];
  utterances?: RawUtterance[];
  segments?: RawSegmentLike[];
  meta?: TranscriptJsonV2["meta"];
  language_code?: string;
  audio_duration?: number;
  language_probability?: number;
  [k: string]: unknown;
};

export type ProviderHint = "assemblyai" | "elevenlabs" | "openai" | "unknown";

// ── UUID helpers ─────────────────────────────────────────────────────────────

// crypto.randomUUID is available in Deno runtimes used by Supabase Edge.
function newUuid(): string {
  return crypto.randomUUID();
}

// Deterministic UUID for backfill: sha256 of a natural-key string, formatted
// in v4-uuid layout so it satisfies callers that pattern-match on UUIDv4.
// Re-running with the same natural key always yields the same UUID, so the
// backfill function is idempotent.
export async function deterministicUuid(naturalKey: string): Promise<string> {
  const data = new TextEncoder().encode(naturalKey);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  // Use first 16 bytes; force v4 + RFC 4122 variant bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes.slice(0, 16))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function buildNaturalKey(
  jobId: string,
  fileIndex: number | null,
  speakerId: string | null,
  startMs: number,
  endMs: number,
): string {
  return `${jobId}|${fileIndex ?? -1}|${speakerId ?? ""}|${Math.round(startMs)}|${Math.round(endMs)}`;
}

// ── Normalization ────────────────────────────────────────────────────────────

function coerceSpeaker(s: string | number | undefined | null): string | null {
  if (s === undefined || s === null || s === "") return null;
  return typeof s === "number" ? `Speaker ${s}` : String(s);
}

// Pull a numeric ms timestamp from either ms-or-seconds-style fields.
// AssemblyAI: ms. OpenAI verbose_json: seconds. ElevenLabs: seconds (float).
// We normalize everything to ms internally.
function toMs(value: number | undefined, hint: "ms" | "s"): number {
  if (value === undefined || value === null || !Number.isFinite(value)) return 0;
  return hint === "ms" ? Math.round(value) : Math.round(value * 1000);
}

function detectProvider(raw: RawTranscriptJson, providedHint?: ProviderHint): ProviderHint {
  if (providedHint && providedHint !== "unknown") return providedHint;
  if (Array.isArray(raw.utterances) && raw.utterances.length > 0) return "assemblyai";
  if (
    Array.isArray(raw.segments) && raw.segments.length > 0 &&
    raw.segments[0].text !== undefined && raw.segments[0].start !== undefined &&
    raw.segments[0].speaker === undefined
  ) return "openai";
  if (Array.isArray(raw.words) && raw.words.length > 0) {
    // ElevenLabs words have decimal start/end (seconds); AssemblyAI words have integer ms.
    const sample = raw.words[0];
    const start = sample.start ?? sample.start_time;
    if (typeof start === "number" && start > 0 && start < 100 && !Number.isInteger(start)) {
      return "elevenlabs";
    }
    return "assemblyai";
  }
  return "unknown";
}

// normalizeToSegments — convert raw STT json to canonical Segment[].
// idStrategy:
//   "random"        — mint fresh UUIDs (default; used at STT time)
//   "deterministic" — sha256(jobId|fileIndex|speaker|start|end) — used by backfill
export async function normalizeToSegments(
  raw: RawTranscriptJson | null | undefined,
  opts: {
    provider?: ProviderHint;
    idStrategy?: "random" | "deterministic";
    jobId?: string;       // required when idStrategy === "deterministic"
    fileIndex?: number | null;
  } = {},
): Promise<Segment[]> {
  if (!raw) return [];
  const provider = detectProvider(raw, opts.provider);
  const idStrategy = opts.idStrategy ?? "random";
  const mintId = async (speaker: string | null, start: number, end: number): Promise<string> => {
    if (idStrategy === "deterministic") {
      if (!opts.jobId) {
        throw new Error("deterministicUuid requires jobId");
      }
      return deterministicUuid(buildNaturalKey(opts.jobId, opts.fileIndex ?? null, speaker, start, end));
    }
    return newUuid();
  };

  const segments: Segment[] = [];

  // Branch 1: AssemblyAI utterances are pre-built speaker segments.
  if (Array.isArray(raw.utterances) && raw.utterances.length > 0) {
    for (const u of raw.utterances) {
      const speaker = coerceSpeaker(u.speaker);
      const start = toMs(u.start, "ms");
      const end = toMs(u.end, "ms");
      const text = (u.text ?? "").trim();
      if (!text) continue;
      const id = await mintId(speaker, start, end);
      const seg: Segment = { id, speaker_id: speaker, start, end, text };
      if (Array.isArray(u.words) && u.words.length > 0) {
        seg.words = u.words.map((w) => ({
          text: w.text ?? w.word ?? "",
          speaker_id: speaker ?? undefined,
          start: toMs(w.start ?? w.start_time, "ms"),
          end: toMs(w.end ?? w.end_time, "ms"),
          type: w.type ?? "text",
        }));
      }
      segments.push(seg);
    }
    return segments;
  }

  // Branch 2: ElevenLabs / AssemblyAI word stream — group by speaker change.
  if (Array.isArray(raw.words) && raw.words.length > 0) {
    const isSeconds = provider === "elevenlabs";
    const hint = isSeconds ? "s" : "ms";
    let curSpeaker: string | null = null;
    let curWords: Word[] = [];
    let curStart = 0;
    let curEnd = 0;

    const flush = async () => {
      const text = curWords
        .filter((w) => (w.type ?? "text") !== "spacing")
        .map((w) => w.text)
        .join("")
        .trim();
      if (!text) {
        curWords = [];
        return;
      }
      const id = await mintId(curSpeaker, curStart, curEnd);
      segments.push({
        id,
        speaker_id: curSpeaker,
        start: curStart,
        end: curEnd,
        text,
        words: curWords,
      });
      curWords = [];
    };

    for (const w of raw.words) {
      const speaker = coerceSpeaker(w.speaker ?? w.speaker_id);
      const wStart = toMs(w.start ?? w.start_time, hint);
      const wEnd = toMs(w.end ?? w.end_time, hint);
      const wText = w.text ?? w.word ?? "";
      const wType = w.type ?? "text";

      if (curWords.length === 0) {
        curSpeaker = speaker;
        curStart = wStart;
      } else if (speaker !== curSpeaker && wType !== "spacing") {
        await flush();
        curSpeaker = speaker;
        curStart = wStart;
      }
      curWords.push({
        text: wText,
        speaker_id: speaker ?? undefined,
        start: wStart,
        end: wEnd,
        type: wType,
      });
      if (wEnd > 0) curEnd = wEnd;
      else if (wStart > 0) curEnd = wStart;
    }
    if (curWords.length > 0) await flush();
    return segments;
  }

  // Branch 3: OpenAI verbose_json segments (no diarization, seconds).
  if (Array.isArray(raw.segments) && raw.segments.length > 0) {
    for (const s of raw.segments) {
      const text = (s.text ?? "").trim();
      if (!text) continue;
      const speaker = coerceSpeaker(s.speaker ?? s.speaker_id);
      // OpenAI gpt-4o-transcribe single-segment shape sometimes has end in ms already;
      // disambiguate: if end > 1000 and is integer, treat as ms; else seconds.
      const looksLikeMs = typeof s.end === "number" && s.end > 1000 && Number.isInteger(s.end);
      const start = toMs(s.start, looksLikeMs ? "ms" : "s");
      const end = toMs(s.end, looksLikeMs ? "ms" : "s");
      const id = await mintId(speaker, start, end);
      segments.push({ id, speaker_id: speaker, start, end, text });
    }
    return segments;
  }

  return segments;
}

// ── Build the canonical v2 transcript_json from segments ─────────────────────

export function buildTranscriptJsonV2(
  segments: Segment[],
  meta?: TranscriptJsonV2["meta"],
): TranscriptJsonV2 {
  // Denormalize a flat words[] across segments for legacy callers.
  const words: Word[] = [];
  for (let i = 0; i < segments.length; i++) {
    if (i > 0) words.push({ text: " ", type: "spacing" });
    const seg = segments[i];
    if (seg.words && seg.words.length > 0) {
      words.push(...seg.words);
    } else {
      words.push({
        text: seg.text,
        speaker_id: seg.speaker_id ?? undefined,
        start: seg.start,
        end: seg.end,
        type: "text",
      });
    }
  }
  return {
    format_version: 2,
    segments,
    ...(meta ? { meta } : {}),
    words,
  };
}

// Read segments out of any transcript_json shape — v2 directly, v1 via on-the-fly
// normalization (read-only; does not mint persistent IDs).
export async function readSegments(
  raw: unknown,
  opts: { provider?: ProviderHint } = {},
): Promise<Segment[]> {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as TranscriptJsonV2 & RawTranscriptJson;
  if (r.format_version === 2 && Array.isArray(r.segments)) {
    return r.segments;
  }
  return normalizeToSegments(r, { provider: opts.provider, idStrategy: "random" });
}

// ── Denormalization helpers (regenerate flat text) ───────────────────────────

export function denormalizeText(segments: Segment[]): string {
  return segments
    .map((s) => {
      const spk = s.speaker_id ? `${s.speaker_id}: ` : "";
      return `${spk}${s.text}`.trim();
    })
    .filter(Boolean)
    .join("\n\n");
}

export function denormalizeTranslation(segments: Segment[], lang: string): string {
  return segments
    .map((s) => s.translations?.[lang] ?? "")
    .filter((t) => t.trim().length > 0)
    .join("\n\n");
}

export function wordCount(segments: Segment[]): number {
  return segments.reduce((acc, s) => acc + s.text.split(/\s+/).filter(Boolean).length, 0);
}

// ── Reprocess merge: preserve IDs by speaker + time overlap ──────────────────

export type MergeSummary = {
  preserved: number;
  added: number;
  removed: number;
  reused_translations: number;
};

function overlapMs(a: Segment, b: Segment): number {
  const lo = Math.max(a.start, b.start);
  const hi = Math.min(a.end, b.end);
  return Math.max(0, hi - lo);
}

function segDuration(s: Segment): number {
  return Math.max(0, s.end - s.start);
}

export function mergeReprocessedSegments(
  prev: Segment[],
  next: Segment[],
  opts: { minOverlapRatio?: number } = {},
): { segments: Segment[]; summary: MergeSummary } {
  const minRatio = opts.minOverlapRatio ?? 0.5;
  const summary: MergeSummary = { preserved: 0, added: 0, removed: prev.length, reused_translations: 0 };
  const usedPrev = new Set<string>();

  const merged: Segment[] = next.map((cand) => {
    let best: Segment | null = null;
    let bestRatio = 0;
    for (const p of prev) {
      if (usedPrev.has(p.id)) continue;
      if ((p.speaker_id ?? null) !== (cand.speaker_id ?? null)) continue;
      const ov = overlapMs(p, cand);
      if (ov <= 0) continue;
      const ratio = ov / Math.max(1, segDuration(cand));
      if (ratio > bestRatio) {
        bestRatio = ratio;
        best = p;
      }
    }
    if (best && bestRatio >= minRatio) {
      usedPrev.add(best.id);
      summary.preserved++;
      if (best.translations && Object.keys(best.translations).length > 0) {
        summary.reused_translations++;
      }
      return {
        ...cand,
        id: best.id,
        translations: best.translations,
      };
    }
    summary.added++;
    return cand;
  });

  summary.removed = prev.length - usedPrev.size;
  return { segments: merged, summary };
}

// ── Apply edits keyed by segment id ──────────────────────────────────────────

export type SegmentEdit = {
  id: string;
  text?: string;                          // updated source text
  translations?: Record<string, string>;  // updated translations (merged with existing)
};

export type ApplyEditsResult = {
  segments: Segment[];
  applied: number;
  unknown: string[];
  source_edits: number;
  translation_edits: number;
};

export function applySegmentEdits(prev: Segment[], edits: SegmentEdit[]): ApplyEditsResult {
  const byId = new Map(prev.map((s) => [s.id, s]));
  const unknown: string[] = [];
  let applied = 0;
  let sourceEdits = 0;
  let translationEdits = 0;

  for (const edit of edits) {
    const seg = byId.get(edit.id);
    if (!seg) {
      unknown.push(edit.id);
      continue;
    }
    const next: Segment = { ...seg };
    let changed = false;
    if (typeof edit.text === "string" && edit.text !== seg.text) {
      next.text = edit.text;
      sourceEdits++;
      changed = true;
    }
    if (edit.translations) {
      const merged = { ...(seg.translations ?? {}) };
      for (const [lang, text] of Object.entries(edit.translations)) {
        if (typeof text === "string" && text !== merged[lang]) {
          merged[lang] = text;
          translationEdits++;
          changed = true;
        }
      }
      next.translations = merged;
    }
    if (changed) {
      byId.set(edit.id, next);
      applied++;
    }
  }

  const segments = prev.map((s) => byId.get(s.id) ?? s);
  return { segments, applied, unknown, source_edits: sourceEdits, translation_edits: translationEdits };
}

// Diff two segment arrays (assumed same id-set or near-same) → counts only.
export function diffSegmentCounts(
  before: Segment[],
  after: Segment[],
): { source_changed: number; translation_changed: number; unchanged: number; added: number; removed: number } {
  const beforeById = new Map(before.map((s) => [s.id, s]));
  const afterById = new Map(after.map((s) => [s.id, s]));
  let sourceChanged = 0;
  let translationChanged = 0;
  let unchanged = 0;
  let added = 0;
  let removed = 0;
  for (const a of after) {
    const b = beforeById.get(a.id);
    if (!b) {
      added++;
      continue;
    }
    let touched = false;
    if (b.text !== a.text) {
      sourceChanged++;
      touched = true;
    }
    const langs = new Set([
      ...Object.keys(b.translations ?? {}),
      ...Object.keys(a.translations ?? {}),
    ]);
    for (const lang of langs) {
      if ((b.translations?.[lang] ?? "") !== (a.translations?.[lang] ?? "")) {
        translationChanged++;
        touched = true;
        break;
      }
    }
    if (!touched) unchanged++;
  }
  for (const b of before) {
    if (!afterById.has(b.id)) removed++;
  }
  return { source_changed: sourceChanged, translation_changed: translationChanged, unchanged, added, removed };
}

// ── LLM serialization / parsing ──────────────────────────────────────────────

// We use a short id prefix (first 8 hex chars) in prompts so Claude has fewer
// tokens to copy but we can still map back to full UUIDs deterministically.
// On parse, we accept either the short prefix or the full UUID.

function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8);
}

function formatTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export type SerializeOpts = {
  includeTranslations?: string[];    // ISO 639-3 codes to inline as "→ <lang>: ..."
  maxSegments?: number;              // chunking
};

export function serializeForLLM(segments: Segment[], opts: SerializeOpts = {}): string {
  const slice = opts.maxSegments ? segments.slice(0, opts.maxSegments) : segments;
  return slice
    .map((s) => {
      const speaker = s.speaker_id ?? "Speaker";
      const ts = formatTimestamp(s.start);
      const sid = shortId(s.id);
      let block = `[${sid}] (${speaker} @ ${ts}) ${s.text}`;
      if (opts.includeTranslations) {
        for (const lang of opts.includeTranslations) {
          const t = s.translations?.[lang];
          if (t) block += `\n  → ${lang}: ${t}`;
        }
      }
      return block;
    })
    .join("\n\n");
}

// Chunk segments by total character budget so each LLM call fits its context.
export function chunkSegments(segments: Segment[], maxChars = 6000): Segment[][] {
  const chunks: Segment[][] = [];
  let cur: Segment[] = [];
  let curSize = 0;
  for (const s of segments) {
    const size = (s.text?.length ?? 0) + 64; // overhead for prefix
    if (cur.length > 0 && curSize + size > maxChars) {
      chunks.push(cur);
      cur = [];
      curSize = 0;
    }
    cur.push(s);
    curSize += size;
  }
  if (cur.length > 0) chunks.push(cur);
  return chunks;
}

export type ParseOpts = {
  mode?: "source" | "translation";
  targetLang?: string; // required when mode === "translation"
  knownIds?: string[]; // full UUIDs of segments in scope — used to resolve short ids
};

// parseLLMResponse — extract `[sid] text` lines, tolerate stray prose.
// Returns SegmentEdit[] keyed by full UUID (resolved from knownIds when short ids used).
export function parseLLMResponse(text: string, opts: ParseOpts): SegmentEdit[] {
  const knownById = new Map<string, string>(); // short → full
  if (opts.knownIds) {
    for (const id of opts.knownIds) knownById.set(shortId(id), id);
  }

  const edits: SegmentEdit[] = [];
  const lines = text.split(/\r?\n/);
  let current: { fullId: string; buf: string[] } | null = null;
  const flush = () => {
    if (!current) return;
    const value = current.buf.join("\n").trim();
    if (!value) {
      current = null;
      return;
    }
    if (opts.mode === "translation") {
      const lang = opts.targetLang;
      if (!lang) throw new Error("parseLLMResponse: translation mode requires targetLang");
      edits.push({ id: current.fullId, translations: { [lang]: value } });
    } else {
      edits.push({ id: current.fullId, text: value });
    }
    current = null;
  };

  const idLine = /^\s*\[([a-f0-9-]{4,})\]\s*(.*)$/i;
  for (const raw of lines) {
    const m = raw.match(idLine);
    if (m) {
      flush();
      const ref = m[1].toLowerCase();
      const full = ref.includes("-") ? ref : knownById.get(ref);
      if (!full) {
        // unknown id — skip until next id line
        current = null;
        continue;
      }
      current = { fullId: full, buf: [m[2]] };
    } else if (current) {
      current.buf.push(raw);
    }
  }
  flush();
  return edits;
}

// ── XLSX row helpers ─────────────────────────────────────────────────────────

// Columns (in this exact order):
//   Segment ID | Speaker | Start | End | Source | <lang1> | <lang2> | ... | Notes
//
// Start/End use hh:mm:ss.mmm. Segment ID is the full UUID for round-trip safety.

export type XlsxRow = Record<string, string>;

export function buildXlsxRows(
  segments: Segment[],
  langs: string[],
): { headers: string[]; rows: XlsxRow[] } {
  const headers = ["Segment ID", "Speaker", "Start", "End", "Source", ...langs, "Notes"];
  const rows: XlsxRow[] = segments.map((s) => {
    const row: XlsxRow = {
      "Segment ID": s.id,
      "Speaker": s.speaker_id ?? "",
      "Start": formatHms(s.start),
      "End": formatHms(s.end),
      "Source": s.text,
      "Notes": "",
    };
    for (const lang of langs) {
      row[lang] = s.translations?.[lang] ?? "";
    }
    return row;
  });
  return { headers, rows };
}

function formatHms(ms: number): string {
  const totalMs = Math.max(0, Math.round(ms));
  const h = Math.floor(totalMs / 3600000);
  const m = Math.floor((totalMs % 3600000) / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const ms3 = totalMs % 1000;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms3.toString().padStart(3, "0")}`;
}

// parseXlsxRows: given header array + row objects (string-keyed), return edits.
// Source column → text; any column NOT in [Segment ID, Speaker, Start, End, Source, Notes]
// is treated as a translation keyed by that header (caller is responsible for
// passing ISO 639-3 codes as column headers, matching buildXlsxRows output).
const RESERVED = new Set(["Segment ID", "Speaker", "Start", "End", "Source", "Notes"]);

export function parseXlsxRows(
  headers: string[],
  rows: XlsxRow[],
  prev: Segment[],
): {
  edits: SegmentEdit[];
  unknown_ids: string[];
  duplicate_ids: string[];
  missing_columns: string[];
} {
  const requiredCols = ["Segment ID", "Source"];
  const missing_columns = requiredCols.filter((c) => !headers.includes(c));
  const langCols = headers.filter((h) => !RESERVED.has(h));
  const knownIds = new Set(prev.map((s) => s.id));
  const knownById = new Map(prev.map((s) => [s.id, s] as const));
  const seen = new Set<string>();
  const duplicate_ids: string[] = [];
  const unknown_ids: string[] = [];
  const edits: SegmentEdit[] = [];

  if (missing_columns.length > 0) {
    return { edits, unknown_ids, duplicate_ids, missing_columns };
  }

  for (const row of rows) {
    const id = (row["Segment ID"] ?? "").trim();
    if (!id) continue;
    if (seen.has(id)) {
      duplicate_ids.push(id);
      continue;
    }
    seen.add(id);
    if (!knownIds.has(id)) {
      unknown_ids.push(id);
      continue;
    }
    const seg = knownById.get(id)!;
    const edit: SegmentEdit = { id };
    const src = row["Source"];
    if (typeof src === "string" && src !== seg.text) {
      edit.text = src;
    }
    const trans: Record<string, string> = {};
    for (const lang of langCols) {
      const v = row[lang];
      if (typeof v === "string") {
        const existing = seg.translations?.[lang] ?? "";
        if (v !== existing) trans[lang] = v;
      }
    }
    if (Object.keys(trans).length > 0) edit.translations = trans;
    if (edit.text !== undefined || edit.translations) edits.push(edit);
  }

  return { edits, unknown_ids, duplicate_ids, missing_columns };
}

// ── Convenience: regenerate denormalized job/source_file fields ──────────────

export function denormalizedFieldsForJob(segments: Segment[], targetLang?: string | null) {
  return {
    transcript_text: denormalizeText(segments),
    translated_text: targetLang ? denormalizeTranslation(segments, targetLang) : undefined,
    word_count: wordCount(segments),
  };
}
