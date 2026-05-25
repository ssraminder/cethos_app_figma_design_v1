// ============================================================================
// parse-cat-analysis
//
// Parses a pasted CAT-tool analysis (Trados / SDL Studio / memoQ / XTM / Phrase /
// Plunet / XTRF export, or copy-paste from any of those grids) into structured
// per-tier word counts, then applies a deterministic
//   line_subtotal = word_count × tier_percentage × base_rate
// per tier and returns the breakdown.
//
// Inputs:
//   {
//     pasted_text: string,            // raw CAT analysis text (required)
//     base_rate: number,              // vendor per-word base rate (required)
//     vendor_id?: string,             // load per-vendor grid override if set
//     currency?: string,              // "CAD" by default — display only
//   }
//
// Output:
//   {
//     success: true,
//     lines: [{match_tier, tier_label, word_count, tier_percentage, base_rate, line_subtotal}],
//     total_words: number,
//     subtotal: number,               // sum(line_subtotal)
//     currency: string,
//     grid_source: "vendor" | "global",
//     extraction_source: "claude" | "regex_fallback",
//   }
//
// Architecture follows the project's "deterministic core + Claude prose" rule:
//   Claude only extracts NUMBERS from the text — it never picks the rate or
//   the final price. The Σ(words × tier_pct × base_rate) math runs server-side
//   below regardless of what Claude says. If Claude is unavailable the regex
//   fallback handles common Trados/memoQ table shapes.
//
// Deployed with --no-verify-jwt; admin UI calls via supabase.functions.invoke
// (staff JWT attached automatically).
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Canonical tier keys. Any synonym that comes from the CAT tool is normalized
// onto one of these so the downstream UI + child table can rely on a fixed set.
const CANONICAL_TIERS = [
  "context_match",
  "repetitions",
  "100",
  "95_99",
  "85_94",
  "75_84",
  "50_74",
  "no_match",
] as const;
type CanonicalTier = (typeof CANONICAL_TIERS)[number];

// Maps the most common CAT-tool tier labels onto canonical keys. The matching
// is case-insensitive and tolerant of extra whitespace/punctuation.
const TIER_SYNONYMS: Array<{ pattern: RegExp; tier: CanonicalTier }> = [
  { pattern: /\b(context\s*match|perfect\s*match|101%?)\b/i, tier: "context_match" },
  { pattern: /\brepetitions?\b/i, tier: "repetitions" },
  { pattern: /\b(cross[-\s]?file\s*reps?|cross\s*reps?)\b/i, tier: "repetitions" },
  { pattern: /\b100\s*%\b/, tier: "100" },
  { pattern: /\b(95\s*[-–]\s*99\s*%|95%?\s*to\s*99%?)\b/, tier: "95_99" },
  { pattern: /\b(85\s*[-–]\s*94\s*%|85%?\s*to\s*94%?)\b/, tier: "85_94" },
  { pattern: /\b(75\s*[-–]\s*84\s*%|75%?\s*to\s*84%?)\b/, tier: "75_84" },
  { pattern: /\b(50\s*[-–]\s*74\s*%|50%?\s*to\s*74%?)\b/, tier: "50_74" },
  { pattern: /\b(no\s*match|new\s*words|0\s*[-–]\s*49\s*%)\b/i, tier: "no_match" },
];

type GridTier = { key: string; label: string; percentage: number };
type Grid = { tiers: GridTier[] };

function parseGrid(raw: string | null | undefined): Grid | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.tiers)) return null;
    return parsed as Grid;
  } catch {
    return null;
  }
}

async function loadGrid(supabase: any, vendor_id?: string | null): Promise<{ grid: Grid; source: "vendor" | "global" }> {
  if (vendor_id) {
    const { data: vendor } = await supabase
      .from("vendors")
      .select("cat_grid")
      .eq("id", vendor_id)
      .maybeSingle();
    if (vendor?.cat_grid) {
      const tiers = Array.isArray(vendor.cat_grid?.tiers) ? vendor.cat_grid.tiers : null;
      if (tiers && tiers.length > 0) return { grid: { tiers }, source: "vendor" };
    }
  }
  const { data: setting } = await supabase
    .from("app_settings")
    .select("setting_value")
    .eq("setting_key", "cat_grid_default")
    .maybeSingle();
  const parsed = parseGrid(setting?.setting_value);
  if (!parsed) {
    // Hard fallback so the function never explodes if the row is missing
    // (it should always exist after the Phase 1 migration).
    return {
      grid: {
        tiers: [
          { key: "context_match", label: "Context Match", percentage: 0.00 },
          { key: "repetitions",   label: "Repetitions",   percentage: 0.25 },
          { key: "100",           label: "100%",          percentage: 0.30 },
          { key: "95_99",         label: "95-99%",        percentage: 0.60 },
          { key: "85_94",         label: "85-94%",        percentage: 0.80 },
          { key: "75_84",         label: "75-84%",        percentage: 1.00 },
          { key: "50_74",         label: "50-74%",        percentage: 1.00 },
          { key: "no_match",      label: "No Match",      percentage: 1.00 },
        ],
      },
      source: "global",
    };
  }
  return { grid: parsed, source: "global" };
}

