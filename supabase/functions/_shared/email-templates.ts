/**
 * Inline HTML templates for all CVP transactional email (V1–V17).
 *
 * Each builder returns { subject, html, text } for sendMailgunEmail.
 * Copy changes land here, in PRs, reviewed like code.
 * For operational/ad-hoc emails (daily status digest, OTPs, vendor invites)
 * see the individual edge functions — those render their own HTML.
 */

const BRAND = {
  teal: "#0891B2",
  navy: "#0C2340",
  text: "#111827",
  muted: "#6B7280",
  border: "#E5E7EB",
  bg: "#F9FAFB",
  logoUrl:
    "https://lmzoyezvsjgsxveoakdr.supabase.co/storage/v1/object/public/web-assets/final_logo_light_bg_cethosAsset%201.svg",
};

function supportEmail(): string {
  return Deno.env.get("CVP_SUPPORT_EMAIL") ?? "vm@cethos.com";
}

function esc(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface ShellArgs {
  preheader?: string;
  heading: string;
  body: string;
  cta?: { label: string; url: string };
  footer?: string;
}

function shell({ preheader, heading, body, cta, footer }: ShellArgs): string {
  const preheaderBlock = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>`
    : "";
  const ctaBlock = cta
    ? `<p style="margin:24px 0;">
         <a href="${esc(cta.url)}" style="display:inline-block;background:${BRAND.teal};color:#fff;text-decoration:none;padding:11px 22px;border-radius:6px;font-weight:600;font-size:14px;">${esc(cta.label)}</a>
       </p>`
    : "";
  const footerBlock = footer
    ? `<p style="color:${BRAND.muted};font-size:12px;margin-top:32px;border-top:1px solid ${BRAND.border};padding-top:16px;">${footer}</p>`
    : `<p style="color:${BRAND.muted};font-size:12px;margin-top:32px;border-top:1px solid ${BRAND.border};padding-top:16px;">Questions? Reply to this email or contact <a href="mailto:${esc(supportEmail())}" style="color:${BRAND.teal};">${esc(supportEmail())}</a>.</p>`;
  return `
<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:${BRAND.bg};padding:24px 12px;">
${preheaderBlock}
<div style="max-width:640px;margin:0 auto;background:#fff;padding:24px 28px 32px;border:1px solid ${BRAND.border};border-radius:8px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${BRAND.text};">
  <div style="margin:0 0 20px;padding-bottom:16px;border-bottom:1px solid ${BRAND.border};">
    <img src="${BRAND.logoUrl}" alt="Cethos" width="120" height="auto" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:120px;">
  </div>
  <h1 style="color:${BRAND.teal};font-size:20px;margin:0 0 16px;">${esc(heading)}</h1>
  <div style="font-size:14px;line-height:1.55;">${body}</div>
  ${ctaBlock}
  ${footerBlock}
</div>
</body></html>`;
}

function textify(html: string): string {
  return html
    .replace(/<style[^>]*>.*?<\/style>/gs, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function render(subject: string, args: ShellArgs): RenderedEmail {
  const html = shell(args);
  return { subject, html, text: textify(html) };
}

// ---- V1: Application received ----
export interface V1Params {
  fullName: string;
  applicationNumber: string;
}
export function buildV1ApplicationReceived(p: V1Params): RenderedEmail {
  return render(`We received your application · ${p.applicationNumber}`, {
    preheader: "Thanks for applying to CETHOS — here's what happens next.",
    heading: `Thanks for applying, ${esc(p.fullName.split(" ")[0])}!`,
    body: `
      <p>We've received your application <strong>${esc(p.applicationNumber)}</strong>.</p>
      <p>Our AI pre-screen runs in the next few minutes. You'll hear from us again with either a test invitation or a status update within 1–2 business days.</p>
    `,
  });
}

// ---- V2: Prescreen passed ----
export interface V2Params {
  fullName: string;
  applicationNumber: string;
  roleType: string;
}
export function buildV2PrescreenPassed(p: V2Params): RenderedEmail {
  return render(`Your application moved forward · ${p.applicationNumber}`, {
    preheader: "You've cleared pre-screen. A test invitation is on its way.",
    heading: "You've cleared pre-screen",
    body: `
      <p>Hi ${esc(p.fullName)},</p>
      <p>Good news — application <strong>${esc(p.applicationNumber)}</strong> (${esc(p.roleType)}) has cleared our AI pre-screen.</p>
      <p>You'll receive a separate email shortly with a test invitation. Each test link is valid for 48 hours.</p>
    `,
  });
}

// ---- V3: Test invitation ----
export interface V3Params {
  fullName: string;
  applicationNumber: string;
  testCount: number;
  testLinksHtml: string; // pre-rendered <ul>…</ul> of test links
  expiryHours: number;
}
export function buildV3TestInvitation(p: V3Params): RenderedEmail {
  const isMulti = p.testCount > 1;
  const testWord = isMulti ? "tests" : "test";
  const areOrIs = isMulti ? "are" : "is";
  return render(`Your Cethos ${testWord} ${areOrIs} ready · ${p.applicationNumber}`, {
    preheader: `Open within ${p.expiryHours} hours. One click signs you in — no password needed.`,
    heading: `Your ${testWord} ${areOrIs} ready`,
    body: `
      <p>Hi ${esc(p.fullName)},</p>
      <p>Welcome to the next step of your application <strong>${esc(p.applicationNumber)}</strong> with Cethos. You have <strong>${p.testCount}</strong> ${testWord} waiting in our translator workspace.</p>

      <div style="margin:20px 0;padding:16px 18px;background:#F9FAFB;border:1px solid ${BRAND.border};border-radius:6px;">
        <div style="font-weight:600;color:${BRAND.navy};margin-bottom:10px;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">How this works</div>
        <ol style="margin:0;padding-left:20px;font-size:14px;line-height:1.6;color:${BRAND.text};">
          <li style="margin-bottom:6px;"><strong>Click "Open my test"</strong> below — that signs you in to <a href="https://tm.cethos.com" style="color:${BRAND.teal};">tm.cethos.com</a> automatically. No password.</li>
          <li style="margin-bottom:6px;"><strong>Translate each segment.</strong> The source is split into sentences on the left; type your translation on the right and click <strong style="color:${BRAND.teal};">Confirm ✓</strong> to lock each one in. Your work saves as you type.</li>
          <li style="margin-bottom:6px;"><strong>Click <span style="color:${BRAND.navy};">Submit test</span></strong> in the top bar when every segment is confirmed. We'll email you when the result is in.</li>
        </ol>
      </div>

      ${p.testLinksHtml}

      <div style="margin-top:24px;padding:14px 16px;background:#FFFBEB;border-left:3px solid #F59E0B;font-size:13px;color:#374151;">
        <strong>Heads up:</strong> the one-click links expire in <strong>${p.expiryHours} hours</strong> and can only be used once each. If a link stops working, sign in directly at <a href="https://tm.cethos.com" style="color:${BRAND.teal};">tm.cethos.com</a> with this email — we'll send you a 6-digit code instead.
      </div>

      <div style="margin-top:20px;font-size:13px;color:${BRAND.muted};">
        <strong style="color:${BRAND.text};">Need help?</strong>
        <ul style="margin:6px 0 0;padding-left:18px;line-height:1.55;">
          <li><strong>Lost the link?</strong> Just reply to this email and we'll resend.</li>
          <li><strong>Sign-in code didn't arrive?</strong> Check spam, then reply with your application number above.</li>
          <li><strong>Need more time?</strong> Tell us before the ${p.expiryHours}-hour window closes and we'll extend.</li>
        </ul>
      </div>
    `,
  });
}

// ---- V4: Test reminder 24h ----
export interface V4Params {
  fullName: string;
  applicationNumber: string;
  testLink: string;
  hoursRemaining: number;
}
export function buildV4TestReminder24hr(p: V4Params): RenderedEmail {
  return render(`Reminder: your CETHOS test expires in ${p.hoursRemaining}h`, {
    preheader: "Your test link hasn't been submitted yet.",
    heading: "Your test link is about to expire",
    body: `
      <p>Hi ${esc(p.fullName)},</p>
      <p>We noticed you haven't submitted your test yet for <strong>${esc(p.applicationNumber)}</strong>. The link expires in about <strong>${p.hoursRemaining} hours</strong>.</p>
    `,
    cta: { label: "Open test", url: p.testLink },
    footer: `If you're no longer interested, you can ignore this email.`,
  });
}

