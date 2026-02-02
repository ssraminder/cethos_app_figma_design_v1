// supabase/functions/analyze-paystub/index.ts
// Analyzes uploaded paystub/remittance documents using Claude AI vision

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.24.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface OutstandingInvoice {
  id: string;
  invoice_number: string;
  amount: number;
  outstanding: number;
  due_date: string;
}

interface AnalyzePaystubRequest {
  fileBase64: string;
  fileName: string;
  mimeType: string;
  customerId?: string;
  outstandingInvoices?: OutstandingInvoice[];
}

interface PaystubExtraction {
  amount: number | null;
  payment_date: string | null;
  reference_number: string | null;
  payment_method: string | null;
  payer_name: string | null;
  invoice_numbers: string[];
  confidence: number;
  notes: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload: AnalyzePaystubRequest = await req.json();
    const { fileBase64, fileName, mimeType, outstandingInvoices } = payload;

    if (!fileBase64) {
      return new Response(
        JSON.stringify({ success: false, error: "No file provided" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicApiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Anthropic API key not configured",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const anthropic = new Anthropic({
      apiKey: anthropicApiKey,
    });

    // Build invoice context for AI
    const invoiceContext = outstandingInvoices?.length
      ? `Outstanding invoices for this customer:\n${outstandingInvoices
          .map(
            (inv) =>
              `- ${inv.invoice_number}: $${inv.outstanding.toFixed(2)} outstanding (total $${inv.amount.toFixed(2)}, due ${inv.due_date})`
          )
          .join("\n")}`
      : "No outstanding invoices provided for context.";

    // Determine media type
    let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" =
      "image/png";
    if (mimeType.includes("jpeg") || mimeType.includes("jpg")) {
      mediaType = "image/jpeg";
    } else if (mimeType.includes("png")) {
      mediaType = "image/png";
    } else if (mimeType.includes("gif")) {
      mediaType = "image/gif";
    } else if (mimeType.includes("webp")) {
      mediaType = "image/webp";
    }

    // For PDFs, we need to handle differently - Claude vision doesn't support PDF directly
    // In production, you'd want to use a PDF to image conversion service
    const isPdf = mimeType.includes("pdf");

    if (isPdf) {
      // For PDFs, we'll return a message that the file was recognized but needs manual processing
      // In a production system, you'd convert the PDF to images first
      console.log("PDF file detected - manual entry recommended");
      return new Response(
        JSON.stringify({
          success: true,
          extracted: {
            amount: null,
            payment_date: null,
            reference_number: null,
            payment_method: null,
            payer_name: null,
            invoice_numbers: [],
            confidence: 0,
            notes:
              "PDF detected. For best results, please upload an image (PNG/JPG) or enter details manually.",
          } as PaystubExtraction,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Analyzing paystub: ${fileName} (${mimeType})`);

    // Call Claude with vision
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: fileBase64,
              },
            },
            {
              type: "text",
              text: `You are analyzing a payment document (paystub, remittance advice, bank statement, check, or e-transfer confirmation) for CETHOS translation services.

Extract the following information from this document:
1. Payment amount (total amount being paid)
2. Payment date (when the payment was made or issued)
3. Reference number / Check number / Transaction ID / Confirmation number
4. Payment method (check, bank transfer, wire, ACH, Interac e-transfer, credit card)
5. Payer/Company name (who is making the payment)
6. Any invoice numbers or references mentioned (look for patterns like INV-YYYY-NNNNNN, or just invoice/reference numbers)

${invoiceContext}

Respond in JSON format ONLY (no other text):
{
  "amount": <number or null>,
  "payment_date": "<YYYY-MM-DD or null>",
  "reference_number": "<string or null>",
  "payment_method": "<string: 'check', 'etransfer', 'wire', 'ach', 'credit_card', 'bank_transfer', or null>",
  "payer_name": "<string or null>",
  "invoice_numbers": ["<list of invoice numbers found, even partial matches>"],
  "confidence": <0.0 to 1.0>,
  "notes": "<any relevant observations or issues>"
}

Rules:
- If you cannot find a field with certainty, set it to null
- Match invoice numbers to the outstanding invoices list when possible
- Confidence should reflect how clearly you can read and understand the document
- For amounts, extract the total payment amount, not individual line items
- Payment dates should be converted to YYYY-MM-DD format
- Include partial invoice number matches in invoice_numbers array
- Note any discrepancies or concerns in the notes field`,
            },
          ],
        },
      ],
    });

    // Parse response
    const responseText =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Try to extract JSON from the response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.error("Failed to parse AI response:", responseText);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to parse AI response",
          raw_response: responseText,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let extracted: PaystubExtraction;
    try {
      extracted = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid JSON in AI response",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Normalize and validate the extracted data
    const normalizedExtraction: PaystubExtraction = {
      amount:
        typeof extracted.amount === "number" && extracted.amount > 0
          ? extracted.amount
          : null,
      payment_date: extracted.payment_date || null,
      reference_number: extracted.reference_number || null,
      payment_method: extracted.payment_method || null,
      payer_name: extracted.payer_name || null,
      invoice_numbers: Array.isArray(extracted.invoice_numbers)
        ? extracted.invoice_numbers.filter(
            (n) => typeof n === "string" && n.length > 0
          )
        : [],
      confidence:
        typeof extracted.confidence === "number"
          ? Math.min(1, Math.max(0, extracted.confidence))
          : 0.5,
      notes: extracted.notes || null,
    };

    console.log("Paystub extraction result:", {
      amount: normalizedExtraction.amount,
      payment_date: normalizedExtraction.payment_date,
      reference_number: normalizedExtraction.reference_number,
      invoice_numbers: normalizedExtraction.invoice_numbers,
      confidence: normalizedExtraction.confidence,
    });

    return new Response(
      JSON.stringify({
        success: true,
        extracted: normalizedExtraction,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Paystub analysis error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
