// POST /functions/v1/transcription-upload
// Multipart form: file (audio/video), session_token, duration_seconds,
//   source_language (optional ISO code), translation_target (optional ISO code),
//   delivery_formats (optional comma-separated: txt,docx,pdf)
//
// For free tier: validates 1-min cap + daily limit, then triggers processing.
// For paid tier (duration > free max): creates Stripe Checkout session, returns URL.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  jsonResponse,
  preflight,
  getServiceClient,
  verifySessionToken,
  getTranscriptionSettings,
  isAssemblyAiSupported,
  auditLog,
} from "../_shared/transcription.ts";

const ALLOWED_FORMATS = new Set([
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav",
  "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/aac",
  "audio/ogg", "audio/flac", "audio/webm",
  "video/mp4", "video/quicktime", "video/webm",
  "application/octet-stream",
]);

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const sessionToken = formData.get("session_token") as string | null;
    const durationStr = formData.get("duration_seconds") as string | null;
    const sourceLang = formData.get("source_language") as string | null;
    const translationTarget = formData.get("translation_target") as string | null;
    const deliveryFormatsStr = formData.get("delivery_formats") as string | null;

    // ── Validate session ──────────────────────────────────────────────────

    if (!sessionToken) {
      return jsonResponse({ success: false, error: "Session token required" }, 401);
    }

    const session = await verifySessionToken(sessionToken);
    if (!session) {
      return jsonResponse({ success: false, error: "Invalid or expired session" }, 401);
    }

    // ── Validate file ─────────────────────────────────────────────────────

    if (!file || file.size === 0) {
      return jsonResponse({ success: false, error: "File required" }, 400);
    }

    if (file.size > MAX_FILE_SIZE) {
      return jsonResponse(
        { success: false, error: `File too large. Max ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        400,
      );
    }

    if (!ALLOWED_FORMATS.has(file.type) && !file.name.match(/\.(mp3|wav|m4a|mp4|mov|webm|ogg|flac|aac)$/i)) {
      return jsonResponse(
        { success: false, error: "Unsupported file format" },
        400,
      );
    }

    const durationSeconds = parseFloat(durationStr ?? "0");
    if (!durationSeconds || durationSeconds <= 0) {
      return jsonResponse(
        { success: false, error: "Valid duration_seconds required" },
        400,
      );
    }

    // ── Load settings ─────────────────────────────────────────────────────

    const admin = getServiceClient();
    const settings = await getTranscriptionSettings(admin);

    if (settings.transcription_enabled !== "true") {
      return jsonResponse(
        { success: false, error: "Transcription service is currently unavailable" },
        503,
      );
    }

    const freeMaxSeconds = parseInt(settings.transcription_free_tier_max_seconds ?? "60", 10);
    const dailyLimit = parseInt(settings.transcription_free_tier_daily_limit ?? "5", 10);
    const pricePerMinute = parseFloat(settings.transcription_price_per_minute ?? "0.15");
    const aiTranslationPrice = parseFloat(settings.transcription_ai_translation_price ?? "0.25");
    const freeExpiryDays = parseInt(settings.transcription_free_expiry_days ?? "7", 10);
    const paidExpiryDays = parseInt(settings.transcription_paid_expiry_days ?? "30", 10);

    // ── Determine tier ────────────────────────────────────────────────────

    const isFree = durationSeconds <= freeMaxSeconds;
    const email = session.email;

    if (isFree) {
      // Check daily usage
      const today = new Date().toISOString().split("T")[0];
      const { data: usageRow } = await admin
        .from("transcription_email_usage")
        .select("id, usage_count")
        .eq("email", email)
        .eq("usage_date", today)
        .maybeSingle();

      const usedToday = usageRow?.usage_count ?? 0;
      if (usedToday >= dailyLimit) {
        return jsonResponse({
          success: false,
          error: `Daily free limit reached (${dailyLimit}/day). Upgrade to paid for unlimited transcription.`,
          free_remaining: 0,
          pricing: {
            price_per_minute: pricePerMinute,
            estimated_cost: Math.ceil(durationSeconds / 60) * pricePerMinute,
          },
        }, 429);
      }

      // Increment usage
      if (usageRow) {
        await admin
          .from("transcription_email_usage")
          .update({ usage_count: usedToday + 1 })
          .eq("id", usageRow.id);
      } else {
        await admin
          .from("transcription_email_usage")
          .insert({ email, usage_date: today, usage_count: 1 });
      }
    }

    // ── Determine provider ────────────────────────────────────────────────

    const primaryProvider = settings.transcription_primary_provider ?? "assemblyai";
    const fallbackProvider = settings.transcription_fallback_provider ?? "openai";
    const langCode = sourceLang?.toLowerCase().split("-")[0] ?? "";

    let provider = primaryProvider;
    if (primaryProvider === "assemblyai" && langCode && !isAssemblyAiSupported(langCode)) {
      provider = fallbackProvider;
    }

    // ── Delivery formats ──────────────────────────────────────────────────

    const validFormats = new Set(["txt", "docx", "pdf"]);
    const deliveryFormats = deliveryFormatsStr
      ? deliveryFormatsStr.split(",").map(f => f.trim()).filter(f => validFormats.has(f))
      : ["txt"];
    if (deliveryFormats.length === 0) deliveryFormats.push("txt");

    // ── Upload file to storage ────────────────────────────────────────────

    const jobId = crypto.randomUUID();
    const ext = file.name.split(".").pop() ?? "mp3";
    const storagePath = `${jobId}/source/audio.${ext}`;

    const fileBuffer = await file.arrayBuffer();
    const { error: uploadErr } = await admin.storage
      .from("transcription-uploads")
      .upload(storagePath, fileBuffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadErr) {
      console.error("Storage upload failed:", uploadErr);
      return jsonResponse({ success: false, error: "File upload failed" }, 500);
    }

    // ── Calculate pricing ─────────────────────────────────────────────────

    const durationMinutes = Math.ceil(durationSeconds / 60);
    let amountCharged = 0;
    let translationRequested = false;
    let translationType: string | null = null;

    if (!isFree) {
      amountCharged = durationMinutes * pricePerMinute;
      if (translationTarget) {
        translationRequested = true;
        translationType = "ai_instant";
        amountCharged += durationMinutes * aiTranslationPrice;
      }
    } else if (translationTarget) {
      // Free tier with translation — charge only for translation
      translationRequested = true;
      translationType = "ai_instant";
      amountCharged = durationMinutes * aiTranslationPrice;
    }

    // ── Resolve source language to language_id ────────────────────────────

    let sourceLanguageId: string | null = null;
    if (sourceLang) {
      const { data: langRow } = await admin
        .from("languages")
        .select("id")
        .or(`code.eq.${sourceLang},code.eq.${sourceLang}`)
        .limit(1)
        .maybeSingle();
      sourceLanguageId = langRow?.id ?? null;
    }

    let translationTargetLanguageId: string | null = null;
    if (translationTarget) {
      const { data: langRow } = await admin
        .from("languages")
        .select("id")
        .or(`code.eq.${translationTarget},code.eq.${translationTarget}`)
        .limit(1)
        .maybeSingle();
      translationTargetLanguageId = langRow?.id ?? null;
    }

    // ── Determine expiry ──────────────────────────────────────────────────

    const expiryDays = isFree && amountCharged === 0 ? freeExpiryDays : paidExpiryDays;
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();

    // ── Create job record ─────────────────────────────────────────────────

    const needsPayment = amountCharged > 0;

    const { error: jobErr } = await admin
      .from("transcription_jobs")
      .insert({
        id: jobId,
        customer_email: email,
        file_path: storagePath,
        file_name: file.name,
        file_duration_seconds: durationSeconds,
        file_size_bytes: file.size,
        file_format: ext,
        status: needsPayment ? "pending" : "processing",
        provider,
        pricing_tier: isFree && amountCharged === 0 ? "free" : "standard",
        amount_charged: Math.round(amountCharged * 100) / 100,
        payment_status: needsPayment ? "pending" : "none",
        source_language_id: sourceLanguageId,
        translation_requested: translationRequested,
        translation_type: translationType,
        translation_target_language_id: translationTargetLanguageId,
        delivery_formats: deliveryFormats,
        expires_at: expiresAt,
      });

    if (jobErr) {
      console.error("Job insert failed:", jobErr);
      await admin.storage.from("transcription-uploads").remove([storagePath]);
      return jsonResponse({ success: false, error: "Failed to create job" }, 500);
    }

    await auditLog(admin, jobId, "job_created", "customer", email, {
      tier: isFree && amountCharged === 0 ? "free" : "standard",
      duration_seconds: durationSeconds,
      provider,
      translation: translationRequested,
    });

    // ── If needs payment, create Stripe checkout ──────────────────────────

    if (needsPayment) {
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (!stripeKey) {
        return jsonResponse({
          success: false,
          error: "Payment processing unavailable",
        }, 503);
      }

      const lineItems: Array<{ price_data: Record<string, unknown>; quantity: number }> = [];

      if (!isFree) {
        lineItems.push({
          price_data: {
            currency: "cad",
            unit_amount: Math.round(pricePerMinute * 100),
            product_data: {
              name: "AI Transcription",
              description: `${durationMinutes} min × $${pricePerMinute.toFixed(2)}/min`,
            },
          },
          quantity: durationMinutes,
        });
      }

      if (translationRequested) {
        lineItems.push({
          price_data: {
            currency: "cad",
            unit_amount: Math.round(aiTranslationPrice * 100),
            product_data: {
              name: "AI Translation",
              description: `${durationMinutes} min × $${aiTranslationPrice.toFixed(2)}/min`,
            },
          },
          quantity: durationMinutes,
        });
      }

      const mainWebUrl = Deno.env.get("MAIN_WEB_URL") ?? "https://cethos.com";

      const checkoutResp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          "mode": "payment",
          "customer_email": email,
          "metadata[transcription_job_id]": jobId,
          "success_url": `${mainWebUrl}/services/transcription?job=${jobId}&status=success`,
          "cancel_url": `${mainWebUrl}/services/transcription?job=${jobId}&status=cancelled`,
          ...Object.fromEntries(
            lineItems.flatMap((item, i) => [
              [`line_items[${i}][price_data][currency]`, "cad"],
              [`line_items[${i}][price_data][unit_amount]`, String(item.price_data.unit_amount)],
              [`line_items[${i}][price_data][product_data][name]`, String(item.price_data.product_data.name)],
              [`line_items[${i}][price_data][product_data][description]`, String(item.price_data.product_data.description)],
              [`line_items[${i}][quantity]`, String(item.quantity)],
            ]),
          ),
        }),
      });

      if (!checkoutResp.ok) {
        const errText = await checkoutResp.text();
        console.error("Stripe checkout creation failed:", errText);
        return jsonResponse({ success: false, error: "Payment setup failed" }, 500);
      }

      const checkoutSession = await checkoutResp.json();

      await admin
        .from("transcription_jobs")
        .update({ stripe_session_id: checkoutSession.id })
        .eq("id", jobId);

      return jsonResponse({
        success: true,
        job_id: jobId,
        requires_payment: true,
        checkout_url: checkoutSession.url,
        amount: Math.round(amountCharged * 100) / 100,
        currency: "CAD",
      });
    }

    // ── Free tier: trigger processing immediately ─────────────────────────

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Fire-and-forget to transcription-process
    fetch(`${supabaseUrl}/functions/v1/transcription-process`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ job_id: jobId }),
    }).catch((e) => console.error("Failed to trigger processing:", e));

    return jsonResponse({
      success: true,
      job_id: jobId,
      requires_payment: false,
      status: "processing",
    });
  } catch (e) {
    console.error("transcription-upload error:", e);
    return jsonResponse({ success: false, error: "Internal error" }, 500);
  }
});
