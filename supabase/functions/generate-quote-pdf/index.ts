// generate-quote-pdf
//
// POST { quote_id }  → returns PDF bytes (application/pdf)
// GET  ?quote_id=…   → same
//
// On-demand: nothing is stored. The PDF is built fresh from the latest
// quote/analysis/adjustments rows so totals always match what the customer
// sees in the portal. Layout mirrors the invoice PDF's branded header
// (CETHOS blue bar) for visual consistency.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "content-disposition",
};

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// CETHOS brand palette (from tailwind.config.ts).
const CETHOS_NAVY = rgb(0x0c / 255, 0x23 / 255, 0x40 / 255); // #0C2340
const CETHOS_TEAL = rgb(0x08 / 255, 0x91 / 255, 0xb2 / 255); // #0891B2
const CETHOS_TEAL_LIGHT = rgb(0xec / 255, 0xfe / 255, 0xff / 255); // #ECFEFF
const TEXT_DARK = rgb(0x1f / 255, 0x29 / 255, 0x37 / 255); // slate-800
const TEXT_MUTED = rgb(0x64 / 255, 0x74 / 255, 0x8b / 255); // #64748B
const TABLE_HEADER_BG = rgb(0xf8 / 255, 0xfa / 255, 0xfc / 255); // slate-50
const TABLE_BORDER = rgb(0xe5 / 255, 0xe7 / 255, 0xeb / 255); // #E5E7EB
const WHITE = rgb(1, 1, 1);

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 50;
const HEADER_H = 90;

function unitLabel(unit: string | null, qty: number): string {
  if (!unit) return qty === 1 ? "page" : "pages";
  const map: Record<string, [string, string]> = {
    per_page: ["page", "pages"],
    per_word: ["word", "words"],
    per_hour: ["hour", "hours"],
    per_minute: ["min", "min"],
    flat: ["flat", "flat"],
  };
  const [s, p] = map[unit] ?? ["unit", "units"];
  return qty === 1 ? s : p;
}

function money(n: number | null | undefined, currency = "CAD"): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
  }).format(Number(n ?? 0));
}

