// generate-vendor-po
// VERSION: 1.0.0 — Branded vendor Purchase Order (placeholder layout; swap to
// the uploaded PO template later). Built on the same Cethos Design-System
// scaffolding as generate-invoice-pdf v2.0.0 (pdf-lib + logo + Plus Jakarta Sans).
//
// POST { workflow_step_id, vendor_id }
//   -> mints a VPO-YYYY-NNNNN number, renders the branded PO from the vendor's
//      payable on the step, stores it in the `vendor-pos` bucket, upserts
//      vendor_purchase_orders, and returns { po_id, po_number, pdf_storage_path }.
//   Idempotent: if a PO already exists for (step, vendor) it is reused/regenerated.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { PDFDocument, PDFImage, PDFFont, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";

const LOGO_URL = "https://lmzoyezvsjgsxveoakdr.supabase.co/storage/v1/object/public/web-assets/png_logo_cethos_light_bg.png";
const FONT_REGULAR_URL = "https://cdn.jsdelivr.net/gh/tokotype/PlusJakartaSans/fonts/ttf/PlusJakartaSans-Regular.ttf";
const FONT_BOLD_URL = "https://cdn.jsdelivr.net/gh/tokotype/PlusJakartaSans/fonts/ttf/PlusJakartaSans-Bold.ttf";
let _logo: Uint8Array | null = null, _fr: Uint8Array | null = null, _fb: Uint8Array | null = null;
async function fb(url: string) { try { const r = await fetch(url); return r.ok ? new Uint8Array(await r.arrayBuffer()) : null; } catch { return null; } }
async function brand() {
  const t: Promise<void>[] = [];
  if (!_logo) t.push(fb(LOGO_URL).then((b) => { if (b) _logo = b; }));
  if (!_fr) t.push(fb(FONT_REGULAR_URL).then((b) => { if (b) _fr = b; }));
  if (!_fb) t.push(fb(FONT_BOLD_URL).then((b) => { if (b) _fb = b; }));
  if (t.length) await Promise.all(t);
}

