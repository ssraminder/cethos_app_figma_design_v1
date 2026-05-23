// =============================================================================
// rc-call-intelligence-report — Weekly AI-powered call analysis report.
//
// Two modes:
//   1. Cron (weekly): verifies x-cron-secret, analyzes last 7 days, emails report.
//   2. Manual: called from admin UI with custom date range.
//
// POST body (manual):
//   { period_start?: string, period_end?: string, created_by?: string }
//
// Required secrets: ANTHROPIC_API_KEY, BREVO_API_KEY
// =============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  corsHeaders,
  jsonResponse,
} from "../_shared/ringcentral.ts";
import { requireCronSecret } from "../_shared/require-cron-secret.ts";

const ADMIN_PORTAL_URL = Deno.env.get("ADMIN_PORTAL_URL") || "https://portal.cethos.com";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Determine mode: cron vs manual
    const hasCronSecret = !!req.headers.get("x-cron-secret");
    let isCron = false;
    let body: Record<string, unknown> = {};

    if (hasCronSecret) {
      const authed = await requireCronSecret(req);
      if (!authed.ok) {
        return jsonResponse(authed.status, { ok: false, error: authed.error });
      }
      isCron = true;
    } else {
      // Manual mode — parse body
      if (req.method === "POST") {
        try { body = await req.json(); } catch { /* empty ok */ }
      }
    }

    // ── Check if intelligence reports are enabled ─────────────────────
    const { data: enabledData } = await admin
      .from("app_settings")
      .select("setting_value")
      .eq("setting_key", "call_intelligence_enabled")
      .maybeSingle();
    const enabled = (enabledData?.setting_value ?? "true") === "true";

    if (isCron && !enabled) {
      return jsonResponse(200, { ok: true, skipped: true, reason: "call intelligence reports disabled" });
    }

    // ── Determine date range ──────────────────────────────────────────
    const now = new Date();
    let periodEnd: Date;
    let periodStart: Date;

    if (isCron) {
      periodEnd = now;
      periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      periodEnd = body.period_end ? new Date(body.period_end as string) : now;
      periodStart = body.period_start
        ? new Date(body.period_start as string)
        : new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    const createdBy = typeof body.created_by === "string" ? body.created_by : null;

    // ── Create report row ─────────────────────────────────────────────
    const { data: reportId, error: createErr } = await admin.rpc(
      "comms_create_intelligence_report",
      {
        p_period_start: periodStart.toISOString(),
        p_period_end: periodEnd.toISOString(),
        p_trigger_type: isCron ? "cron" : "manual",
        p_created_by: createdBy,
      },
    );

    if (createErr || !reportId) {
      return jsonResponse(500, { ok: false, error: "failed to create report row", detail: createErr?.message });
    }

    // ── Fetch transcribed calls ──────────────────────────────────────
    const { data: callsData, error: callsErr } = await admin.rpc(
      "comms_get_transcribed_calls_for_period",
      {
        p_start: periodStart.toISOString(),
        p_end: periodEnd.toISOString(),
      },
    );

    if (callsErr) {
      await admin.rpc("comms_update_intelligence_report", {
        p_id: reportId,
        p_status: "failed",
        p_error: `Failed to fetch calls: ${callsErr.message}`,
      });
      return jsonResponse(500, { ok: false, error: "failed to fetch calls", detail: callsErr.message });
    }

    const calls = (callsData ?? []) as CallRecord[];

    if (calls.length === 0) {
      await admin.rpc("comms_update_intelligence_report", {
        p_id: reportId,
        p_status: "completed",
        p_calls_analyzed: 0,
        p_report_json: { executive_summary: "No transcribed calls found for this period.", calls_analyzed: 0 },
      });
      return jsonResponse(200, { ok: true, report_id: reportId, calls_analyzed: 0, message: "no transcribed calls in period" });
    }

    // ── Build Claude prompt ──────────────────────────────────────────
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      await admin.rpc("comms_update_intelligence_report", {
        p_id: reportId,
        p_status: "failed",
        p_error: "ANTHROPIC_API_KEY not configured",
      });
      return jsonResponse(503, { ok: false, error: "ANTHROPIC_API_KEY not configured" });
    }

    const callSummaries = calls.map((c, i) => {
      const parts = [
        `Call #${i + 1}:`,
        `  Direction: ${c.direction}`,
        c.staff_name ? `  Staff: ${c.staff_name}` : null,
        c.customer_company ? `  Customer: ${c.customer_company}` : null,
        c.label_name ? `  Label: ${c.label_name}` : null,
        `  Duration: ${c.duration_sec ? Math.round(c.duration_sec / 60) + "m " + (c.duration_sec % 60) + "s" : "unknown"}`,
        `  Date: ${c.started_at}`,
        c.result ? `  Result: ${c.result}` : null,
        `  Summary: ${c.summary || "(no summary)"}`,
        `  Transcript excerpt: ${(c.transcript || "").substring(0, 1500)}${(c.transcript || "").length > 1500 ? "..." : ""}`,
      ];
      return parts.filter(Boolean).join("\n");
    }).join("\n\n---\n\n");

    const dateRange = `${formatDate(periodStart)} to ${formatDate(periodEnd)}`;

    const prompt = `You are a call center quality analyst for Cethos Translation Services, a professional translation and certification company. Analyze the following ${calls.length} call transcripts from the week of ${dateRange}.

Provide a structured JSON report with the following fields. Be specific, actionable, and reference actual call details where relevant.

Required JSON structure:
{
  "executive_summary": "2-3 paragraph overview of the week's call performance, key trends, and notable events",
  "quality_score": <number 1-10, overall call quality rating>,
  "calls_analyzed": ${calls.length},
  "avg_duration_sec": <average call duration in seconds>,
  "top_topics": [
    { "topic": "<topic name>", "count": <number of calls>, "sentiment": "positive|neutral|negative" }
  ],
  "sentiment_breakdown": {
    "positive": <count>,
    "neutral": <count>,
    "negative": <count>
  },
  "training_highlights": [
    {
      "type": "good_example" | "improvement",
      "staff_name": "<name or null>",
      "call_date": "<date>",
      "note": "<specific observation and what to learn from it>"
    }
  ],
  "staff_performance": [
    {
      "staff_name": "<name>",
      "calls": <count>,
      "avg_quality": <1-10>,
      "sentiment_positive": <count>,
      "sentiment_neutral": <count>,
      "sentiment_negative": <count>,
      "notes": "<brief performance notes>"
    }
  ],
  "action_items": [
    "<specific, actionable recommendation>"
  ],
  "customer_patterns": [
    {
      "pattern": "<description>",
      "frequency": <count>,
      "recommendation": "<what to do about it>"
    }
  ],
  "label_breakdown": [
    { "label": "<label name>", "count": <calls>, "avg_duration_sec": <seconds> }
  ]
}

Focus on:
- Identifying training opportunities (both good examples to replicate and areas needing improvement)
- Spotting customer service patterns that could be addressed proactively
- Providing actionable recommendations the team can implement this week
- Highlighting staff members who excelled or need coaching
- Detecting recurring customer issues that might indicate systemic problems

Respond ONLY with valid JSON. No markdown, no code fences, no explanation.

Call data:

${callSummaries}`;

    // ── Call Claude API ──────────────────────────────────────────────
    const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeResp.ok) {
      const errText = await claudeResp.text();
      console.error("Claude API error:", errText);
      await admin.rpc("comms_update_intelligence_report", {
        p_id: reportId,
        p_status: "failed",
        p_error: `Claude API error: ${claudeResp.status}`,
      });
      return jsonResponse(500, { ok: false, error: `Claude API error: ${claudeResp.status}`, detail: errText });
    }

    const claudeResult = await claudeResp.json();
    const rawText = claudeResult.content?.[0]?.text || "";

    // Parse JSON from Claude response
    let reportJson: Record<string, unknown>;
    try {
      // Strip potential markdown fences
      const cleaned = rawText.replace(/^```json?\s*/m, "").replace(/\s*```$/m, "").trim();
      reportJson = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("Failed to parse Claude JSON:", rawText.substring(0, 500));
      await admin.rpc("comms_update_intelligence_report", {
        p_id: reportId,
        p_status: "failed",
        p_error: "Failed to parse Claude response as JSON",
      });
      return jsonResponse(500, { ok: false, error: "Failed to parse Claude response" });
    }

    // ── Generate HTML email ──────────────────────────────────────────
    const reportHtml = generateEmailHtml(reportJson, dateRange, reportId as string);

    // ── Send email via Brevo ─────────────────────────────────────────
    const { data: recipData } = await admin
      .from("app_settings")
      .select("setting_value")
      .eq("setting_key", "call_intelligence_recipients")
      .maybeSingle();
    const recipientStr = recipData?.setting_value ?? "";
    const recipients = recipientStr
      .split(",")
      .map((e: string) => e.trim())
      .filter((e: string) => e.includes("@"));

    let emailedTo: string[] = [];

    if (recipients.length > 0) {
      const brevoKey = Deno.env.get("BREVO_API_KEY");
      if (brevoKey) {
        for (const email of recipients) {
          try {
            const emailResp = await fetch("https://api.brevo.com/v3/smtp/email", {
              method: "POST",
              headers: {
                "api-key": brevoKey,
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({
                to: [{ email }],
                sender: { name: "Cethos Call Intelligence", email: "donotreply@cethos.com" },
                subject: `Weekly Call Intelligence Report — ${dateRange}`,
                htmlContent: reportHtml,
              }),
            });
            if (emailResp.ok) {
              emailedTo.push(email);
            } else {
              console.error(`Brevo send failed for ${email}:`, await emailResp.text());
            }
          } catch (e) {
            console.error(`Email error for ${email}:`, e);
          }
        }
      } else {
        console.warn("BREVO_API_KEY not set — skipping email delivery");
      }
    }

    // ── Save completed report ────────────────────────────────────────
    await admin.rpc("comms_update_intelligence_report", {
      p_id: reportId,
      p_status: "completed",
      p_calls_analyzed: calls.length,
      p_report_json: reportJson,
      p_report_html: reportHtml,
      p_emailed_to: emailedTo,
    });

    return jsonResponse(200, {
      ok: true,
      report_id: reportId,
      calls_analyzed: calls.length,
      quality_score: reportJson.quality_score,
      emailed_to: emailedTo,
    });
  } catch (e) {
    console.error("rc-call-intelligence-report error:", e);
    return jsonResponse(500, { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

// ── Types ──────────────────────────────────────────────────────────────────────

interface CallRecord {
  id: string;
  direction: string;
  from_name: string | null;
  to_name: string | null;
  from_number: string | null;
  to_number: string | null;
  staff_user_id: string | null;
  staff_name: string | null;
  customer_id: string | null;
  customer_company: string | null;
  started_at: string;
  duration_sec: number | null;
  result: string | null;
  transcript: string | null;
  summary: string | null;
  label_id: string | null;
  label_name: string | null;
  label_color: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Email HTML generator ───────────────────────────────────────────────────────

function generateEmailHtml(
  report: Record<string, unknown>,
  dateRange: string,
  reportId: string,
): string {
  const qualityScore = Number(report.quality_score ?? 0);
  const callsAnalyzed = Number(report.calls_analyzed ?? 0);
  const sentiment = report.sentiment_breakdown as Record<string, number> | undefined;
  const topics = (report.top_topics as Array<{ topic: string; count: number }> | undefined) ?? [];
  const actions = (report.action_items as string[] | undefined) ?? [];
  const summary = String(report.executive_summary ?? "");

  const positiveCount = sentiment?.positive ?? 0;
  const neutralCount = sentiment?.neutral ?? 0;
  const negativeCount = sentiment?.negative ?? 0;
  const total = positiveCount + neutralCount + negativeCount || 1;
  const positivePct = Math.round((positiveCount / total) * 100);

  const topicsHtml = topics.slice(0, 6).map(t =>
    `<span style="display:inline-block;background:#eff6ff;color:#2563eb;padding:4px 12px;border-radius:16px;font-size:13px;margin:3px 4px 3px 0;">${escHtml(t.topic)} (${t.count})</span>`
  ).join("");

  const actionsHtml = actions.slice(0, 5).map((a, i) =>
    `<tr><td style="padding:8px 12px;color:#2563eb;font-weight:600;width:30px;vertical-align:top;">${i + 1}.</td><td style="padding:8px 0;font-size:14px;color:#374151;">${escHtml(a)}</td></tr>`
  ).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:640px;margin:0 auto;padding:24px;">

  <!-- Header -->
  <div style="background:#2563eb;border-radius:12px 12px 0 0;padding:24px 28px;color:white;">
    <h1 style="margin:0;font-size:20px;">Weekly Call Intelligence Report</h1>
    <p style="margin:6px 0 0;font-size:14px;opacity:0.85;">${escHtml(dateRange)}</p>
  </div>

  <div style="background:white;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:28px;">

    <!-- Stats -->
    <table style="width:100%;margin-bottom:24px;" cellpadding="0" cellspacing="0">
      <tr>
        <td style="text-align:center;padding:12px;">
          <div style="font-size:28px;font-weight:700;color:#2563eb;">${callsAnalyzed}</div>
          <div style="font-size:12px;color:#6b7280;text-transform:uppercase;">Calls Analyzed</div>
        </td>
        <td style="text-align:center;padding:12px;">
          <div style="font-size:28px;font-weight:700;color:${qualityScore >= 8 ? '#16a34a' : qualityScore >= 6 ? '#f59e0b' : '#ef4444'};">${qualityScore.toFixed(1)}</div>
          <div style="font-size:12px;color:#6b7280;text-transform:uppercase;">Quality Score</div>
        </td>
        <td style="text-align:center;padding:12px;">
          <div style="font-size:28px;font-weight:700;color:#16a34a;">${positivePct}%</div>
          <div style="font-size:12px;color:#6b7280;text-transform:uppercase;">Positive Sentiment</div>
        </td>
      </tr>
    </table>

    <!-- Summary -->
    <div style="font-size:14px;line-height:1.7;color:#374151;margin-bottom:24px;border-left:3px solid #2563eb;padding-left:16px;">
      ${escHtml(summary).replace(/\n/g, "<br/>")}
    </div>

    <!-- Topics -->
    ${topics.length > 0 ? `
    <div style="margin-bottom:24px;">
      <h3 style="font-size:14px;font-weight:600;color:#111827;margin:0 0 10px;">Top Topics</h3>
      <div>${topicsHtml}</div>
    </div>` : ""}

    <!-- Action Items -->
    ${actions.length > 0 ? `
    <div style="margin-bottom:24px;">
      <h3 style="font-size:14px;font-weight:600;color:#111827;margin:0 0 10px;">Action Items</h3>
      <table style="width:100%;" cellpadding="0" cellspacing="0">${actionsHtml}</table>
    </div>` : ""}

    <!-- CTA -->
    <div style="text-align:center;margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb;">
      <a href="${ADMIN_PORTAL_URL}/admin/call-intelligence" style="display:inline-block;background:#2563eb;color:white;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:500;text-decoration:none;">View Full Report</a>
    </div>
  </div>

  <p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:16px;">
    Cethos Call Intelligence &mdash; Generated automatically by AI analysis
  </p>
</div>
</body>
</html>`;
}
