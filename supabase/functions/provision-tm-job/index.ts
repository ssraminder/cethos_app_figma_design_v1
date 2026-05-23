// provision-tm-job
// Called by the admin UI when "Use Cethos TM" is toggled on for a workflow step.
// Downloads the order's source files, POSTs them to the TM's /api/jobs/ingest
// endpoint, and stores the resulting tm_job_id back on the step.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { encode as base64Encode } from "https://deno.land/std@0.208.0/encoding/base64.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { step_id } = await req.json();
    if (!step_id) return json({ success: false, error: "Missing step_id" }, 400);

    const TM_API_URL = Deno.env.get("CETHOS_TM_API_URL");
    const TM_API_KEY = Deno.env.get("CETHOS_TM_API_KEY");
    if (!TM_API_URL || !TM_API_KEY) {
      return json({ success: false, error: "TM integration not configured" }, 500);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch step + order + quote
    const { data: step, error: stepErr } = await supabase
      .from("order_workflow_steps")
      .select("id, order_id, source_language, target_language, tm_job_id, use_cethos_tm, vendor_id")
      .eq("id", step_id)
      .single();
    if (stepErr || !step) return json({ success: false, error: "Step not found" }, 404);

    if (step.tm_job_id) {
      return json({ success: true, already_provisioned: true, tm_job_id: step.tm_job_id });
    }

    const { data: order } = await supabase
      .from("orders")
      .select("id, order_number, quote_id")
      .eq("id", step.order_id)
      .single();
    if (!order?.quote_id) return json({ success: false, error: "Order has no quote/files" }, 400);

    // Resolve language codes from UUIDs
    const langIds = [step.source_language, step.target_language].filter(Boolean);
    let sourceLang = step.source_language ?? "en";
    let targetLang = step.target_language ?? "fr";
    if (langIds.length > 0) {
      const { data: langs } = await supabase
        .from("languages")
        .select("id, code")
        .in("id", langIds);
      if (langs) {
        for (const l of langs) {
          if (l.id === step.source_language) sourceLang = l.code;
          if (l.id === step.target_language) targetLang = l.code;
        }
      }
    }

    // Get the first translatable source file from quote_files
    const { data: qfiles } = await supabase
      .from("quote_files")
      .select("id, original_filename, storage_path, mime_type")
      .eq("quote_id", order.quote_id)
      .is("deleted_at", null)
      .neq("upload_status", "failed")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(1);

    if (!qfiles?.length) {
      return json({ success: false, error: "No source files found for this order" }, 400);
    }
    const sourceFile = qfiles[0];

    // Download the file from storage
    const { data: fileData, error: dlErr } = await supabase.storage
      .from("quote-files")
      .download(sourceFile.storage_path);
    if (dlErr || !fileData) {
      return json({ success: false, error: `Failed to download source file: ${dlErr?.message ?? "unknown"}` }, 500);
    }

    const buffer = new Uint8Array(await fileData.arrayBuffer());
    const b64 = base64Encode(buffer);

    // Resolve vendor email if assigned
    let assignedEmail: string | undefined;
    if (step.vendor_id) {
      const { data: vendor } = await supabase
        .from("vendors")
        .select("email")
        .eq("id", step.vendor_id)
        .maybeSingle();
      assignedEmail = vendor?.email ?? undefined;
    }

    // POST to TM ingest API
    const ingestBody: Record<string, unknown> = {
      source_b64: b64,
      source_filename: sourceFile.original_filename,
      source_mime_type: sourceFile.mime_type ?? undefined,
      source_lang: sourceLang,
      target_lang: targetLang,
      external_ref: `order-${order.order_number}-step-${step_id}`,
    };
    if (assignedEmail) {
      ingestBody.assigned_to_email = assignedEmail;
    }

    const tmRes = await fetch(`${TM_API_URL}/api/jobs/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TM_API_KEY}`,
      },
      body: JSON.stringify(ingestBody),
    });

    if (!tmRes.ok) {
      const errBody = await tmRes.text();
      console.error("TM ingest failed:", tmRes.status, errBody);
      return json({ success: false, error: `TM provisioning failed: ${tmRes.status}` }, 502);
    }

    const tmResult = await tmRes.json();

    // Store TM job reference back on the step
    await supabase
      .from("order_workflow_steps")
      .update({
        use_cethos_tm: true,
        tm_job_id: tmResult.job_id,
        tm_job_reference: tmResult.reference,
        tm_provisioned_at: new Date().toISOString(),
      })
      .eq("id", step_id);

    console.log(`TM job provisioned: step=${step_id} tm_job=${tmResult.job_id} ref=${tmResult.reference}`);

    return json({
      success: true,
      tm_job_id: tmResult.job_id,
      tm_job_reference: tmResult.reference,
      segments: tmResult.segments,
      words: tmResult.words,
    });
  } catch (err) {
    console.error("provision-tm-job error:", err);
    return json({ success: false, error: (err as Error).message }, 500);
  }
});
