import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface Branding {
  companyName: string;
  logoUrl: string;
  logoDarkUrl: string;
  supportEmail: string;
  primaryColor: string;
  loading: boolean;
}

const defaultBranding: Branding = {
  companyName: 'Cethos',
  logoUrl: '',
  logoDarkUrl: '',
  supportEmail: 'support@cethos.com',
  primaryColor: '#3B82F6',
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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await fetch(
        'https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/get-branding',
        {
          signal: controller.signal,
          mode: 'cors',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      clearTimeout(timeoutId);

      // If the function doesn't exist yet (404), just use defaults
      if (!response.ok) {
        console.warn('Branding Edge Function returned', response.status, '- using default branding');
        setBranding(prev => ({ ...prev, loading: false }));
        return;
      }

      const result = await response.json();
      if (result.success) {
        setBranding({
          ...result.branding,
          loading: false,
        });
      } else {
        setBranding(prev => ({ ...prev, loading: false }));
      }
    } catch (error) {
      // Silently fallback to default branding
      // This is expected in development environments with CORS restrictions
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('Branding fetch timed out, using default branding');
      } else {
        console.warn('Branding fetch failed (CORS or network issue), using default branding');
      }
      setBranding(prev => ({ ...prev, loading: false }));
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