// ---- V5: Test expired ----
export interface V5Params {
  fullName: string;
  applicationNumber: string;
}
export function buildV5TestExpired(p: V5Params): RenderedEmail {
  return render(`Your test link expired · ${p.applicationNumber}`, {
    preheader: "Reply to this email and we can issue a new one.",
    heading: "Your test link has expired",
    body: `
      <p>Hi ${esc(p.fullName)},</p>
      <p>Your test link for <strong>${esc(p.applicationNumber)}</strong> has expired.</p>
      <p>If you'd still like to complete the test, reply to this email and we'll send a fresh link.</p>
    `,
  });
}

// ---- V6: Final chance day 7 ----
export interface V6Params {
  fullName: string;
  applicationNumber: string;
}
export function buildV6FinalChanceDay7(p: V6Params): RenderedEmail {
  return render(`Final check-in on application ${p.applicationNumber}`, {
    preheader: "One more chance to complete your CETHOS test.",
    heading: "Last chance to complete your test",
    body: `
      <p>Hi ${esc(p.fullName)},</p>
      <p>It's been a week since we sent your test link for <strong>${esc(p.applicationNumber)}</strong> and we haven't received a submission.</p>
      <p>If you'd still like to continue, reply to this email within 3 days. Otherwise we'll archive the application.</p>
    `,
  });
}

