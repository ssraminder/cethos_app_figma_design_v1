import { useEffect, useRef } from "react";
import { useLocation, Outlet } from "react-router-dom";
import { useQuote } from "@/context/QuoteContext";
import {
  trackPageView,
  trackQuoteStep,
  trackQuoteAbandonment,
  captureReferralSource,
  STEP_NAMES,
} from "@/lib/tracking";
import { useTrackingSettings } from "@/hooks/useTrackingSettings";

/**
 * Tracking layout that wraps ONLY the quote wizard routes.
 * Handles:
 *  - Capturing referral source on entry (once per session)
 *  - Tracking virtual pageviews on route/step changes
 *  - Tracking step progression
 *  - Tracking abandonment (beforeunload)
 *
 * Does NOT load GTM itself — that's handled by the global GoogleTagManager component,
 * which is already mounted at the app root.
 */
export default function QuoteTrackingLayout() {
  const location = useLocation();
  const { state } = useQuote();
  const { settings } = useTrackingSettings();
  const referralCaptured = useRef(false);
  const prevStep = useRef<number | null>(null);

  // Capture referral data once on first entry to quote flow
  useEffect(() => {
    if (!referralCaptured.current && settings.tracking_enabled) {
      captureReferralSource();
      referralCaptured.current = true;
    }
  }, [settings.tracking_enabled]);

  // Track virtual pageviews on route changes within the quote flow
  useEffect(() => {
    if (!settings.tracking_enabled) return;
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search, settings.tracking_enabled]);

  // Track step transitions
  useEffect(() => {
    if (!settings.tracking_enabled) return;
    if (prevStep.current !== null && prevStep.current !== state.currentStep) {
      const stepName = STEP_NAMES[state.currentStep] || `step_${state.currentStep}`;
      trackQuoteStep(state.currentStep, stepName, state.quoteId);
    }
    prevStep.current = state.currentStep;
  }, [state.currentStep, state.quoteId, settings.tracking_enabled]);

  // Track abandonment on beforeunload
  useEffect(() => {
    if (!settings.tracking_enabled) return;

    const handleBeforeUnload = () => {
      const stepName = STEP_NAMES[state.currentStep] || `step_${state.currentStep}`;
      trackQuoteAbandonment(state.currentStep, stepName, state.quoteId);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [state.currentStep, state.quoteId, settings.tracking_enabled]);

  return <Outlet />;
}
