// qms-auto-qualify — AI-first vendor qualification pipeline (ISO 17100 §3.1).
//
// Design (per SOP-001): AI extracts facts from the CV with verbatim quotes;
// FIXED RULES — not AI — decide which §3.1.4 basis applies; outcomes are
// recorded with full inputs for reproducibility. In dry_run mode nothing is
// written to qms.role_qualifications — only to qms.auto_qualification_results
// so a human can review the would-be distribution before going live.
//
// Decisions:
//   auto_qualify — evidence clearly satisfies a basis (t_a / t_b / t_c)
//   escalate     — contradictory or insufficient evidence, or agency → human queue
//   chase        — no CV on file → automated document request
//
// Actions:
//   start   { mode? }                  → create run + pending rows for vendors
//                                        active in qms eligibility events (180d)
//   process { run_id, batch_size? }    → process next N pending vendors
//   status  { run_id }                 → progress counts
//   report  { run_id }                 → aggregate distribution
//
// PROMPT_VERSION + model are stamped on the run row.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const PROMPT_VERSION = "auto-qualify-v2";
const MODEL = "claude-sonnet-4-6";
const CV_BUCKET = "vendor-cvs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(d: Record<string, unknown>, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
}

interface Extraction {
  degrees: Array<{
    level: string;
    field: string;
    institution: string | null;
    year: number | null;
    is_translation_degree: boolean;
    quote: string;
  }>;
  translation_experience: {
    earliest_year: number | null;
    total_years_estimate: number | null;
    quote: string | null;
  };
  revision_experience: { claimed: boolean; quote: string | null };
  certifications: Array<{ name: string; issuer: string | null; year: number | null; quote: string }>;
  language_pairs: string[];
  red_flags: string[];
}

const EXTRACTION_PROMPT = `You are extracting facts from a translator's CV for an ISO 17100 qualification review.

Return ONLY a JSON object (no markdown fences, no commentary) with this exact shape:
{
  "degrees": [{"level": "bachelor|master|phd|diploma|other", "field": "...", "institution": "...", "year": 2010, "is_translation_degree": true, "quote": "verbatim text from the CV"}],
  "translation_experience": {"earliest_year": 2012, "total_years_estimate": 8, "quote": "verbatim text supporting this"},
  "revision_experience": {"claimed": false, "quote": null},
  "certifications": [{"name": "...", "issuer": "...", "year": 2020, "quote": "verbatim text"}],
  "language_pairs": ["EN>FR"],
  "red_flags": []
}

Rules:
- "is_translation_degree" is true only for degrees in translation, interpreting, linguistics, or language studies with translation training.
- EVERY degree, certification, and experience claim MUST include a short verbatim quote copied from the CV. If you cannot quote it, do not include it.
- "total_years_estimate" is years of professional TRANSLATION work only (not unrelated jobs). null if the CV gives no usable dates.
- "revision_experience.claimed" is true only if the CV explicitly mentions revision, editing, proofreading, or QA of translations as work experience.
- "red_flags": ONLY genuine contradictions or impossibilities — dates that conflict with each other, degrees that contradict the timeline, experience claims that are mutually inconsistent. Normal CV traits (missing dates on courses, marketing language, unverifiable rankings, missing issuing bodies, round-number project counts) are NOT red flags. Most CVs should have an EMPTY red_flags array.
- Do not infer or embellish. Missing is missing.`;

