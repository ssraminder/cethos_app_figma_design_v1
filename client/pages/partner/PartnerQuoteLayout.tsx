// PartnerQuoteLayout.tsx
// Branded wrapper for partner quote flow — Design A
// Renders existing Step1-Step4 components with partner branding header + footer

import { useState, useEffect } from "react";
import { useQuote } from "@/context/QuoteContext";
import ProgressStepper from "@/components/quote/ProgressStepper";
import ProcessingStatus from "@/components/ProcessingStatus";
import Step1Upload from "@/components/quote/Step1Upload";
import Step2Details from "@/components/quote/Step2Details";
import Step3Contact from "@/components/quote/Step3Contact";
import Step4ReviewCheckout from "@/components/quote/Step4ReviewCheckout";

interface PartnerData {
  partner_id: string;
  code: string;
  name: string;
  customer_rate: number;
  logo_url: string | null;
  welcome_message: string | null;
  has_pickup_location: boolean;
  contact_email: string | null;
  contact_phone: string | null;
  business_address_line1: string | null;
  business_city: string | null;
  business_province: string | null;
  business_postal_code: string | null;
}

interface Props {
  partnerData: PartnerData;
}

export default function PartnerQuoteLayout({ partnerData }: Props) {
  const { state, updateState } = useQuote();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Override scrollbar-gutter on html so backgrounds can span full viewport width
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.scrollbarGutter;
    html.style.scrollbarGutter = "auto";
    return () => {
      html.style.scrollbarGutter = prev;
    };
  }, []);

  const handleProcessingComplete = () => {
    updateState({
      showProcessingModal: false,
      isProcessing: false,
      currentStep: 4,
    });
  };

  const handleEmailInstead = () => {
    updateState({ showProcessingModal: false, isProcessing: false });
  };

  // Header contact data
  const contactPhone = partnerData.contact_phone;
  const contactEmail = partnerData.contact_email;

  // Footer contact logic — use partner data, fall back to CETHOS
  const hasPartnerContact =
    partnerData.contact_email ||
    partnerData.contact_phone ||
    partnerData.business_address_line1;

  const footerContactName = hasPartnerContact
    ? partnerData.name
    : "CETHOS Translation Services";
  const footerAddress = hasPartnerContact
    ? partnerData.business_address_line1 || ""
    : "";
  const footerCityLine = hasPartnerContact
    ? [
        partnerData.business_city,
        partnerData.business_province,
        partnerData.business_postal_code,
      ]
        .filter(Boolean)
        .join(", ")
    : "Calgary, AB, Canada";
  const footerEmail = hasPartnerContact
    ? partnerData.contact_email || ""
    : "info@cethos.com";
  const footerPhone = hasPartnerContact
    ? partnerData.contact_phone || ""
    : "1-844-280-1313";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
        display: "flex",
        flexDirection: "column",
        width: "100vw",
        overflowX: "hidden",
      }}
    >
      {/* ── HEADER ───────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0" }}>
        <div
          style={{
            padding: "20px 24px",
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            justifyContent: "space-between",
            alignItems: isMobile ? "center" : "center",
            gap: isMobile ? 12 : 20,
          }}
        >
          {/* Left: Partner logo or name */}
          <div>
            {partnerData.logo_url && partnerData.logo_url.trim().startsWith("http") ? (
              <img
                src={partnerData.logo_url}
                alt={partnerData.name}
                style={{
                  height: 44,
                  maxWidth: 180,
                  objectFit: "contain",
                  display: "block",
                }}
              />
            ) : (
              <span
                style={{ fontSize: 20, fontWeight: 400, color: "#0C2340" }}
              >
                {partnerData.name}
              </span>
            )}
          </div>

          {/* Right: Phone + Email */}
          {(contactPhone || contactEmail) && (
            <div style={{ textAlign: isMobile ? "center" : "right" }}>
              {contactPhone && (
                <a
                  href={`tel:${contactPhone}`}
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: "#0C2340",
                    textDecoration: "none",
                    display: "block",
                  }}
                >
                  {contactPhone}
                </a>
              )}
              {contactEmail && (
                <a
                  href={`mailto:${contactEmail}`}
                  style={{
                    fontSize: 12,
                    color: "#64748b",
                    textDecoration: "none",
                    display: "block",
                    marginTop: 2,
                  }}
                >
                  {contactEmail}
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── WELCOME BAR (optional) ───────────────────────────── */}
      {partnerData.welcome_message && (
        <div
          style={{ background: "#ecfeff", borderBottom: "1px solid #cdf5f6" }}
        >
          <div
            style={{
              padding: "10px 24px",
              fontSize: 13,
              color: "#0e7490",
              lineHeight: 1.5,
              textAlign: "center",
            }}
          >
            {partnerData.welcome_message}
          </div>
        </div>
      )}

      {/* ── QUOTE FLOW CONTENT ─────────────────────────────── */}
      <div
        style={{ flex: 1 }}
        className={`mx-auto py-7 pb-24 ${state.currentStep === 4 ? "max-w-7xl px-4 sm:px-6 lg:px-8" : "max-w-2xl px-5"}`}
      >
        <ProgressStepper
          currentStep={state.currentStep}
          className={`mb-7 ${state.currentStep === 4 ? "max-w-2xl mx-auto" : ""}`}
        />

        {/* Processing Modal */}
        {state.showProcessingModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <ProcessingStatus
              quoteId={state.quoteId ?? ""}
              onComplete={handleProcessingComplete}
              onEmailInstead={handleEmailInstead}
            />
          </div>
        )}

        {/* Step Components — same as /quote flow */}
        {state.currentStep === 1 && <Step1Upload />}
        {state.currentStep === 2 && <Step2Details />}
        {state.currentStep === 3 && <Step3Contact />}
        {!state.showProcessingModal && state.currentStep === 4 && (
          <Step4ReviewCheckout />
        )}
      </div>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <div
        style={{
          background: "#0C2340",
          position: "relative",
          fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
        }}
      >
        {/* Teal accent line */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: "linear-gradient(90deg, #0891B2, #0e7490)",
          }}
        />

        <div style={{ padding: "0 24px" }}>
          {/* Main footer content */}
          <div
            style={{
              padding: "32px 0 24px",
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              justifyContent: "space-between",
              alignItems: isMobile ? "center" : "flex-start",
              gap: isMobile ? 28 : 40,
            }}
          >
            {/* Left: CETHOS branding */}
            <div style={{ flex: 1, textAlign: isMobile ? "center" : "left" }}>
              <div
                style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}
              >
                Powered by
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
                <a
                  href="https://www.cethos.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#fff", textDecoration: "none" }}
                >
                  CETHOS Translation Services
                </a>
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "#94a3b8",
                  lineHeight: 1.65,
                  maxWidth: isMobile ? undefined : 340,
                }}
              >
                Certified translation partner of{" "}
                <strong style={{ color: "#e2e8f0", fontWeight: 600 }}>
                  {partnerData.name}
                </strong>
                . All translations are completed by licensed translators and
                certified for official use.
              </div>
            </div>

            {/* Right: Partner contact OR CETHOS fallback */}
            <div
              style={{
                textAlign: isMobile ? "center" : "right",
                minWidth: isMobile ? undefined : 200,
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#fff",
                  marginBottom: 8,
                }}
              >
                {footerContactName}
              </div>
              <div
                style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.8 }}
              >
                {footerAddress && (
                  <>
                    {footerAddress}
                    <br />
                  </>
                )}
                {footerCityLine && (
                  <>
                    {footerCityLine}
                    <br />
                    <br />
                  </>
                )}
                {footerEmail && (
                  <>
                    <a
                      href={`mailto:${footerEmail}`}
                      style={{ color: "#0891B2", textDecoration: "none" }}
                    >
                      {footerEmail}
                    </a>
                    <br />
                  </>
                )}
                {footerPhone && (
                  <a
                    href={`tel:${footerPhone}`}
                    style={{ color: "#0891B2", textDecoration: "none" }}
                  >
                    {footerPhone}
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div
            style={{
              borderTop: "1px solid rgba(255,255,255,0.07)",
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "14px 0",
              gap: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 20,
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <a
                href="/terms"
                style={{
                  fontSize: 11,
                  color: "#64748b",
                  textDecoration: "none",
                }}
              >
                Terms of Service
              </a>
              <a
                href="/privacy"
                style={{
                  fontSize: 11,
                  color: "#64748b",
                  textDecoration: "none",
                }}
              >
                Privacy Policy
              </a>
              <a
                href="/refund"
                style={{
                  fontSize: 11,
                  color: "#64748b",
                  textDecoration: "none",
                }}
              >
                Refund Policy
              </a>
            </div>
            <div style={{ fontSize: 11, color: "rgba(148,163,184,0.4)" }}>
              &copy; {new Date().getFullYear()} CETHOS Translation Services
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