const NAVY = rgb(0x0c / 255, 0x23 / 255, 0x40 / 255);
const TEAL = rgb(0x08 / 255, 0x91 / 255, 0xb2 / 255);
const TEAL_DEEP = rgb(0x0e / 255, 0x74 / 255, 0x90 / 255);
const DARK = rgb(0x1f / 255, 0x29 / 255, 0x37 / 255);
const MUTED = rgb(0x64 / 255, 0x74 / 255, 0x8b / 255);
const SLATE = rgb(0xf8 / 255, 0xfa / 255, 0xfc / 255);
const BORDER = rgb(0xe2 / 255, 0xe8 / 255, 0xf0 / 255);
const WHITE = rgb(1, 1, 1);
const PAGE_W = 612, PAGE_H = 792, M = 56;

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (d: Record<string, unknown>, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const safe = (s: unknown) => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[→]/g, ">").replace(/[…]/g, "...").replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "").slice(0, 300);
const fmtDate = (d: unknown) => { if (!d) return "-"; try { return new Date(d as string).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }); } catch { return "-"; } };
const money = (n: unknown, c = "USD") => `${c === "CAD" ? "C$" : c === "EUR" ? "€" : "$"}${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = req.method === "POST" ? await req.json() : Object.fromEntries(new URL(req.url).searchParams);
    const stepId = body.workflow_step_id, vendorId = body.vendor_id;
    if (!stepId || !vendorId) throw new Error("workflow_step_id and vendor_id are required");

    // ── Gather data ──
    const { data: step } = await sb.from("order_workflow_steps")
      .select("id, name, deadline, vendor_rate, vendor_total, vendor_currency, vendor_rate_unit, workflow_id").eq("id", stepId).single();
    if (!step) throw new Error("Step not found");
    const { data: wf } = await sb.from("order_workflows").select("order_id").eq("id", step.workflow_id).single();
    const orderId = wf?.order_id;
    const { data: order } = await sb.from("orders").select("id, order_number, client_project_number, po_number, quote_id, service_id, currency").eq("id", orderId).single();
    const { data: payable } = await sb.from("vendor_payables")
      .select("id, rate, rate_unit, units, subtotal, currency, total, service_id, source_language, target_language, step_name, description")
      .eq("workflow_step_id", stepId).eq("vendor_id", vendorId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { data: vendor } = await sb.from("vendors")
      .select("id, full_name, business_name, email, additional_emails, vendor_type, agency_primary_contact_name, preferred_rate_currency").eq("id", vendorId).single();
    const { data: quote } = order?.quote_id ? await sb.from("quotes").select("source_language_id, target_language_id").eq("id", order.quote_id).single() : { data: null };
    let src = "", tgt = "";
    if (quote) {
      const ids = [quote.source_language_id, quote.target_language_id].filter(Boolean);
      const { data: langs } = ids.length ? await sb.from("languages").select("id, name").in("id", ids) : { data: [] };
      src = (langs || []).find((l: any) => l.id === quote.source_language_id)?.name || "";
      tgt = (langs || []).find((l: any) => l.id === quote.target_language_id)?.name || "";
    }
    const { data: svc } = await sb.from("services").select("name").eq("id", payable?.service_id || order?.service_id).maybeSingle();

    const currency = payable?.currency || step.vendor_currency || vendor?.preferred_rate_currency || "USD";
    const total = Number(payable?.total ?? step.vendor_total ?? 0);
    const subtotal = Number(payable?.subtotal ?? total);
    const rate = payable?.rate ?? step.vendor_rate;
    const unit = (payable?.rate_unit ?? step.vendor_rate_unit ?? "flat").replace(/_/g, " ");
    const units = payable?.units;

    // ── PO number: reuse if a PO already exists for this step+vendor ──
    const { data: existing } = await sb.from("vendor_purchase_orders").select("id, po_number").eq("workflow_step_id", stepId).eq("vendor_id", vendorId).maybeSingle();
    let poNumber = existing?.po_number;
    if (!poNumber) { const { data: n } = await sb.rpc("next_vendor_po_number"); poNumber = n as string; }

    // ── Render branded PO ──
    await brand();
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    let fR: PDFFont, fB: PDFFont;
    try { fR = _fr ? await pdf.embedFont(_fr, { subset: true }) : await pdf.embedFont(StandardFonts.Helvetica); fB = _fb ? await pdf.embedFont(_fb, { subset: true }) : await pdf.embedFont(StandardFonts.HelveticaBold); }
    catch { fR = await pdf.embedFont(StandardFonts.Helvetica); fB = await pdf.embedFont(StandardFonts.HelveticaBold); }
    let logo: PDFImage | null = null; if (_logo) { try { logo = await pdf.embedPng(_logo); } catch { logo = null; } }
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    const RIGHT = PAGE_W - M;
    const draw = (t: string, x: number, y: number, o: any = {}) => { const sz = o.size ?? 10, f = o.font ?? fR; let s = safe(t); if (o.maxWidth) { while (s.length > 3 && f.widthOfTextAtSize(s, sz) > o.maxWidth) s = s.slice(0, -1); } page.drawText(s, { x, y, size: sz, font: f, color: o.color ?? DARK }); };
    const dR = (t: string, xR: number, y: number, o: any = {}) => { const sz = o.size ?? 10, f = o.font ?? fR; const s = safe(t); draw(s, xR - f.widthOfTextAtSize(s, sz), y, o); };

    // Header
    page.drawRectangle({ x: 0, y: PAGE_H - 78, width: PAGE_W, height: 78, color: WHITE });
    page.drawRectangle({ x: 0, y: PAGE_H - 81, width: PAGE_W, height: 3, color: TEAL });
    if (logo) { const w = 170, sc = w / logo.width, h = logo.height * sc; page.drawImage(logo, { x: M, y: PAGE_H - 12 - h - (44 - h) / 2, width: w, height: h }); }
    else { draw("CETHOS", M, PAGE_H - 38, { size: 26, font: fB, color: NAVY }); }
    dR("PURCHASE ORDER", RIGHT, PAGE_H - 47, { size: 22, font: fB, color: NAVY });

    let y = PAGE_H - 78 - 34;
    draw("PO #", M, y, { size: 9, font: fB, color: TEAL });
    draw(poNumber!, M, y - 22, { size: 22, font: fB, color: NAVY });
    const mx = RIGHT - 170;
    const meta = (l: string, v: string, yy: number, strong = false) => { draw(l, mx, yy, { size: 8.5, color: MUTED }); dR(v, RIGHT, yy, { size: 9.5, font: strong ? fB : fR, color: strong ? NAVY : DARK }); };
    meta("PO date", fmtDate(new Date().toISOString()), y);
    meta("Deadline", fmtDate(step.deadline), y - 15);
    meta("Order", order?.order_number || "-", y - 30);
    if (order?.client_project_number) meta("Project", order.client_project_number, y - 45);
    y -= 60;

    // To / From
    draw("TO (VENDOR)", M, y, { size: 8.5, font: fB, color: TEAL });
    draw("FROM", mx, y, { size: 8.5, font: fB, color: TEAL });
    y -= 15;
    const vName = vendor?.business_name || vendor?.full_name || "Vendor";
    draw(vName, M, y, { size: 11, font: fB, color: DARK, maxWidth: 230 });
    draw("Cethos Solutions Inc.", mx, y, { size: 10, font: fB, color: DARK, maxWidth: 170 });
    y -= 14;
    const toLines = [vendor?.vendor_type === "agency" ? `Attn: ${vendor?.agency_primary_contact_name || vendor?.full_name || ""}` : null, vendor?.email].filter(Boolean) as string[];
    const fromLines = ["accounts@cethos.com", "www.cethos.com"];
    for (let i = 0; i < Math.max(toLines.length, fromLines.length); i++) { if (toLines[i]) draw(toLines[i], M, y, { size: 9, color: MUTED, maxWidth: 230 }); if (fromLines[i]) draw(fromLines[i], mx, y, { size: 9, color: MUTED, maxWidth: 170 }); y -= 13; }
    y -= 16;

    // Line item table
    page.drawRectangle({ x: M, y: y - 18, width: PAGE_W - M * 2, height: 22, color: NAVY });
    draw("DESCRIPTION", M + 10, y - 12, { size: 8.5, font: fB, color: WHITE });
    dR("AMOUNT", RIGHT - 10, y - 12, { size: 8.5, font: fB, color: WHITE });
    y -= 22;
    const stepName = payable?.step_name || step.name || "Service";
    const svcName = svc?.name || "";
    const langPair = src && tgt ? `${src} > ${tgt}` : "";
    const desc = [stepName, svcName, langPair].filter(Boolean).join(" | ");
    const rateLine = rate != null ? `Rate: ${money(rate, currency)} / ${unit}${units != null ? `  x ${units}` : ""}` : null;
    page.drawRectangle({ x: M, y: y - 14, width: PAGE_W - M * 2, height: 20, color: SLATE });
    draw(desc, M + 10, y - 8, { size: 8.5, color: DARK, maxWidth: PAGE_W - M * 2 - 110 });
    dR(money(total, currency), RIGHT - 10, y - 8, { size: 9, font: fB, color: DARK });
    y -= 20;
    if (rateLine) { draw(rateLine, M + 10, y - 6, { size: 8, color: MUTED }); y -= 16; }
    page.drawLine({ start: { x: M, y: y - 2 }, end: { x: RIGHT, y: y - 2 }, thickness: 1, color: BORDER });
    y -= 22;

    // Total + Amount Payable bar
    const tlX = RIGHT - 220;
    draw("Subtotal", tlX, y, { size: 9.5, color: MUTED }); dR(money(subtotal, currency), RIGHT, y, { size: 9.5, color: DARK }); y -= 24;
    draw("Total", tlX, y, { size: 12, font: fB, color: DARK }); dR(money(total, currency), RIGHT, y, { size: 12, font: fB, color: NAVY }); y -= 32;
    page.drawRectangle({ x: tlX - 12, y: y - 2, width: RIGHT - tlX + 12, height: 26, color: TEAL_DEEP });
    draw("Amount Payable", tlX, y + 7, { size: 11, font: fB, color: WHITE });
    dR(money(total, currency), RIGHT - 8, y + 7, { size: 13, font: fB, color: WHITE });
    y -= 48;

    // Terms
    draw("TERMS", M, y, { size: 8.5, font: fB, color: TEAL }); y -= 14;
    draw("This Purchase Order confirms the assignment above at the agreed rate and deadline. Please quote this PO number on your invoice. Deliver via the Cethos vendor portal.", M, y, { size: 8.5, color: MUTED, maxWidth: PAGE_W - M * 2 });

    // Footer
    page.drawLine({ start: { x: M, y: 64 }, end: { x: RIGHT, y: 64 }, thickness: 1, color: BORDER });
    draw("Cethos Translation Services", M, 50, { size: 9, font: fB, color: DARK });
    draw("Questions? accounts@cethos.com", M, 38, { size: 8.5, color: MUTED });

    const bytes = await pdf.save();

    // ── Store + upsert ──
    const path = `${vendorId}/${poNumber}.pdf`;
    const { error: upErr } = await sb.storage.from("vendor-pos").upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

    const row = {
      po_number: poNumber, order_id: orderId, workflow_step_id: stepId, vendor_payable_id: payable?.id ?? null, vendor_id: vendorId,
      step_name: stepName, service: svcName, source_language: src, target_language: tgt,
      rate, rate_unit: payable?.rate_unit ?? step.vendor_rate_unit, units, currency, subtotal, total,
      deadline: step.deadline, pdf_storage_path: path, generated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    const { data: po, error: poErr } = existing
      ? await sb.from("vendor_purchase_orders").update(row).eq("id", existing.id).select("id, po_number").single()
      : await sb.from("vendor_purchase_orders").insert(row).select("id, po_number").single();
    if (poErr) throw new Error(`PO record write failed: ${poErr.message}`);

    if (req.method === "GET") return new Response(bytes, { headers: { ...CORS, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${poNumber}.pdf"` } });
    return json({ success: true, po_id: po.id, po_number: po.po_number, pdf_storage_path: path });
  } catch (e) {
    console.error("generate-vendor-po error:", (e as Error).message);
    return json({ success: false, error: (e as Error).message }, 400);
  }
});
