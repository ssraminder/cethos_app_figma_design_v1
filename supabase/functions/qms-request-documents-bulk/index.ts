// qms-request-documents-bulk — chase the "nearly qualified" cohorts from an
// auto-qualification run by fanning out the existing vendor-request-documents
// edge function. Staff-triggered, batched, with a dry-run preview so nothing
// goes out without a click.
//
// Cohorts (per run, unapplied results):
//   chase                  decision='chase'   (no CV on file) → CV + credentials
//   insufficient_evidence  decision='escalate' AND flag 'insufficient_evidence'
//                          (CV present but no clear §3.1.4 basis) → degree /
//                          experience / professional-cert evidence
//
// Vendors with an already-open document request (draft/sent/partial) are
// skipped so reminders aren't duplicated — the existing reminder + status-sweep
// crons carry those forward.
//
// Actions:
//   preview { run_id, cohort }                 → counts + sample, no sends
//   send    { run_id, cohort, staff_id, limit } → request docs for up to `limit`
//                                                 vendors (default 25, max 50)

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(d: Record<string, unknown>, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
}

type Cohort = "chase" | "insufficient_evidence";

// Item sets reuse the established §3.1.4 doc-request slugs (see iso-recheck.ts).
// Labels are what the vendor reads; degree_/experience_ slugs are satisfied by a
// CV upload, cert slugs match against vendors.certifications.
const ITEM_SETS: Record<Cohort, Array<Record<string, unknown>>> = {
  chase: [
    { slug: "degree_translation_studies", label: "Your CV / résumé and any degree certificates", kind: "file" },
    { slug: "experience_evidence_5y", label: "Evidence of professional translation experience", kind: "file" },
    { slug: "profile_years_experience", label: "Years of professional translation experience", kind: "profile_field", profile_column: "years_experience" },
  ],
  insufficient_evidence: [
    { slug: "degree_translation_studies", label: "Degree certificate — translation, linguistics, or language studies", kind: "file" },
    { slug: "degree_other_field", label: "Degree certificate — any other field", kind: "file" },
    { slug: "experience_evidence_5y", label: "Proof of 5+ years professional translation experience", kind: "file" },
    { slug: "professional_translation_cert", label: "Professional translation certification (e.g. ATA, CTTIC, sworn)", kind: "file" },
  ],
};

const STAFF_MESSAGE: Record<Cohort, string> = {
  chase: "To complete your ISO 17100 qualification with Cethos we need your CV and any qualification documents on file. Please upload them using the secure link below.",
  insufficient_evidence: "We're finalising your ISO 17100 qualification and need documentary evidence of your translation qualifications. Please upload whichever of the items below apply to you.",
};

interface Degree { level?: string; field?: string }
interface Extraction { degrees?: Degree[]; translation_experience?: { total_years_estimate?: number | null } }

// Per-vendor tailoring for insufficient-evidence: the gap depends on whether
// the CV showed a higher-education degree. Items are DETERMINISTIC (this
// function); the human-readable message is AI-written (aiMessage below) — the
// house "deterministic value + AI prose" split.
function tailorInsufficient(extraction: Extraction | null): { items: Array<Record<string, unknown>>; route: string; gap: string } {
  const degrees = extraction?.degrees ?? [];
  const higherEd = degrees.find((d) => ["bachelor", "master", "phd"].includes((d.level ?? "").toLowerCase()));
  if (higherEd) {
    return {
      route: "degree_plus_2y",
      gap: `a ${higherEd.level} degree${higherEd.field ? ` in ${higherEd.field}` : ""} on the CV, but no confirmed translation-specific qualification or documented translation experience`,
      items: [
        { slug: "experience_evidence_2y", label: "Proof of 2+ years' professional translation experience (e.g. reference letters, contracts, PO history)", kind: "file" },
        { slug: "degree_other_field", label: "Your degree certificate", kind: "file" },
        { slug: "professional_translation_cert", label: "Professional translation certification (ATA, CTTIC, sworn, etc.) — only if you hold one", kind: "file" },
      ],
    };
  }
  return {
    route: "degree_or_5y",
    gap: "no recognised translation qualification and not enough documented translation experience on the CV",
    items: [
      { slug: "degree_translation_studies", label: "Degree in translation, linguistics, or language studies", kind: "file" },
      { slug: "experience_evidence_5y", label: "Proof of 5+ years' professional translation experience (e.g. reference letters, contracts, PO history)", kind: "file" },
      { slug: "professional_translation_cert", label: "Professional translation certification (ATA, CTTIC, sworn, etc.) — only if you hold one", kind: "file" },
    ],
  };
}