// ---- V7: Test received ----
export interface V7Params {
  fullName: string;
  applicationNumber: string;
}
export function buildV7TestReceived(p: V7Params): RenderedEmail {
  return render(`We received your test · ${p.applicationNumber}`, {
    preheader: "Your submission is in review.",
    heading: "Test received — thanks",
    body: `
      <p>Hi ${esc(p.fullName)},</p>
      <p>We've received your test submission for <strong>${esc(p.applicationNumber)}</strong>. Our AI assessment runs in the next few minutes, then a human reviewer takes a look.</p>
      <p>Expect to hear back within 2–3 business days.</p>
    `,
  });
}

// ---- V8: Under manual review ----
export interface V8Params {
  fullName: string;
  applicationNumber: string;
  roleType: string;
}
export function buildV8UnderManualReview(p: V8Params): RenderedEmail {
  return render(`Your application is under manual review · ${p.applicationNumber}`, {
    preheader: "A human reviewer is taking a closer look.",
    heading: "Under manual review",
    body: `
      <p>Hi ${esc(p.fullName)},</p>
      <p>Your ${esc(p.roleType)} application <strong>${esc(p.applicationNumber)}</strong> is being reviewed by one of our team members rather than our automated process. This usually means we want to weigh something carefully.</p>
      <p>We'll be in touch within 3–5 business days.</p>
    `,
  });
}

