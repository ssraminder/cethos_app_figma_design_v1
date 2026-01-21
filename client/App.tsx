// client/App.tsx
// Updated with admin routes for staff portal

import "./global.css";
import { Toaster } from "@/components/ui/toaster";
import { createRoot, type Root } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QuoteProvider } from "./context/QuoteContext";
import { StaffAuthProvider } from "./context/StaffAuthContext";
import { AdminAuthProvider } from "./context/AdminAuthContext";
import { BrandingProvider } from "./context/BrandingContext";
import Index from "./pages/Index";
import Success from "./pages/Success";
import NotFound from "./pages/NotFound";
import Checkout from "./pages/Checkout";
import OrderSuccess from "./pages/OrderSuccess";

// Admin pages
import AdminLogin from "./pages/admin/Login";
import ResetPassword from "./pages/admin/ResetPassword";
import ProtectedAdminRoute from "./components/admin/ProtectedAdminRoute";
import HITLQueue from "./pages/admin/HITLQueue";
import HITLReviewDetail from "./pages/admin/HITLReviewDetail";
import AdminSettings from "./pages/admin/AdminSettings";
import Analytics from "./pages/admin/Analytics";
import Patterns from "./pages/admin/Patterns";
import Learning from "./pages/admin/Learning";
import Thresholds from "./pages/admin/Thresholds";

// Admin Settings pages
import PricingSettings from "./pages/admin/settings/PricingSettings";
import ComplexitySettings from "./pages/admin/settings/ComplexitySettings";
import TurnaroundSettings from "./pages/admin/settings/TurnaroundSettings";
import DocumentTypesSettings from "./pages/admin/settings/DocumentTypesSettings";
import CertificationTypesSettings from "./pages/admin/settings/CertificationTypesSettings";
import DeliveryOptionsSettings from "./pages/admin/settings/DeliveryOptionsSettings";
import TaxRatesSettings from "./pages/admin/settings/TaxRatesSettings";
import BusinessHoursSettings from "./pages/admin/settings/BusinessHoursSettings";
import HolidaysSettings from "./pages/admin/settings/HolidaysSettings";
import AIPromptsSettings from "./pages/admin/settings/AIPromptsSettings";
import OCRSettings from "./pages/admin/settings/OCRSettings";
import HITLThresholdsSettings from "./pages/admin/settings/HITLThresholdsSettings";
import IntendedUsesSettings from "./pages/admin/settings/IntendedUsesSettings";
import PickupLocationsSettings from "./pages/admin/settings/PickupLocationsSettings";
import SameDaySettings from "./pages/admin/settings/SameDaySettings";
import LanguageTiersSettings from "./pages/admin/settings/LanguageTiersSettings";
import LanguagesSettings from "./pages/admin/settings/LanguagesSettings";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrandingProvider>
        <QuoteProvider>
          <StaffAuthProvider>
            <BrowserRouter>
              <Routes>
                {/* Customer routes */}
                <Route path="/" element={<Index />} />
                <Route path="/success" element={<Success />} />
                <Route path="/quote/:quoteId/checkout" element={<Checkout />} />
                <Route path="/order/success" element={<OrderSuccess />} />

                {/* Admin login (not protected) */}
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route
                  path="/admin/reset-password"
                  element={<ResetPassword />}
                />

                {/* Protected admin routes */}
                <Route
                  path="/admin/hitl"
                  element={
                    <ProtectedAdminRoute>
                      <HITLQueue />
                    </ProtectedAdminRoute>
                  }
                />
                <Route
                  path="/admin/hitl/:reviewId"
                  element={
                    <ProtectedAdminRoute>
                      <HITLReviewDetail />
                    </ProtectedAdminRoute>
                  }
                />
                <Route
                  path="/admin/settings"
                  element={
                    <ProtectedAdminRoute>
                      <AdminSettings />
                    </ProtectedAdminRoute>
                  }
                />
                <Route
                  path="/admin/analytics"
                  element={
                    <ProtectedAdminRoute>
                      <Analytics />
                    </ProtectedAdminRoute>
                  }
                />
                <Route
                  path="/admin/patterns"
                  element={
                    <ProtectedAdminRoute>
                      <Patterns />
                    </ProtectedAdminRoute>
                  }
                />
                <Route
                  path="/admin/learning"
                  element={
                    <ProtectedAdminRoute>
                      <Learning />
                    </ProtectedAdminRoute>
                  }
                />
                <Route
                  path="/admin/thresholds"
                  element={
                    <ProtectedAdminRoute>
                      <Thresholds />
                    </ProtectedAdminRoute>
                  }
                />

                {/* Admin Settings screens */}
                <Route
                  path="/admin/settings/pricing"
                  element={
                    <ProtectedAdminRoute>
                      <PricingSettings />
                    </ProtectedAdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/complexity"
                  element={
                    <ProtectedAdminRoute>
                      <ComplexitySettings />
                    </ProtectedAdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/turnaround"
                  element={
                    <ProtectedAdminRoute>
                      <TurnaroundSettings />
                    </ProtectedAdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/document-types"
                  element={
                    <ProtectedAdminRoute>
                      <DocumentTypesSettings />
                    </ProtectedAdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/certifications"
                  element={
                    <ProtectedAdminRoute>
                      <CertificationTypesSettings />
                    </ProtectedAdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/delivery"
                  element={
                    <ProtectedAdminRoute>
                      <DeliveryOptionsSettings />
                    </ProtectedAdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/tax"
                  element={
                    <ProtectedAdminRoute>
                      <TaxRatesSettings />
                    </ProtectedAdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/hours"
                  element={
                    <ProtectedAdminRoute>
                      <BusinessHoursSettings />
                    </ProtectedAdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/holidays"
                  element={
                    <ProtectedAdminRoute>
                      <HolidaysSettings />
                    </ProtectedAdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/ai-prompts"
                  element={
                    <ProtectedAdminRoute>
                      <AIPromptsSettings />
                    </ProtectedAdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/ocr"
                  element={
                    <ProtectedAdminRoute>
                      <OCRSettings />
                    </ProtectedAdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/hitl"
                  element={
                    <ProtectedAdminRoute>
                      <HITLThresholdsSettings />
                    </ProtectedAdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/intended-uses"
                  element={
                    <ProtectedAdminRoute>
                      <IntendedUsesSettings />
                    </ProtectedAdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/pickup-locations"
                  element={
                    <ProtectedAdminRoute>
                      <PickupLocationsSettings />
                    </ProtectedAdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/same-day"
                  element={
                    <ProtectedAdminRoute>
                      <SameDaySettings />
                    </ProtectedAdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/language-tiers"
                  element={
                    <ProtectedAdminRoute>
                      <LanguageTiersSettings />
                    </ProtectedAdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/languages"
                  element={
                    <ProtectedAdminRoute>
                      <LanguagesSettings />
                    </ProtectedAdminRoute>
                  }
                />

                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </StaffAuthProvider>
        </QuoteProvider>
      </BrandingProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

const rootElement = document.getElementById("root")!;
// Store root on the element itself to survive HMR
const rootKey = "__react_root__";
if (!(rootElement as any)[rootKey]) {
  (rootElement as any)[rootKey] = createRoot(rootElement);
}
const root = (rootElement as any)[rootKey] as Root;
root.render(<App />);
