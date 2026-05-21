// ============================================================================
// ai-paystub-allocate
//
// Accepts a paystub (PDF or image, base64-encoded) plus the customer + payment
// context, asks Claude Haiku to extract invoice-number / amount pairs (plus
// the document total), then matches each extracted invoice number against the
// customer's currently-unpaid invoices. Returns the matched set keyed by
// portal invoice id, plus unmatched invoice numbers and the paystub total so
// the UI can warn if it doesn't equal the payment amount.
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.27.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jr(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

const UNPAID_STATUSES = ["issued", "sent", "overdue", "partially_paid"];

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jr({ error: "Missing Supabase configuration" }, 500);
  }
  if (!ANTHROPIC_API_KEY) return jr({ error: "ANTHROPIC_API_KEY not set" }, 500);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return jr({ error: "Invalid JSON" }, 400); }

  const customerId = body.customer_id as string;
  const paymentAmount = Number(body.payment_amount || 0);
  const currency = (body.currency as string) || "CAD";
  const paystubB64 = body.paystub_base64 as string;
  const paystubMime = (body.paystub_mime_type as string) || "application/pdf";
  if (!customerId || !paystubB64) {
    return jr({ error: "customer_id + paystub_base64 required" }, 400);
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Pull this customer's unpaid invoices to ground the match.
  const unpaid: { id: string; invoice_number: string | null; balance_due: number; currency: string | null }[] = [];
  {
    let from = 0; const PAGE = 1000;
    while (true) {
      const { data, error } = await sb
        .from("customer_invoices")
        .select("id, invoice_number, balance_due, currency, voided_at, status")
        .eq("customer_id", customerId)
        .is("voided_at", null)
        .in("status", UNPAID_STATUSES)
        .gt("balance_due", 0)
        .range(from, from + PAGE - 1);
      if (error) return jr({ error: error.message }, 500);
      if (!data || data.length === 0) break;
      unpaid.push(...(data as any));
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }

  if (unpaid.length === 0) {
    return jr({ matches: [], unmatched: [], total_in_paystub: 0, message: "No unpaid invoices for this customer." });
  }

  // Build the lookup. Normalize invoice numbers for fuzzy matching: strip
  // whitespace + dashes, lowercase.
  const norm = (s: string | null | undefined) =>
    (s ?? "").toString().toLowerCase().replace(/[\s\-_]/g, "");
  const byNorm = new Map<string, typeof unpaid[number]>();
  for (const inv of unpaid) {
    const k = norm(inv.invoice_number);
    if (k) byNorm.set(k, inv);
  }

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const userPrompt = `You are reading a vendor remittance / paystub document. The customer is paying invoices issued by us (CETHOS).

PAYMENT CONTEXT
- Customer ID: ${customerId}
- Payment amount: ${paymentAmount.toFixed(2)} ${currency}

Outstanding invoices for this customer (you MUST only match against this list):
${unpaid
  .slice(0, 400) // cap prompt size; if more, model can still match exact numbers via fallback
  .map((i) => `- ${i.invoice_number}  ${Number(i.balance_due).toFixed(2)} ${i.currency || currency}`)
  .join("\n")}

Look at the paystub image/PDF and extract the line items. Return ONLY a JSON object with this shape:

{
  "lines": [
    { "invoice_number": "<exact number as printed>", "amount": <number> }
  ],
  "total": <number>,
  "notes": "<one-line explanation, e.g. 'Cheque #1234 listing 5 invoices'>"
}

Rules:
- "amount" is the amount the customer is paying THIS invoice (not the invoice total). For partial payments, use the amount on the paystub line.
- "total" is the document's stated total. If absent, sum the lines.
- Match invoice numbers exactly as shown on the paystub. We will fuzzy-match on our side.
- Return JSON only — no commentary outside the JSON.`;

  let extracted: { lines: { invoice_number: string; amount: number }[]; total: number; notes?: string } | null = null;
  try {
    const isPdf = paystubMime === "application/pdf";
    const content: Anthropic.MessageCreateParams["messages"][0]["content"] = [
      isPdf
        ? {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: paystubB64 },
          }
        : {
            type: "image",
            source: { type: "base64", media_type: paystubMime as any, data: paystubB64 },
          },
      { type: "text", text: userPrompt },
    ];
    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [{ role: "user", content }],
    });
    const text = res.content
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in model response");
    extracted = JSON.parse(match[0]);
  } catch (err: any) {
    return jr({ error: `Haiku call failed: ${err?.message || err}` }, 500);
  }

  if (!extracted || !Array.isArray(extracted.lines)) {
    return jr({ error: "Model returned invalid structure" }, 500);
  }

  // Match each extracted invoice number to a portal invoice.
  const matches: { invoice_id: string; invoice_number: string; amount: number }[] = [];
  const unmatched: string[] = [];
  for (const line of extracted.lines) {
    const k = norm(line.invoice_number);
    if (!k) { unmatched.push(line.invoice_number); continue; }
    const inv = byNorm.get(k);
    if (inv) {
      matches.push({
        invoice_id: inv.id,
        invoice_number: inv.invoice_number || "",
        amount: Math.min(Number(line.amount || 0), Number(inv.balance_due)),
      });
    } else {
      // Try a contains-match as fallback (handles prefix differences)
      let found: typeof unpaid[number] | undefined;
      for (const [normKey, candidate] of byNorm.entries()) {
        if (normKey.includes(k) || k.includes(normKey)) { found = candidate; break; }
      }
      if (found) {
        matches.push({
          invoice_id: found.id,
          invoice_number: found.invoice_number || "",
          amount: Math.min(Number(line.amount || 0), Number(found.balance_due)),
        });
      } else {
        unmatched.push(line.invoice_number);
      }
    }
  }

  const sumMatched = matches.reduce((s, m) => s + m.amount, 0);

  return jr({
    matches,
    unmatched,
    total_in_paystub: Number(extracted.total ?? 0),
    matched_sum: sumMatched,
    payment_amount: paymentAmount,
    sum_matches_payment: Math.abs(sumMatched - paymentAmount) < 0.01,
    sum_matches_paystub_total: Math.abs(sumMatched - Number(extracted.total ?? 0)) < 0.01,
    notes: extracted.notes ?? null,
  });
});
