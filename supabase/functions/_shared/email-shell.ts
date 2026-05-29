// ============================================================================
// email-shell.ts — Cethos canonical transactional email shell + building blocks
// ----------------------------------------------------------------------------
// Server-side HTML-string equivalent of the Cethos Design System email shell
// (`email-templates/EmailShell.jsx`). Every transactional email in the
// Cethos system MUST use these helpers. Goals:
//   - One look. No more 9 different header colors.
//   - One width (600px), one font stack, one button language.
//   - Brand teal `#0891B2` is the only accent; status colors only signal state.
//   - Per-template metadata (name · version · date) rendered in the footer
//     beside the copyright line, so support staff can identify which
//     template / version generated a customer-facing email at a glance.
//
// ⚠️ KEEP IN SYNC with copies in the vendor portal (`D:\cethos-vendor`) and
//    the marketing site (`D:\cethos\main_web`). All three share the same
//    Supabase project so any drift will show up in customer inboxes within
//    hours. Same convention as `notify-counter.ts`.
//
// Reference inventory: `reports/email-templates-inventory.md`.
// ============================================================================

// ────────────────────────────────────────────────────────────────────────────
// Design tokens
// ────────────────────────────────────────────────────────────────────────────
export const C = {
  navy: "#0C2340",
  teal: "#0891B2",
  tealDeep: "#0E7490",
  tealBg: "#E0F2FE",
  gray: "#4B5563",
  muted: "#64748B",
  border: "#E5E7EB",
  slate50: "#F8FAFC",
  slate100: "#F1F5F9",
  slate200: "#E2E8F0",
  slate300: "#CBD5E1",
  white: "#FFFFFF",
  success: "#10B981",
  successBg: "#ECFDF5",
  successText: "#065F46",
  warn: "#F59E0B",
  warnBg: "#FFFBEB",
  warnText: "#92400E",
  error: "#EF4444",
  errorBg: "#FEF2F2",
  errorText: "#991B1B",
} as const;

export const FONT =
  "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";

// ────────────────────────────────────────────────────────────────────────────
// Logo URLs. Pick the variant that matches your header background.
//   LOGO_URL       → light-bg PNG. Use for WHITE / light-grey email headers.
//                    Default for `emailShell()`.
//   LOGO_URL_DARK  → dark-bg SVG. Use only when the email card has a navy
//                    header band (e.g. the legacy
//                    `notify-vendor-instructions-changed` layout).
// ────────────────────────────────────────────────────────────────────────────
export const LOGO_URL =
  Deno.env.get("CETHOS_EMAIL_LOGO_URL") ||
  "https://lmzoyezvsjgsxveoakdr.supabase.co/storage/v1/object/public/web-assets/png_logo_cethos_light_bg.png";
export const LOGO_URL_DARK =
  Deno.env.get("CETHOS_EMAIL_LOGO_URL_DARK") ||
  "https://lmzoyezvsjgsxveoakdr.supabase.co/storage/v1/object/public/web-assets/final_logo_dark_bg_cethosAsset%202.svg";

// Reply addresses by audience. Use `REPLY.x` rather than hardcoding strings
// so audience-routing stays single-source.
export const REPLY = {
  customer: "support@cethos.com",
  ar: "ar@cethos.com",
  vendor: "vendor@cethos.com",
  vendorMgmt: "vm@cethos.com",
  ops: "ops@cethos.com",
} as const;

// Company facts pulled into the footer.
export const COMPANY = {
  legalName: "Cethos Solutions Inc.",
  address: "421 7 Avenue SW, Floor 30, Calgary, AB T2P 4K9",
  website: "https://cethos.com",
} as const;

