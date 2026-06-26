import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OTP_TTL_MINUTES = 15;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { staff_user_id } = await req.json();
    if (!staff_user_id) throw new Error("staff_user_id required");

    const { data: staff, error } = await supabase
      .from("staff_users")
      .select("id, email, full_name, is_active")
      .eq("id", staff_user_id)
      .single();
    if (error || !staff) throw new Error("Staff member not found");
    if (!staff.is_active) throw new Error("Account is inactive");

    // Generate 6-digit OTP
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const encoder = new TextEncoder();
    const data = encoder.encode(code);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const code_hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    const expires_at = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

    // Upsert OTP record (partial unique index on contact,channel WHERE channel='staff_nda')
    const { error: upsertErr } = await supabase.from("secure_upload_otps").upsert({
      contact: staff.email,
      channel: "staff_nda",
      code_hash,
      attempts: 0,
      expires_at,
      verified_at: null,
    }, { onConflict: "contact,channel" });
    if (upsertErr) throw new Error(`Failed to save OTP: ${upsertErr.message}`);

    // Send via Brevo
    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": Deno.env.get("BREVO_API_KEY")!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: "Cethos", email: Deno.env.get("BREVO_SENDER_EMAIL") ?? "no-reply@cethos.com" },
        to: [{ email: staff.email, name: staff.full_name }],
        subject: "Your Cethos NDA signing code",
        htmlContent: `<p>Hi ${staff.full_name},</p>
<p>Please use the code below to sign the Cethos Staff Confidentiality Agreement. This code expires in ${OTP_TTL_MINUTES} minutes.</p>
<h2 style="letter-spacing:6px;font-size:32px;font-family:monospace;">${code}</h2>
<p>If you did not request this, please contact your administrator immediately.</p>
<p>— Cethos Translation Services</p>`,
      }),
    });

    if (!brevoRes.ok) {
      const err = await brevoRes.text();
      throw new Error(`Email send failed: ${err}`);
    }

    return Response.json({ success: true, email: staff.email }, { headers: corsHeaders });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
});