function num(x: unknown): number | null {
  if (x == null) return null;
  const n = typeof x === "number" ? x : parseFloat(String(x).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

async function sha256hex(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function extractFromCv(pdf: ArrayBuffer): Promise<Extraction> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 3000,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64(pdf) } },
            { type: "text", text: EXTRACTION_PROMPT },
          ],
        },
      ],
    }),
  });
  if (!resp.ok) throw new Error(`Anthropic API ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();
  const text = data?.content?.find((c: { type: string }) => c.type === "text")?.text ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in extraction response");
  return JSON.parse(match[0]) as Extraction;
}

// ── Deterministic basis rules (auto-qualify-v1) ──────────────────────────────
// AI never picks the outcome; these rules do, from extracted facts + our own
// records. Conservative by design: contradictions and thin evidence escalate.
function decide(args: {
  vendorType: string | null;
  hasCv: boolean;
  extraction: Extraction | null;
  selfYears: number | null;
  internalJobs: number;
  internalTenureYears: number;
  revisionSteps: number;
  hasNda: boolean;
}): { decision: "auto_qualify" | "escalate" | "chase"; basis: string | null; roles: string[]; confidence: number; reasons: string[]; flags: string[] } {
  const reasons: string[] = [];
  const flags: string[] = [];
  if (!args.hasNda) flags.push("nda_missing");

  if (args.vendorType === "agency") {
    return { decision: "escalate", basis: null, roles: [], confidence: 0, reasons: ["agency vendors need a human review of the agency's own ISO 17100 certificate or per-linguist credentials (§3.1.2)"], flags: [...flags, "agency"] };
  }
  if (!args.hasCv || !args.extraction) {
    return { decision: "chase", basis: null, roles: [], confidence: 0, reasons: ["no CV on file — automated document request"], flags };
  }

  const ex = args.extraction;
  const claimedYears = num(ex.translation_experience?.total_years_estimate);
  const transDegree = (ex.degrees ?? []).find((d) => d.is_translation_degree && d.quote?.trim());
  const anyDegree = (ex.degrees ?? []).find((d) => d.quote?.trim());

  // Contradiction: CV timeline vs self-declared years differ wildly.
  if (claimedYears != null && args.selfYears != null && Math.abs(claimedYears - args.selfYears) > 3) {
    return { decision: "escalate", basis: null, roles: [], confidence: 0.4, reasons: [`CV suggests ~${claimedYears}y of translation work but vendor declared ${args.selfYears}y — needs a human look`], flags: [...flags, "contradiction"] };
  }

  const effectiveYears = claimedYears ?? args.selfYears;
  const corroborated = args.internalJobs >= 3 || args.internalTenureYears >= 1;

  let basis: string | null = null;
  let confidence = 0;
  if (transDegree) {
    basis = "t_a_degree_translation";
    confidence = 0.9;
    reasons.push(`Translation degree: ${transDegree.field}${transDegree.institution ? `, ${transDegree.institution}` : ""} — "${transDegree.quote}"`);
  } else if (anyDegree && effectiveYears != null && effectiveYears >= 2 && corroborated) {
    basis = "t_b_degree_other_plus_2y";
    confidence = 0.8;
    reasons.push(`Degree (${anyDegree.field}) — "${anyDegree.quote}"`, `≥2y translation experience (${effectiveYears}y) corroborated by ${args.internalJobs} paid jobs in our records`);
  } else if (effectiveYears != null && effectiveYears >= 5 && corroborated) {
    basis = "t_c_5y_experience";
    confidence = 0.75;
    reasons.push(`≥5y translation experience (${effectiveYears}y${ex.translation_experience?.quote ? ` — "${ex.translation_experience.quote}"` : ", vendor-declared"}) corroborated by ${args.internalJobs} paid jobs in our records`);
  }

  // Red flags reduce confidence rather than auto-escalating: the extractor is
  // told to report only genuine contradictions, and a strong basis (e.g. a
  // quoted translation degree) can outweigh one of them.
  const redFlags = ex.red_flags ?? [];
  if (redFlags.length > 0) {
    flags.push("red_flags");
    confidence = Math.max(0.3, confidence - 0.15 * redFlags.length);
    reasons.push(`CV red flags (${redFlags.length}): ${redFlags.join("; ")}`);
  }

  if (!basis) {
    return { decision: "escalate", basis: null, roles: [], confidence: 0.4, reasons: ["evidence does not clearly satisfy §3.1.4 (a), (b), or (c) — needs a human decision", ...reasons], flags: [...flags, "insufficient_evidence"] };
  }
  if (confidence < 0.7) {
    return { decision: "escalate", basis, roles: [], confidence, reasons: [`confidence ${confidence.toFixed(2)} below 0.70 auto-threshold`, ...reasons], flags };
  }

  const roles = ["translator"];
  if (args.revisionSteps >= 1 || ex.revision_experience?.claimed) {
    roles.push("reviser");
    reasons.push(
      args.revisionSteps >= 1
        ? `Reviser: ${args.revisionSteps} revision/review step(s) completed in our own workflow records`
        : `Reviser: CV claims revision experience — "${ex.revision_experience?.quote ?? ""}"`,
    );
  }
  return { decision: "auto_qualify", basis, roles, confidence, reasons, flags };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const qms = sb; // pipeline tables live in public with a qms_ prefix (PostgREST does not expose the qms schema)

  try {
    const body = await req.json();
    const action = body?.action as string;

    if (action === "start") {
      const mode = body.mode === "live" ? "live" : "dry_run";
      if (mode === "live") return json({ success: false, error: "live mode is not enabled yet — dry_run only" }, 400);

      const { data: run, error: rErr } = await qms
        .from("qms_auto_qualification_runs")
        .insert({ mode, prompt_version: PROMPT_VERSION, model: MODEL, params: { window_days: 180 } })
        .select("*")
        .single();
      if (rErr) return json({ success: false, error: rErr.message }, 400);

      // Candidates: vendors with assignment-eligibility activity in 180 days.
      // Paginated — PostgREST caps responses at 1,000 rows and the window
      // holds several thousand events.
      const since = new Date(Date.now() - 180 * 86400_000).toISOString();
      const vendorIdSet = new Set<string>();
      const PAGE = 1000;
      for (let offset = 0; ; offset += PAGE) {
        const { data: events, error: eErr } = await qms
          .from("qms_assignment_eligibility_events_v")
          .select("vendor_id")
          .gte("performed_at", since)
          .not("vendor_id", "is", null)
          .order("id")
          .range(offset, offset + PAGE - 1);
        if (eErr) return json({ success: false, error: eErr.message }, 400);
        for (const e of events ?? []) vendorIdSet.add(e.vendor_id as string);
        if (!events || events.length < PAGE) break;
      }
      const vendorIds = [...vendorIdSet];

      const rows = vendorIds.map((vendor_id) => ({ run_id: run.id, vendor_id }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await qms.from("qms_auto_qualification_results").insert(rows.slice(i, i + 500));
        if (error) return json({ success: false, error: error.message }, 400);
      }
      const { error: uErr } = await qms.from("qms_auto_qualification_runs").update({ vendor_count: vendorIds.length }).eq("id", run.id);
      if (uErr) return json({ success: false, error: uErr.message }, 400);
      return json({ success: true, run_id: run.id, vendor_count: vendorIds.length });
    }

    if (action === "process") {
      const { run_id } = body;
      const batchSize = Math.min(Math.max(num(body.batch_size) ?? 4, 1), 8);
      if (!run_id) return json({ success: false, error: "run_id required" }, 400);

      const { data: pending, error: pErr } = await qms
        .from("qms_auto_qualification_results")
        .select("id, vendor_id")
        .eq("run_id", run_id)
        .eq("status", "pending")
        .limit(batchSize);
      if (pErr) return json({ success: false, error: pErr.message }, 400);
      if (!pending?.length) {
        await qms.from("qms_auto_qualification_runs").update({ status: "completed", finished_at: new Date().toISOString() }).eq("id", run_id).eq("status", "running");
        return json({ success: true, processed: 0, remaining: 0, done: true });
      }

      await Promise.all(
        pending.map(async (row) => {
          try {
            const { data: vendor } = await sb
              .from("vendors")
              .select("id, vendor_type, years_experience, nda_signed_at, xtrf_vendor_id")
              .eq("id", row.vendor_id)
              .single();

            const { data: cv } = await sb
              .from("vendor_cvs")
              .select("id, file_storage_path, file_name, content_type")
              .eq("vendor_id", row.vendor_id)
              .eq("is_current", true)
              .order("version", { ascending: false })
              .limit(1)
              .maybeSingle();

            const { data: ndaSig } = await sb
              .from("vendor_nda_signatures")
              .select("id")
              .eq("vendor_id", row.vendor_id)
              .eq("is_current", true)
              .limit(1)
              .maybeSingle();

            const { data: payables } = await sb
              .from("vendor_payables")
              .select("created_at")
              .eq("vendor_id", row.vendor_id);

            let xtrfCount = 0;
            let xtrfFirst: string | null = null;
            let xtrfLast: string | null = null;
            if (vendor?.xtrf_vendor_id != null) {
              const { data: xtrf } = await sb
                .from("xtrf_vendor_invoice_cache")
                .select("final_date, draft_date")
                .eq("provider_id", vendor.xtrf_vendor_id);
              const dates = (xtrf ?? []).map((x) => x.final_date ?? x.draft_date).filter(Boolean).sort();
              xtrfCount = xtrf?.length ?? 0;
              xtrfFirst = dates[0] ?? null;
              xtrfLast = dates[dates.length - 1] ?? null;
            }

            const { count: revisionSteps } = await sb
              .from("order_workflow_steps")
              .select("id", { count: "exact", head: true })
              .eq("vendor_id", row.vendor_id)
              .in("status", ["completed", "approved"])
              .or("name.ilike.%revis%,name.ilike.%review%");

            const payDates = (payables ?? []).map((p) => p.created_at).sort();
            const allDates = [...payDates, xtrfFirst, xtrfLast].filter(Boolean).sort() as string[];
            const internalTenureYears = allDates.length >= 2
              ? (new Date(allDates[allDates.length - 1]).getTime() - new Date(allDates[0]).getTime()) / 31_557_600_000
              : 0;
            const internalJobs = (payables?.length ?? 0) + xtrfCount;

            let extraction: Extraction | null = null;
            let cvSha: string | null = null;
            let extractionError: string | null = null;
            if (cv?.file_storage_path && (cv.content_type ?? "").includes("pdf")) {
              const { data: file, error: dlErr } = await sb.storage.from(CV_BUCKET).download(cv.file_storage_path);
              if (dlErr || !file) {
                extractionError = `cv_download_failed: ${dlErr?.message ?? "no data"}`;
              } else {
                const buf = await file.arrayBuffer();
                cvSha = await sha256hex(buf);
                extraction = await extractFromCv(buf);
              }
            }

            const inputs = {
              vendor_type: vendor?.vendor_type ?? null,
              self_years: num(vendor?.years_experience),
              has_nda: !!(vendor?.nda_signed_at || ndaSig),
              cv_id: cv?.id ?? null,
              cv_path: cv?.file_storage_path ?? null,
              cv_sha256: cvSha,
              internal_jobs: internalJobs,
              internal_tenure_years: Math.round(internalTenureYears * 10) / 10,
              revision_steps: revisionSteps ?? 0,
              extraction_error: extractionError,
            };

            const verdict = extractionError
              ? { decision: "escalate" as const, basis: null, roles: [], confidence: 0, reasons: [extractionError], flags: ["extraction_failed"] }
              : decide({
                  vendorType: vendor?.vendor_type ?? null,
                  hasCv: !!cv && !!extraction,
                  extraction,
                  selfYears: num(vendor?.years_experience),
                  internalJobs,
                  internalTenureYears,
                  revisionSteps: revisionSteps ?? 0,
                  hasNda: inputs.has_nda,
                });

            const { error: upErr } = await qms
              .from("qms_auto_qualification_results")
              .update({
                status: "processed",
                decision: verdict.decision,
                roles: verdict.roles,
                basis_code: verdict.basis,
                confidence: verdict.confidence,
                reasons: verdict.reasons,
                flags: verdict.flags,
                inputs,
                extraction,
                processed_at: new Date().toISOString(),
              })
              .eq("id", row.id);
            if (upErr) throw new Error(`result update failed: ${upErr.message}`);
          } catch (e) {
            await qms
              .from("qms_auto_qualification_results")
              .update({ status: "error", error: e instanceof Error ? e.message : String(e), processed_at: new Date().toISOString() })
              .eq("id", row.id);
          }
        }),
      );

      const { count: remaining } = await qms
        .from("qms_auto_qualification_results")
        .select("id", { count: "exact", head: true })
        .eq("run_id", run_id)
        .eq("status", "pending");
      return json({ success: true, processed: pending.length, remaining: remaining ?? 0, done: (remaining ?? 0) === 0 });
    }

    if (action === "status" || action === "report") {
      const { run_id } = body;
      if (!run_id) return json({ success: false, error: "run_id required" }, 400);
      const { data: results, error } = await qms
        .from("qms_auto_qualification_results")
        .select("status, decision, basis_code, roles, flags, confidence")
        .eq("run_id", run_id);
      if (error) return json({ success: false, error: error.message }, 400);

      const tally = (key: (r: Record<string, unknown>) => string | null) => {
        const out: Record<string, number> = {};
        for (const r of results ?? []) {
          const k = key(r) ?? "—";
          out[k] = (out[k] ?? 0) + 1;
        }
        return out;
      };
      return json({
        success: true,
        total: results?.length ?? 0,
        by_status: tally((r) => r.status as string),
        by_decision: tally((r) => r.decision as string | null),
        by_basis: tally((r) => r.basis_code as string | null),
        reviser_also: (results ?? []).filter((r) => (r.roles as string[] | null)?.includes("reviser")).length,
        nda_missing: (results ?? []).filter((r) => (r.flags as string[] | null)?.includes("nda_missing")).length,
      });
    }

    return json({ success: false, error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
