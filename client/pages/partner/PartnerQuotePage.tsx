// PartnerQuotePage.tsx
// Route: /p/:code
// Validates partner code from URL, stores in session, renders branded flow

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import PartnerQuoteLayout from "./PartnerQuoteLayout";
import PartnerInvalidPage from "./PartnerInvalidPage";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

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

export default function PartnerQuotePage() {
  const { code } = useParams<{ code: string }>();
  const [loading, setLoading] = useState(true);
  const [partnerData, setPartnerData] = useState<PartnerData | null>(null);
  const [isInvalid, setIsInvalid] = useState(false);

  useEffect(() => {
    if (!code) {
      setIsInvalid(true);
      setLoading(false);
      return;
    }

    validatePartnerCode(code);
  }, [code]);

  async function validatePartnerCode(partnerCode: string) {
    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/validate-partner-code`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ code: partnerCode }),
        },
      );

      const data = await response.json();

      if (data.valid) {
        // Store partner data in sessionStorage (same keys as Phase 1 ?ref= flow)
        sessionStorage.setItem("cethos_partner_id", data.partner_id);
        sessionStorage.setItem("cethos_partner_code", partnerCode);
        sessionStorage.setItem("cethos_partner_rate", String(data.customer_rate));
        sessionStorage.setItem("cethos_partner_name", data.name);
        sessionStorage.setItem("cethos_partner_logo", data.logo_url || "");
        sessionStorage.setItem("cethos_partner_welcome", data.welcome_message || "");
        sessionStorage.setItem("cethos_partner_flow", "true");

        // Footer contact data (v1.2)
        sessionStorage.setItem("cethos_partner_email", data.contact_email || "");
        sessionStorage.setItem("cethos_partner_phone", data.contact_phone || "");
        sessionStorage.setItem("cethos_partner_address", data.business_address_line1 || "");
        sessionStorage.setItem("cethos_partner_city", data.business_city || "");
        sessionStorage.setItem("cethos_partner_province", data.business_province || "");
        sessionStorage.setItem("cethos_partner_postal", data.business_postal_code || "");

        setPartnerData({
          partner_id: data.partner_id,
          code: partnerCode,
          name: data.name,
          customer_rate: data.customer_rate,
          logo_url: data.logo_url,
          welcome_message: data.welcome_message,
          has_pickup_location: data.has_pickup_location,
          contact_email: data.contact_email || null,
          contact_phone: data.contact_phone || null,
          business_address_line1: data.business_address_line1 || null,
          business_city: data.business_city || null,
          business_province: data.business_province || null,
          business_postal_code: data.business_postal_code || null,
        });
      } else {
        setIsInvalid(true);
      }
    } catch (error) {
      console.error("Error validating partner code:", error);
      setIsInvalid(true);
    } finally {
      setLoading(false);
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-4 text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Invalid partner code
  if (isInvalid || !partnerData) {
    return <PartnerInvalidPage />;
  }

  // Valid partner — render branded flow
  return <PartnerQuoteLayout partnerData={partnerData} />;
}
