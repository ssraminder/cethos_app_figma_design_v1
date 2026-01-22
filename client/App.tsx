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
import QuoteReviewPage from "./pages/quote/QuoteReviewPage";

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

// Wrapper that combines AdminAuthProvider and ProtectedAdminRoute
const AdminRoute = ({ children }: { children: React.ReactNode }) => (
  <AdminAuthProvider>
    <ProtectedAdminRoute>{children}</ProtectedAdminRoute>
  </AdminAuthProvider>
);

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
                <Route
                  path="/quote/:quoteId/review"
                  element={<QuoteReviewPage />}
                />
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
                    <AdminRoute>
                      <HITLQueue />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/hitl/:reviewId"
                  element={
                    <AdminRoute>
                      <HITLReviewDetail />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/settings"
                  element={
                    <AdminRoute>
                      <AdminSettings />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/analytics"
                  element={
                    <AdminRoute>
                      <Analytics />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/patterns"
                  element={
                    <AdminRoute>
                      <Patterns />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/learning"
                  element={
                    <AdminRoute>
                      <Learning />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/thresholds"
                  element={
                    <AdminRoute>
                      <Thresholds />
                    </AdminRoute>
                  }
                />

                {/* Admin Settings screens */}
                <Route
                  path="/admin/settings/pricing"
                  element={
                    <AdminRoute>
                      <PricingSettings />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/complexity"
                  element={
                    <AdminRoute>
                      <ComplexitySettings />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/turnaround"
                  element={
                    <AdminRoute>
                      <TurnaroundSettings />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/document-types"
                  element={
                    <AdminRoute>
                      <DocumentTypesSettings />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/certifications"
                  element={
                    <AdminRoute>
                      <CertificationTypesSettings />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/delivery"
                  element={
                    <AdminRoute>
                      <DeliveryOptionsSettings />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/tax"
                  element={
                    <AdminRoute>
                      <TaxRatesSettings />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/hours"
                  element={
                    <AdminRoute>
                      <BusinessHoursSettings />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/holidays"
                  element={
                    <AdminRoute>
                      <HolidaysSettings />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/ai-prompts"
                  element={
                    <AdminRoute>
                      <AIPromptsSettings />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/ocr"
                  element={
                    <AdminRoute>
                      <OCRSettings />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/hitl"
                  element={
                    <AdminRoute>
                      <HITLThresholdsSettings />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/intended-uses"
                  element={
                    <AdminRoute>
                      <IntendedUsesSettings />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/pickup-locations"
                  element={
                    <AdminRoute>
                      <PickupLocationsSettings />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/same-day"
                  element={
                    <AdminRoute>
                      <SameDaySettings />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/language-tiers"
                  element={
                    <AdminRoute>
                      <LanguageTiersSettings />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/settings/languages"
                  element={
                    <AdminRoute>
                      <LanguagesSettings />
                    </AdminRoute>
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
