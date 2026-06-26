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
    const { staff_user_id } = await req.json();
    if (!staff_user_id) throw new Error("staff_user_id required");

    const { data: staff, error } = await supabase
      .from("staff_users")
      .select("id, email, full_name, auth_user_id")
      .eq("id", staff_user_id)
      .single();
    if (error || !staff) throw new Error("Staff member not found");

    // Invite (or re-invite) the user via Supabase Auth admin
    const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
      staff.email,
      {
        data: { full_name: staff.full_name, staff_user_id: staff.id },
        redirectTo: `${Deno.env.get("SITE_URL") ?? "https://portal.cethos.com"}/admin/dashboard`,
      },
    );
    if (inviteErr) throw inviteErr;

    // Link auth_user_id back to staff_users if not already set
    if (invited?.user?.id && !staff.auth_user_id) {
      await supabase
        .from("staff_users")
        .update({ auth_user_id: invited.user.id })
        .eq("id", staff.id);
    }

    return Response.json({
      success: true,
      email: staff.email,
      auth_user_id: invited?.user?.id,
    }, { headers: corsHeaders });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
});
