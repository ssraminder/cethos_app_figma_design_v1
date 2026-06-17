/**
 * Shared helpers for staff-decision processing on cvp_applications.
 *
 * Every approve / reject / waitlist / request_info action captures the staff
 * member's raw notes, optionally runs them through Claude to produce an
 * applicant-facing message, and writes the full audit trail to
 * cvp_application_decisions for the learning loop.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { MODEL_QUALITY } from "./ai-models.ts";

// Decision-AI rewrites are high-stakes (reject reasons, waitlist copy, info
// requests all go to applicants, and reference-email drafts / response
// analysis sit at the same quality bar). Use the Opus-tier model.
const ANTHROPIC_MODEL = MODEL_QUALITY;

export type DecisionAction =
  | "approved"
  | "rejected"
  | "waitlisted"
  | "info_requested"
  | "prescreen_advanced"
  | "prescreen_manual_review"
  | "prescreen_silent";

export interface ClaudeRewriteOptions {
  /**
   * The system prompt that frames Claude's task. Will receive the staff notes
   * and any context as the user message.
   */
  systemPrompt: string;
  /** User message — typically the raw staff notes plus context. */
  userMessage: string;
  maxTokens?: number;
}

export interface RewriteResult {
  ok: boolean;
  text: string | null;
  error: string | null;
}

/**
 * Call Claude to rewrite/process a staff note into applicant-facing copy.
 * Non-throwing — returns ok=false + error string on any failure so callers
 * can fall back to the raw staff notes.
 */
export async function claudeRewrite(
  options: ClaudeRewriteOptions,
): Promise<RewriteResult> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return { ok: false, text: null, error: "ANTHROPIC_API_KEY not configured" };
  }
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: options.maxTokens ?? 800,
        system: options.systemPrompt,
        messages: [{ role: "user", content: options.userMessage }],
      }),
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      return {
        ok: false,
        text: null,
        error: `Claude ${resp.status}: ${errBody.slice(0, 400)}`,
      };
    }
    const json = (await resp.json()) as {
      content: { type: string; text?: string }[];
    };
    const text =
      json.content?.find((b) => b.type === "text")?.text?.trim() ?? "";
    if (!text) {
      return { ok: false, text: null, error: "Empty Claude response" };
    }
    return { ok: true, text, error: null };
  } catch (err) {
    return {
      ok: false,
      text: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface LogDecisionInput {
  supabase: SupabaseClient;
  applicationId: string;
  action: DecisionAction;
  staffNotes: string | null;
  aiInputPrompt: string | null;
  aiOutput: string | null;
  aiError: string | null;
  messageSentSubject: string | null;
  messageSentBody: string | null;
  staffUserId?: string | null;
}

/**
 * Write a row to cvp_application_decisions. Best-effort: errors are logged
 * but never block the calling flow.
 */
export async function logDecision(input: LogDecisionInput): Promise<void> {
  const aiProcessed =
    Boolean(input.aiInputPrompt) || Boolean(input.aiOutput) || Boolean(input.aiError);
  const { error } = await input.supabase
    .from("cvp_application_decisions")
    .insert({
      application_id: input.applicationId,
      action: input.action,
      staff_notes: input.staffNotes,
      ai_processed: aiProcessed,
      ai_input_prompt: input.aiInputPrompt,
      ai_output: input.aiOutput,
      ai_model: aiProcessed ? ANTHROPIC_MODEL : null,
      ai_error: input.aiError,
      message_sent_subject: input.messageSentSubject,
      message_sent_body: input.messageSentBody,
      staff_user_id: input.staffUserId ?? null,
    });
  if (error) {
    console.error(
      `Failed to log decision (${input.action}) for ${input.applicationId}:`,
      error.message,
    );
  }
}

// ---------- System prompts ----------

export const REJECT_REASON_SYSTEM_PROMPT = `You are a recruitment writer for CETHOS, a Canadian certified-translation company.

You will receive raw internal staff notes explaining why an applicant is being rejected. Your job is to produce ONE polite, professional, applicant-facing sentence (or two short sentences max) that summarises the reason without:
- Insulting the applicant
- Revealing internal jargon, scoring numbers, AI flags, or staff-only language
- Making promises about future opportunities
- Listing specific deficiencies that the applicant could "fix" and re-submit a flood of follow-ups about

Tone: respectful, neutral, brief. Output the text only — no preamble, no quotes, no bullets, no markdown. Plain prose.

If the staff notes are empty or non-substantive, output exactly:
"After reviewing the materials submitted, our team has decided not to proceed at this time."`;

export const REQUEST_INFO_SYSTEM_PROMPT = `You are a recruitment writer for CETHOS, a Canadian certified-translation company.

You will receive raw internal staff notes describing what additional information is needed from an applicant before their application can move forward. Your job is to produce 1–3 short, polite, applicant-facing sentences (max ~80 words) that:
- Make the request clear and specific
- Use plain language (no internal jargon, no "we need you to provide…" stuffiness)
- Do NOT reveal AI scoring, internal flags, or staff-only context
- Do NOT include a salutation or signoff (the email template wraps it)
- End with what the applicant should do next (reply with X, attach Y, etc.)

Output the text only — no preamble, no quotes. Plain prose paragraphs separated by blank lines if needed.

If the staff notes are empty or non-substantive, output exactly:
"Could you reply to this email with any additional information that supports your application — recent samples, references, or updated certifications? It will help us move your application forward."`;

export const WAITLIST_NOTE_SYSTEM_PROMPT = `You are a recruitment writer for CETHOS, a Canadian certified-translation company.

You will receive raw internal staff notes about why an applicant is being placed on the waitlist (rather than rejected or moved forward). Produce 1–2 short, polite, applicant-facing sentences (max ~50 words) that explain the situation in plain language without:
- Internal jargon, AI scores, or staff-only context
- Hard promises about timing
- Implying the applicant did anything wrong

Output the text only — no preamble, no quotes, no salutation/signoff (the template wraps it).

If the staff notes are empty or non-substantive, output an empty string (the template will fall back to its default copy).`;

export const APPROVE_NOTE_SYSTEM_PROMPT = `You are a recruitment writer for CETHOS, a Canadian certified-translation company.

You will receive raw internal staff notes about an approved applicant — sometimes a personal welcome line, sometimes a heads-up about specific strengths or onboarding context the applicant should know.

Produce 1–2 short, warm, applicant-facing sentences (max ~50 words) that share the relevant context in plain language. No internal jargon, no scoring numbers. No salutation/signoff (template wraps it). If notes are empty or purely internal-only ("approved per X review"), output an empty string.

Output the text only — no preamble, no quotes.`;
