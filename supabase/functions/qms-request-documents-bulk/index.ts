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
      .select("vendor_id, decision, flags")
      .eq("run_id", run_id)
      .is("applied_at", null);
    q = cohort === "chase"
      ? q.eq("decision", "chase")
      : q.eq("decision", "escalate").contains("flags", ["insufficient_evidence"]);
    const { data: rows, error } = await q;
    if (error) return json({ success: false, error: error.message }, 400);

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
      return json({
        success: true,
        cohort,
        eligible: eligibleIds.length,
        already_requested: blocked.size,
        item_count: ITEM_SETS[cohort].length,
        items: ITEM_SETS[cohort],
        sample: sample ?? [],
      });
    }

    if (action === "send") {
      const { staff_id } = body;
      if (!staff_id) return json({ success: false, error: "staff_id required" }, 400);
      const limit = Math.min(Math.max(Number(body.limit) || 25, 1), 50);
      const batch = eligibleIds.slice(0, limit);

      const sent: string[] = [];
      const failed: Array<Record<string, unknown>> = [];
      for (const vendor_id of batch) {
        try {
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
              requested_items: ITEM_SETS[cohort],
              staff_message: STAFF_MESSAGE[cohort],
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
