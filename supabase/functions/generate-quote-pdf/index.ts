// generate-quote-pdf
//
// POST { quote_id }  -> returns PDF bytes (application/pdf)
// GET  ?quote_id=... -> same
//
// On-demand: nothing is stored. The PDF is built fresh from the latest
// quote/analysis/adjustments rows so totals always match what the customer
// sees in the portal.
//
// Two layouts:
//   - Business / AR customers (customer.company_name IS NOT NULL) get the
//     "Cethos Design System" business quote layout: white header band with
//     QUOTE wordmark + teal underline, slate notes panel with payment terms
//     and project details, bordered Accept card. Pulls payment terms from
//     customers.payment_terms (default 'net_30').
//   - Individual customers stay on the original branded-header layout.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  PDFDocument,
  PDFImage,
  PDFFont,
  PDFName,
  PDFString,
  StandardFonts,
  rgb,
} from "https://esm.sh/pdf-lib@1.17.1";
import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";

// Brand assets — fetched once per warm Deno isolate and cached in module
// scope. Plus Jakarta Sans is the Cethos design-system body face; the logo
// is the Supabase-hosted light-bg variant (used everywhere else in the app).
const LOGO_URL =
  "https://lmzoyezvsjgsxveoakdr.supabase.co/storage/v1/object/public/web-assets/png_logo_cethos_light_bg.png";
const FONT_REGULAR_URL =
  "https://cdn.jsdelivr.net/gh/tokotype/PlusJakartaSans/fonts/ttf/PlusJakartaSans-Regular.ttf";
const FONT_BOLD_URL =
  "https://cdn.jsdelivr.net/gh/tokotype/PlusJakartaSans/fonts/ttf/PlusJakartaSans-Bold.ttf";

let _logoBytes: Uint8Array | null = null;
let _regularFontBytes: Uint8Array | null = null;
let _boldFontBytes: Uint8Array | null = null;

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`brand asset fetch ${url} -> HTTP ${res.status}`);
      return null;
    }
    return new Uint8Array(await res.arrayBuffer());
  } catch (err) {
    console.warn(`brand asset fetch ${url} threw:`, err);
    return null;
  }
}

async function ensureBrandAssets() {
  // Each missing asset is re-fetched; once cached, this is a no-op.
  const tasks: Array<Promise<void>> = [];
  if (!_logoBytes) {
    tasks.push(fetchBytes(LOGO_URL).then((b) => { if (b) _logoBytes = b; }));
  }
  if (!_regularFontBytes) {
    tasks.push(
      fetchBytes(FONT_REGULAR_URL).then((b) => {
        if (b) _regularFontBytes = b;
      }),
    );
  }
  if (!_boldFontBytes) {
    tasks.push(
      fetchBytes(FONT_BOLD_URL).then((b) => {
        if (b) _boldFontBytes = b;
      }),
    );
  }
  if (tasks.length) await Promise.all(tasks);
}

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

