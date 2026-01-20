import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

interface Branding {
  companyName: string;
  logoUrl: string;
  logoDarkUrl: string;
  supportEmail: string;
  primaryColor: string;
  loading: boolean;
}

const defaultBranding: Branding = {
  companyName: "Cethos",
  logoUrl: "",
  logoDarkUrl: "",
  supportEmail: "support@cethos.com",
  primaryColor: "#3B82F6",
  loading: true,
};

const BrandingContext = createContext<Branding>(defaultBranding);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding>(defaultBranding);

  useEffect(() => {
    fetchBranding();
  }, []);

  async function fetchBranding() {
    try {
      const response = await fetch(
        "https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/get-branding",
      );
      const result = await response.json();
      if (result.success) {
        setBranding({
          ...result.branding,
          loading: false,
        });
      } else {
        setBranding((prev) => ({ ...prev, loading: false }));
      }
    } catch (error) {
      console.error("Failed to fetch branding:", error);
      setBranding((prev) => ({ ...prev, loading: false }));
    }
  }

  return (
    <BrandingContext.Provider value={branding}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}