// ---- V9: Negotiation offer ----
export interface V9Params {
  fullName: string;
  applicationNumber: string;
  offeredRate: string;
  currency: string;
  negotiateLink: string;
  offerExpiresAt: string;
}
export function buildV9NegotiationOffer(p: V9Params): RenderedEmail {
  return render(`Rate offer for application ${p.applicationNumber}`, {
    preheader: `Our offer: ${p.offeredRate} ${p.currency}.`,
    heading: "Our rate offer",
    body: `
      <p>Hi ${esc(p.fullName)},</p>
      <p>Based on your test and experience, we'd like to offer a starting rate of <strong>${esc(p.offeredRate)} ${esc(p.currency)}</strong> for <strong>${esc(p.applicationNumber)}</strong>.</p>
      <p>You can accept or submit one counter-offer at the link below. This offer expires <strong>${esc(p.offerExpiresAt)}</strong>.</p>
    `,
    cta: { label: "Review & respond", url: p.negotiateLink },
  });
}

// ---- V10: Rate agreed ----
export interface V10Params {
  fullName: string;
  applicationNumber: string;
  agreedRate: string;
  currency: string;
}
export function buildV10RateAgreed(p: V10Params): RenderedEmail {
  return render(`Rate agreed · ${p.applicationNumber}`, {
    preheader: "We're moving to the final approval step.",
    heading: "Rate agreed",
    body: `
      <p>Hi ${esc(p.fullName)},</p>
      <p>We've agreed on a rate of <strong>${esc(p.agreedRate)} ${esc(p.currency)}</strong> for <strong>${esc(p.applicationNumber)}</strong>.</p>
      <p>You'll receive a welcome email with your vendor portal access shortly.</p>
    `,
  });
}

// Optional AI-generated personal note from staff. Appended to V11/V13 bodies
// when the staff member added context in the decision modal.
function staffMessageBlock(message?: string | null): string {
  if (!message || message.trim().length === 0) return "";
  return `<blockquote style="border-left:3px solid ${BRAND.teal};padding-left:12px;color:${BRAND.muted};margin:16px 0;">${message
    .split(/\n\n+/)
    .map((p) => `<p style="margin:6px 0;">${esc(p)}</p>`)
    .join("")}</blockquote>`;
}

// ---- V11: Approved / welcome ----
export interface V11Params {
  fullName: string;
  applicationNumber: string;
  vendorPortalUrl: string;
  passwordSetupLink: string;
  passwordSetupExpiryHours: number;
  approvedCombinationsList: string; // pre-rendered <ul>…</ul>
  staffMessage?: string | null;     // optional AI-rephrased staff note
}
export function buildV11ApprovedWelcome(p: V11Params): RenderedEmail {
  return render(`Welcome to CETHOS · ${p.applicationNumber}`, {
    preheader: "Your application is approved. Set up your password to get started.",
    heading: `Welcome to CETHOS, ${esc(p.fullName.split(" ")[0])}!`,
    body: `
      <p>Great news — your application <strong>${esc(p.applicationNumber)}</strong> is approved.</p>
      <p><strong>Approved for:</strong></p>
      ${p.approvedCombinationsList}
      ${staffMessageBlock(p.staffMessage)}
      <p>Set your password to activate your vendor portal access. The link expires in <strong>${p.passwordSetupExpiryHours} hours</strong>.</p>
    `,
    cta: { label: "Set up your password", url: p.passwordSetupLink },
    footer: `Your vendor portal: <a href="${esc(p.vendorPortalUrl)}" style="color:${BRAND.teal};">${esc(p.vendorPortalUrl)}</a>. Questions? <a href="mailto:${esc(supportEmail())}" style="color:${BRAND.teal};">${esc(supportEmail())}</a>.`,
  });
}

// ---- V12: Rejected ----
// `reasonSummary` is the AI-rephrased applicant-facing reason produced from
// the staff's raw notes. Never pass raw internal staff notes here.
export interface V12Params {
  fullName: string;
  applicationNumber: string;
  reasonSummary: string;
  reapplyAfterDate: string;
}
export function buildV12Rejected(p: V12Params): RenderedEmail {
  return render(`Update on application ${p.applicationNumber}`, {
    preheader: "Decision on your CETHOS application.",
    heading: "Update on your application",
    body: `
      <p>Hi ${esc(p.fullName)},</p>
      <p>Thanks for applying to CETHOS. After reviewing <strong>${esc(p.applicationNumber)}</strong>, we're not moving forward at this time.</p>
      <p><em>${esc(p.reasonSummary)}</em></p>
      <p>You're welcome to reapply after <strong>${esc(p.reapplyAfterDate)}</strong>. We wish you the best.</p>
    `,
  });
}

