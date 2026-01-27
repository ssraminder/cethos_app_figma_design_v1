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
import { UploadProvider } from "./context/UploadContext";
import { StaffAuthProvider } from "./context/StaffAuthContext";
import { AdminAuthProvider } from "./context/AdminAuthContext";
import { BrandingProvider } from "./context/BrandingContext";
import AppLayout from "./components/layouts/AppLayout";
import Login from "./pages/Login";
import Index from "./pages/Index";
import Success from "./pages/Success";
import NotFound from "./pages/NotFound";
import Checkout from "./pages/Checkout";
import OrderSuccess from "./pages/OrderSuccess";
import PaymentCancel from "./pages/PaymentCancel";
import QuoteRecoverPage from "./pages/quote/QuoteRecoverPage";
import QuoteReviewPage from "./pages/quote/QuoteReviewPage";
import QuoteRevisionPage from "./pages/quote/QuoteRevisionPage";
import UploadPage from "./pages/upload/UploadPage";

// Admin pages
import AdminLogin from "./pages/admin/Login";
import ResetPassword from "./pages/admin/ResetPassword";
import ProtectedAdminRoute from "./components/admin/ProtectedAdminRoute";
import AdminLayout from "./components/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminQuotesList from "./pages/admin/AdminQuotesList";
import AdminQuoteDetail from "./pages/admin/AdminQuoteDetail";
import AdminOrderDetail from "./pages/admin/AdminOrderDetail";
import AdminOrdersList from "./pages/admin/AdminOrdersList";
import AdminStaffManagement from "./pages/admin/AdminStaffManagement";
import AdminAIAnalytics from "./pages/admin/AdminAIAnalytics";
import AdminReports from "./pages/admin/AdminReports";
import HITLQueue from "./pages/admin/HITLQueue";
import HITLReviewDetail from "./pages/admin/HITLReviewDetail";
import AdminSettings from "./pages/admin/AdminSettings";
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
          <UploadProvider>
            <StaffAuthProvider>
              <BrowserRouter>
                <Routes>
                  <Route element={<AppLayout />}>
                    <Route path="/" element={<Login />} />
                    <Route path="/quote" element={<Index />} />
                    <Route path="/success" element={<Success />} />
                    <Route
                      path="/quote/:quoteId/checkout"
                      element={<Checkout />}
                    />
                    <Route
                      path="/quote/recover"
                      element={<QuoteRecoverPage />}
                    />
                    <Route
                      path="/quote/:quoteId/review"
                      element={<QuoteReviewPage />}
                    />
                    <Route
                      path="/quote/:quoteId/revision"
                      element={<QuoteRevisionPage />}
                    />
                    <Route path="/order/success" element={<OrderSuccess />} />
                    <Route path="/payment/cancel" element={<PaymentCancel />} />

                    {/* Upload Form Routes */}
                    <Route path="/upload" element={<UploadPage />} />
                  </Route>

                  {/* Admin login (not protected) */}
                  <Route path="/admin/login" element={<AdminLogin />} />
                  <Route
                    path="/admin/reset-password"
                    element={<ResetPassword />}
                  />

                  {/* Protected admin routes */}
                  <Route
                    path="/admin"
                    element={
                      <AdminRoute>
                        <AdminLayout />
                      </AdminRoute>
                    }
                  >
                    <Route index element={<AdminDashboard />} />
                    <Route path="dashboard" element={<AdminDashboard />} />
                    <Route path="hitl" element={<HITLQueue />} />
                    <Route
                      path="hitl/:reviewId"
                      element={<HITLReviewDetail />}
                    />
                    <Route path="quotes" element={<AdminQuotesList />} />
                    <Route path="quotes/:id" element={<AdminQuoteDetail />} />
                    <Route path="orders" element={<AdminOrdersList />} />
                    <Route path="orders/:id" element={<AdminOrderDetail />} />
                    <Route path="settings" element={<AdminSettings />} />
                    <Route path="settings/*" element={<AdminSettings />} />
                    <Route path="analytics" element={<AdminAIAnalytics />} />
                    <Route path="ai/analytics" element={<AdminAIAnalytics />} />
                    <Route path="patterns" element={<Patterns />} />
                    <Route path="learning" element={<Learning />} />
                    <Route path="thresholds" element={<Thresholds />} />
                    <Route path="staff" element={<AdminStaffManagement />} />
                    <Route path="reports" element={<AdminReports />} />

                    {/* Admin Settings screens */}
                    <Route
                      path="settings/pricing"
                      element={<PricingSettings />}
                    />
                    <Route
                      path="settings/complexity"
                      element={<ComplexitySettings />}
                    />
                    <Route
                      path="settings/turnaround"
                      element={<TurnaroundSettings />}
                    />
                    <Route
                      path="settings/document-types"
                      element={<DocumentTypesSettings />}
                    />
                    <Route
                      path="settings/certifications"
                      element={<CertificationTypesSettings />}
                    />
                    <Route
                      path="settings/delivery"
                      element={<DeliveryOptionsSettings />}
                    />
                    <Route path="settings/tax" element={<TaxRatesSettings />} />
                    <Route
                      path="settings/hours"
                      element={<BusinessHoursSettings />}
                    />
                    <Route
                      path="settings/holidays"
                      element={<HolidaysSettings />}
                    />
                    <Route
                      path="settings/ai-prompts"
                      element={<AIPromptsSettings />}
                    />
                    <Route path="settings/ocr" element={<OCRSettings />} />
                    <Route
                      path="settings/hitl"
                      element={<HITLThresholdsSettings />}
                    />
                    <Route
                      path="settings/intended-uses"
                      element={<IntendedUsesSettings />}
                    />
                    <Route
                      path="settings/pickup-locations"
                      element={<PickupLocationsSettings />}
                    />
                    <Route
                      path="settings/same-day"
                      element={<SameDaySettings />}
                    />
                    <Route
                      path="settings/language-tiers"
                      element={<LanguageTiersSettings />}
                    />
                    <Route
                      path="settings/languages"
                      element={<LanguagesSettings />}
                    />
                  </Route>

                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </StaffAuthProvider>
          </UploadProvider>
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
