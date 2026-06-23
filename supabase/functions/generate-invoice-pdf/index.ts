// generate-invoice-pdf
// VERSION: 2.0.0 — Branded Cethos Design-System invoice template (2026-06-20).
//   v2.0.0  pdf-lib rebuild: Cethos logo + Plus Jakarta Sans + navy/teal palette,
//           renders customer_invoice_lines, tax row always shown, due date from
//           client payment terms, payment instructions suppressed when empty,
//           www.cethos.com. Mirrors the certified-quote layout (generate-quote-pdf).
//   v1.x    legacy raw-PDF-operator text layout (quote_files-only, "Translation
//           Services" fallback, WinAnsi garbling) — replaced.
//
// POST { invoice_id }  -> renders + stores the PDF in the `invoices` bucket,
//                         updates customer_invoices.pdf_storage_path
// GET  ?invoice_id=...  -> returns the freshly rendered PDF bytes
//
// BRANDED template — matches the Cethos Design-System certified-quote layout:
// white header band with the Cethos logo + INVOICE wordmark + teal underline,
// Plus Jakarta Sans (the brand body face), navy/teal palette. Line items come
// from customer_invoice_lines (their descriptions already carry service +
// source > target language); falls back to quote_files then a service label.
// Using an embedded TTF also renders Latin-1 punctuation (·) cleanly.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  PDFDocument,
  PDFImage,
  PDFFont,
  StandardFonts,
  rgb,
} from "https://esm.sh/pdf-lib@1.17.1";
import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";

// ── Brand assets (fetched once per warm isolate) ────────────────────────────
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
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}
async function ensureBrandAssets() {
  const tasks: Array<Promise<void>> = [];
  if (!_logoBytes) tasks.push(fetchBytes(LOGO_URL).then((b) => { if (b) _logoBytes = b; }));
  if (!_regularFontBytes) tasks.push(fetchBytes(FONT_REGULAR_URL).then((b) => { if (b) _regularFontBytes = b; }));
  if (!_boldFontBytes) tasks.push(fetchBytes(FONT_BOLD_URL).then((b) => { if (b) _boldFontBytes = b; }));
  if (tasks.length) await Promise.all(tasks);
}

// ── Brand palette (Cethos Design System) ────────────────────────────────────
const CETHOS_NAVY = rgb(0x0c / 255, 0x23 / 255, 0x40 / 255); // #0C2340
const CETHOS_TEAL = rgb(0x08 / 255, 0x91 / 255, 0xb2 / 255); // #0891B2
const CETHOS_TEAL_DEEP = rgb(0x0e / 255, 0x74 / 255, 0x90 / 255); // #0E7490
const TEXT_DARK = rgb(0x1f / 255, 0x29 / 255, 0x37 / 255); // slate-800
const TEXT_MUTED = rgb(0x64 / 255, 0x74 / 255, 0x8b / 255); // slate-500
const SLATE_50 = rgb(0xf8 / 255, 0xfa / 255, 0xfc / 255); // #F8FAFC
const BORDER = rgb(0xe2 / 255, 0xe8 / 255, 0xf0 / 255); // slate-200
const WHITE = rgb(1, 1, 1);