// ---- V13: Waitlisted ----
export interface V13Params {
  fullName: string;
  applicationNumber: string;
  waitlistPair: string;
  staffMessage?: string | null;     // optional AI-rephrased staff note
}
export function buildV13Waitlisted(p: V13Params): RenderedEmail {
  return render(`You've been waitlisted · ${p.applicationNumber}`, {
    preheader: "We'll be in touch when demand opens up for your language pair.",
    heading: "You're on our waitlist",
    body: `
      <p>Hi ${esc(p.fullName)},</p>
      <p>Your application <strong>${esc(p.applicationNumber)}</strong> is a strong fit, but we don't currently have regular work for the <strong>${esc(p.waitlistPair)}</strong> pair.</p>
      ${staffMessageBlock(p.staffMessage)}
      <p>We'll email you directly when demand opens up.</p>
    `,
  });
}

// ---- V14: Profile nudge ----
export interface V14Params {
  fullName: string;
  nudgeType: string;
  actionLabel: string;
  actionLink: string;
  message: string;
}
export function buildV14ProfileNudge(p: V14Params): RenderedEmail {
  return render(`Action needed on your CETHOS vendor profile`, {
    preheader: esc(p.message),
    heading: "A quick thing to update",
    body: `
      <p>Hi ${esc(p.fullName)},</p>
      <p>${esc(p.message)}</p>
    `,
    cta: { label: p.actionLabel, url: p.actionLink },
  });
}

// ---- V15: Certification expiry ----
export interface V15Params {
  fullName: string;
  certName: string;
  expiryDate: string;
  profileLink: string;
}
export function buildV15CertExpiry(p: V15Params): RenderedEmail {
  return render(`Certification expiring: ${p.certName}`, {
    preheader: `Expires ${p.expiryDate}.`,
    heading: "Certification expiry reminder",
    body: `
      <p>Hi ${esc(p.fullName)},</p>
      <p>Your certification <strong>${esc(p.certName)}</strong> is set to expire on <strong>${esc(p.expiryDate)}</strong>. Please upload an updated copy to keep receiving matching jobs.</p>
    `,
    cta: { label: "Update certifications", url: p.profileLink },
  });
}

// ---- V16: Language pairs check ----
export interface V16Params {
  fullName: string;
  profileLink: string;
}
export function buildV16LanguagePairsCheck(p: V16Params): RenderedEmail {
  return render(`Is your language pair list still accurate?`, {
    preheader: "Quick check-in on your working pairs.",
    heading: "Quick check on your language pairs",
    body: `
      <p>Hi ${esc(p.fullName)},</p>
      <p>It's been a while since you updated your language-pair list. Take 30 seconds to confirm it's still accurate so we match you to the right jobs.</p>
    `,
    cta: { label: "Review my pairs", url: p.profileLink },
  });
}

// ---- V17: Request more info ----
export interface V17Params {
  fullName: string;
  applicationNumber: string;
  requestDetails: string;
  infoDeadlineDate: string;
}
export function buildV17RequestMoreInfo(p: V17Params): RenderedEmail {
  return render(`We need a bit more info · ${p.applicationNumber}`, {
    preheader: `Reply by ${p.infoDeadlineDate}.`,
    heading: "A quick follow-up",
    body: `
      <p>Hi ${esc(p.fullName)},</p>
      <p>Before we can move application <strong>${esc(p.applicationNumber)}</strong> forward, we need some additional information:</p>
      <blockquote style="border-left:3px solid ${BRAND.teal};padding-left:12px;color:${BRAND.muted};">${esc(p.requestDetails)}</blockquote>
      <p>Please reply to this email by <strong>${esc(p.infoDeadlineDate)}</strong>.</p>
    `,
  });
}

