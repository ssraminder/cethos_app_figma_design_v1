import React, { createContext, useContext, useEffect, useState } from "react";

interface Branding {
  companyName: string;
  logoUrl: string;
  logoDarkUrl: string;
  faviconUrl: string;
  supportEmail: string;
  primaryColor: string;
  loading: boolean;
}

const defaultBranding: Branding = {
  companyName: "Cethos",
  logoUrl: "",
  logoDarkUrl: "",
  faviconUrl: "",
  supportEmail: "support@cethos.com",
  primaryColor: "#0891B2", // Updated to teal
  loading: true,
};

const BrandingContext = createContext<Branding>(defaultBranding);

export function useBranding() {
  return useContext(BrandingContext);
}

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<Branding>(defaultBranding);

  useEffect(() => {
    async function fetchBranding() {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
          console.warn("Supabase credentials not found, using defaults");
          setBranding((prev) => ({ ...prev, loading: false }));
          return;
        }

        const response = await fetch(
          `${supabaseUrl}/functions/v1/get-branding`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseKey}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setBranding({
            companyName: data.companyName || "Cethos",
            logoUrl: data.logoUrl || "",
            logoDarkUrl: data.logoDarkUrl || "",
            faviconUrl: data.faviconUrl || "",
            supportEmail: data.supportEmail || "support@cethos.com",
            primaryColor: data.primaryColor || "#0891B2",
            loading: false,
          });

          // Update favicon dynamically
          if (data.faviconUrl) {
            updateFavicon(data.faviconUrl);
          }

          // Update document title
          if (data.companyName) {
            document.title = `${data.companyName} - Certified Translations`;
          }
        } else {
          console.warn("Failed to fetch branding, using defaults");
          setBranding((prev) => ({ ...prev, loading: false }));
        }
      } catch (error) {
        console.error("Error fetching branding:", error);
        setBranding((prev) => ({ ...prev, loading: false }));
      }
    }

    fetchBranding();
  }, []);

  return (
    <BrandingContext.Provider value={branding}>
      {children}
    </BrandingContext.Provider>
  );
}

// Helper function to update favicon dynamically
function updateFavicon(faviconUrl: string) {
  // Remove existing favicons
  const existingLinks = document.querySelectorAll("link[rel*='icon']");
  existingLinks.forEach((link) => link.remove());

  // Add new favicon
  const link = document.createElement("link");
  link.rel = "icon";
  link.type = "image/svg+xml";
  link.href = faviconUrl;
  document.head.appendChild(link);

  // Also add apple-touch-icon
  const appleLink = document.createElement("link");
  appleLink.rel = "apple-touch-icon";
  appleLink.href = faviconUrl;
  document.head.appendChild(appleLink);
}

export default BrandingContext;