const PAGE_W = 612;
const PAGE_H = 792;
const M = 56; // page margin

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "content-disposition",
};
const json = (data: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

// WinAnsi-safe transliteration (keeps Latin-1 like · so the brand font renders it).
function safeText(s: unknown): string {
  return String(s ?? "")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[→➔➜➤]/g, ">")
    .replace(/[…]/g, "...")
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "")
    .slice(0, 300);
}
const fmtDate = (d: string | Date | null | undefined): string => {
  if (!d) return "-";
  try { return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }); }
  catch { return "-"; }
};
const money = (n: unknown, cur = "USD") => {
  const sym = cur === "CAD" ? "C$" : cur === "EUR" ? "€" : "$";
  return `${sym}${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

function resolvePaymentInstructions(
  code: string,
  displayInstructions: string | null,
  details: Record<string, string> | null,
): string | null {
  const d = details || {};
  const hasDetails = Object.values(d).some((v) => v && String(v).trim());
  // Only use the placeholder template when the branch actually has values
  // filled in — otherwise we'd print "Bank: , Transit: , Account:".
  if (displayInstructions && (hasDetails || !/\[[A-Z_]+\]/.test(displayInstructions))) {
    const resolved = displayInstructions
      .replace(/\[EMAIL\]/g, d.email || "").replace(/\[ADDRESS\]/g, d.address || "")
      .replace(/\[BANK\]/g, d.bank_name || "").replace(/\[TRANSIT\]/g, d.transit || "")
      .replace(/\[ACCOUNT\]/g, d.account || "").replace(/\[SWIFT\]/g, d.swift || "")
      .replace(/\[INSTITUTION\]/g, d.institution || "").replace(/\[PAYABLE_TO\]/g, d.payable_to || "");
    if (!resolved.includes("[]") && resolved.trim()) return resolved;
  }
  switch (code) {
    case "etransfer": return d.email ? `Send Interac e-Transfer to: ${d.email}` : null;
    case "wire": return d.bank_name ? `Wire Transfer - ${d.bank_name}, Transit: ${d.transit}, Account: ${d.account}${d.swift ? ", SWIFT: " + d.swift : ""}` : null;
    case "cheque": return d.payable_to ? `Make cheque payable to ${d.payable_to}${d.address ? " and mail to: " + d.address : ""}` : null;
    case "direct_deposit": return d.bank_name ? `Direct Deposit - ${d.bank_name}, Transit: ${d.transit}, Account: ${d.account}` : null;
    case "paypal": return d.email ? `Send PayPal payment to: ${d.email}` : null;
    case "cash": return "Cash payment accepted at our office.";
    case "stripe": case "online": return "Pay online via credit/debit card at portal.cethos.com";
    default: return null;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !KEY) throw new Error("Missing Supabase configuration");
    const supabase = createClient(SUPABASE_URL, KEY);

    let invoiceId: string | null = null;
    if (req.method === "POST") invoiceId = (await req.json()).invoice_id || null;
    else invoiceId = new URL(req.url).searchParams.get("invoice_id");
    if (!invoiceId) throw new Error("Must provide invoice_id");

    const { data: invoice, error: invErr } = await supabase
      .from("customer_invoices").select("*").eq("id", invoiceId).single();
    if (invErr || !invoice) throw new Error("Invoice not found");

    const { data: customer } = await supabase
      .from("customers")
      .select("id, full_name, email, phone, company_name, payment_terms, preferred_payment_method_id, backup_payment_method_id, invoicing_branch_id, billing_address_line1, billing_city, billing_state, billing_postal_code, billing_country")
      .eq("id", invoice.customer_id).single();

    const { data: branch } = customer?.invoicing_branch_id
      ? await supabase.from("branches").select("legal_name, tax_number").eq("id", customer.invoicing_branch_id).maybeSingle()
      : { data: null as any };

    const { data: invoiceLines } = await supabase
      .from("customer_invoice_lines")
      .select("description, line_total, sort_order")
      .eq("invoice_id", invoice.id).order("sort_order", { ascending: true });

    // Payment methods
    let prefName: string | null = null, prefInstr: string | null = null, bakName: string | null = null, bakInstr: string | null = null;
    const pmIds = [customer?.preferred_payment_method_id, customer?.backup_payment_method_id].filter(Boolean);
    if (pmIds.length) {
      const { data: methods } = await supabase.from("payment_methods").select("id, name, code").in("id", pmIds);
      let bpm: any[] = [];
      if (customer?.invoicing_branch_id) {
        const { data } = await supabase.from("branch_payment_methods")
          .select("payment_method_id, display_instructions, details, is_enabled")
          .eq("branch_id", customer.invoicing_branch_id).in("payment_method_id", pmIds).eq("is_enabled", true);
        bpm = data || [];
      }
      for (const m of methods || []) {
        const b = bpm.find((x) => x.payment_method_id === m.id);
        const instr = b ? resolvePaymentInstructions(m.code, b.display_instructions, b.details) : null;
        if (m.id === customer?.preferred_payment_method_id) { prefName = m.name; prefInstr = instr; }
        if (m.id === customer?.backup_payment_method_id) { bakName = m.name; bakInstr = instr; }
      }
    }

    // ── Build the branded PDF ─────────────────────────────────────────────
    await ensureBrandAssets();
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    let fontR: PDFFont, fontB: PDFFont;
    try {
      fontR = _regularFontBytes ? await pdf.embedFont(_regularFontBytes, { subset: true }) : await pdf.embedFont(StandardFonts.Helvetica);
      fontB = _boldFontBytes ? await pdf.embedFont(_boldFontBytes, { subset: true }) : await pdf.embedFont(StandardFonts.HelveticaBold);
    } catch {
      fontR = await pdf.embedFont(StandardFonts.Helvetica);
      fontB = await pdf.embedFont(StandardFonts.HelveticaBold);
    }
    let logo: PDFImage | null = null;
    if (_logoBytes) { try { logo = await pdf.embedPng(_logoBytes); } catch { logo = null; } }

    const pdfBytes = await renderInvoice({
      pdf, fontR, fontB, logo, invoice, customer, branch,
      lines: invoiceLines || [],
      pay: { prefName, prefInstr, bakName, bakInstr },
    });

    // Store + return
    const storagePath = `${invoice.customer_id}/${invoice.invoice_number}.pdf`;
    const { error: upErr } = await supabase.storage.from("invoices")
      .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw new Error("Failed to upload PDF to storage");
    await supabase.from("customer_invoices")
      .update({ pdf_storage_path: storagePath, pdf_generated_at: new Date().toISOString() })
      .eq("id", invoice.id);

    if (req.method === "GET") {
      return new Response(pdfBytes, {
        headers: { ...CORS_HEADERS, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${invoice.invoice_number}.pdf"` },
      });
    }
    return json({ success: true, invoice_id: invoice.id, invoice_number: invoice.invoice_number, pdf_storage_path: storagePath });
  } catch (error) {
    console.error("generate-invoice-pdf error:", (error as Error).message);
    return json({ success: false, error: (error as Error).message }, 400);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// Branded invoice layout (Cethos Design System)
// ════════════════════════════════════════════════════════════════════════════
async function renderInvoice(ctx: any): Promise<Uint8Array> {
  const { pdf, fontR, fontB, logo, invoice, customer, branch, lines, pay } = ctx;
  const cur = invoice.currency || "USD";
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const RIGHT = PAGE_W - M;

  const draw = (text: string, x: number, y: number, o: any = {}) => {
    const size = o.size ?? 10, font = o.font ?? fontR, color = o.color ?? TEXT_DARK;
    let s = safeText(text);
    if (o.maxWidth && font.widthOfTextAtSize(s, size) > o.maxWidth) {
      // Strictly shrink the base text (the previous "slice(-2)+'..'" kept the
      // length constant → infinite loop / WORKER_RESOURCE_LIMIT on long text).
      while (s.length > 1 && font.widthOfTextAtSize(s + "..", size) > o.maxWidth) {
        s = s.slice(0, -1);
      }
      s = s + "..";
    }
    page.drawText(s, { x, y, size, font, color });
  };
  const drawRight = (text: string, xRight: number, y: number, o: any = {}) => {
    const size = o.size ?? 10, font = o.font ?? fontR;
    const s = safeText(text);
    draw(s, xRight - font.widthOfTextAtSize(s, size), y, o);
  };

  // ─── Header band: logo left, INVOICE wordmark right, teal underline ───
  page.drawRectangle({ x: 0, y: PAGE_H - 78, width: PAGE_W, height: 78, color: WHITE });
  page.drawRectangle({ x: 0, y: PAGE_H - 81, width: PAGE_W, height: 3, color: CETHOS_TEAL });
  if (logo) {
    const targetW = 170, scale = targetW / logo.width, h = logo.height * scale;
    page.drawImage(logo, { x: M, y: PAGE_H - 12 - h - (44 - h) / 2, width: targetW, height: h });
  } else {
    draw("CETHOS", M, PAGE_H - 38, { size: 26, font: fontB, color: CETHOS_NAVY });
    draw("Translation Services", M, PAGE_H - 54, { size: 9, color: TEXT_MUTED });
  }
  drawRight("INVOICE", RIGHT, PAGE_H - 47, { size: 28, font: fontB, color: CETHOS_NAVY });

  let y = PAGE_H - 78 - 34;

  // ─── Meta: Invoice # (big) + Date / Due / Status ──────────────────────
  draw("Invoice #", M, y, { size: 9, font: fontB, color: CETHOS_TEAL });
  draw(invoice.invoice_number ?? "-", M, y - 22, { size: 22, font: fontB, color: CETHOS_NAVY });

  const metaX = RIGHT - 150;
  const metaRow = (label: string, val: string, yy: number, strong = false) => {
    draw(label, metaX, yy, { size: 8.5, color: TEXT_MUTED });
    drawRight(val, RIGHT, yy, { size: 9.5, font: strong ? fontB : fontR, color: strong ? CETHOS_NAVY : TEXT_DARK });
  };
  // Due date derived from the client profile's payment terms (e.g. net_45),
  // counted from the invoice date.
  const termDays = parseInt(String(customer?.payment_terms || "net_30").replace(/\D/g, ""), 10) || 30;
  const termLabel = `Net ${termDays}`;
  const dueDate = invoice.invoice_date
    ? new Date(new Date(invoice.invoice_date).getTime() + termDays * 86400000)
    : invoice.due_date;
  metaRow("Invoice date", fmtDate(invoice.invoice_date), y);
  metaRow("Payment terms", termLabel, y - 15);
  metaRow("Due date", fmtDate(dueDate), y - 30);
  metaRow("Status", String(invoice.status || "draft").toUpperCase(), y - 45, true);
  if (invoice.po_number) metaRow("PO", String(invoice.po_number), y - 60);

  y -= 75;

  // ─── Bill To (left) / Invoiced by (right) ─────────────────────────────
  draw("BILL TO", M, y, { size: 8.5, font: fontB, color: CETHOS_TEAL });
  draw("INVOICED BY", metaX, y, { size: 8.5, font: fontB, color: CETHOS_TEAL });
  y -= 15;
  const billName = customer?.company_name || customer?.full_name || "";
  draw(billName, M, y, { size: 11, font: fontB, color: TEXT_DARK, maxWidth: 230 });
  draw(branch?.legal_name || "Cethos Solutions Inc.", metaX, y, { size: 10, font: fontB, color: TEXT_DARK, maxWidth: 170 });
  y -= 14;
  const billLines = [
    customer?.company_name ? customer?.full_name : null,
    customer?.email,
    [customer?.billing_city, customer?.billing_state, customer?.billing_postal_code].filter(Boolean).join(", ") || null,
  ].filter(Boolean) as string[];
  const byLines = [branch?.tax_number ? `Tax #: ${branch.tax_number}` : null, "support@cethos.com", "www.cethos.com"].filter(Boolean) as string[];
  const maxRows = Math.max(billLines.length, byLines.length);
  for (let i = 0; i < maxRows; i++) {
    if (billLines[i]) draw(billLines[i], M, y, { size: 9, color: TEXT_MUTED, maxWidth: 230 });
    if (byLines[i]) draw(byLines[i], metaX, y, { size: 9, color: TEXT_MUTED, maxWidth: 170 });
    y -= 13;
  }

  y -= 16;

  // ─── Line items table ─────────────────────────────────────────────────
  const tableTop = y;
  page.drawRectangle({ x: M, y: tableTop - 18, width: PAGE_W - M * 2, height: 22, color: CETHOS_NAVY });
  draw("DESCRIPTION", M + 10, tableTop - 12, { size: 8.5, font: fontB, color: WHITE });
  drawRight("AMOUNT", RIGHT - 10, tableTop - 12, { size: 8.5, font: fontB, color: WHITE });
  y = tableTop - 22;

  const renderRow = (desc: string, amount: number, idx: number) => {
    const rowH = 20;
    if (idx % 2 === 1) page.drawRectangle({ x: M, y: y - rowH + 6, width: PAGE_W - M * 2, height: rowH, color: SLATE_50 });
    draw(desc, M + 10, y - rowH + 12, { size: 8.5, color: TEXT_DARK, maxWidth: PAGE_W - M * 2 - 110 });
    drawRight(money(amount, cur), RIGHT - 10, y - rowH + 12, { size: 9, font: fontB, color: TEXT_DARK });
    y -= rowH;
  };

  if (lines.length > 0) {
    lines.forEach((l: any, i: number) => renderRow(l.description || "Service", Number(l.line_total || 0), i));
  } else {
    renderRow("Translation Services", Number(invoice.subtotal || invoice.total_amount || 0), 0);
  }
  page.drawLine({ start: { x: M, y: y - 2 }, end: { x: RIGHT, y: y - 2 }, thickness: 1, color: BORDER });
  y -= 22;

  // ─── Totals (right column) ────────────────────────────────────────────
  const tlX = RIGHT - 220;
  const totalRow = (label: string, val: string, yy: number, o: any = {}) => {
    draw(label, tlX, yy, { size: o.size ?? 9.5, color: o.color ?? TEXT_MUTED, font: o.font ?? fontR });
    drawRight(val, RIGHT, yy, { size: o.size ?? 9.5, font: o.font ?? fontR, color: o.valColor ?? TEXT_DARK });
  };
  totalRow("Subtotal", money(invoice.subtotal, cur), y); y -= 18;
  if (Number(invoice.certification_total) > 0) { totalRow("Certification", money(invoice.certification_total, cur), y); y -= 18; }
  // Tax row always shown (even at 0%).
  const taxPct = Number(invoice.tax_rate || 0) * 100;
  totalRow(`Tax (${taxPct.toFixed(taxPct % 1 === 0 ? 0 : 1)}%)`, money(invoice.tax_amount, cur), y); y -= 24;
  // (No divider line here — the bold Total + teal Balance-Due bar separate it.)
  totalRow("Total", money(invoice.total_amount, cur), y, { size: 12, font: fontB, color: TEXT_DARK, valColor: CETHOS_NAVY }); y -= 32;

  // Balance Due — teal emphasis bar (text vertically centred in the bar).
  const balDue = Number(invoice.balance_due ?? invoice.total_amount ?? 0);
  page.drawRectangle({ x: tlX - 12, y: y - 2, width: RIGHT - tlX + 12, height: 26, color: CETHOS_TEAL_DEEP });
  draw("Balance Due", tlX, y + 7, { size: 11, font: fontB, color: WHITE });
  drawRight(money(balDue, cur), RIGHT - 8, y + 7, { size: 13, font: fontB, color: WHITE });
  y -= 48;

  // ─── Payment method ───────────────────────────────────────────────────
  if (pay.prefName || pay.bakName) {
    draw("PAYMENT METHOD", M, y, { size: 8.5, font: fontB, color: CETHOS_TEAL }); y -= 16;
    if (pay.prefName) {
      draw(`Preferred: ${pay.prefName}`, M, y, { size: 9.5, font: fontB, color: TEXT_DARK }); y -= 13;
      if (pay.prefInstr) { draw(pay.prefInstr, M + 8, y, { size: 8.5, color: TEXT_MUTED, maxWidth: PAGE_W - M * 2 - 8 }); y -= 14; }
    }
    if (pay.bakName) {
      draw(`Backup: ${pay.bakName}`, M, y, { size: 9.5, font: fontB, color: TEXT_DARK }); y -= 13;
      if (pay.bakInstr) { draw(pay.bakInstr, M + 8, y, { size: 8.5, color: TEXT_MUTED, maxWidth: PAGE_W - M * 2 - 8 }); y -= 14; }
    }
    y -= 8;
  }

  // ─── Notes ────────────────────────────────────────────────────────────
  if (invoice.notes) {
    draw("NOTES", M, y, { size: 8.5, font: fontB, color: CETHOS_TEAL }); y -= 14;
    draw(String(invoice.notes), M, y, { size: 9, color: TEXT_MUTED, maxWidth: PAGE_W - M * 2 }); y -= 18;
  }

  // ─── Footer ───────────────────────────────────────────────────────────
  page.drawLine({ start: { x: M, y: 64 }, end: { x: RIGHT, y: 64 }, thickness: 1, color: BORDER });
  draw("Thank you for choosing Cethos Translation Services.", M, 50, { size: 9, color: TEXT_DARK, font: fontB });
  draw("Questions? Contact us at support@cethos.com", M, 38, { size: 8.5, color: TEXT_MUTED });

  return await pdf.save();
}
