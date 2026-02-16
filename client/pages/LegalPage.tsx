// LegalPage.tsx
// Static legal pages: /terms, /privacy, /refund

import { Link } from "react-router-dom";

const PAGES = {
  terms: {
    title: "Terms of Service",
    content: `These Terms of Service govern your use of CETHOS Translation Services. By using our services, you agree to these terms.

Our translation services are provided by licensed, professional translators. All certified translations are guaranteed to be accepted by government agencies, legal bodies, and educational institutions across Canada.

Pricing is determined at the time of quote and is valid for 30 days. Payment is required before translation work begins unless alternative arrangements have been made.

Delivery timelines are estimates. While we strive to meet all deadlines, factors such as document complexity and language pair may affect turnaround times.

All documents are handled with strict confidentiality. We do not share your documents or personal information with third parties except as necessary to complete your translation.

For questions about these terms, contact us at info@cethos.com.`,
  },
  privacy: {
    title: "Privacy Policy",
    content: `CETHOS Translation Services is committed to protecting your privacy. This policy explains how we collect, use, and protect your personal information.

We collect information you provide when requesting a quote or placing an order, including your name, email, phone number, and billing address. We also collect the documents you upload for translation.

Your information is used solely to provide translation services, process payments, and communicate with you about your orders. We do not sell your personal information to third parties.

Documents are stored securely using encrypted storage. Documents are retained for 90 days after order completion to facilitate any revisions, after which they are permanently deleted.

We use Stripe for payment processing. Your payment information is handled directly by Stripe and is never stored on our servers.

For privacy inquiries, contact us at info@cethos.com.`,
  },
  refund: {
    title: "Refund Policy",
    content: `CETHOS Translation Services stands behind the quality of our work. If you are not satisfied with your translation, we offer the following:

If there are errors in your certified translation, we will correct them at no additional charge. Please notify us within 14 days of delivery.

If you cancel your order before translation work has begun, you will receive a full refund. If work has already started, a partial refund may be issued based on the work completed.

Rush and same-day fees are non-refundable once the expedited work has been assigned to a translator.

Delivery fees are non-refundable once physical documents have been shipped.

To request a refund or correction, contact us at info@cethos.com with your order number.`,
  },
};

interface Props {
  type: "terms" | "privacy" | "refund";
}

export default function LegalPage({ type }: Props) {
  const page = PAGES[type];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
      }}
    >
      {/* Simple header */}
      <div
        style={{
          background: "#fff",
          borderBottom: "1px solid #e2e8f0",
          padding: "16px 24px",
        }}
      >
        <div
          style={{
            maxWidth: 680,
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Link
            to="/"
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "#0C2340",
              textDecoration: "none",
            }}
          >
            CETHOS Translation Services
          </Link>
          <Link
            to="/quote"
            style={{
              fontSize: 13,
              color: "#0891B2",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            Get a Quote &rarr;
          </Link>
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          maxWidth: 680,
          margin: "0 auto",
          padding: "40px 24px 80px",
        }}
      >
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: "#0C2340",
            marginBottom: 8,
          }}
        >
          {page.title}
        </h1>
        <p style={{ fontSize: 13, color: "#94a3b8", marginBottom: 32 }}>
          Last updated: February 2026
        </p>
        <div
          style={{
            fontSize: 15,
            color: "#334155",
            lineHeight: 1.8,
            whiteSpace: "pre-line",
          }}
        >
          {page.content}
        </div>
      </div>
    </div>
  );
}
