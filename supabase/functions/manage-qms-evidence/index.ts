// manage-qms-evidence — admin adds or verifies QMS competence evidence.
//
// The QMS evidence locker (qms.competence_evidence) is the single place for all
// audit proof per linguist: CVs, degree certificates, references, certifications,
// first-party payment statements, test results. This function is the admin write
// path for it. The qms schema isn't exposed to PostgREST, so all writes go
// through the public SECURITY DEFINER wrappers qms_add_evidence_wrapper /
// qms_verify_evidence_wrapper.
//
// Body (action = "add"):
//   {
//     action: "add",
//     staff_id,
//     vendor_id,
//     role_qualification_id?,            // link to a specific qualification, or null (locker-level)
//     evidence_type_code,                // qms.evidence_types.code
//     title,
//     issuing_organization?, issuing_country_code?, issued_date?, expiry_date?,
//     verified?: boolean,                // true => Tier-2 (a human reviewed the doc)
//     verification_method?, verification_notes?,
//     file?: { name, mime, base64 }      // optional document to store + hash
//   }
//
// Body (action = "verify"):
//   { action: "verify", staff_id, evidence_id, verification_method?, verification_notes? }
//
// Returns: { success, evidence_id, storage_path? }

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const BUCKET = "qms-evidence";

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function sanitize(name: string): string {
  return (name || "document").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.split(",")[1] : b64; // strip data: prefix
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const { action, staff_id } = body ?? {};
    if (!action || !["add", "verify", "build_first_party", "approve_qualification"].includes(action)) {
      return json({ success: false, error: "action must be 'add', 'verify', 'build_first_party' or 'approve_qualification'" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolve acting staff -> auth user id.
    let acting_user_id: string | null = null;
    if (staff_id) {
      const { data: staffRow } = await supabase
        .from("staff_users")
        .select("auth_user_id")
        .eq("id", staff_id)
        .maybeSingle();
      acting_user_id = staffRow?.auth_user_id ?? null;
    }
    if (!acting_user_id) {
      return json({ success: false, error: "Could not resolve acting staff user (staff_id missing or not linked to an auth user)." }, 401);
    }

    if (action === "approve_qualification") {
      const { vendor_id, role_qualification_id } = body;
      if (!vendor_id) return json({ success: false, error: "vendor_id required" }, 400);
      const { data, error } = await supabase.rpc("qms_approve_qualification", {
        p_vendor_id: vendor_id,
        p_acting_user_id: acting_user_id,
        p_role_qualification_id: role_qualification_id ?? null,
      });
      if (error) return json({ success: false, error: error.message, hint: error.hint }, 400);
      return json({ success: true, result: data });
    }

    if (action === "build_first_party") {
      const { vendor_id, dry_run } = body;
      if (!vendor_id) return json({ success: false, error: "vendor_id required" }, 400);
      const { data, error } = await supabase.rpc("qms_build_first_party_experience", {
        p_vendor_id: vendor_id,
        p_acting_user_id: acting_user_id,
        p_dry_run: dry_run ?? false,
      });
      if (error) return json({ success: false, error: error.message, hint: error.hint }, 400);
      return json({ success: true, result: data });
    }

    if (action === "verify") {
      const { evidence_id, verification_method, verification_notes } = body;
      if (!evidence_id) return json({ success: false, error: "evidence_id required" }, 400);
      const { data, error } = await supabase.rpc("qms_verify_evidence_wrapper", {
        p_evidence_id: evidence_id,
        p_verification_method: verification_method ?? "document_review",
        p_verification_notes: verification_notes ?? null,
        p_acting_user_id: acting_user_id,
      });
      if (error) return json({ success: false, error: error.message, hint: error.hint }, 400);
      return json({ success: true, evidence_id: data });
    }

    // action === "add"
    const {
      vendor_id,
      role_qualification_id,
      evidence_type_code,
      title,
      issuing_organization,
      issuing_country_code,
      issued_date,
      expiry_date,
      verified,
      verification_method,
      verification_notes,
      file,
    } = body;

    if (!vendor_id || !evidence_type_code || !title) {
      return json({ success: false, error: "vendor_id, evidence_type_code and title are required" }, 400);
    }

    let storage_path: string | null = null;
    let file_name: string | null = null;
    let file_mime: string | null = null;
    let file_size: number | null = null;
    let sha256: string | null = null;

    if (file?.base64) {
      const bytes = b64ToBytes(file.base64);
      sha256 = await sha256Hex(bytes);
      file_name = sanitize(file.name);
      file_mime = file.mime ?? "application/octet-stream";
      file_size = bytes.byteLength;
      storage_path = `${vendor_id}/manual-${crypto.randomUUID()}-${file_name}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(storage_path, bytes, { contentType: file_mime, upsert: false });
      if (upErr) return json({ success: false, error: `upload failed: ${upErr.message}` }, 400);
    }

    const { data, error } = await supabase.rpc("qms_add_evidence_wrapper", {
      p_vendor_id: vendor_id,
      p_role_qualification_id: role_qualification_id ?? null,
      p_evidence_type_code: evidence_type_code,
      p_title: title,
      p_org: issuing_organization ?? null,
      p_country: issuing_country_code ?? null,
      p_issued_date: issued_date ?? null,
      p_expiry_date: expiry_date ?? null,
      p_storage_path: storage_path,
      p_file_name: file_name,
      p_file_mime: file_mime,
      p_file_size: file_size,
      p_sha256: sha256,
      p_verified: verified ?? false,
      p_verification_method: verification_method ?? null,
      p_verification_notes: verification_notes ?? null,
      p_acting_user_id: acting_user_id,
    });
    if (error) return json({ success: false, error: error.message, hint: error.hint }, 400);
    return json({ success: true, evidence_id: data, storage_path });
  } catch (err: any) {
    console.error("manage-qms-evidence error:", err);
    return json({ success: false, error: err?.message ?? String(err) }, 500);
  }
});