// ---- V18: References — request to applicant ----
export interface V18Params {
  fullName: string;
  applicationNumber: string;
  staffMessage: string | null;   // optional Opus-drafted explanation
  contactsLinkUrl: string;        // /references/:request_token
  expiryDays: number;
}
export function buildV18ReferencesRequest(p: V18Params): RenderedEmail {
  const messageBlock = p.staffMessage
    ? `<p>${esc(p.staffMessage)}</p>`
    : `<p>To finalise your CETHOS application, we'd like to speak with two or three professional references who can vouch for your translation work — former clients, project managers, or peer translators are ideal.</p>`;
  return render(`Please share your references · ${p.applicationNumber}`, {
    preheader: "Send us 2–3 contacts and we'll handle the rest.",
    heading: `Hi ${esc(p.fullName.split(" ")[0])} — references, please`,
    body: `
      ${messageBlock}
      <p>Click the button below to enter your references' contact details. We'll reach out to them directly with a short questionnaire — you don't need to coordinate anything.</p>
      <p style="color:${BRAND.muted};font-size:13px;">This link expires in ${p.expiryDays} days.</p>
    `,
    cta: { label: "Add my references", url: p.contactsLinkUrl },
  });
}

// ---- V19: Reference — request to a specific reference ----
export interface V19Params {
  referenceName: string;
  applicantName: string;
  applicantApplicationNumber: string;
  feedbackLinkUrl: string;        // /reference-feedback/:feedback_token
  expiryDays: number;
}
export function buildV19ReferenceFeedbackRequest(p: V19Params): RenderedEmail {
  return render(`${p.applicantName} listed you as a reference`, {
    preheader: `A short questionnaire about ${p.applicantName.split(" ")[0]}'s translation work — under 5 minutes.`,
    heading: `${esc(p.applicantName)} listed you as a reference`,
    body: `
      <p>Hi ${esc(p.referenceName.split(" ")[0])},</p>
      <p><strong>${esc(p.applicantName)}</strong> is applying to join the CETHOS network of professional translators, and listed you as someone who can speak to their work.</p>
      <p>If you're willing, please answer a few short questions — under 5 minutes — by clicking the link below. Your responses go directly to our vendor-management team and aren't shared with ${esc(p.applicantName.split(" ")[0])}.</p>
      <p>If you don't recognise this person or would prefer not to respond, you can decline on the same page — no follow-up.</p>
      <p style="color:${BRAND.muted};font-size:13px;">This link expires in ${p.expiryDays} days.</p>
    `,
    cta: { label: "Respond now", url: p.feedbackLinkUrl },
  });
}

// ---- V20: Reference — thank-you ack after submission ----
export interface V20Params {
  referenceName: string;
  applicantName: string;
}
export function buildV20ReferenceAck(p: V20Params): RenderedEmail {
  return render(`Thanks for your reference for ${p.applicantName}`, {
    preheader: "Your input helps us build a stronger translator network.",
    heading: "Thank you",
    body: `
      <p>Hi ${esc(p.referenceName.split(" ")[0])},</p>
      <p>Thanks for taking the time to share your feedback on <strong>${esc(p.applicantName)}</strong>. Your input is genuinely useful — references are a meaningful part of how we evaluate new translators.</p>
      <p>You won't hear from us again about this application unless we have a follow-up question.</p>
      <p>If you ever need translation services yourself, we'd be glad to help — just reply to this email.</p>
    `,
  });
}