// ────────────────────────────────────────────────────────────────────────────
// Template metadata.
//
// Every email template MUST declare a TemplateMeta object at the top of its
// file and pass it to `emailShell(body, { template })`. The shell renders
//
//   © 2026 Cethos Solutions Inc. · {name} v{version} · Updated {updatedAt}
//
// in the footer beside the copyright. This gives support staff an at-a-glance
// answer to "which template/version produced this email?" without grepping.
//
// Conventions:
//   name       Human-readable, Title Case, no abbreviations.
//              e.g. "Quote Ready", "Vendor Job Offer", "Order Confirmation".
//   version    Semver-style. Bump major on copy/structure changes that affect
//              customer comprehension, minor for visual tweaks.
//   updatedAt  ISO date (YYYY-MM-DD), no time component.
//
// Example at the top of a template file:
//   const TEMPLATE: TemplateMeta = {
//     name: "Quote Ready",
//     version: "1.0",
//     updatedAt: "2026-05-28",
//   };
// ────────────────────────────────────────────────────────────────────────────
export interface TemplateMeta {
  name: string;
  version: string;
  updatedAt: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Escaping. ALWAYS escape strings that came from the database before they
// bleed into HTML. The blocks below assume their `string` inputs are already
// safe HTML — only `esc()` on the way in if you control the call site.
// ────────────────────────────────────────────────────────────────────────────
export const esc = (s: string | number | null | undefined): string => {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return c;
    }
  });
};

// ────────────────────────────────────────────────────────────────────────────
// The canonical shell.
//
// Use:
//   const TEMPLATE: TemplateMeta = { name: "Quote Ready", version: "1.0", updatedAt: "2026-05-28" };
//   const html = emailShell(
//     [title("..."), lead("..."), detailsTable([...]), ctaButton({...})].join(""),
//     { replyTo: REPLY.customer, template: TEMPLATE }
//   );
// ────────────────────────────────────────────────────────────────────────────
export interface EmailShellOptions {
  /** Email address printed in the footer ("Reply to ..."). */
  replyTo?: string;
  /** Optional preheader text — hidden, surfaces in inbox previews. */
  preheader?: string;
  /** Per-template metadata. Rendered in the footer beside the copyright. */
  template?: TemplateMeta;
  /** Override the default light-bg logo with the dark-bg variant. */
  logoVariant?: "light" | "dark";
}

