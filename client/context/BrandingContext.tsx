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
    // Delay fetch slightly to avoid blocking initial render
    const timer = setTimeout(() => {
      fetchBranding();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  async function fetchBranding() {
    // Check if we're in a sandboxed/restricted environment
    try {
      // Quick feature detection - if fetch is wrapped or restricted, skip
      if (typeof window === "undefined") {
        setBranding((prev) => ({ ...prev, loading: false }));
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout

      const response = await fetch(
        "https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/get-branding",
        {
          signal: controller.signal,
          mode: "cors",
          headers: {
            "Content-Type": "application/json",
          },
        },
      ).catch(() => {
        // Catch fetch errors immediately without logging
        clearTimeout(timeoutId);
        return null;
      });

      clearTimeout(timeoutId);

      if (!response || !response.ok) {
        setBranding((prev) => ({ ...prev, loading: false }));
        return;
      }

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
      // Silently fallback to default branding
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
