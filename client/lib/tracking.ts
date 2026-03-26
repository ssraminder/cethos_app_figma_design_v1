// Portal conversion tracking for GA4 via GTM dataLayer
// Fires events ONLY on quote wizard pages — admin/dashboard routes are excluded
// by the QuoteTrackingLayout wrapper that calls these functions.

declare global {
  interface Window {
    dataLayer: Record<string, unknown>[];
  }
}

/**
 * Push a custom event to GTM dataLayer.
 * Silently no-ops if dataLayer isn't available (e.g., on admin pages where GTM isn't loaded).
 */
function pushEvent(eventName: string, params: Record<string, unknown> = {}) {
  if (!window.dataLayer) return;
  window.dataLayer.push({
    event: eventName,
    ...params,
  });
}

/**
 * Track SPA virtual pageview on route change within the quote flow.
 */
export function trackPageView(pagePath: string, pageTitle?: string) {
  pushEvent("virtualPageview", {
    page_path: pagePath,
    page_title: pageTitle || document.title,
    page_location: window.location.href,
  });
}

/**
 * Track quote wizard step progression.
 * Call when user advances to each step.
 */
export function trackQuoteStep(
  stepNumber: number,
  stepName: string,
  quoteId?: string | null,
) {
  pushEvent("quote_step_view", {
    step_number: stepNumber,
    step_name: stepName,
    quote_id: quoteId || "unknown",
  });
}

/**
 * Track quote wizard completion (final submission / payment).
 * This is the PRIMARY conversion event.
 */
export function trackQuoteSubmission(params: {
  quoteId: string;
  serviceType?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  fileCount?: number;
  totalAmount?: number;
  sourceUrl?: string;
  sourceLocation?: string;
}) {
  pushEvent("quote_submission_complete", {
    quote_id: params.quoteId,
    service_type: params.serviceType || "",
    source_language: params.sourceLanguage || "",
    target_language: params.targetLanguage || "",
    file_count: params.fileCount || 0,
    total_amount: params.totalAmount || 0,
    source_url: params.sourceUrl || "",
    source_location: params.sourceLocation || "",
    conversion_value: 1,
  });
}

/**
 * Track quote wizard abandonment (user leaves mid-flow).
 * Called on beforeunload while in the wizard.
 */
export function trackQuoteAbandonment(
  stepNumber: number,
  stepName: string,
  quoteId?: string | null,
) {
  pushEvent("quote_abandoned", {
    step_number: stepNumber,
    step_name: stepName,
    quote_id: quoteId || "unknown",
  });
}

/**
 * Track file upload events within the wizard.
 */
export function trackFileUpload(fileCount: number, totalSizeMB: number) {
  pushEvent("quote_file_upload", {
    file_count: fileCount,
    total_size_mb: Math.round(totalSizeMB * 100) / 100,
  });
}

/**
 * Track quote saved & emailed (alternative to payment).
 */
export function trackQuoteSaved(quoteId: string) {
  pushEvent("quote_saved", {
    quote_id: quoteId,
  });
}

/**
 * Capture referral source from URL parameters on portal arrival.
 * Call ONCE when entering the quote flow from cethos.com.
 *
 * Expected URL formats:
 *   portal.cethos.com/quote?id=xxx (website embed)
 *   portal.cethos.com/quote?quote_id=xxx&token=yyy (email link)
 *   portal.cethos.com/quote?id=xxx&source_url=/services/certified&utm_source=...
 */
export function captureReferralSource(): {
  quoteId: string | null;
  sourceUrl: string | null;
  sourceLocation: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referrer: string;
  entryType: string;
} {
  const params = new URLSearchParams(window.location.search);

  const quoteId = params.get("id") || params.get("quote_id");
  const entryType = params.get("id")
    ? "website_embed"
    : params.get("quote_id")
      ? "email_link"
      : "direct";

  const referralData = {
    quoteId,
    sourceUrl: params.get("source_url") || params.get("sourceUrl"),
    sourceLocation:
      params.get("source_location") || params.get("sourceLocation"),
    utmSource: params.get("utm_source"),
    utmMedium: params.get("utm_medium"),
    utmCampaign: params.get("utm_campaign"),
    referrer: document.referrer,
    entryType,
  };

  // Push referral data to dataLayer for GTM
  pushEvent("portal_entry", {
    quote_id: referralData.quoteId,
    source_url: referralData.sourceUrl,
    source_location: referralData.sourceLocation,
    utm_source: referralData.utmSource,
    utm_medium: referralData.utmMedium,
    utm_campaign: referralData.utmCampaign,
    referrer: referralData.referrer,
    entry_type: referralData.entryType,
  });

  // Store in sessionStorage so it persists across wizard steps
  sessionStorage.setItem("cethos_referral", JSON.stringify(referralData));

  return referralData;
}

/**
 * Retrieve stored referral source (from sessionStorage).
 * Use in later wizard steps to attribute the conversion.
 */
export function getReferralSource(): {
  quoteId: string | null;
  sourceUrl: string | null;
  sourceLocation: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referrer: string;
  entryType: string;
} | null {
  const stored = sessionStorage.getItem("cethos_referral");
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }
  return null;
}

/** Step number → human-readable name mapping for the 4-step wizard */
export const STEP_NAMES: Record<number, string> = {
  1: "file_upload",
  2: "translation_details",
  3: "contact_info",
  4: "review_checkout",
};