// Regex fallback: tries to extract `<tier label> ... <word count>` pairs from
// the pasted text. Used when ANTHROPIC_API_KEY is missing or the Claude call
// errors out. Handles common Trados / memoQ / XTM table shapes.
function regexExtract(text: string): Array<{ canonical_tier: CanonicalTier; word_count: number }> {
  const out: Array<{ canonical_tier: CanonicalTier; word_count: number }> = [];
  const seen = new Set<CanonicalTier>();
  for (const line of text.split(/\r?\n/)) {
    for (const { pattern, tier } of TIER_SYNONYMS) {
      if (seen.has(tier)) continue;
      if (!pattern.test(line)) continue;
      // Pull the first plausible word count from the line. Skip numbers that
      // look like percentages (e.g. "85-94%") by ignoring matches followed by %.
      const numberMatches = [...line.matchAll(/([0-9][0-9,\.\s]*)(?!\s*%)/g)];
      let candidate: number | null = null;
      for (const m of numberMatches) {
        const cleaned = m[1].replace(/[\s,]/g, "");
        const n = Number(cleaned);
        if (Number.isFinite(n) && n >= 0 && n < 10_000_000) {
          // Prefer integer-ish counts. The first such match on the line is
          // usually the "segments" or "words" column.
          if (Math.abs(n - Math.round(n)) < 0.01) {
            candidate = Math.round(n);
            break;
          }
        }
      }
      if (candidate !== null) {
        out.push({ canonical_tier: tier, word_count: candidate });
        seen.add(tier);
        break;
      }
    }
  }
  return out;
}