export function emailShell(bodyHtml: string, opts: EmailShellOptions = {}): string {
  const replyTo = opts.replyTo ?? REPLY.customer;
  const logo = opts.logoVariant === "dark" ? LOGO_URL_DARK : LOGO_URL;
  const year = new Date().getFullYear();

  const preheader = opts.preheader
    ? `<div style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${esc(opts.preheader)}</div>`
    : "";

  // Footer metadata line. Always shows copyright; appends template name/version/date
  // when provided so we can trace a customer-facing email back to the source.
  const tplLine = opts.template
    ? ` · <span style="color:${C.muted};">${esc(opts.template.name)} v${esc(opts.template.version)} · Updated ${esc(opts.template.updatedAt)}</span>`
    : "";

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Cethos</title>
<!--[if mso]>
<xml>
  <o:OfficeDocumentSettings xmlns:o="urn:schemas-microsoft-com:office:office">
    <o:AllowPNG/>
    <o:PixelsPerInch>96</o:PixelsPerInch>
  </o:OfficeDocumentSettings>
</xml>
<style type="text/css">
  table, td, div, h1, h2, p, a { font-family: 'Segoe UI', Arial, sans-serif !important; }
</style>
<![endif]-->
<style type="text/css">
  html, body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
  * { -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; }
  img { -ms-interpolation-mode: bicubic; border: 0; line-height: 100%; outline: none; text-decoration: none; }
  a { text-decoration: none; }
  a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
  @media only screen and (max-width: 620px) {
    .cethos-card { width: 100% !important; max-width: 100% !important; border-radius: 0 !important; }
    .cethos-pad { padding-left: 20px !important; padding-right: 20px !important; }
    .cethos-h1 { font-size: 22px !important; line-height: 1.25 !important; }
    .cethos-delivery-cell { display: block !important; width: 100% !important; padding: 0 0 12px !important; }
    .cethos-meta { font-size: 10.5px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;width:100%;background:${C.slate50};font-family:${FONT};color:${C.gray};font-size:15px;line-height:1.55;">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.slate50};padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="cethos-card" style="background:${C.white};border-radius:12px;overflow:hidden;border:1px solid ${C.border};max-width:600px;box-shadow:0 1px 3px rgba(12,35,64,0.06);">
      <tr>
        <td class="cethos-pad" style="padding:26px 32px 22px;border-bottom:2px solid ${C.teal};background:${C.white};">
          <img src="${logo}" alt="Cethos" height="32" style="height:32px;display:block;border:0;outline:none;text-decoration:none;" />
        </td>
      </tr>
      <tr>
        <td class="cethos-pad" style="padding:32px 32px 28px;color:${C.gray};font-size:15px;line-height:1.6;font-family:${FONT};">
${bodyHtml}
        </td>
      </tr>
      <tr>
        <td class="cethos-pad cethos-meta" style="padding:18px 32px;border-top:1px solid ${C.border};background:${C.slate50};font-size:11.5px;color:${C.muted};line-height:1.6;">
          <div>${esc(COMPANY.legalName)} · ${esc(COMPANY.address)}</div>
          <div style="margin-top:2px;">
            Reply to <a href="mailto:${esc(replyTo)}" style="color:${C.tealDeep};text-decoration:none;">${esc(replyTo)}</a>
            ·
            <a href="${esc(COMPANY.website)}" style="color:${C.tealDeep};text-decoration:none;">cethos.com</a>
          </div>
          <div style="margin-top:6px;color:${C.slate300};">© ${year} ${esc(COMPANY.legalName)}. All rights reserved.${tplLine}</div>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ────────────────────────────────────────────────────────────────────────────
// Building blocks. All return HTML strings.
// Callers compose them with `[a, b, c].join("")`.
//
// **Inputs that interpolate are responsible for escaping themselves.** Helpers
// that take a single string (`title`, `lead`) accept either pre-escaped text
// or text that you want to bleed unescaped (eg. with `<strong>` mixed in). If
// you're rendering data straight from the DB, wrap it with `esc()` first.
// ────────────────────────────────────────────────────────────────────────────

export type EyebrowTone = "teal" | "success" | "warn" | "error" | "muted";

export function eyebrow(text: string, tone: EyebrowTone = "teal"): string {
  const colorMap: Record<EyebrowTone, string> = {
    teal: C.teal,
    success: C.success,
    warn: C.warn,
    error: C.error,
    muted: C.muted,
  };
  return `<div style="font-size:11px;font-weight:700;color:${colorMap[tone]};text-transform:uppercase;letter-spacing:0.12em;margin:0 0 10px;">${text}</div>`;
}

export function title(text: string): string {
  return `<h1 class="cethos-h1" style="margin:0 0 14px;font-size:24px;font-weight:700;line-height:1.25;color:${C.navy};letter-spacing:-0.005em;font-family:${FONT};">${text}</h1>`;
}

export function lead(text: string): string {
  return `<p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:${C.gray};">${text}</p>`;
}

export function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:14.5px;line-height:1.6;color:${C.gray};">${text}</p>`;
}

export function hint(text: string): string {
  return `<p style="margin:20px 0 0;font-size:12.5px;color:${C.muted};line-height:1.55;">${text}</p>`;
}

export function hr(): string {
  return `<div style="height:1px;background:${C.border};margin:18px 0;"></div>`;
}

export function strong(text: string): string {
  return `<span style="color:${C.navy};font-weight:700;">${text}</span>`;
}

// ────────────────────────────────────────────────────────────────────────────
// Details table — label/value rows in a tinted card.
// ────────────────────────────────────────────────────────────────────────────
export type DetailRow = [string, string];

export function detailsTable(rows: DetailRow[]): string {
  const inner = rows
    .map(([k, v], i) => {
      const border = i < rows.length - 1 ? `border-bottom:1px solid ${C.slate200};` : "";
      return `<tr style="${border}"><td style="padding:10px 16px;color:${C.muted};font-size:13px;width:40%;vertical-align:top;">${esc(k)}</td><td style="padding:10px 16px;color:${C.navy};font-size:13.5px;font-weight:500;">${v}</td></tr>`;
    })
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 24px;background:${C.slate50};border-radius:8px;overflow:hidden;"><tbody>${inner}</tbody></table>`;
}

// ────────────────────────────────────────────────────────────────────────────
// CTA button.
//   variant: "primary" (teal) | "navy" (payment) | "success"
//   align:   "left" (default) | "center" (OTP) | "full" (single high-intent)
// ────────────────────────────────────────────────────────────────────────────
export type CtaVariant = "primary" | "navy" | "success";
export type CtaAlign = "left" | "center" | "full";

export function ctaButton(args: {
  label: string;
  url: string;
  variant?: CtaVariant;
  align?: CtaAlign;
}): string {
  const variant = args.variant ?? "primary";
  const align = args.align ?? "left";
  const bg = variant === "navy" ? C.navy : variant === "success" ? C.success : C.teal;
  const full = align === "full";
  const tableAlign = align === "center" || full ? "center" : "left";
  const tableAttrs = full ? `width="100%"` : "";
  const tableMargin = full
    ? `margin:8px 0 4px;width:100%;`
    : align === "center"
      ? `margin:8px auto 4px;`
      : `margin:8px 0 4px;`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ${tableAttrs} align="${tableAlign}" style="${tableMargin}border-collapse:separate;"><tbody><tr><td align="center" bgcolor="${bg}" style="background:${bg};border-radius:8px;${full ? "" : "padding:0;"}"><a href="${esc(args.url)}" target="_blank" style="display:${full ? "block" : "inline-block"};padding:14px 28px;color:${C.white};text-decoration:none;font-weight:600;font-size:15px;font-family:${FONT};text-align:center;border-radius:8px;">${esc(args.label)}</a></td></tr></tbody></table>`;
}

// ────────────────────────────────────────────────────────────────────────────
// Callout — left-bordered info/success/warn/error card.
// ────────────────────────────────────────────────────────────────────────────
export type CalloutTone = "info" | "success" | "warn" | "error";

export function callout(args: {
  tone?: CalloutTone;
  title?: string;
  body: string;
}): string {
  const tone = args.tone ?? "info";
  const styles: Record<CalloutTone, { bg: string; border: string; text: string; titleColor: string }> = {
    info: { bg: C.tealBg, border: C.teal, text: C.tealDeep, titleColor: C.navy },
    success: { bg: C.successBg, border: C.success, text: C.successText, titleColor: C.successText },
    warn: { bg: C.warnBg, border: C.warn, text: C.warnText, titleColor: C.warnText },
    error: { bg: C.errorBg, border: C.error, text: C.errorText, titleColor: C.errorText },
  };
  const s = styles[tone];
  const titleHtml = args.title
    ? `<div style="font-weight:600;font-size:13px;color:${s.titleColor};margin:0 0 4px;">${esc(args.title)}</div>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 22px;"><tbody><tr><td style="background:${s.bg};border-left:3px solid ${s.border};border-radius:0 8px 8px 0;padding:12px 16px;">${titleHtml}<div style="font-size:13px;color:${s.text};line-height:1.55;">${args.body}</div></td></tr></tbody></table>`;
}

// ────────────────────────────────────────────────────────────────────────────
// Amount card — the big "Amount due" feature used by pay/deposit emails.
// ────────────────────────────────────────────────────────────────────────────
export function amountCard(args: {
  amount: string;
  currency?: string;
  label?: string;
}): string {
  const label = args.label ?? "Amount due";
  const currency = args.currency ?? "CAD";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tbody><tr><td style="background:${C.slate50};border:1px solid ${C.slate200};border-top:3px solid ${C.teal};border-radius:10px;padding:24px 22px;text-align:center;"><div style="font-size:10.5px;font-weight:700;color:${C.muted};text-transform:uppercase;letter-spacing:0.14em;margin:0 0 8px;">${esc(label)}</div><div style="font-size:38px;font-weight:800;color:${C.navy};letter-spacing:-0.01em;line-height:1.1;">${esc(args.amount)}</div><div style="font-size:12px;color:${C.muted};margin:6px 0 0;">${esc(currency)}</div></td></tr></tbody></table>`;
}

// ────────────────────────────────────────────────────────────────────────────
// Code block — centred verification code for OTP emails.
// ────────────────────────────────────────────────────────────────────────────
export function codeBlock(args: { code: string; expiresIn?: string }): string {
  const expires = args.expiresIn
    ? `<div style="margin:12px 0 0;font-size:12.5px;color:${C.muted};">Expires in ${esc(args.expiresIn)}</div>`
    : "";
  return `<div style="text-align:center;margin:0 0 22px;"><div style="display:inline-block;padding:20px 36px;background:${C.slate50};border:2px solid ${C.slate200};border-radius:12px;font-family:'SF Mono',Menlo,Monaco,'Courier New',monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:${C.navy};">${esc(args.code)}</div>${expires}</div>`;
}

// ────────────────────────────────────────────────────────────────────────────
// Status badge — small pill, used inline above the title.
// ────────────────────────────────────────────────────────────────────────────
export type BadgeTone = "success" | "warn" | "error" | "info";

export function statusBadge(tone: BadgeTone, text: string): string {
  const styles: Record<BadgeTone, { bg: string; color: string; dot: string }> = {
    success: { bg: C.successBg, color: C.successText, dot: C.success },
    warn: { bg: C.warnBg, color: C.warnText, dot: C.warn },
    error: { bg: C.errorBg, color: C.errorText, dot: C.error },
    info: { bg: C.tealBg, color: C.tealDeep, dot: C.teal },
  };
  const s = styles[tone];
  return `<div style="margin:0 0 12px;"><span style="display:inline-block;padding:4px 12px;border-radius:9999px;background:${s.bg};color:${s.color};font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${s.dot};margin-right:6px;vertical-align:middle;"></span>${esc(text)}</span></div>`;
}

// ────────────────────────────────────────────────────────────────────────────
// Line items table — invoices and quote-ready emails.
//   totals[i].emphasis: undefined → muted label / regular row,
//                       "total"   → teal tint, navy total
//                       "grand"   → navy background, white "Total due"
// ────────────────────────────────────────────────────────────────────────────
export interface LineItem {
  label: string;
  sub?: string;
  amount: string;
}
export type TotalEmphasis = undefined | "total" | "grand";
export interface LineTotal {
  label: string;
  amount: string;
  emphasis?: TotalEmphasis;
}

export function lineItemsTable(args: { items: LineItem[]; totals: LineTotal[] }): string {
  const itemRows = args.items
    .map((it) => {
      const sub = it.sub
        ? `<div style="font-size:11.5px;color:${C.muted};margin:2px 0 0;">${esc(it.sub)}</div>`
        : "";
      return `<tr style="border-top:1px solid ${C.border};"><td style="padding:12px 14px;font-size:13.5px;color:${C.navy};"><div style="font-weight:500;">${esc(it.label)}</div>${sub}</td><td style="padding:12px 14px;font-size:13.5px;color:${C.navy};text-align:right;font-weight:500;">${esc(it.amount)}</td></tr>`;
    })
    .join("");
  const totalRows = args.totals
    .map((t) => {
      const isGrand = t.emphasis === "grand";
      const isTotal = t.emphasis === "total";
      const bg = isGrand ? C.navy : isTotal ? C.tealBg : C.slate50;
      const labelColor = isGrand ? C.white : isTotal ? C.navy : C.muted;
      const amountColor = isGrand ? C.white : C.navy;
      const fontSize = isGrand ? 16 : 13;
      const labelSize = isGrand ? 14 : 13;
      const fontWeight = t.emphasis ? 700 : 400;
      const pad = isGrand ? "12px 14px" : "10px 14px";
      const borderTop = isGrand ? `1px solid ${C.navy}` : `1px solid ${C.border}`;
      return `<tr style="background:${bg};border-top:${borderTop};"><td style="padding:${pad};font-size:${labelSize}px;color:${labelColor};font-weight:${fontWeight};">${esc(t.label)}</td><td style="padding:${pad};font-size:${fontSize}px;color:${amountColor};text-align:right;font-weight:${fontWeight};">${esc(t.amount)}</td></tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 22px;border:1px solid ${C.border};border-radius:8px;overflow:hidden;"><thead><tr style="background:${C.slate50};"><th style="padding:10px 14px;text-align:left;font-size:11px;color:${C.muted};text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">Description</th><th style="padding:10px 14px;text-align:right;font-size:11px;color:${C.muted};text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">Amount</th></tr></thead><tbody>${itemRows}${totalRows}</tbody></table>`;
}

// ────────────────────────────────────────────────────────────────────────────
// Delivery options — side-by-side Standard/Rush cards.
// Used by quote-ready + pay-link emails.
// ────────────────────────────────────────────────────────────────────────────
export function deliveryOptions(args: {
  standardDate: string;
  rushDate: string;
  rushLabel: string;
  selected?: "standard" | "rush" | null;
}): string {
  const sel = args.selected ?? null;

  const card = (
    key: "standard" | "rush",
    titleText: string,
    date: string,
    badge: string | null,
  ): string => {
    const isSel = sel === key;
    const borderColor = isSel ? C.teal : C.slate200;
    const bg = isSel ? C.tealBg : C.white;
    const eyebrowColor = isSel ? C.tealDeep : C.muted;
    const badgeHtml = badge ? ` · <span style="color:#9A3412;">${esc(badge)}</span>` : "";
    const selectedHtml = isSel
      ? `<div style="font-size:11px;color:${C.tealDeep};font-weight:600;margin:4px 0 0;">Selected</div>`
      : "";
    const padding = key === "standard" ? "0 6px 0 0" : "0 0 0 6px";
    return `<td class="cethos-delivery-cell" width="50%" valign="top" style="vertical-align:top;padding:${padding};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tbody><tr><td style="border:1.5px solid ${borderColor};background:${bg};border-radius:10px;padding:14px 16px;"><div style="font-size:10px;font-weight:700;color:${eyebrowColor};text-transform:uppercase;letter-spacing:0.1em;margin:0 0 6px;">${esc(titleText)}${badgeHtml}</div><div style="font-size:15px;font-weight:700;color:${C.navy};">${esc(date)}</div>${selectedHtml}</td></tr></tbody></table></td>`;
  };

  return `<div style="font-size:10.5px;font-weight:700;color:${C.muted};text-transform:uppercase;letter-spacing:0.12em;margin:0 0 10px;">Delivery options</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 24px;"><tbody><tr>${card("standard", "Standard", args.standardDate, null)}${card("rush", "Rush", args.rushDate, args.rushLabel)}</tr></tbody></table>`;
}

// ────────────────────────────────────────────────────────────────────────────
// Numbered "what happens next" list — used by success/confirmation emails.
// ────────────────────────────────────────────────────────────────────────────
export function nextSteps(label: string, steps: string[]): string {
  const items = steps.map((s) => `<li style="margin:0 0 6px;">${s}</li>`).join("");
  return `<p style="margin:0 0 12px;font-size:14px;font-weight:600;color:${C.navy};">${esc(label)}</p><ol style="margin:0 0 22px 20px;padding:0;font-size:14px;color:${C.gray};line-height:1.7;">${items}</ol>`;
}

// ────────────────────────────────────────────────────────────────────────────
// Bulleted list — same family as nextSteps but unordered.
// ────────────────────────────────────────────────────────────────────────────
export function bulletList(label: string, items: string[]): string {
  const lis = items.map((s) => `<li style="margin:0 0 6px;">${s}</li>`).join("");
  return `<p style="margin:0 0 12px;font-size:14px;font-weight:600;color:${C.navy};">${esc(label)}</p><ul style="margin:0 0 22px 20px;padding:0;font-size:14px;color:${C.gray};line-height:1.7;">${lis}</ul>`;
}

// ────────────────────────────────────────────────────────────────────────────
// Message blockquote — for forwarding a customer's or staff member's message.
// ────────────────────────────────────────────────────────────────────────────
export function messageBlock(body: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 22px;"><tbody><tr><td style="background:${C.tealBg};border-left:3px solid ${C.teal};border-radius:0 8px 8px 0;padding:14px 18px;font-size:14.5px;color:${C.navy};line-height:1.6;white-space:pre-wrap;">${body}</td></tr></tbody></table>`;
}

// ────────────────────────────────────────────────────────────────────────────
// Default Brevo sender payload.
// ────────────────────────────────────────────────────────────────────────────
export interface BrevoPayloadArgs {
  to: Array<{ email: string; name?: string }>;
  subject: string;
  html: string;
  replyTo?: string;
  cc?: Array<{ email: string }>;
  senderName?: string;
  senderEmail?: string;
  tags?: string[];
  attachment?: Array<{ content: string; name: string }>;
  headers?: Record<string, string>;
}

export function brevoPayload(args: BrevoPayloadArgs): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    sender: {
      name: args.senderName ?? "Cethos Translation Services",
      email: args.senderEmail ?? "donotreply@cethos.com",
    },
    to: args.to,
    subject: args.subject,
    htmlContent: args.html,
    tags: args.tags ?? [],
  };
  if (args.replyTo) payload.replyTo = { email: args.replyTo };
  if (args.cc && args.cc.length > 0) payload.cc = args.cc;
  if (args.attachment && args.attachment.length > 0) payload.attachment = args.attachment;
  if (args.headers) payload.headers = args.headers;
  return payload;
}
