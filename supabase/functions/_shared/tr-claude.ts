// Shared Claude API helper for tr-* edge functions.
// Wraps Anthropic Messages API with tool_use forcing for structured output,
// prompt caching on the system prefix, and audit-row writing.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { tr } from "./tr.ts";

export const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
export const CLAUDE_VERSION = "2023-06-01";

export type ToolDef = {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
};

export type ClaudeMessage = {
  role: "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
};

export type ClaudeCallArgs = {
  system: string;                       // cached prefix (methodology + locked decisions)
  messages: ClaudeMessage[];
  tools?: ToolDef[];
  tool_choice?: { type: "tool"; name: string } | { type: "auto" };
  model?: string;
  max_tokens?: number;
  temperature?: number;
  enable_prompt_cache?: boolean;
};

export type ClaudeResult = {
  ok: boolean;
  status: number;
  raw: unknown;
  tool_input?: Record<string, unknown>;
  text?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  error?: string;
};

export async function callClaude(args: ClaudeCallArgs): Promise<ClaudeResult> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return { ok: false, status: 500, raw: null, error: "ANTHROPIC_API_KEY not set" };

  const model = args.model ?? "claude-opus-4-7";
  const max_tokens = args.max_tokens ?? 8192;
  const temperature = args.temperature ?? 0;

  const body: Record<string, unknown> = {
    model,
    max_tokens,
    temperature,
    messages: args.messages,
  };
  if (args.enable_prompt_cache !== false) {
    body.system = [
      { type: "text", text: args.system, cache_control: { type: "ephemeral" } },
    ];
  } else {
    body.system = args.system;
  }
  if (args.tools) body.tools = args.tools;
  if (args.tool_choice) body.tool_choice = args.tool_choice;

  const res = await fetch(CLAUDE_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": CLAUDE_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = await res.json();
  if (!res.ok) {
    return { ok: false, status: res.status, raw, error: raw?.error?.message ?? `HTTP ${res.status}` };
  }

  // Extract tool_use content if a tool was forced
  let tool_input: Record<string, unknown> | undefined;
  let text: string | undefined;
  for (const block of (raw as { content?: Array<Record<string, unknown>> }).content ?? []) {
    if (block.type === "tool_use") tool_input = block.input as Record<string, unknown>;
    if (block.type === "text") text = (text ?? "") + (block.text as string);
  }
  const usage = (raw as { usage?: ClaudeResult["usage"] }).usage;

  return { ok: true, status: 200, raw, tool_input, text, usage };
}

export async function writeClaudeCallRow(
  sb: SupabaseClient,
  args: {
    job_id: string;
    call_kind: string;
    model: string;
    prompt_version: string;
    system_prompt: string;
    request_payload: Record<string, unknown>;
    result: ClaudeResult;
    latency_ms: number;
    outcome: string;
    error_text?: string | null;
    created_by?: string | null;
  },
): Promise<number | null> {
  const systemHashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(args.system_prompt));
  const systemHashHex = Array.from(new Uint8Array(systemHashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const { data, error } = await tr(sb)
    .from("claude_calls")
    .insert({
      job_id: args.job_id,
      call_kind: args.call_kind,
      model: args.model,
      prompt_version: args.prompt_version,
      system_prompt_hash: systemHashHex,
      request_jsonb: args.request_payload,
      response_jsonb: args.result.raw as Record<string, unknown>,
      input_tokens: args.result.usage?.input_tokens ?? null,
      output_tokens: args.result.usage?.output_tokens ?? null,
      cache_read_tokens: args.result.usage?.cache_read_input_tokens ?? null,
      cache_creation_tokens: args.result.usage?.cache_creation_input_tokens ?? null,
      latency_ms: args.latency_ms,
      outcome: args.outcome,
      error_text: args.error_text ?? null,
      created_by: args.created_by ?? null,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[tr-claude] writeClaudeCallRow error:", error);
    return null;
  }
  return data?.id ?? null;
}