async function claudeExtract(pasted_text: string): Promise<Array<{ canonical_tier: CanonicalTier; word_count: number }> | null> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return null;

  const tool = {
    name: "emit_cat_breakdown",
    description: "Emit the per-tier word counts extracted from the pasted CAT analysis.",
    input_schema: {
      type: "object",
      properties: {
        lines: {
          type: "array",
          description: "One row per match tier. Only emit a row when the input clearly identifies that tier with a word count.",
          items: {
            type: "object",
            properties: {
              match_tier: {
                type: "string",
                enum: CANONICAL_TIERS as unknown as string[],
                description: "Canonical Cethos tier key.",
              },
              word_count: {
                type: "number",
                description: "Total source words in this tier. Use the 'Words' column when present; never use segments, characters, or percentages.",
              },
            },
            required: ["match_tier", "word_count"],
          },
        },
      },
      required: ["lines"],
    },
  };

  const systemPrompt = `You convert CAT-tool analysis exports (Trados / SDL Studio / memoQ / XTM / Phrase / Plunet / XTRF) into a structured per-tier word breakdown.

Canonical tier mapping:
- "Context Match" / "Perfect Match" / "101%" → context_match
- "Repetitions" (Trados/SDL also separates "Cross-file Repetitions" — SUM both into repetitions)
- "100%" → 100
- "95% - 99%" / fuzzy 95-99 → 95_99
- "85% - 94%" / fuzzy 85-94 → 85_94
- "75% - 84%" / fuzzy 75-84 → 75_84
- "50% - 74%" / fuzzy 50-74 → 50_74
- "No Match" / "New" / "0-49%" → no_match

Input shapes you must handle:

1. LABELED ROWS — "Repetitions 412 words" / "100% 92" / table with a "Words" header column.
   Read the "Words" column. Never Segments / Characters / Percent / Placeables.

2. TRADOS / SDL STUDIO "ANALYZE FILES" CSV — one row per file, headerless or
   header-stripped. Standard column order (after the filename + optional
   weighted-pct column):
     PerfectMatch     [Segments | Words | Percent | Placeables]
     Context Match    [Segments | Words | Percent | Placeables]
     Repetitions      [Segments | Words | Percent | Placeables]
     Cross-file Reps  [Segments | Words | Percent | Placeables]    <- sum into repetitions
     100%             [Segments | Words | Percent | Placeables]
     95% - 99%        [Segments | Words | Percent | Placeables]
     85% - 94%        [Segments | Words | Percent | Placeables]
     75% - 84%        [Segments | Words | Percent | Placeables]
     50% - 74%        [Segments | Words | Percent | Placeables]
     New              [Segments | Words | Percent | Placeables]    <- this is no_match
   The trailing number on each row is usually Total. Cross-check by adding
   the per-tier Words across all tiers and confirming it matches the trailing
   Total. If they don't match, prefer the explicit Total and proportionally
   trust the per-tier Words.

3. MEMOQ "STATISTICS" CSV — header row names tiers explicitly. Match by label.

4. MULTI-FILE INPUTS — when the input contains MULTIPLE file rows, SUM the
   per-tier word counts across all files. Emit one row per canonical tier
   with the summed total.

5. PARTIAL / SUMMARY OUTPUTS — when only summary lines are present (e.g.
   "Total: 3110 words" with no tier breakdown), emit no_match with that
   total and leave other tiers absent. Don't invent a distribution.

Final checks before emitting:
- Each tier word_count must be a non-negative integer.
- Sum of emitted word_counts should approximate the input's Total when one
  is visible. If your sum is dramatically off (>10% drift), you're reading
  the wrong column — re-read.
- Never emit Segments, Characters, Percent, or Placeables values as
  word_counts. Decimals like "4.15" are weighted-percent values; ignore.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: systemPrompt,
      tools: [tool],
      tool_choice: { type: "tool", name: "emit_cat_breakdown" },
      messages: [
        {
          role: "user",
          content: `Extract per-tier word counts from this CAT analysis:\n\n${pasted_text}`,
        },
      ],
    }),
  });
  if (!res.ok) {
    console.error("claude HTTP", res.status, await res.text().catch(() => ""));
    return null;
  }
  const raw = await res.json().catch(() => null);
  const blocks: Array<Record<string, unknown>> = Array.isArray(raw?.content) ? raw.content : [];
  let input: Record<string, unknown> | null = null;
  for (const b of blocks) {
    if (b?.type === "tool_use" && b?.input && typeof b.input === "object") {
      input = b.input as Record<string, unknown>;
      break;
    }
  }
  if (!input || !Array.isArray((input as any).lines)) return null;

  const lines = (input as any).lines as Array<{ match_tier: string; word_count: number }>;
  const valid: Array<{ canonical_tier: CanonicalTier; word_count: number }> = [];
  for (const l of lines) {
    if (!CANONICAL_TIERS.includes(l.match_tier as CanonicalTier)) continue;
    const w = Number(l.word_count);
    if (!Number.isFinite(w) || w < 0) continue;
    valid.push({ canonical_tier: l.match_tier as CanonicalTier, word_count: w });
  }
  return valid;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const pasted_text: string = String(body?.pasted_text ?? "").trim();
    const base_rate: number = Number(body?.base_rate);
    const vendor_id: string | null = body?.vendor_id ?? null;
    const currency: string = String(body?.currency || "CAD").toUpperCase();

    if (!pasted_text) return json({ success: false, error: "Missing pasted_text" }, 400);
    if (!Number.isFinite(base_rate) || base_rate <= 0) {
      return json({ success: false, error: "base_rate must be > 0" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { grid, source: gridSource } = await loadGrid(supabase, vendor_id);

    // Try Claude first; regex fallback only on null/empty.
    let extracted = await claudeExtract(pasted_text);
    let extractionSource: "claude" | "regex_fallback" = "claude";
    if (!extracted || extracted.length === 0) {
      extracted = regexExtract(pasted_text);
      extractionSource = "regex_fallback";
    }

    if (extracted.length === 0) {
      return json({
        success: false,
        error: "Could not identify any CAT analysis tiers in the pasted text. Check that it includes tier labels (e.g. '100%', 'Repetitions') and a Words column.",
      }, 422);
    }

    // Build lines — emit one row per CANONICAL_TIER so the UI shows every
    // grid tier even if Claude only mentioned a subset. Tiers the input
    // didn't cover get word_count=0 and line_subtotal=0 (still shown so
    // staff can fill them in manually if needed).
    const gridByKey: Record<string, GridTier> = {};
    for (const t of grid.tiers) gridByKey[t.key] = t;
    const extractedByKey: Record<string, number> = {};
    for (const e of extracted) extractedByKey[e.canonical_tier] = e.word_count;

    const lines: Array<{
      match_tier: string;
      tier_label: string;
      word_count: number;
      tier_percentage: number;
      base_rate: number;
      line_subtotal: number;
    }> = [];
    let totalWords = 0;
    let totalSubtotal = 0;
    let sortOrder = 0;
    for (const tier of CANONICAL_TIERS) {
      const gridTier = gridByKey[tier];
      // Grid may not list every canonical tier (e.g. agency removed 50_74);
      // skip tiers the grid doesn't define.
      if (!gridTier) continue;
      const words = Number(extractedByKey[tier] ?? 0);
      const pct = Number(gridTier.percentage) || 0;
      const lineSubtotal = Math.round(words * pct * base_rate * 10000) / 10000;
      totalWords += words;
      totalSubtotal += lineSubtotal;
      lines.push({
        match_tier: tier,
        tier_label: gridTier.label,
        word_count: words,
        tier_percentage: pct,
        base_rate,
        line_subtotal: lineSubtotal,
      });
      sortOrder++;
    }

    // Sanity check: scan the input for an explicit Total / Total Words
    // figure and compare against our summed word count. If they drift by
    // more than 10%, surface a warning so the UI can prompt the user.
    const warnings: string[] = [];
    const explicitTotalMatch = pasted_text.match(/\btotal(?:\s*words)?\s*[:=]?\s*([0-9][0-9,\.\s]*)/i);
    let explicitTotal: number | null = null;
    if (explicitTotalMatch) {
      const cleaned = explicitTotalMatch[1].replace(/[\s,]/g, "");
      const n = Number(cleaned);
      if (Number.isFinite(n) && n > 0 && n < 100_000_000) explicitTotal = Math.round(n);
    }
    // Also: if the input has multiple rows that look like Trados file rows
    // (decimal weighted-pct followed by 40+ integers), try summing every
    // trailing-row number as a heuristic check.
    let trailingTotal: number | null = null;
    const fileRowTrailings: number[] = [];
    for (const line of pasted_text.split(/\r?\n/)) {
      const nums = [...line.matchAll(/(-?[0-9]+(?:\.[0-9]+)?)/g)].map((m) => Number(m[1]));
      // Trados file row heuristic: at least one decimal (weighted %) and 35+ numbers total
      if (nums.length >= 35 && nums.some((n) => !Number.isInteger(n) && n > 0 && n < 100)) {
        fileRowTrailings.push(nums[nums.length - 1]);
      }
    }
    if (fileRowTrailings.length > 0) {
      trailingTotal = fileRowTrailings.reduce((a, b) => a + b, 0);
    }

    const referenceTotal = explicitTotal ?? trailingTotal;
    if (referenceTotal !== null && totalWords > 0) {
      const drift = Math.abs(totalWords - referenceTotal) / referenceTotal;
      if (drift > 0.10) {
        warnings.push(
          `Extracted total (${totalWords} words) drifts ${Math.round(drift * 100)}% from the value the input suggests (${referenceTotal}). The parser may have read the wrong column — try uploading the original CSV/XLSX file, or paste with the header row included.`,
        );
      }
    }
    if (referenceTotal !== null && totalWords === 0) {
      warnings.push(
        `Parser found tier labels but couldn't extract Words counts; the input may be in a column layout the parser doesn't recognize. The input suggests a total of ${referenceTotal} words — try uploading the original file.`,
      );
    }
    if (extractionSource === "regex_fallback") {
      warnings.push(
        `AI extraction unavailable — used a tolerant regex fallback. Double-check the per-tier word counts below before saving.`,
      );
    }

    return json({
      success: true,
      lines,
      total_words: totalWords,
      subtotal: Math.round(totalSubtotal * 100) / 100,
      currency,
      grid_source: gridSource,
      extraction_source: extractionSource,
      reference_total: referenceTotal,
      warnings,
    });
  } catch (err: any) {
    console.error("parse-cat-analysis error:", err?.message || err);
    return json({ success: false, error: err?.message || "Internal error" }, 500);
  }
});
