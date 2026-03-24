// ============================================================================
// vendor-invitation-reminder v1.0
// Cron-triggered: sends graduated reminders to vendors who haven't accepted
// Schedule: daily at 10 AM UTC via pg_cron
// Reminder schedule (days after original invite): 3, 7, 15, 21, 30, then monthly
// Date: March 24, 2026
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const JSON_HEADERS = { ...CORS_HEADERS, "Content-Type": "application/json" };

// Graduated reminder schedule: days after original invitation
const REMINDER_SCHEDULE_DAYS = [3, 7, 15, 21, 30];
const MONTHLY_INTERVAL = 30; // after day 30, send every 30 days

function getNextReminderDay(remindersSent: number): number {
  if (remindersSent < REMINDER_SCHEDULE_DAYS.length) {
    return REMINDER_SCHEDULE_DAYS[remindersSent];
  }
  // Monthly after the schedule is exhausted
  const monthsAfterSchedule = remindersSent - REMINDER_SCHEDULE_DAYS.length + 1;
  return 30 + monthsAfterSchedule * MONTHLY_INTERVAL;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const OTP_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/vendor-auth-otp-send`;

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Fetch vendors who have been invited but haven't accepted
    const { data: pendingVendors, error: fetchError } = await supabaseAdmin
      .from("vendors")
      .select("id, email, full_name, invitation_sent_at, invitation_reminder_count")
      .not("invitation_sent_at", "is", null)
      .is("auth_user_id", null)
      .order("invitation_sent_at", { ascending: true });

    if (fetchError) {
      throw new Error(`Failed to fetch vendors: ${fetchError.message}`);
    }

    if (!pendingVendors || pendingVendors.length === 0) {
      console.log("No pending vendor invitations to remind.");
      return new Response(
        JSON.stringify({ success: true, reminded: 0, skipped: 0 }),
        { headers: JSON_HEADERS },
      );
    }

    const now = Date.now();
    let reminded = 0;
    let skipped = 0;

    for (const vendor of pendingVendors) {
      const invitedAt = new Date(vendor.invitation_sent_at).getTime();
      const daysSinceInvite = (now - invitedAt) / (1000 * 60 * 60 * 24);
      const remindersSent = vendor.invitation_reminder_count ?? 0;
      const nextReminderDay = getNextReminderDay(remindersSent);

      if (daysSinceInvite < nextReminderDay) {
        skipped++;
        continue;
      }

      // Call vendor-auth-otp-send in reminder mode
      try {
        const response = await fetch(OTP_FUNCTION_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            email: vendor.email,
            is_reminder: true,
          }),
        });

        if (response.ok) {
          // Update reminder tracking
          await supabaseAdmin
            .from("vendors")
            .update({
              last_reminder_sent_at: new Date().toISOString(),
              invitation_reminder_count: remindersSent + 1,
            })
            .eq("id", vendor.id);

          reminded++;
          console.log(
            `Reminder #${remindersSent + 1} sent to ${vendor.email} (day ${Math.floor(daysSinceInvite)})`,
          );
        } else {
          const errText = await response.text();
          console.error(`Failed to remind ${vendor.email}: ${errText}`);
          skipped++;
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`Error reminding ${vendor.email}: ${message}`);
        skipped++;
      }
    }

    console.log(
      `Vendor invitation reminders complete: ${reminded} reminded, ${skipped} skipped`,
    );

    return new Response(
      JSON.stringify({ success: true, reminded, skipped }),
      { headers: JSON_HEADERS },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("vendor-invitation-reminder error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: JSON_HEADERS },
    );
  }
});
