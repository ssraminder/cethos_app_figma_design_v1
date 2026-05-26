// POST /functions/v1/transcription-stripe-webhook
// Stripe webhook for transcription payments.
// Primary event: checkout.session.completed with metadata.transcription_job_id.
// On payment success: marks job as paid, triggers processing.
// Deploy with --no-verify-jwt (Stripe sends raw POST, no Supabase auth).

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@13.3.0?target=deno";
import {
  jsonResponse,
  preflight,
  getServiceClient,
  auditLog,
} from "../_shared/transcription.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_TRANSCRIPTION_WEBHOOK_SECRET")
    ?? Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!stripeKey || !webhookSecret) {
    console.error("Missing STRIPE_SECRET_KEY or webhook secret");
    return jsonResponse({ error: "Not configured" }, 500);
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

  // ── Verify Stripe signature ──────────────────────────────────────────

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return jsonResponse({ error: "Missing stripe-signature" }, 400);
  }

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Webhook signature verification failed:", msg);
    return jsonResponse({ error: "Invalid signature" }, 400);
  }

  if (event.type !== "checkout.session.completed") {
    return jsonResponse({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const jobId = session.metadata?.transcription_job_id;

  if (!jobId) {
    return jsonResponse({ received: true });
  }

  try {
    const admin = getServiceClient();

    // ── Verify job exists and is pending payment ───────────────────────

    const { data: job, error: jobErr } = await admin
      .from("transcription_jobs")
      .select("id, status, payment_status, customer_email")
      .eq("id", jobId)
      .is("deleted_at", null)
      .maybeSingle();

    if (jobErr || !job) {
      console.error("Job not found:", jobId);
      return jsonResponse({ received: true });
    }

    if (job.payment_status === "paid") {
      return jsonResponse({ received: true, already_paid: true });
    }

    // ── Mark as paid and start processing ──────────────────────────────

    const { error: updateErr } = await admin
      .from("transcription_jobs")
      .update({
        payment_status: "paid",
        status: "processing",
        stripe_session_id: session.id,
      })
      .eq("id", jobId);

    if (updateErr) {
      console.error("Payment update failed:", updateErr);
      return jsonResponse({ error: "Update failed" }, 500);
    }

    await auditLog(admin, jobId, "payment_confirmed", "system", null, {
      stripe_session_id: session.id,
      amount: session.amount_total ? session.amount_total / 100 : null,
      currency: session.currency,
    });

    // ── Trigger processing ─────────────────────────────────────────────

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    fetch(`${supabaseUrl}/functions/v1/transcription-process`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ job_id: jobId }),
    }).catch((e) => console.error("Failed to trigger processing:", e));

    return jsonResponse({ received: true, job_id: jobId, status: "processing" });
  } catch (e) {
    console.error("transcription-stripe-webhook error:", e);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