// AI-written, per-vendor explanation. Deterministic fallback if the model is
// unavailable so a send never blocks on the API.
async function aiMessage(firstName: string, gap: string, itemLabels: string[]): Promise<string> {
  const fallback =
    `Hi ${firstName || "there"}, we're finalising your ISO 17100 qualification with Cethos. Our review found ${gap}. ` +
    `To complete it, please upload whichever of these apply to you: ${itemLabels.join("; ")}. Use the secure link below.`;
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return fallback;
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        temperature: 0.3,
        messages: [{
          role: "user",
          content:
            `Write a short (3-4 sentence), warm, professional email body to a translation vendor named "${firstName || "there"}". ` +
            `Context: we are finalising their ISO 17100 qualification and our review of their CV found ${gap}. ` +
            `Ask them to upload whichever of these apply: ${itemLabels.join("; ")}. ` +
            `Do not invent specifics about them beyond the context given. Do not add a greeting line salutation beyond starting with their name, no sign-off, no subject line — just the body paragraph(s). Plain text.`,
        }],
      }),
    });
    if (!resp.ok) return fallback;
    const data = await resp.json();
    const text = data?.content?.find((c: { type: string }) => c.type === "text")?.text?.trim();
    return text || fallback;
  } catch {
    return fallback;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = await req.json();
    const action = body?.action as string;
    const cohort = body?.cohort as Cohort;
    const run_id = body?.run_id as string;
    if (!run_id || !cohort || !ITEM_SETS[cohort]) {
      return json({ success: false, error: "run_id + valid cohort required" }, 400);
    }

    // Eligible = unapplied results in this run matching the cohort, whose vendor
    // has no open document request yet.
    let q = sb
      .from("qms_auto_qualification_results")
      .select("vendor_id, decision, flags, extraction")
      .eq("run_id", run_id)
      .is("applied_at", null);
    q = cohort === "chase"
      ? q.eq("decision", "chase")
      : q.eq("decision", "escalate").contains("flags", ["insufficient_evidence"]);
    const { data: rows, error } = await q;
    if (error) return json({ success: false, error: error.message }, 400);

    const extractionByVendor = new Map<string, Extraction | null>(
      (rows ?? []).map((r) => [r.vendor_id as string, (r.extraction as Extraction | null) ?? null]),
    );
    const vendorIds = [...new Set((rows ?? []).map((r) => r.vendor_id as string))];
    if (vendorIds.length === 0) return json({ success: true, eligible: 0, sample: [], sent: 0, failed: [], remaining: 0 });

    // Drop vendors with an open (draft/sent/partial) request.
    const { data: openReqs } = await sb
      .from("vendor_document_requests")
      .select("vendor_id")
      .in("vendor_id", vendorIds)
      .in("status", ["draft", "sent", "partial"]);
    const blocked = new Set((openReqs ?? []).map((r) => r.vendor_id as string));
    const eligibleIds = vendorIds.filter((id) => !blocked.has(id));

    if (action === "preview") {
      const { data: sample } = await sb
        .from("vendors")
        .select("id, full_name, email")
        .in("id", eligibleIds.slice(0, 10));

      // For the AI cohort, generate one real tailored sample (AI message +
      // per-vendor items) via a dry-run send so staff see what goes out.
      let sampleEmail: Record<string, unknown> | null = null;
      if (cohort === "insufficient_evidence" && eligibleIds.length > 0) {
        const sv = eligibleIds[0];
        const t = tailorInsufficient(extractionByVendor.get(sv) ?? null);
        const { data: svRow } = await sb.from("vendors").select("full_name").eq("id", sv).maybeSingle();
        const firstName = ((svRow?.full_name as string) ?? "").trim().split(/\s+/)[0] ?? "";
        const msg = await aiMessage(firstName, t.gap, t.items.map((i) => String(i.label)));
        const dr = await fetch(`${SUPABASE_URL}/functions/v1/vendor-request-documents`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "apikey": SERVICE_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ vendor_id: sv, dry_run: true, ai_generated: true, staff_message: msg, requested_items: t.items }),
        });
        const drJson = await dr.json().catch(() => ({}));
        sampleEmail = { vendor_first_name: firstName, route: t.route, ai_message: msg, items: t.items, subject: drJson?.data?.subject, html: drJson?.data?.html };
      }

      return json({
        success: true,
        cohort,
        eligible: eligibleIds.length,
        already_requested: blocked.size,
        ai_generated: cohort === "insufficient_evidence",
        item_count: ITEM_SETS[cohort].length,
        items: ITEM_SETS[cohort],
        sample: sample ?? [],
        sample_email: sampleEmail,
      });
    }

    if (action === "send") {
      const { staff_id } = body;
      if (!staff_id) return json({ success: false, error: "staff_id required" }, 400);
      // AI-tailored cohort is heavier (a model call per vendor) — smaller cap.
      const maxBatch = cohort === "insufficient_evidence" ? 15 : 25;
      const limit = Math.min(Math.max(Number(body.limit) || maxBatch, 1), maxBatch);
      const batch = eligibleIds.slice(0, limit);

      // First names for the per-vendor AI message.
      const { data: vrows } = await sb.from("vendors").select("id, full_name").in("id", batch);
      const firstNameById = new Map(
        (vrows ?? []).map((v) => [v.id as string, ((v.full_name as string) ?? "").trim().split(/\s+/)[0] ?? ""]),
      );

      const sent: string[] = [];
      const failed: Array<Record<string, unknown>> = [];
      for (const vendor_id of batch) {
        try {
          let items = ITEM_SETS[cohort];
          let message = STAFF_MESSAGE[cohort];
          let aiGenerated = false;
          if (cohort === "insufficient_evidence") {
            const t = tailorInsufficient(extractionByVendor.get(vendor_id) ?? null);
            items = t.items;
            message = await aiMessage(firstNameById.get(vendor_id) ?? "", t.gap, t.items.map((i) => String(i.label)));
            aiGenerated = true;
          }
          const resp = await fetch(`${SUPABASE_URL}/functions/v1/vendor-request-documents`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${SERVICE_KEY}`,
              "apikey": SERVICE_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              vendor_id,
              staff_id,
              requested_items: items,
              staff_message: message,
              ai_generated: aiGenerated,
              expiry_days: 30,
            }),
          });
          const out = await resp.json();
          if (resp.ok && out?.success !== false) sent.push(vendor_id);
          else failed.push({ vendor_id, error: out?.error ?? `HTTP ${resp.status}` });
        } catch (e) {
          failed.push({ vendor_id, error: e instanceof Error ? e.message : String(e) });
        }
      }
      return json({
        success: true,
        cohort,
        sent: sent.length,
        failed,
        remaining: Math.max(0, eligibleIds.length - batch.length),
      });
    }

    return json({ success: false, error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