// CETHOS brand palette (Cethos Design System colors_and_type.css).
const CETHOS_NAVY = rgb(0x0c / 255, 0x23 / 255, 0x40 / 255); // #0C2340
const CETHOS_TEAL = rgb(0x08 / 255, 0x91 / 255, 0xb2 / 255); // #0891B2
const CETHOS_TEAL_DEEP = rgb(0x0e / 255, 0x74 / 255, 0x90 / 255); // #0E7490
const CETHOS_TEAL_LIGHT = rgb(0xec / 255, 0xfe / 255, 0xff / 255); // #ECFEFF
const CETHOS_BG_BLUE = rgb(0xe0 / 255, 0xf2 / 255, 0xfe / 255); // #E0F2FE
const TEXT_DARK = rgb(0x1f / 255, 0x29 / 255, 0x37 / 255); // slate-800
const TEXT_MUTED = rgb(0x64 / 255, 0x74 / 255, 0x8b / 255); // slate-500
const SLATE_50 = rgb(0xf8 / 255, 0xfa / 255, 0xfc / 255); // #F8FAFC
const TABLE_BORDER = rgb(0xe5 / 255, 0xe7 / 255, 0xeb / 255); // #E5E7EB
const RUSH_PILL_BG = rgb(0xff / 255, 0xf7 / 255, 0xed / 255); // #FFF7ED
const RUSH_PILL_FG = rgb(0x9a / 255, 0x34 / 255, 0x12 / 255); // #9A3412
const RUSH_PILL_DOT = rgb(0xf5 / 255, 0x9e / 255, 0x0b / 255); // #F59E0B
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
  // WinAnsi can encode 0x20-0xFF (Latin-1) — anything outside must be
  // transliterated or stripped before drawText() throws. Order matters:
  // the punctuation/dash substitutions run before the catch-all stripper.
  // Unicode whitespace uses explicit escapes — embedding literal NBSP/ZWSP
  // in the character class triggered a `space-to-ZWSP` range that ate every
  // ASCII codepoint and silently turned drawn text into rows of spaces.
  return String(s ?? "")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[→➔➜➤]/g, "->")
    .replace(/[←]/g, "<-")
    .replace(/[…]/g, "...")
    .replace(/[   ​　]/g, " ")
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "")
    .slice(0, 500);
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function paymentTermsLabel(terms: string | null | undefined): {
  short: string; // e.g. "Net 30"
  account: string; // e.g. "AR approved · Net 30"
  days: number;
} {
  const raw = (terms ?? "net_30").toLowerCase();
  if (raw === "due_on_receipt" || raw === "upon_receipt") {
    return { short: "Due on receipt", account: "Due on receipt", days: 0 };
  }
  const match = raw.match(/net[_\s-]?(\d{1,3})/);
  const days = match ? parseInt(match[1], 10) : 30;
  return {
    short: `Net ${days}`,
    account: `AR approved · Net ${days}`,
    days,
  };
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
          created_at, created_by_staff_id, converted_to_order_id,
          advance_percentage, advance_amount, advance_received_at,
          payment_link, payment_link_created_at, payment_link_expires_at,
          customer:customers!quotes_customer_id_fkey(id, full_name, email,
            phone, company_name, is_ar_customer, payment_terms,
            invoicing_branch_id, billing_address_line1, billing_address_line2,
            billing_city, billing_state, billing_postal_code, billing_country),
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

    // Re-project standard + rush delivery dates from "today" using the same
    // business-day budget that was promised on the original issue date. The
    // RPC locks once the quote has converted into an order. Holiday lookups
    // are handled by the existing is_business_day() helper.
    try {
      const { data: shifted, error: shiftErr } = await supabase.rpc(
        "shift_quote_delivery_dates",
        { p_quote_id: quote.id, p_region: "CA-AB" },
      );
      if (shiftErr) {
        console.warn("shift_quote_delivery_dates RPC failed:", shiftErr.message);
      } else if (shifted && shifted.shifted === true) {
        if (shifted.standard_delivery) {
          quote.promised_delivery_date = shifted.standard_delivery;
        }
        if (shifted.rush_delivery) {
          quote.promised_delivery_date_rush = shifted.rush_delivery;
        }
      }
    } catch (err) {
      console.warn("shift_quote_delivery_dates threw:", err);
    }

    // Look up the PM (Cethos-side staff who created the quote) if any.
    let pm: { full_name: string | null; email: string | null } | null = null;
    if (quote.created_by_staff_id) {
      const { data } = await supabase
        .from("staff_users")
        .select("full_name, email")
        .eq("id", quote.created_by_staff_id)
        .maybeSingle();
      pm = data ?? null;
    }

    // Look up the rush surcharge percentage from app_settings (default 30%).
    const { data: rushSetting } = await supabase
      .from("app_settings")
      .select("setting_value")
      .eq("setting_key", "rush_multiplier")
      .maybeSingle();
    const rushMultiplier = Number(rushSetting?.setting_value ?? 1.3);
    const rushPct = Math.round((rushMultiplier - 1) * 100);

    // Look up the invoicing branch for tax label + tax number. Falls back to
    // branches.is_default = true if the customer has no invoicing_branch_id.
    let branch: {
      tax_label: string | null;
      tax_number: string | null;
      legal_name: string | null;
    } | null = null;
    if (customer.invoicing_branch_id) {
      const { data } = await supabase
        .from("branches")
        .select("tax_label, tax_number, legal_name")
        .eq("id", customer.invoicing_branch_id)
        .maybeSingle();
      branch = data ?? null;
    }
    if (!branch || !branch.tax_number) {
      const { data } = await supabase
        .from("branches")
        .select("tax_label, tax_number, legal_name")
        .eq("is_default", true)
        .maybeSingle();
      branch = data ?? branch;
    }

    // Mint a Stripe payment link if the quote doesn't have one yet (and the
    // amount due is positive, and the quote isn't already paid/converted).
    // Re-uses an existing link if cached on the quote.
    let paymentUrl: string | null = null;
    const advancePct = Number(quote.advance_percentage ?? 0);
    const hasAdvance = advancePct > 0;
    const amountDue = hasAdvance
      ? Number(quote.advance_amount ?? 0)
      : Number(quote.total ?? 0);
    const canPay =
      !quote.converted_to_order_id &&
      quote.status !== "paid" &&
      amountDue > 0;
    if (canPay) {
      const linkExpired =
        quote.payment_link_expires_at &&
        new Date(quote.payment_link_expires_at).getTime() < Date.now();
      if (quote.payment_link && !linkExpired) {
        paymentUrl = quote.payment_link;
      } else {
        try {
          const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY");
          if (STRIPE_KEY) {
            const body = new URLSearchParams();
            body.append("line_items[0][price_data][currency]", String(currency).toLowerCase());
            body.append(
              "line_items[0][price_data][product_data][name]",
              `Translation Quote ${quote.quote_number}`,
            );
            body.append(
              "line_items[0][price_data][product_data][description]",
              quote.advance_percentage
                ? `Advance (${quote.advance_percentage}%) for quote ${quote.quote_number}`
                : `Payment for translation quote ${quote.quote_number}`,
            );
            body.append(
              "line_items[0][price_data][unit_amount]",
              String(Math.round(amountDue * 100)),
            );
            body.append("line_items[0][quantity]", "1");
            body.append("metadata[quote_id]", String(quote.id));
            body.append("metadata[quote_number]", String(quote.quote_number ?? ""));
            if (quote.advance_percentage) {
              body.append("metadata[payment_type]", "advance");
              body.append(
                "metadata[advance_percentage]",
                String(quote.advance_percentage),
              );
            }
            body.append("after_completion[type]", "redirect");
            body.append(
              "after_completion[redirect][url]",
              `https://portal.cethos.com/order/confirmation/${quote.id}`,
            );
            body.append("allow_promotion_codes", "true");

            const stripeRes = await fetch(
              "https://api.stripe.com/v1/payment_links",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${STRIPE_KEY}`,
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: body.toString(),
              },
            );
            if (stripeRes.ok) {
              const link = await stripeRes.json();
              paymentUrl = link.url ?? null;
              if (paymentUrl) {
                await supabase
                  .from("quotes")
                  .update({
                    payment_link: paymentUrl,
                    payment_link_created_at: new Date().toISOString(),
                  })
                  .eq("id", quote.id);
              }
            } else {
              const errText = await stripeRes.text();
              console.warn(
                "Stripe payment_links create failed:",
                stripeRes.status,
                errText.slice(0, 200),
              );
            }
          }
        } catch (err) {
          console.warn("Stripe payment link mint threw:", err);
        }
      }
    }

    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);

    // Warm the brand-asset cache (logo PNG + Plus Jakarta Sans TTFs). If any
    // fetch fails we fall back to Helvetica + a text wordmark so the PDF
    // still ships rather than 500'ing.
    await ensureBrandAssets();

    let fontRegular: PDFFont;
    let fontBold: PDFFont;
    let usingBrandFont = false;
    if (_regularFontBytes && _boldFontBytes) {
      try {
        fontRegular = await pdf.embedFont(_regularFontBytes, { subset: true });
        fontBold = await pdf.embedFont(_boldFontBytes, { subset: true });
        usingBrandFont = true;
      } catch (err) {
        console.warn("Plus Jakarta Sans embedFont failed:", err);
        fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
        fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
      }
    } else {
      fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
      fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    }

    let logoImage: PDFImage | null = null;
    if (_logoBytes) {
      try {
        logoImage = await pdf.embedPng(_logoBytes);
      } catch (err) {
        console.warn("logo embedPng failed:", err);
      }
    }

    // Branch: business customer → new Design System layout; else original.
    const isBusiness = Boolean(customer.company_name);
    if (isBusiness) {
      await renderBusinessQuote({
        pdf,
        fontRegular,
        fontBold,
        quote,
        customer,
        analysis,
        adjustments,
        sourceLang,
        targetLang,
        intendedUse,
        currency,
        pm,
        rushPct,
        logoImage,
        usingBrandFont,
        branch,
        paymentUrl,
        amountDue,
        hasAdvance,
      });
    } else {
      await renderClassicQuote({
        pdf,
        fontRegular,
        fontBold,
        quote,
        customer,
        analysis,
        adjustments,
        sourceLang,
        targetLang,
        intendedUse,
        currency,
      });
    }

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

// ════════════════════════════════════════════════════════════════════
// Business / AR customer layout — Cethos Design System "Quote Template"
// ════════════════════════════════════════════════════════════════════

type RenderCtx = {
  pdf: PDFDocument;
  fontRegular: PDFFont;
  fontBold: PDFFont;
  quote: any;
  customer: any;
  analysis: any[];
  adjustments: any[];
  sourceLang: any;
  targetLang: any;
  intendedUse: any;
  currency: string;
  pm?: { full_name: string | null; email: string | null } | null;
  rushPct?: number;
  logoImage?: PDFImage | null;
  usingBrandFont?: boolean;
  branch?: {
    tax_label: string | null;
    tax_number: string | null;
    legal_name: string | null;
  } | null;
  paymentUrl?: string | null;
  amountDue?: number;
  hasAdvance?: boolean;
};

async function renderBusinessQuote(ctx: RenderCtx) {
  const {
    pdf,
    fontRegular,
    fontBold,
    quote,
    customer,
    analysis,
    adjustments,
    sourceLang,
    targetLang,
    currency,
    pm,
    rushPct = 30,
    logoImage,
    branch,
    paymentUrl,
    amountDue,
    hasAdvance,
  } = ctx;

  // Page margins for the business layout — wider gutter than the classic one
  // to match the 56px padding in the HTML template.
  const M = 56;
  const RIGHT = PAGE_W - M;

  let page = pdf.addPage([PAGE_W, PAGE_H]);

  const draw = (
    text: string,
    x: number,
    y: number,
    opts: {
      size?: number;
      font?: any;
      color?: ReturnType<typeof rgb>;
      maxWidth?: number;
    } = {},
  ) => {
    const size = opts.size ?? 10;
    const font = opts.font ?? fontRegular;
    const color = opts.color ?? TEXT_DARK;
    let s = safeText(text);
    if (opts.maxWidth) {
      while (font.widthOfTextAtSize(s, size) > opts.maxWidth && s.length > 1) {
        s = s.slice(0, -2) + "..";
      }
    }
    page.drawText(s, { x, y, size, font, color });
  };

  // ─── HEADER BAND (white with teal underline) ─────────────────────────
  // Logo on the left, "QUOTE" tagline on the right.
  page.drawRectangle({
    x: 0,
    y: PAGE_H - 78,
    width: PAGE_W,
    height: 78,
    color: WHITE,
  });
  // 3px teal underline
  page.drawRectangle({
    x: 0,
    y: PAGE_H - 81,
    width: PAGE_W,
    height: 3,
    color: CETHOS_TEAL,
  });
  // Left: brand logo image. The Supabase-hosted PNG is ~6:1; sizing by
  // page-width fraction matches the HTML template (~29% of page width)
  // and keeps the wordmark legible without dominating the band.
  if (logoImage) {
    const targetW = 180;
    const scale = targetW / logoImage.width;
    const h = logoImage.height * scale;
    page.drawImage(logoImage, {
      x: M,
      y: PAGE_H - 12 - h - (44 - h) / 2,
      width: targetW,
      height: h,
    });
  } else {
    draw("CETHOS", M, PAGE_H - 38, {
      size: 26,
      font: fontBold,
      color: CETHOS_NAVY,
    });
    draw("Translation Services", M, PAGE_H - 54, {
      size: 9,
      color: TEXT_MUTED,
    });
  }
  // Right: large QUOTE wordmark — baseline drops to the logo's bottom edge
  // so the glyphs visually bottom-align with the brand mark instead of
  // hanging from the top of the band.
  const quoteLabel = "QUOTE";
  const quoteLabelWidth = fontBold.widthOfTextAtSize(quoteLabel, 28);
  draw(quoteLabel, RIGHT - quoteLabelWidth, PAGE_H - 47, {
    size: 28,
    font: fontBold,
    color: CETHOS_NAVY,
  });

  // Body starts below the header + breathing room
  let y = PAGE_H - 78 - 36;

  // ─── META ROW: Quote # / Date / Valid until ──────────────────────────
  // Extra gap (10pt -> the number sits at y-22 instead of y-18) so the
  // eyebrow doesn't crowd the wordmark.
  draw("Quote #", M, y, {
    size: 9,
    font: fontBold,
    color: CETHOS_TEAL,
  });
  draw(quote.quote_number ?? "—", M, y - 22, {
    size: 22,
    font: fontBold,
    color: CETHOS_NAVY,
  });

  const dateText = fmtDate(quote.created_at);
  const validText = fmtDate(quote.expires_at);
  // Right side: "Date: ..." and "Valid until: ..." each as a labelled row
  const dateLabel = "Date:";
  const validLabel = "Valid until:";
  const dateLabelW = fontBold.widthOfTextAtSize(dateLabel, 10);
  const validLabelW = fontBold.widthOfTextAtSize(validLabel, 10);
  const dateValueW = fontRegular.widthOfTextAtSize(dateText, 10);
  const validValueW = fontRegular.widthOfTextAtSize(validText, 10);
  const dateRowW = dateLabelW + 6 + dateValueW;
  const validRowW = validLabelW + 6 + validValueW;

  // top row (date) aligned with quote # label
  draw(dateLabel, RIGHT - dateRowW, y, {
    size: 10,
    font: fontBold,
    color: CETHOS_NAVY,
  });
  draw(dateText, RIGHT - dateValueW, y, {
    size: 10,
    color: CETHOS_NAVY,
  });
  // valid-until row sits just below
  draw(validLabel, RIGHT - validRowW, y - 16, {
    size: 10,
    font: fontBold,
    color: CETHOS_NAVY,
  });
  draw(validText, RIGHT - validValueW, y - 16, {
    size: 10,
    color: CETHOS_NAVY,
  });

  y -= 42;

  // Divider under the meta row
  page.drawLine({
    start: { x: M, y },
    end: { x: RIGHT, y },
    thickness: 0.5,
    color: TABLE_BORDER,
  });

  y -= 22;

  // ─── BILL TO / PROJECT ───────────────────────────────────────────────
  const blockTopY = y;
  const colW = (RIGHT - M - 32) / 2;
  const projectX = M + colW + 32;

  draw("BILL TO", M, blockTopY, {
    size: 9,
    font: fontBold,
    color: TEXT_MUTED,
  });
  draw("PROJECT", projectX, blockTopY, {
    size: 9,
    font: fontBold,
    color: TEXT_MUTED,
  });

  let leftY = blockTopY - 16;
  // Bill-to: company name (bold), contact name, then email
  draw(customer.company_name ?? "—", M, leftY, {
    size: 11,
    font: fontBold,
    color: CETHOS_NAVY,
    maxWidth: colW,
  });
  leftY -= 14;
  if (customer.full_name) {
    draw(customer.full_name, M, leftY, {
      size: 11,
      color: CETHOS_NAVY,
      maxWidth: colW,
    });
    leftY -= 14;
  }
  if (customer.email) {
    draw(customer.email, M, leftY, {
      size: 10,
      color: TEXT_MUTED,
      maxWidth: colW,
    });
    leftY -= 13;
  }
  if (customer.phone) {
    draw(customer.phone, M, leftY, {
      size: 10,
      color: TEXT_MUTED,
      maxWidth: colW,
    });
    leftY -= 13;
  }

  // Project block — language pair with teal arrow, delivery dates.
  // Use ASCII "->" because StandardFonts.Helvetica is WinAnsi-only and
  // Unicode U+2192 throws on widthOfTextAtSize.
  let rightY = blockTopY - 16;
  const src = safeText(sourceLang.name) || "-";
  const tgt = safeText(targetLang.name) || "-";
  const srcW = fontBold.widthOfTextAtSize(src, 11);
  draw(src, projectX, rightY, {
    size: 11,
    font: fontBold,
    color: CETHOS_NAVY,
  });
  const arrowGlyph = "->";
  draw(arrowGlyph, projectX + srcW + 6, rightY, {
    size: 12,
    font: fontBold,
    color: CETHOS_TEAL,
  });
  const arrowW = fontBold.widthOfTextAtSize(arrowGlyph, 12);
  draw(tgt, projectX + srcW + 6 + arrowW + 6, rightY, {
    size: 11,
    font: fontBold,
    color: CETHOS_NAVY,
    maxWidth:
      colW - (srcW + 6 + arrowW + 6) > 0 ? colW - (srcW + 6 + arrowW + 6) : 80,
  });
  rightY -= 14;

  if (quote.promised_delivery_date) {
    const lab = "Standard delivery:";
    const labW = fontRegular.widthOfTextAtSize(lab, 10);
    draw(lab, projectX, rightY, { size: 10, color: TEXT_MUTED });
    draw(fmtDate(quote.promised_delivery_date), projectX + labW + 6, rightY, {
      size: 10,
      color: CETHOS_NAVY,
    });
    rightY -= 14;
  }
  if (quote.promised_delivery_date_rush) {
    const lab = "Rush delivery:";
    const labW = fontRegular.widthOfTextAtSize(lab, 10);
    draw(lab, projectX, rightY, { size: 10, color: TEXT_MUTED });
    const dateStr = fmtDate(quote.promised_delivery_date_rush);
    draw(dateStr, projectX + labW + 6, rightY, {
      size: 10,
      color: CETHOS_NAVY,
    });
    const dateW = fontRegular.widthOfTextAtSize(dateStr, 10);
    // Rush pill: dot + "+XX%"
    const pillText = `+${rushPct}%`;
    const pillTextW = fontBold.widthOfTextAtSize(pillText, 8);
    const pillW = 10 + pillTextW + 10;
    const pillX = projectX + labW + 6 + dateW + 8;
    page.drawRectangle({
      x: pillX,
      y: rightY - 3,
      width: pillW,
      height: 13,
      color: RUSH_PILL_BG,
      borderColor: RUSH_PILL_BG,
    });
    // dot
    page.drawCircle({
      x: pillX + 5,
      y: rightY + 3,
      size: 2.5,
      color: RUSH_PILL_DOT,
    });
    draw(pillText, pillX + 10, rightY, {
      size: 8,
      font: fontBold,
      color: RUSH_PILL_FG,
    });
    rightY -= 14;
  }

  y = Math.min(leftY, rightY) - 14;

  // ─── ITEMS TABLE ─────────────────────────────────────────────────────
  // Column layout: Description (56%) | Qty (12%) | Rate (15%) | Amount (17%)
  const tableW = RIGHT - M;
  const colDescX = M;
  const colQtyR = M + tableW * 0.68; // right edge of Qty column
  const colRateR = M + tableW * 0.83;
  const colAmtR = RIGHT;

  // Header row background (slate-50)
  const headerH = 28;
  page.drawRectangle({
    x: M,
    y: y - headerH + 14,
    width: tableW,
    height: headerH,
    color: SLATE_50,
  });
  // Header labels
  draw("Description", colDescX + 8, y, {
    size: 10,
    font: fontBold,
    color: CETHOS_NAVY,
  });
  const qtyLabelW = fontBold.widthOfTextAtSize("Qty", 10);
  const rateLabelW = fontBold.widthOfTextAtSize("Rate", 10);
  const amtLabelW = fontBold.widthOfTextAtSize("Amount", 10);
  draw("Qty", colQtyR - qtyLabelW - 8, y, {
    size: 10,
    font: fontBold,
    color: CETHOS_NAVY,
  });
  draw("Rate", colRateR - rateLabelW - 8, y, {
    size: 10,
    font: fontBold,
    color: CETHOS_NAVY,
  });
  draw("Amount", colAmtR - amtLabelW - 8, y, {
    size: 10,
    font: fontBold,
    color: CETHOS_NAVY,
  });

  y -= headerH;
  // Bottom border of header row
  page.drawLine({
    start: { x: M, y: y + 14 },
    end: { x: RIGHT, y: y + 14 },
    thickness: 0.4,
    color: TABLE_BORDER,
  });

  if (analysis.length === 0) {
    draw("No line items.", colDescX + 8, y, {
      size: 10,
      color: TEXT_MUTED,
    });
    y -= 18;
  } else {
    for (const item of analysis) {
      // Page-break guard — leave room for totals + payment block at bottom
      if (y < 280) {
        page = pdf.addPage([PAGE_W, PAGE_H]);
        y = PAGE_H - 60;
      }
      const filename =
        item.manual_filename ||
        item.document_type_other ||
        item.detected_document_type ||
        "Document";

      // Title row
      draw(filename, colDescX + 8, y, {
        size: 11,
        font: fontBold,
        color: CETHOS_NAVY,
        maxWidth: colQtyR - colDescX - 24,
      });

      const unit = item.calculation_unit as string | null;
      const qty = Number(item.unit_quantity ?? item.billable_pages ?? 0);
      const rate = Number(item.base_rate ?? 0);
      const qtyText =
        unit === "flat"
          ? "Flat"
          : `${qty} ${unitLabel(unit, qty)}`;
      const rateText =
        unit === "flat"
          ? money(rate, currency)
          : `${money(rate, currency)} / ${unitLabel(unit, 1)}`;
      const amtText = money(item.line_total, currency);

      const qtyTextW = fontRegular.widthOfTextAtSize(qtyText, 10);
      const rateTextW = fontRegular.widthOfTextAtSize(rateText, 10);
      const amtTextW = fontBold.widthOfTextAtSize(amtText, 11);
      draw(qtyText, colQtyR - qtyTextW - 8, y, {
        size: 10,
        color: TEXT_MUTED,
      });
      draw(rateText, colRateR - rateTextW - 8, y, {
        size: 10,
        color: TEXT_MUTED,
      });
      draw(amtText, colAmtR - amtTextW - 8, y, {
        size: 11,
        font: fontBold,
        color: CETHOS_NAVY,
      });
      y -= 14;

      // Description / detected doc type as muted small line
      if (item.detected_document_type) {
        draw(
          String(item.detected_document_type).replace(/_/g, " "),
          colDescX + 8,
          y,
          {
            size: 9,
            color: TEXT_MUTED,
            maxWidth: colQtyR - colDescX - 24,
          },
        );
        y -= 12;
      }

      if (Number(item.certification_price) > 0) {
        const certLab = "Certification";
        const certLabW = fontRegular.widthOfTextAtSize(certLab, 9);
        const certVal = money(item.certification_price, currency);
        const certValW = fontRegular.widthOfTextAtSize(certVal, 9);
        draw(certLab, colDescX + 8, y, {
          size: 9,
          color: TEXT_MUTED,
        });
        // dotted leader implied; just align value to amount column
        draw(certVal, colAmtR - certValW - 8, y, {
          size: 9,
          color: TEXT_MUTED,
        });
        y -= 12;
      }

      // Row bottom border
      y -= 6;
      page.drawLine({
        start: { x: M, y },
        end: { x: RIGHT, y },
        thickness: 0.4,
        color: TABLE_BORDER,
      });
      y -= 12;
    }
  }

  // ─── TOTALS (right-aligned column) ───────────────────────────────────
  y -= 6;
  const totalsW = 240;
  const totalsX = RIGHT - totalsW;
  const totalsLabelX = totalsX;
  const totalsValueR = RIGHT;

  const totalsLine = (
    label: string,
    value: string,
    opts: { bold?: boolean; muted?: boolean } = {},
  ) => {
    const size = opts.bold ? 12 : 10;
    const font = opts.bold ? fontBold : fontRegular;
    const labelColor = opts.bold ? CETHOS_NAVY : TEXT_MUTED;
    const valueColor = CETHOS_NAVY;
    draw(label, totalsLabelX, y, { size, font, color: labelColor });
    const valW = font.widthOfTextAtSize(value, size);
    draw(value, totalsValueR - valW, y, { size, font, color: valueColor });
    y -= opts.bold ? 18 : 14;
  };

  totalsLine("Subtotal", money(quote.subtotal, currency));
  if (Number(quote.certification_total) > 0) {
    totalsLine("Certification", money(quote.certification_total, currency));
  }
  for (const adj of adjustments) {
    const amt = Number(adj.calculated_amount ?? 0);
    const label =
      adj.adjustment_type === "discount"
        ? `Discount${adj.reason ? ` (${safeText(adj.reason).slice(0, 30)})` : ""}`
        : `Surcharge${adj.reason ? ` (${safeText(adj.reason).slice(0, 30)})` : ""}`;
    const signed =
      adj.adjustment_type === "discount"
        ? `-${money(Math.abs(amt), currency)}`
        : money(Math.abs(amt), currency);
    totalsLine(label, signed);
  }
  if (Number(quote.rush_fee) > 0) {
    totalsLine("Rush fee", money(quote.rush_fee, currency));
  }
  if (Number(quote.delivery_fee) > 0) {
    totalsLine("Delivery", money(quote.delivery_fee, currency));
  }
  const taxPct = Number(quote.tax_rate ?? 0) * 100;
  totalsLine(
    `Tax (${taxPct.toFixed(taxPct % 1 === 0 ? 0 : 2)}% GST)`,
    money(quote.tax_amount, currency),
  );

  // 2px navy line above grand total
  y -= 2;
  page.drawLine({
    start: { x: totalsX, y: y + 6 },
    end: { x: totalsValueR, y: y + 6 },
    thickness: 1.5,
    color: CETHOS_NAVY,
  });
  y -= 10;

  // Grand total: bold navy label + (CAD) muted + bold value
  const grandLabel = "Total";
  const grandCur = `(${currency})`;
  const grandValue = money(quote.total, currency);
  draw(grandLabel, totalsLabelX, y, {
    size: 13,
    font: fontBold,
    color: CETHOS_NAVY,
  });
  const grandLabelW = fontBold.widthOfTextAtSize(grandLabel, 13);
  draw(grandCur, totalsLabelX + grandLabelW + 6, y, {
    size: 10,
    color: TEXT_MUTED,
  });
  const grandValueW = fontBold.widthOfTextAtSize(grandValue, 13);
  draw(grandValue, totalsValueR - grandValueW, y, {
    size: 13,
    font: fontBold,
    color: CETHOS_NAVY,
  });
  y -= 28;

  // ─── NOTES / PAYMENT TERMS BLOCK (slate panel) ───────────────────────
  // Sized for the longest paragraph variant (AR-approved Net 45) at the
  // current font size. If the paragraph grows, bump this.
  const notesH = 175;
  if (y - notesH < 100) {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - 60;
  }

  const notesTop = y;
  page.drawRectangle({
    x: M,
    y: y - notesH,
    width: RIGHT - M,
    height: notesH,
    color: SLATE_50,
    borderColor: SLATE_50,
  });

  // 2-column inner grid
  const innerPad = 18;
  const innerLeftX = M + innerPad;
  const innerRightX = M + (RIGHT - M) / 2 + 4;
  const innerColW = (RIGHT - M) / 2 - innerPad - 8;
  let innerTopY = notesTop - 22;

  draw("PAYMENT TERMS", innerLeftX, innerTopY, {
    size: 9,
    font: fontBold,
    color: TEXT_MUTED,
  });
  draw("PROJECT DETAILS", innerRightX, innerTopY, {
    size: 9,
    font: fontBold,
    color: TEXT_MUTED,
  });

  const terms = paymentTermsLabel(customer.payment_terms);

  // Left column rows. "Advance requested" replaces the old Remit-to row —
  // shows NIL by default, or "X% (CAD $YYY.YY)" when a percentage is set
  // on quotes.advance_percentage.
  const arApproved = customer.is_ar_customer === true;
  const accountValue = arApproved ? terms.account : terms.short;
  const advancePctInline = Number(quote.advance_percentage ?? 0);
  const advanceLabel = advancePctInline > 0
    ? `${advancePctInline % 1 === 0 ? advancePctInline.toFixed(0) : advancePctInline}% (${money(quote.advance_amount, currency)})`
    : "NIL";
  const leftRows: Array<[string, string]> = [
    ["Account", accountValue],
    ["Methods", "e-Transfer · EFT · Cheque"],
    ["Advance requested", advanceLabel],
  ];

  // Right column rows. GST/HST label + number come from the branch the
  // customer is billed under (customer.invoicing_branch_id → branches),
  // falling back to the default branch.
  const pmName = pm?.full_name?.trim() || "Cethos PM team";
  const pmEmail = pm?.email?.trim() || "pm@cethoscorp.com";
  const taxLabel = (branch?.tax_label || "GST/HST").toString();
  const taxNumber = branch?.tax_number || "—";
  const rightRows: Array<[string, string]> = [
    ["Project manager", pmName],
    ["Contact", pmEmail],
    [taxLabel, taxNumber],
  ];

  let leftRowY = innerTopY - 16;
  for (const [k, v] of leftRows) {
    draw(k, innerLeftX, leftRowY, { size: 10, color: TEXT_MUTED });
    const vW = fontBold.widthOfTextAtSize(safeText(v), 10);
    const rightEdge = innerLeftX + innerColW;
    draw(v, Math.max(innerLeftX + 90, rightEdge - vW), leftRowY, {
      size: 10,
      font: fontBold,
      color: CETHOS_NAVY,
      maxWidth: innerColW - 90,
    });
    leftRowY -= 16;
  }

  let rightRowY = innerTopY - 16;
  for (const [k, v] of rightRows) {
    draw(k, innerRightX, rightRowY, { size: 10, color: TEXT_MUTED });
    const vW = fontBold.widthOfTextAtSize(safeText(v), 10);
    const rightEdge = innerRightX + innerColW;
    draw(v, Math.max(innerRightX + 90, rightEdge - vW), rightRowY, {
      size: 10,
      font: fontBold,
      color: CETHOS_NAVY,
      maxWidth: innerColW - 90,
    });
    rightRowY -= 16;
  }

  // Divider then paragraph
  const paraDividerY = Math.min(leftRowY, rightRowY) - 2;
  page.drawLine({
    start: { x: innerLeftX, y: paraDividerY },
    end: { x: RIGHT - innerPad, y: paraDividerY },
    thickness: 0.4,
    color: TABLE_BORDER,
  });

  const advanceClause = hasAdvance
    ? `An advance of ${money(quote.advance_amount, currency)} (${advancePctInline}% of total) is required before work begins; balance due on ${terms.short} after delivery. `
    : arApproved
    ? `No deposit required — your account is approved for AR billing on ${terms.short} terms. `
    : `Standard terms apply (${terms.short}). `;

  const paragraph =
    `Quote valid for ${terms.days || 30} days from issue date. ` +
    advanceClause +
    `One free revision round included; further changes billed at $0.18/word. ` +
    `ISO 17100 quality workflow with subject-matter linguists, independent ` +
    `editor pass, and final QA. Invoices issued upon delivery; late payments ` +
    `accrue 1.5% per month past ${terms.short}.`;

  let paraY = paraDividerY - 14;
  const words = safeText(paragraph).split(/\s+/);
  const maxParaW = RIGHT - innerPad - innerLeftX;
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (fontRegular.widthOfTextAtSize(test, 10) > maxParaW) {
      draw(line, innerLeftX, paraY, { size: 10, color: TEXT_MUTED });
      paraY -= 13;
      line = w;
    } else {
      line = test;
    }
    if (paraY < notesTop - notesH + 6) break;
  }
  if (line && paraY >= notesTop - notesH + 6) {
    draw(line, innerLeftX, paraY, { size: 10, color: TEXT_MUTED });
  }

  y = notesTop - notesH - 18;

  // ─── ACCEPT STRIP (bordered card) ────────────────────────────────────
  // Approve-via-email button is always drawn; Pay-online sits to its right
  // when a Stripe link is available. 135 leaves the paragraph 3 wrapped
  // lines + ~14pt breathing room above the button row.
  const acceptH = 135;
  if (y - acceptH < 80) {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - 60;
  }

  // Draw bordered rectangle (1px border)
  page.drawRectangle({
    x: M,
    y: y - acceptH,
    width: RIGHT - M,
    height: acceptH,
    color: WHITE,
    borderColor: TABLE_BORDER,
    borderWidth: 1,
  });

  draw("Accept this quote to start work", M + 18, y - 22, {
    size: 12,
    font: fontBold,
    color: CETHOS_NAVY,
  });

  // The "Approve" mailto button addresses the PM with info@ on CC, so the
  // staff inbox always gets a copy even if the PM is away.
  const CC_EMAIL = "info@cethos.com";
  const pmEmailForAccept = pmEmail;
  const acceptText = hasAdvance
    ? `Reply to ${pmEmailForAccept} (with ${CC_EMAIL} on CC) with "ACCEPT ${quote.quote_number ?? ""}" from any authorized email on file. Work will begin once the advance of ${money(amountDue, currency)} is received — use the Pay online button or contact us for wire details.`
    : `Reply to ${pmEmailForAccept} (with ${CC_EMAIL} on CC) with "ACCEPT ${quote.quote_number ?? ""}" from any authorized email on file. We will start work within 30 minutes of confirmation` +
      (arApproved ? ` — no signature required for AR-approved accounts.` : `.`);

  const acceptWords = safeText(acceptText).split(/\s+/);
  const acceptMaxW = RIGHT - M - 36;
  let acceptLine = "";
  let acceptY = y - 40;
  for (const w of acceptWords) {
    const test = acceptLine ? acceptLine + " " + w : w;
    if (fontRegular.widthOfTextAtSize(test, 10) > acceptMaxW) {
      draw(acceptLine, M + 18, acceptY, { size: 10, color: TEXT_MUTED });
      acceptY -= 13;
      acceptLine = w;
    } else {
      acceptLine = test;
    }
    if (acceptY < y - acceptH + 58) break;
  }
  if (acceptLine && acceptY >= y - acceptH + 58) {
    draw(acceptLine, M + 18, acceptY, { size: 10, color: TEXT_MUTED });
  }

  // ─── APPROVE + PAY ONLINE BUTTONS (side by side at card bottom) ───────
  // Approve = navy primary, opens a pre-filled mailto: with the PM + info@
  // on CC. Pay-online = teal secondary, opens the Stripe payment link.
  const buttonH = 30;
  const buttonY = y - acceptH + 14;
  const buttonTextSize = 11;

  // Approve mailto link is always present.
  const subject = `ACCEPT ${quote.quote_number ?? ""}`;
  const mailBody =
    `Hello,\n\nWe accept quote ${quote.quote_number ?? ""}.\n\nThank you,\n`;
  const mailtoUrl =
    `mailto:${pmEmailForAccept}` +
    `?cc=${encodeURIComponent(CC_EMAIL)}` +
    `&subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(mailBody)}`;
  const approveLabel = "Approve via email";
  const approveW =
    fontBold.widthOfTextAtSize(approveLabel, buttonTextSize) + 32;
  const approveX = M + 18;

  page.drawRectangle({
    x: approveX,
    y: buttonY,
    width: approveW,
    height: buttonH,
    color: CETHOS_NAVY,
    borderColor: CETHOS_NAVY,
    borderWidth: 1,
  });
  draw(approveLabel, approveX + 16, buttonY + 10, {
    size: buttonTextSize,
    font: fontBold,
    color: WHITE,
  });

  const addLinkAnnotation = (
    rect: [number, number, number, number],
    uri: string,
  ) => {
    try {
      const linkRef = pdf.context.register(
        pdf.context.obj({
          Type: "Annot",
          Subtype: "Link",
          Rect: rect,
          Border: [0, 0, 0],
          A: pdf.context.obj({
            Type: "Action",
            S: "URI",
            URI: PDFString.of(uri),
          }),
        }),
      );
      const annotsKey = PDFName.of("Annots");
      const existing = page.node.lookup(annotsKey);
      if (existing && (existing as any).push) {
        (existing as any).push(linkRef);
      } else {
        page.node.set(annotsKey, pdf.context.obj([linkRef]));
      }
    } catch (err) {
      console.warn("link annotation failed:", err);
    }
  };

  addLinkAnnotation(
    [approveX, buttonY, approveX + approveW, buttonY + buttonH],
    mailtoUrl,
  );

  // Pay online button — sits to the right of Approve when paymentUrl exists.
  if (paymentUrl) {
    const buttonLabel = hasAdvance
      ? `Pay advance ${money(amountDue, currency)} online ->`
      : `Pay online now ->`;
    const buttonW =
      fontBold.widthOfTextAtSize(buttonLabel, buttonTextSize) + 32;
    const buttonX = approveX + approveW + 12;

    page.drawRectangle({
      x: buttonX,
      y: buttonY,
      width: buttonW,
      height: buttonH,
      color: CETHOS_TEAL,
      borderColor: CETHOS_TEAL,
      borderWidth: 1,
    });
    draw(buttonLabel, buttonX + 16, buttonY + 10, {
      size: buttonTextSize,
      font: fontBold,
      color: WHITE,
    });

    addLinkAnnotation(
      [buttonX, buttonY, buttonX + buttonW, buttonY + buttonH],
      paymentUrl,
    );
  }

  // ─── FOOTER ──────────────────────────────────────────────────────────
  const footerY = 36;
  page.drawLine({
    start: { x: M, y: footerY + 14 },
    end: { x: RIGHT, y: footerY + 14 },
    thickness: 0.4,
    color: TABLE_BORDER,
  });
  draw(
    "Cethos Solutions Inc. · 421 7 Avenue SW, Floor 30, Calgary, AB T2P 4K9",
    M,
    footerY,
    { size: 9, font: fontBold, color: CETHOS_NAVY },
  );
  const pageLabel = "Page 1 of 1";
  const pageLabelW = fontRegular.widthOfTextAtSize(pageLabel, 9);
  draw(pageLabel, RIGHT - pageLabelW, footerY, {
    size: 9,
    color: TEXT_MUTED,
  });
}

// ════════════════════════════════════════════════════════════════════
// Classic layout — preserved for individual customers (no company_name)
// ════════════════════════════════════════════════════════════════════

async function renderClassicQuote(ctx: RenderCtx) {
  const {
    pdf,
    fontRegular,
    fontBold,
    quote,
    customer,
    analysis,
    adjustments,
    sourceLang,
    targetLang,
    intendedUse,
    currency,
  } = ctx;

  let page = pdf.addPage([PAGE_W, PAGE_H]);

  const draw = (
    text: string,
    x: number,
    y: number,
    opts: {
      size?: number;
      font?: any;
      color?: ReturnType<typeof rgb>;
      maxWidth?: number;
    } = {},
  ) => {
    const size = opts.size ?? 10;
    const font = opts.font ?? fontRegular;
    const color = opts.color ?? TEXT_DARK;
    let s = safeText(text);
    if (opts.maxWidth) {
      while (font.widthOfTextAtSize(s, size) > opts.maxWidth && s.length > 1) {
        s = s.slice(0, -2) + "..";
      }
    }
    page.drawText(s, { x, y, size, font, color });
  };

  // Navy header band + teal accent
  page.drawRectangle({
    x: 0,
    y: PAGE_H - HEADER_H,
    width: PAGE_W,
    height: HEADER_H,
    color: CETHOS_NAVY,
  });
  page.drawRectangle({
    x: 0,
    y: PAGE_H - HEADER_H - 4,
    width: PAGE_W,
    height: 4,
    color: CETHOS_TEAL,
  });
  draw("CETHOS", MARGIN, PAGE_H - 42, {
    size: 28,
    font: fontBold,
    color: WHITE,
  });
  draw("Translation Services", MARGIN, PAGE_H - 60, {
    size: 11,
    color: rgb(0.78, 0.85, 0.92),
  });
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

  draw(`Quote #: ${quote.quote_number ?? "—"}`, MARGIN, y, {
    size: 12,
    font: fontBold,
    color: CETHOS_NAVY,
  });
  draw(`Date: ${fmtDate(quote.created_at)}`, PAGE_W - MARGIN - 160, y, {
    size: 10,
  });
  y -= 16;
  if (quote.expires_at) {
    draw(`Valid until: ${fmtDate(quote.expires_at)}`, PAGE_W - MARGIN - 160, y, {
      size: 10,
      color: TEXT_MUTED,
    });
  }
  draw(`Status: ${(quote.status ?? "").toUpperCase().replace(/_/g, " ")}`, MARGIN, y, {
    size: 10,
    color: TEXT_MUTED,
  });
  y -= 24;

  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 0.5,
    color: TABLE_BORDER,
  });
  y -= 18;

  const blockTop = y;
  draw("Bill To", MARGIN, blockTop, { size: 10, font: fontBold });
  let leftY = blockTop - 14;
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
      `Standard delivery: ${fmtDate(quote.promised_delivery_date)}`,
      projectX,
      rightY,
      { size: 10, color: TEXT_MUTED },
    );
    rightY -= 13;
  }
  if (quote.promised_delivery_date_rush) {
    draw(
      `Rush delivery: ${fmtDate(quote.promised_delivery_date_rush)}`,
      projectX,
      rightY,
      { size: 10, color: TEXT_MUTED },
    );
    rightY -= 13;
  }

  y = Math.min(leftY, rightY) - 12;

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
    color: SLATE_50,
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
    draw("No line items.", colDescX, y, { size: 10, color: TEXT_MUTED });
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
      const qtyLabelText =
        unit === "flat" ? "Flat" : `${qty} ${unitLabel(unit, qty)}`;
      draw(qtyLabelText, colQtyX, y, { size: 10, color: TEXT_MUTED });
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
  draw("Due upon acceptance", MARGIN + 4, y - 20, {
    size: 11,
    font: fontBold,
    color: CETHOS_TEAL,
  });
  draw(
    "Payment by e-Transfer, Visa, or Mastercard. We will start work within 30 minutes of confirmation.",
    MARGIN + 4,
    y - 36,
    { size: 9, color: TEXT_DARK },
  );
  y -= blockH + 12;

  if (quote.special_instructions) {
    draw("Notes", MARGIN, y, { size: 10, font: fontBold });
    y -= 14;
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

  draw(
    "Cethos Translation Services  ·  support@cethos.com  ·  portal.cethos.com",
    MARGIN,
    40,
    { size: 9, color: TEXT_MUTED },
  );
}
