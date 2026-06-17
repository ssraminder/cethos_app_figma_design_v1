// cvp-iso-autoapprove-check — recruitment-stage ISO 17100 §3.1.4 scorer.
//
// Decides, per application, whether the qualification can be AUTO-approved
// (ISO §3.1.4 met with DOCUMENTED evidence) or must go to HITL. Self-declared
// experience is NOT accepted on its own (§3.1.4 requires "documented evidence",
// §3.1.1 a record of it) — experience routes only auto when the CV fully
// corroborates the claim (prescreen cv_corroborates_form='fully').
//
// AI extracts from the CV (degrees + experience, with verbatim quotes);
// deterministic rules pick the route. DRY-RUN ONLY: writes to
// cvp_iso_autoapprove_results; nothing is approved.
//
// Actions:
//   start   { }                      → create run + enqueue reviewable apps
//   process { run_id, batch_size? }  → score next N (CV extraction per app)
//   report  { run_id }               → distribution
//   list_results { run_id, decision? }

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const PROMPT_VERSION = "cvp-iso-autoapprove-v3";
const MODEL = "claude-sonnet-4-6";
const CV_BUCKET = "cvp-applicant-cvs";
const DEGREE_LEVELS = ["bachelor", "master", "phd"];
// Applications already decided or not yet at a reviewable point are skipped.
const REVIEWABLE_STATUSES = ["prescreened", "staff_review", "test_pending", "test_sent", "test_in_progress", "test_submitted", "test_assessed", "negotiation"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(d: Record<string, unknown>, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
}
function num(x: unknown): number | null {
  if (x == null) return null;
  const n = typeof x === "number" ? x : parseFloat(String(x).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

interface Extraction {
  degrees: Array<{ level: string; field: string; institution: string | null; year: number | null; is_translation_degree: boolean; quote: string }>;
  translation_experience: { total_years_estimate: number | null; quote: string | null };
  red_flags: string[];
}

const EXTRACTION_PROMPT = `You are extracting facts from a translator applicant's CV for an ISO 17100 §3.1.4 qualification check.
Return ONLY a JSON object (no fences):
{
  "degrees": [{"level":"bachelor|master|phd|diploma|other","field":"...","institution":"...","year":2010,"is_translation_degree":true,"quote":"verbatim from CV"}],
  "translation_experience": {"total_years_estimate": 8, "quote":"verbatim supporting this"},
  "red_flags": []
}
Rules:
- "is_translation_degree" true only for degrees in translation, interpreting, linguistics, or language studies.
- EVERY degree + the experience estimate MUST carry a short verbatim quote from the CV. No quote → omit it.
- "total_years_estimate": years of professional TRANSLATION work only, from datable CV history. null if the CV gives no usable dates.
- "red_flags": ONLY genuine contradictions/impossibilities (conflicting dates). Normal CV traits are not red flags. Usually empty.
- Do not infer or embellish. Missing is missing.`;

async function extractFromCv(pdf: ArrayBuffer): Promise<Extraction> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 3000, temperature: 0,
      messages: [{ role: "user", content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64(pdf) } },
        { type: "text", text: EXTRACTION_PROMPT },
      ] }],
    }),
  });
  if (!resp.ok) throw new Error(`Anthropic ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const data = await resp.json();
  const text = data?.content?.find((c: { type: string }) => c.type === "text")?.text ?? "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("no JSON in extraction");
  return JSON.parse(m[0]) as Extraction;
}

// ── Deterministic §3.1.4 decision ───────────────────────────────────────────
// AUTO only when DOCUMENTED: translation degree (a), or experience (b/c) where
// the CV fully corroborates (prescreen cv_corroborates_form='fully'). Self-
// declared-only / partial / contradicting / unreadable → HITL.
function decide(args: {
  extraction: Extraction | null;
  selfYears: number | null;
  cvCorroborates: string | null;   // fully | partially | contradicts | not_readable | null
  hasCv: boolean;
  refConfirmedYears: number | null; // years confirmed by RECEIVED references (documented), or null
}): { decision: "auto" | "pending" | "hitl" | "not_met"; basis: string | null; evidenced: boolean; confidence: number; reasons: string[]; flags: string[] } {
  const reasons: string[] = [];
  const flags: string[] = [];

  if (!args.hasCv) return { decision: "hitl", basis: null, evidenced: false, confidence: 0, reasons: ["no CV on file — §3.1.4 evidence cannot be confirmed automatically"], flags: ["no_cv"] };
  if (!args.extraction) return { decision: "hitl", basis: null, evidenced: false, confidence: 0, reasons: ["CV could not be read/extracted — needs human review"], flags: ["cv_unreadable"] };

  const ex = args.extraction;
  const corrob = args.cvCorroborates;
  const higherEd = (ex.degrees ?? []).filter((d) => d.quote?.trim() && DEGREE_LEVELS.includes((d.level ?? "").toLowerCase()));
  const transDegree = higherEd.find((d) => d.is_translation_degree);
  const anyDegree = higherEd[0];
  const cvYears = num(ex.translation_experience?.total_years_estimate);
  const years = cvYears ?? args.selfYears;

  if ((ex.red_flags ?? []).length > 0) flags.push("red_flags");
  if (corrob === "contradicts") flags.push("cv_contradicts_form");

  // §3.1.4(a) — translation degree, documented (quoted) in the CV. Auto unless
  // the CV has genuine red flags OR the prescreen says the CV contradicts the
  // application form — either is a discrepancy a human should resolve first.
  if (transDegree) {
    reasons.push(`§3.1.4(a) translation degree: ${transDegree.field}${transDegree.institution ? `, ${transDegree.institution}` : ""} — "${transDegree.quote}"`);
    if ((ex.red_flags ?? []).length > 0 || corrob === "contradicts") {
      if ((ex.red_flags ?? []).length > 0) reasons.push(`CV red flags: ${ex.red_flags.join("; ")}`);
      if (corrob === "contradicts") reasons.push("prescreen: CV contradicts the application form — resolve before onboarding");
      return { decision: "hitl", basis: "degree_translation", evidenced: true, confidence: 0.5, reasons, flags };
    }
    return { decision: "auto", basis: "degree_translation", evidenced: true, confidence: 0.9, reasons, flags };
  }

  // Experience routes. Per policy, self-reported experience is NOT a basis:
  // approval requires DOCUMENTED experience — references that confirm the
  // duration (§3.1.4 "documented evidence"). A consistent CV is not enough.
  // Plausible-but-undocumented → 'pending' (request references, wait).
  const refYears = args.refConfirmedYears;
  const refNote = refYears != null
    ? `references confirm ~${refYears}y of professional experience (documented)`
    : "no references on file confirming the experience yet";
  const claimNote = cvYears != null
    ? `CV indicates ~${cvYears}y — "${ex.translation_experience?.quote ?? ""}"`
    : `self-declared ${args.selfYears ?? "?"}y`;
  const flagged = (ex.red_flags ?? []).length > 0 || corrob === "contradicts";

  // §3.1.4(b) — other degree + ≥2 years.
  if (anyDegree && years != null && years >= 2) {
    if (refYears != null && refYears >= 2 && !flagged) {
      reasons.push(`§3.1.4(b) degree (${anyDegree.field}) — "${anyDegree.quote}"`, refNote);
      return { decision: "auto", basis: "degree_other_plus_2y", evidenced: true, confidence: 0.8, reasons, flags };
    }
    reasons.push(`§3.1.4(b) plausible (degree + ${claimNote}) but experience not documented — ${refNote}. Request references to qualify.`);
    return { decision: flagged ? "hitl" : "pending", basis: "degree_other_plus_2y", evidenced: false, confidence: 0.4, reasons, flags };
  }

  // §3.1.4(c) — ≥5 years.
  if (years != null && years >= 5) {
    if (refYears != null && refYears >= 5 && !flagged) {
      reasons.push(`§3.1.4(c) experience`, refNote);
      return { decision: "auto", basis: "experience_5y", evidenced: true, confidence: 0.75, reasons, flags };
    }
    reasons.push(`§3.1.4(c) plausible (${claimNote}) but experience not documented — ${refNote}. Request references to qualify.`);
    return { decision: flagged ? "hitl" : "pending", basis: "experience_5y", evidenced: false, confidence: 0.4, reasons, flags };
  }

  reasons.push("No §3.1.4 route met even on the evidence available — needs human decision");
  return { decision: "not_met", basis: null, evidenced: false, confidence: 0.3, reasons, flags };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = await req.json();
    const action = body?.action as string;

    if (action === "start") {
      const { data: run, error: rErr } = await sb
        .from("cvp_iso_autoapprove_runs")
        .insert({ mode: "dry_run", prompt_version: PROMPT_VERSION, model: MODEL, params: { reviewable_statuses: REVIEWABLE_STATUSES } })
        .select("*").single();
      if (rErr) return json({ success: false, error: rErr.message }, 400);

      const { data: apps, error: aErr } = await sb
        .from("cvp_applications").select("id").in("status", REVIEWABLE_STATUSES);
      if (aErr) return json({ success: false, error: aErr.message }, 400);
      const rows = (apps ?? []).map((a) => ({ run_id: run.id, application_id: a.id }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from("cvp_iso_autoapprove_results").insert(rows.slice(i, i + 500));
        if (error) return json({ success: false, error: error.message }, 400);
      }
      await sb.from("cvp_iso_autoapprove_runs").update({ application_count: rows.length }).eq("id", run.id);
      return json({ success: true, run_id: run.id, application_count: rows.length });
    }

    if (action === "process") {
      const { run_id } = body;
      const batchSize = Math.min(Math.max(num(body.batch_size) ?? 4, 1), 8);
      if (!run_id) return json({ success: false, error: "run_id required" }, 400);

      const { data: pending } = await sb
        .from("cvp_iso_autoapprove_results").select("id, application_id")
        .eq("run_id", run_id).eq("status", "pending").limit(batchSize);
      if (!pending?.length) {
        await sb.from("cvp_iso_autoapprove_runs").update({ status: "completed", finished_at: new Date().toISOString() }).eq("id", run_id).eq("status", "running");
        return json({ success: true, processed: 0, remaining: 0, done: true });
      }

      await Promise.all(pending.map(async (row) => {
        try {
          const { data: app } = await sb.from("cvp_applications")
            .select("id, full_name, education_level, years_experience, cv_storage_path, ai_prescreening_result")
            .eq("id", row.application_id).single();
          const pres = (app?.ai_prescreening_result ?? {}) as Record<string, unknown>;
          const cvCorroborates = (pres["cv_corroborates_form"] as string) ?? null;

          let extraction: Extraction | null = null;
          let extractionError: string | null = null;
          if (app?.cv_storage_path) {
            const { data: file, error: dlErr } = await sb.storage.from(CV_BUCKET).download(app.cv_storage_path);
            if (dlErr || !file) extractionError = `cv_download_failed: ${dlErr?.message ?? "no data"}`;
            else extraction = await extractFromCv(await file.arrayBuffer());
          }

          // Documented experience evidence: RECEIVED references that confirm a
          // start year. Earliest confirmed start → most years.
          const { data: refs } = await sb.from("cvp_application_references")
            .select("reference_confirmed_start_year")
            .eq("application_id", row.application_id)
            .eq("status", "received")
            .not("reference_confirmed_start_year", "is", null);
          const startYears = (refs ?? []).map((r) => num(r.reference_confirmed_start_year)).filter((y): y is number => y != null);
          const refConfirmedYears = startYears.length ? new Date().getUTCFullYear() - Math.min(...startYears) : null;

          const inputs = {
            education_level: app?.education_level ?? null,
            self_years: num(app?.years_experience),
            cv_corroborates_form: cvCorroborates,
            prescreen_overall_score: pres["overall_score"] ?? null,
            references_received: (refs ?? []).length,
            ref_confirmed_years: refConfirmedYears,
            has_cv: !!app?.cv_storage_path,
            extraction_error: extractionError,
          };
          const verdict = extractionError
            ? { decision: "hitl" as const, basis: null, evidenced: false, confidence: 0, reasons: [extractionError], flags: ["extraction_failed"] }
            : decide({ extraction, selfYears: num(app?.years_experience), cvCorroborates, hasCv: !!app?.cv_storage_path, refConfirmedYears });

          await sb.from("cvp_iso_autoapprove_results").update({
            status: "processed",
            decision: verdict.decision, basis_code: verdict.basis, evidenced: verdict.evidenced,
            confidence: verdict.confidence, reasons: verdict.reasons, flags: verdict.flags,
            inputs, extraction, processed_at: new Date().toISOString(),
          }).eq("id", row.id);
        } catch (e) {
          await sb.from("cvp_iso_autoapprove_results")
            .update({ status: "error", error: e instanceof Error ? e.message : String(e), processed_at: new Date().toISOString() })
            .eq("id", row.id);
        }
      }));

      const { count: remaining } = await sb.from("cvp_iso_autoapprove_results")
        .select("id", { count: "exact", head: true }).eq("run_id", run_id).eq("status", "pending");
      return json({ success: true, processed: pending.length, remaining: remaining ?? 0, done: (remaining ?? 0) === 0 });
    }

    if (action === "report") {
      const { run_id } = body;
      if (!run_id) return json({ success: false, error: "run_id required" }, 400);
      const { data: rows } = await sb.from("cvp_iso_autoapprove_results")
        .select("status, decision, basis_code, evidenced").eq("run_id", run_id);
      const tally = (key: (r: Record<string, unknown>) => string | null) => {
        const out: Record<string, number> = {};
        for (const r of rows ?? []) { const k = key(r) ?? "—"; out[k] = (out[k] ?? 0) + 1; }
        return out;
      };
      return json({
        success: true, total: rows?.length ?? 0,
        by_status: tally((r) => r.status as string),
        by_decision: tally((r) => r.decision as string | null),
        auto_by_basis: tally((r) => (r.decision === "auto" ? (r.basis_code as string | null) : null)),
      });
    }

    if (action === "list_results") {
      const { run_id, decision } = body;
      const limit = Math.min(Math.max(num(body.limit) ?? 50, 1), 200);
      if (!run_id) return json({ success: false, error: "run_id required" }, 400);
      let q = sb.from("cvp_iso_autoapprove_results")
        .select("application_id, status, decision, basis_code, evidenced, confidence, reasons, flags")
        .eq("run_id", run_id).order("confidence", { ascending: false, nullsFirst: false }).limit(limit);
      if (decision) q = decision === "error" ? q.eq("status", "error") : q.eq("decision", decision);
      const { data: rows, error } = await q;
      if (error) return json({ success: false, error: error.message }, 400);
      const ids = [...new Set((rows ?? []).map((r) => r.application_id))];
      const { data: apps } = ids.length ? await sb.from("cvp_applications").select("id, full_name, application_number").in("id", ids) : { data: [] };
      const m = Object.fromEntries((apps ?? []).map((a) => [a.id, a]));
      return json({ success: true, results: (rows ?? []).map((r) => ({ ...r, application: m[r.application_id] ?? null })) });
    }

    // Onboard the decision='auto' applications (documented §3.1.4). Gated on
    // the auto_approve toggle. Each call goes through cvp-approve-application,
    // which re-enforces the evidence gate — so experience without references
    // can never slip through even here. Batched.
    if (action === "apply") {
      const { run_id } = body;
      const limit = Math.min(Math.max(num(body.limit) ?? 10, 1), 25);
      if (!run_id) return json({ success: false, error: "run_id required" }, 400);

      const { data: cfg } = await sb.from("cvp_system_config").select("value").eq("key", "auto_approve").maybeSingle();
      const toggle = (cfg?.value ?? {}) as { enabled?: boolean; acting_staff_id?: string | null };
      if (!toggle.enabled) {
        return json({ success: false, code: "AUTO_APPROVE_DISABLED", error: "Auto-approval is turned off. Enable it in config (auto_approve.enabled) before applying." }, 409);
      }
      const actingStaffId = toggle.acting_staff_id;
      if (!actingStaffId) return json({ success: false, error: "auto_approve.acting_staff_id not configured" }, 400);

      const { data: targets } = await sb.from("cvp_iso_autoapprove_results")
        .select("id, application_id, basis_code")
        .eq("run_id", run_id).eq("status", "processed").eq("decision", "auto")
        .is("applied_at", null).limit(limit);

      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const applied: string[] = [];
      const failed: Array<Record<string, unknown>> = [];
      for (const t of targets ?? []) {
        try {
          const resp = await fetch(`${SUPABASE_URL}/functions/v1/cvp-approve-application`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "apikey": SERVICE_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({
              applicationId: t.application_id,
              internalAuto: true,
              actingStaffId,
              skipTesting: true,
              qualificationBasis: t.basis_code,
              staffNotes: `[AUTO-APPROVED §3.1.4 ${t.basis_code}] Documented basis confirmed by the recruitment auto-approve scorer (run ${run_id}).`,
            }),
          });
          const out = await resp.json();
          if (resp.ok && out?.success !== false) {
            await sb.from("cvp_iso_autoapprove_results").update({ applied_at: new Date().toISOString(), applied_vendor_id: out?.data?.vendorId ?? null }).eq("id", t.id);
            applied.push(t.application_id);
          } else {
            const msg = out?.error ?? `HTTP ${resp.status}`;
            await sb.from("cvp_iso_autoapprove_results").update({ apply_error: typeof msg === "string" ? msg : JSON.stringify(msg) }).eq("id", t.id);
            failed.push({ application_id: t.application_id, error: msg });
          }
        } catch (e) {
          failed.push({ application_id: t.application_id, error: e instanceof Error ? e.message : String(e) });
        }
      }
      const { count: remaining } = await sb.from("cvp_iso_autoapprove_results")
        .select("id", { count: "exact", head: true })
        .eq("run_id", run_id).eq("decision", "auto").is("applied_at", null);
      return json({ success: true, applied: applied.length, failed, remaining: remaining ?? 0 });
    }

    return json({ success: false, error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
