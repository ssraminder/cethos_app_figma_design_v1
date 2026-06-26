import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { staff_user_id, otp_code, full_name } = await req.json();
    if (!staff_user_id || !otp_code || !full_name?.trim()) {
      throw new Error("staff_user_id, otp_code, and full_name are required");
    }

    // Fetch staff member
    const { data: staff, error: staffErr } = await supabase
      .from("staff_users")
      .select("id, email, full_name, is_active")
      .eq("id", staff_user_id)
      .single();
    if (staffErr || !staff) throw new Error("Staff member not found");
    if (!staff.is_active) throw new Error("Account is inactive");

    // Verify OTP
    const { data: otpRow, error: otpErr } = await supabase
      .from("secure_upload_otps")
      .select("id, code_hash, attempts, expires_at, verified_at")
      .eq("contact", staff.email)
      .eq("channel", "staff_nda")
      .single();

    if (otpErr || !otpRow) throw new Error("No OTP found — please request a new code");
    if (otpRow.verified_at) throw new Error("This code has already been used — please request a new code");
    if (new Date(otpRow.expires_at) < new Date()) throw new Error("Code has expired — please request a new code");
    if (otpRow.attempts >= 5) throw new Error("Too many attempts — please request a new code");

    // Hash the submitted code and compare
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(otp_code.trim()));
    const submitted_hash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0")).join("");

    if (submitted_hash !== otpRow.code_hash) {
      await supabase
        .from("secure_upload_otps")
        .update({ attempts: otpRow.attempts + 1 })
        .eq("id", otpRow.id);
      throw new Error("Incorrect code — please try again");
    }

    // Mark OTP verified
    await supabase
      .from("secure_upload_otps")
      .update({ verified_at: new Date().toISOString() })
      .eq("id", otpRow.id);

    // Fetch active template
    const { data: template } = await supabase
      .from("nda_templates")
      .select("id, body_html, version_label")
      .eq("agreement_type", "staff_nda")
      .eq("is_active", true)
      .single();

    const now = new Date().toISOString();
    const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? null;
    const ua = req.headers.get("user-agent") ?? null;

    // Supersede any existing current signature
    const { data: existing } = await supabase
      .from("staff_nda_signatures")
      .select("id")
      .eq("staff_user_id", staff_user_id)
      .eq("is_current", true)
      .maybeSingle();

    let newSigId: string | null = null;

    // Insert new signature first (to get its id for superseded_by_id)
    const { data: newSig, error: sigErr } = await supabase
      .from("staff_nda_signatures")
      .insert({
        staff_user_id,
        nda_template_id: template?.id ?? null,
        signed_full_name: full_name.trim(),
        signed_email: staff.email,
        signed_at: now,
        signer_ip: ip,
        signer_user_agent: ua,
        signed_html_snapshot: template?.body_html ?? null,
        otp_verified_at: now,
        is_current: true,
      })
      .select("id")
      .single();
    if (sigErr) throw sigErr;
    newSigId = newSig.id;

    // Mark old signature superseded
    if (existing) {
      await supabase
        .from("staff_nda_signatures")
        .update({
          is_current: false,
          superseded_by_id: newSigId,
          superseded_at: now,
          superseded_reason: "New version signed",
        })
        .eq("id", existing.id);
    }

    return Response.json({
      success: true,
      signature_id: newSigId,
      signed_at: now,
      template_version: template?.version_label ?? "v1.0",
    }, { headers: corsHeaders });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 400, headers: corsHeaders });
  }
});