// ---- V21: Applicant — heads-up that a reference came in (suppressed by default) ----
export interface V21Params {
  fullName: string;
  applicationNumber: string;
  referenceName: string;
}
export function buildV21ApplicantReferenceReceived(p: V21Params): RenderedEmail {
  return render(`We've heard back from one of your references · ${p.applicationNumber}`, {
    preheader: `${p.referenceName} has responded.`,
    heading: "Reference received",
    body: `
      <p>Hi ${esc(p.fullName.split(" ")[0])},</p>
      <p>Just a quick note — <strong>${esc(p.referenceName)}</strong> has responded to our reference questionnaire for application <strong>${esc(p.applicationNumber)}</strong>.</p>
      <p>We'll be in touch once we've reviewed all responses. No action needed from you in the meantime.</p>
    `,
  });
}

// ---- V22: Test feedback request — applicant reviews per-error AI findings ----
// Sent after a test is graded, asking the applicant to Accept or Reject each
// finding the AI flagged. 4-day window. Comments must be in English so our
// review team (and the eventual auto-triage / paid reviewer pipeline) can
// read them across language pairs.
export interface V22Params {
  fullName: string;
  applicationNumber: string;
  reviewUrl: string;
  expiresInDays: number;
  errorCount: number;
  overallScore: number | null;
  pair: string;
}
export function buildV22TestFeedbackRequest(p: V22Params): RenderedEmail {
  const scoreLine = p.overallScore !== null
    ? `Your test scored <strong>${p.overallScore}/100</strong>.`
    : `Your test has been reviewed.`;
  return render(`We graded your ${p.pair} test — share your perspective · ${p.applicationNumber}`, {
    preheader: "Help us improve our review by responding to each finding.",
    heading: "We graded your test",
    body: `
      <p>Hi ${esc(p.fullName.split(" ")[0])},</p>
      <p>${scoreLine} Our AI reviewer flagged <strong>${p.errorCount}</strong> finding${p.errorCount === 1 ? "" : "s"} in your translation. We'd like your perspective on each one — agreeing where you do, and pushing back where you don't.</p>
      <p>This isn't an appeal. The score stands. We use your responses to train our reviewer better, so we want your honest take.</p>
      <p style="text-align: center; margin: 24px 0;">
        <a href="${esc(p.reviewUrl)}" style="display: inline-block; background: #0f766e; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Review the findings</a>
      </p>
      <p style="font-size: 13px; color: #475569;">Please write your comments in <strong>English</strong> — our review team handles many language pairs and reads everything in English.</p>
      <p style="font-size: 13px; color: #475569;">The link expires in <strong>${p.expiresInDays} day${p.expiresInDays === 1 ? "" : "s"}</strong>. If you don't respond, no problem — we'll proceed with the assessment as-is.</p>
    `,
  });
}

// ---- V23: Grading reminder for admin/grader staff ----
// Sent by cvp-check-grading-followups when a submission has been waiting on
// human grading for 3+ days without progress.
export interface V23Params {
  graderName: string;
  applicationNumber: string;
  applicantName: string;
  reminderIndex: 1 | 2 | 3;
  daysWaiting: number;
  reviewUrl: string;
}
export function buildV23GradingReminder(p: V23Params): RenderedEmail {
  const finalChance = p.reminderIndex === 3
    ? `<p><strong>This is the third and final reminder for this submission.</strong> If grading isn't completed, the submission will be re-routed.</p>`
    : "";
  return render(
    `Reminder #${p.reminderIndex}: grade pending test · ${p.applicationNumber}`,
    {
      preheader: `${p.applicantName}'s test has been waiting ${p.daysWaiting} days for grading.`,
      heading: `Grading reminder #${p.reminderIndex}`,
      body: `
        <p>Hi ${esc(p.graderName.split(" ")[0])},</p>
        <p>${esc(p.applicantName)}'s test (application <strong>${esc(p.applicationNumber)}</strong>) has been waiting <strong>${p.daysWaiting} days</strong> for human grading.</p>
        ${finalChance}
        <p style="text-align: center; margin: 24px 0;">
          <a href="${esc(p.reviewUrl)}" style="display: inline-block; background: #0f766e; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Review submission</a>
        </p>
      `,
    },
  );
}