function safeText(s: unknown): string {
  return String(s ?? "")
    .replace(/[‘’‚‛]/g, "\'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[→➔➜➤]/g, "->")
    .replace(/[←]/g, "<-")
    .replace(/[…]/g, "...")
    .replace(/[  -​  　]/g, " ")
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "")
    .slice(0, 500);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonError("Missing Supabase configuration", 500);
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let quoteId: string | null = null;
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      quoteId = body?.quote_id ?? body?.quoteId ?? null;
    } else {
      quoteId = new URL(req.url).searchParams.get("quote_id");
    }

    if (!quoteId || typeof quoteId !== "string") {
      return jsonError("quote_id is required", 400);
    }

    const [quoteRes, analysisRes, adjustmentsRes] = await Promise.all([
      supabase
        .from("quotes")
        .select(
          `
          id, quote_number, status, currency, subtotal, certification_total,
          rush_fee, delivery_fee, tax_rate, tax_amount, total, discount_total,
          surcharge_total, calculated_totals, is_rush, turnaround_type,
          estimated_delivery_date, promised_delivery_date,
          promised_delivery_date_rush, expires_at, special_instructions,
          created_at,
          customer:customers(id, full_name, email, phone, company_name),
          source_language:languages!quotes_source_language_id_fkey(name, code),
          target_language:languages!quotes_target_language_id_fkey(name, code),
          intended_use:intended_uses(name)
        `,
        )
        .eq("id", quoteId)
        .maybeSingle(),
      supabase
        .from("ai_analysis_results")
        .select(
          "id, manual_filename, detected_document_type, document_type_other, " +
            "word_count, page_count, billable_pages, base_rate, line_total, " +
            "calculation_unit, unit_quantity, certification_price, quote_file_id",
        )
        .eq("quote_id", quoteId)
        .is("deleted_at", null),
      supabase
        .from("quote_adjustments")
        .select(
          "id, adjustment_type, value_type, value, calculated_amount, reason",
        )
        .eq("quote_id", quoteId)
        .order("created_at"),
    ]);

    if (quoteRes.error) return jsonError(quoteRes.error.message, 500);
    if (!quoteRes.data) return jsonError("Quote not found", 404);

    const quote = quoteRes.data as any;
    const analysis = (analysisRes.data ?? []) as any[];
    const adjustments = (adjustmentsRes.data ?? []) as any[];
    const customer = quote.customer ?? {};
    const sourceLang = quote.source_language ?? {};
    const targetLang = quote.target_language ?? {};
    const intendedUse = quote.intended_use ?? {};
    const currency = quote.currency ?? "CAD";

    // ────────────────────────────────────────────────────────────────────
    // Build PDF
    // ────────────────────────────────────────────────────────────────────
    const pdf = await PDFDocument.create();
    let page = pdf.addPage([PAGE_W, PAGE_H]);
    const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const draw = (
      text: string,
      x: number,
      y: number,
      opts: {
        size?: number;
        font?: typeof fontRegular;
        color?: ReturnType<typeof rgb>;
        maxWidth?: number;
      } = {},
    ) => {
      const size = opts.size ?? 10;
      const font = opts.font ?? fontRegular;
      const color = opts.color ?? TEXT_DARK;
      let s = safeText(text);
      if (opts.maxWidth) {
        // Truncate with ellipsis if too long for the column.
        while (font.widthOfTextAtSize(s, size) > opts.maxWidth && s.length > 1) {
          s = s.slice(0, -2) + "…";
        }
      }
      page.drawText(s, { x, y, size, font, color });
    };

    // ─── Branded header ────────────────────────────────────────────────
    // Navy band (full width) with the CETHOS wordmark + tagline on the
    // left and a teal accent stripe below for brand emphasis. The
    // marketing wordmark is rendered as text — the app's logo_url
    // app_settings row is currently empty, and the in-app sidebar falls
    // back to the same "CETHOS" wordmark when no image is uploaded.
    page.drawRectangle({
      x: 0,
      y: PAGE_H - HEADER_H,
      width: PAGE_W,
      height: HEADER_H,
      color: CETHOS_NAVY,
    });
    // Teal accent stripe along the bottom edge of the header
    page.drawRectangle({
      x: 0,
      y: PAGE_H - HEADER_H - 4,
      width: PAGE_W,
      height: 4,
      color: CETHOS_TEAL,
    });
    // Wordmark
    draw("CETHOS", MARGIN, PAGE_H - 42, {
      size: 28,
      font: fontBold,
      color: WHITE,
    });
    draw("Translation Services", MARGIN, PAGE_H - 60, {
      size: 11,
      color: rgb(0.78, 0.85, 0.92),
    });
    // "QUOTE" tag on the right
    const tagWidth = 80;
    const tagX = PAGE_W - MARGIN - tagWidth;
    page.drawRectangle({
      x: tagX,
      y: PAGE_H - 50,
      width: tagWidth,
      height: 24,
      color: CETHOS_TEAL,
    });
    const tagLabel = "QUOTE";
    const tagLabelWidth = fontBold.widthOfTextAtSize(tagLabel, 13);
    draw(tagLabel, tagX + (tagWidth - tagLabelWidth) / 2, PAGE_H - 43, {
      size: 13,
      font: fontBold,
      color: WHITE,
    });
    draw("portal.cethos.com", PAGE_W - MARGIN - 110, PAGE_H - 72, {
      size: 9,
      color: rgb(0.78, 0.85, 0.92),
    });

    let y = PAGE_H - HEADER_H - 30;

    // Quote meta row
    draw(`Quote #: ${quote.quote_number ?? "—"}`, MARGIN, y, {
      size: 12,
      font: fontBold,
      color: CETHOS_NAVY,
    });
    draw(
      `Date: ${new Date(quote.created_at).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })}`,
      PAGE_W - MARGIN - 160,
      y,
      { size: 10 },
    );
    y -= 16;
    if (quote.expires_at) {
      draw(
        `Valid until: ${new Date(quote.expires_at).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })}`,
        PAGE_W - MARGIN - 160,
        y,
        { size: 10, color: TEXT_MUTED },
      );
    }
    draw(`Status: ${(quote.status ?? "").toUpperCase().replace(/_/g, " ")}`, MARGIN, y, {
      size: 10,
      color: TEXT_MUTED,
    });
    y -= 24;

    // Divider
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.5,
      color: TABLE_BORDER,
    });
    y -= 18;

    // Bill-to + project blocks side by side
    const blockTop = y;
    draw("Bill To", MARGIN, blockTop, { size: 10, font: fontBold });
    let leftY = blockTop - 14;
    if (customer.company_name) {
      draw(customer.company_name, MARGIN, leftY, { size: 10, font: fontBold });
      leftY -= 13;
    }
    if (customer.full_name) {
      draw(customer.full_name, MARGIN, leftY, { size: 10 });
      leftY -= 13;
    }
    if (customer.email) {
      draw(customer.email, MARGIN, leftY, { size: 10, color: TEXT_MUTED });
      leftY -= 13;
    }
    if (customer.phone) {
      draw(customer.phone, MARGIN, leftY, { size: 10, color: TEXT_MUTED });
      leftY -= 13;
    }

    const projectX = PAGE_W / 2 + 20;
    draw("Project", projectX, blockTop, { size: 10, font: fontBold });
    let rightY = blockTop - 14;
    draw(
      `${sourceLang.name ?? "—"}  →  ${targetLang.name ?? "—"}`,
      projectX,
      rightY,
      { size: 10 },
    );
    rightY -= 13;
    if (intendedUse.name) {
      draw(`Use: ${intendedUse.name}`, projectX, rightY, {
        size: 10,
        color: TEXT_MUTED,
      });
      rightY -= 13;
    }
    if (quote.promised_delivery_date) {
      draw(
        `Standard delivery: ${new Date(quote.promised_delivery_date).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })}`,
        projectX,
        rightY,
        { size: 10, color: TEXT_MUTED },
      );
      rightY -= 13;
    }
    if (quote.promised_delivery_date_rush) {
      draw(
        `Rush delivery: ${new Date(quote.promised_delivery_date_rush).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })}`,
        projectX,
        rightY,
        { size: 10, color: TEXT_MUTED },
      );
      rightY -= 13;
    }

    y = Math.min(leftY, rightY) - 12;

    // Line items table
    const colDescX = MARGIN;
    const colQtyX = 320;
    const colRateX = 410;
    const colTotalX = 490;
    const colRightEdge = PAGE_W - MARGIN;

    page.drawRectangle({
      x: MARGIN - 4,
      y: y - 4,
      width: colRightEdge - MARGIN + 8,
      height: 22,
      color: TABLE_HEADER_BG,
    });
    draw("Description", colDescX, y + 4, { size: 10, font: fontBold });
    draw("Qty", colQtyX, y + 4, { size: 10, font: fontBold });
    draw("Rate", colRateX, y + 4, { size: 10, font: fontBold });
    draw("Amount", colTotalX, y + 4, { size: 10, font: fontBold });
    y -= 14;

    page.drawLine({
      start: { x: MARGIN - 4, y },
      end: { x: colRightEdge + 4, y },
      thickness: 0.4,
      color: TABLE_BORDER,
    });
    y -= 16;

    if (analysis.length === 0) {
      draw("No line items.", colDescX, y, {
        size: 10,
        color: TEXT_MUTED,
      });
      y -= 14;
    } else {
      for (const item of analysis) {
        if (y < 100) {
          page = pdf.addPage([PAGE_W, PAGE_H]);
          y = PAGE_H - MARGIN;
        }
        const filename =
          item.manual_filename ||
          item.document_type_other ||
          item.detected_document_type ||
          "Document";
        draw(filename, colDescX, y, {
          size: 10,
          font: fontBold,
          maxWidth: colQtyX - colDescX - 8,
        });

        const unit = item.calculation_unit as string | null;
        const qty = Number(item.unit_quantity ?? item.billable_pages ?? 0);
        const rate = Number(item.base_rate ?? 0);
        const qtyLabel =
          unit === "flat"
            ? "Flat"
            : `${qty} ${unitLabel(unit, qty)}`;
        draw(qtyLabel, colQtyX, y, { size: 10, color: TEXT_MUTED });
        draw(
          unit === "flat"
            ? money(rate, currency)
            : `${money(rate, currency)} / ${unitLabel(unit, 1)}`,
          colRateX,
          y,
          { size: 10, color: TEXT_MUTED },
        );
        draw(money(item.line_total, currency), colTotalX, y, {
          size: 10,
          font: fontBold,
        });
        y -= 14;

        if (item.detected_document_type) {
          draw(
            String(item.detected_document_type).replace(/_/g, " "),
            colDescX,
            y,
            { size: 9, color: TEXT_MUTED },
          );
          y -= 12;
        }

        if (Number(item.certification_price) > 0) {
          draw("Certification", colDescX + 12, y, {
            size: 9,
            color: TEXT_MUTED,
          });
          draw(money(item.certification_price, currency), colTotalX, y, {
            size: 9,
            color: TEXT_MUTED,
          });
          y -= 12;
        }
        y -= 4;
      }
    }

    y -= 10;
    page.drawLine({
      start: { x: MARGIN - 4, y },
      end: { x: colRightEdge + 4, y },
      thickness: 0.4,
      color: TABLE_BORDER,
    });
    y -= 16;

    // Totals (right-aligned column)
    const labelX = 380;
    const valueX = 510;
    const totalsRow = (label: string, value: string, bold = false) => {
      draw(label, labelX, y, {
        size: 10,
        font: bold ? fontBold : fontRegular,
        color: bold ? TEXT_DARK : TEXT_MUTED,
      });
      draw(value, valueX, y, {
        size: 10,
        font: bold ? fontBold : fontRegular,
      });
      y -= 14;
    };

    totalsRow("Subtotal", money(quote.subtotal, currency));
    if (Number(quote.certification_total) > 0) {
      totalsRow("Certification", money(quote.certification_total, currency));
    }
    for (const adj of adjustments) {
      const amt = Number(adj.calculated_amount ?? 0);
      const label =
        adj.adjustment_type === "discount"
          ? `Discount${adj.reason ? ` (${adj.reason})` : ""}`
          : `Surcharge${adj.reason ? ` (${adj.reason})` : ""}`;
      const signed =
        adj.adjustment_type === "discount"
          ? `-${money(Math.abs(amt), currency)}`
          : money(Math.abs(amt), currency);
      totalsRow(label, signed);
    }
    if (Number(quote.rush_fee) > 0) {
      totalsRow("Rush fee", money(quote.rush_fee, currency));
    }
    if (Number(quote.delivery_fee) > 0) {
      totalsRow("Delivery", money(quote.delivery_fee, currency));
    }
    const taxPct = Number(quote.tax_rate ?? 0) * 100;
    totalsRow(
      `Tax (${taxPct.toFixed(taxPct % 1 === 0 ? 0 : 2)}%)`,
      money(quote.tax_amount, currency),
    );
    y -= 4;
    page.drawLine({
      start: { x: labelX - 6, y: y + 8 },
      end: { x: colRightEdge + 4, y: y + 8 },
      thickness: 0.6,
      color: TABLE_BORDER,
    });
    totalsRow(`Total (${currency})`, money(quote.total, currency), true);

    y -= 18;
    // ─── Payment terms block ───────────────────────────────────────────
    // Enterprise-billing default: Invoice — Net 45. Per-customer override
    // can come later via a customers.payment_terms column.
    const dueDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);
    const dueDateLabel = dueDate.toLocaleDateString("en-CA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const blockH = 56;
    page.drawRectangle({
      x: MARGIN - 6,
      y: y - blockH + 8,
      width: PAGE_W - 2 * MARGIN + 12,
      height: blockH,
      color: CETHOS_TEAL_LIGHT,
    });
    page.drawRectangle({
      x: MARGIN - 6,
      y: y - blockH + 8,
      width: 3,
      height: blockH,
      color: CETHOS_TEAL,
    });
    draw("Payment Terms", MARGIN + 4, y - 4, {
      size: 10,
      font: fontBold,
      color: CETHOS_NAVY,
    });
    draw("Invoice — Net 45", MARGIN + 4, y - 20, {
      size: 11,
      font: fontBold,
      color: CETHOS_TEAL,
    });
    draw(
      `Payment is due ${dueDateLabel} (45 days from invoice date). Invoice will be issued upon project completion.`,
      MARGIN + 4,
      y - 36,
      { size: 9, color: TEXT_DARK },
    );
    y -= blockH + 12;

    if (quote.special_instructions) {
      draw("Notes", MARGIN, y, { size: 10, font: fontBold });
      y -= 14;
      // Simple word-wrap to MARGIN..PAGE_W-MARGIN
      const words = safeText(quote.special_instructions).split(/\s+/);
      const maxWidth = PAGE_W - 2 * MARGIN;
      let line = "";
      for (const w of words) {
        const test = line ? line + " " + w : w;
        if (fontRegular.widthOfTextAtSize(test, 10) > maxWidth) {
          draw(line, MARGIN, y, { size: 10, color: TEXT_MUTED });
          y -= 12;
          line = w;
        } else {
          line = test;
        }
        if (y < 60) break;
      }
      if (line && y >= 60) {
        draw(line, MARGIN, y, { size: 10, color: TEXT_MUTED });
        y -= 12;
      }
    }

    // Footer
    draw(
      "Cethos Translation Services  ·  support@cethos.com  ·  portal.cethos.com",
      MARGIN,
      40,
      { size: 9, color: TEXT_MUTED },
    );

    const pdfBytes = await pdf.save();
    const filename = `${(quote.quote_number || "quote").replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("generate-quote-pdf error:", message);
    return jsonError(message, 500);
  }
});
