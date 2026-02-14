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
import { CustomerAuthProvider } from "./context/CustomerAuthContext";
import { BrandingProvider } from "./context/BrandingContext";
import AppLayout from "./components/layouts/AppLayout";
import Login from "./pages/Login";
import LoginVerify from "./pages/LoginVerify";
import Index from "./pages/Index";
import Success from "./pages/Success";
import NotFound from "./pages/NotFound";
import Checkout from "./pages/Checkout";
import OrderSuccess from "./pages/OrderSuccess";
import PaymentCancel from "./pages/PaymentCancel";
import QuoteRecoverPage from "./pages/quote/QuoteRecoverPage";
import QuoteReviewPage from "./pages/quote/QuoteReviewPage";
import QuoteRevisionPage from "./pages/quote/QuoteRevisionPage";
import QuoteConfirmationPage from "./pages/quote/QuoteConfirmationPage";
import QuoteSavedPage from "./pages/quote/QuoteSavedPage";
import QuoteExpiredPage from "./pages/quote/QuoteExpiredPage";
import QuoteContinuePage from "./pages/quote/QuoteContinuePage";
import UploadPage from "./pages/upload/UploadPage";
import UploadConfirmationPage from "./pages/upload/UploadConfirmationPage";
import ETransferConfirmation from "./pages/ETransferConfirmation";
import ETransferSuccess from "./pages/ETransferSuccess";

// Customer Dashboard pages
import ProtectedCustomerRoute from "./components/customer/ProtectedCustomerRoute";
import CustomerDashboard from "./pages/customer/CustomerDashboard";
import CustomerQuotes from "./pages/customer/CustomerQuotes";
import CustomerQuoteDetail from "./pages/customer/CustomerQuoteDetail";
import CustomerOrders from "./pages/customer/CustomerOrders";
import CustomerOrderDetail from "./pages/customer/CustomerOrderDetail";
import CustomerMessages from "./pages/customer/CustomerMessages";
import CustomerProfile from "./pages/customer/CustomerProfile";

// Admin pages
import AdminLogin from "./pages/admin/Login";
import ResetPassword from "./pages/admin/ResetPassword";
import ProtectedAdminRoute from "./components/admin/ProtectedAdminRoute";
import AdminLayout from "./components/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminQuotesList from "./pages/admin/AdminQuotesList";
import AdminQuoteDetail from "./pages/admin/AdminQuoteDetail";
import PurgeDraftQuotes from "./pages/admin/PurgeDraftQuotes";
import AdminOrderDetail from "./pages/admin/AdminOrderDetail";
import AdminOrdersList from "./pages/admin/AdminOrdersList";
import AdminStaffManagement from "./pages/admin/AdminStaffManagement";
import AdminAIAnalytics from "./pages/admin/AdminAIAnalytics";
import AdminReports from "./pages/admin/AdminReports";
import AdminSettings from "./pages/admin/AdminSettings";
import Patterns from "./pages/admin/Patterns";
import Learning from "./pages/admin/Learning";
import Thresholds from "./pages/admin/Thresholds";
import AIKnowledgeBase from "./pages/admin/AIKnowledgeBase";
import AccountsReceivable from "./pages/admin/AccountsReceivable";
import CustomersList from "./pages/admin/CustomersList";
import CustomerDetail from "./pages/admin/CustomerDetail";
import OCRWordCountPage from "./pages/admin/OCRWordCountPage";
import OCRBatchResultsPage from "./pages/admin/OCRBatchResultsPage";
import PreprocessOCRPage from "./pages/admin/PreprocessOCRPage";
import AdminPartners from "./pages/admin/AdminPartners";

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
import IntendedUsesSettings from "./pages/admin/settings/IntendedUsesSettings";
import PickupLocationsSettings from "./pages/admin/settings/PickupLocationsSettings";
import PaymentMethodsSettings from "./pages/admin/settings/PaymentMethodsSettings";
import SameDaySettings from "./pages/admin/settings/SameDaySettings";
import LanguageTiersSettings from "./pages/admin/settings/LanguageTiersSettings";
import LanguagesSettings from "./pages/admin/settings/LanguagesSettings";
import FileCategoriesSettings from "./pages/admin/settings/FileCategoriesSettings";
import TrackingSettings from "./pages/admin/settings/TrackingSettings";
import GoogleTagManager from "./components/shared/GoogleTagManager";

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
                <GoogleTagManager />
                <Routes>
                  <Route element={<AppLayout />}>
                    <Route path="/" element={<Login />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/login/verify" element={<LoginVerify />} />
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
                    <Route
                      path="/quote/confirmation"
                      element={<QuoteConfirmationPage />}
                    />
                    <Route path="/quote/saved" element={<QuoteSavedPage />} />
                    <Route
                      path="/quote/expired"
                      element={<QuoteExpiredPage />}
                    />
                    <Route
                      path="/quote/:quoteId/continue"
                      element={<QuoteContinuePage />}
                    />
                    <Route path="/order/success" element={<OrderSuccess />} />
                    <Route path="/payment/cancel" element={<PaymentCancel />} />

                    {/* E-Transfer Payment Routes */}
                    <Route
                      path="/etransfer/confirm"
                      element={<ETransferConfirmation />}
                    />
                    <Route
                      path="/etransfer/success"
                      element={<ETransferSuccess />}
                    />

                    {/* Upload Form Routes */}
                    <Route path="/upload" element={<UploadPage />} />
                    <Route
                      path="/upload/confirmation"
                      element={<UploadConfirmationPage />}
                    />
                  </Route>

                  {/* Customer Dashboard Routes */}
                  <Route
                    path="/dashboard"
                    element={
                      <CustomerAuthProvider>
                        <ProtectedCustomerRoute>
                          <CustomerDashboard />
                        </ProtectedCustomerRoute>
                      </CustomerAuthProvider>
                    }
                  />
                  <Route
                    path="/dashboard/quotes"
                    element={
                      <CustomerAuthProvider>
                        <ProtectedCustomerRoute>
                          <CustomerQuotes />
                        </ProtectedCustomerRoute>
                      </CustomerAuthProvider>
                    }
                  />
                  <Route
                    path="/dashboard/quotes/:id"
                    element={
                      <CustomerAuthProvider>
                        <ProtectedCustomerRoute>
                          <CustomerQuoteDetail />
                        </ProtectedCustomerRoute>
                      </CustomerAuthProvider>
                    }
                  />
                  <Route
                    path="/dashboard/orders"
                    element={
                      <CustomerAuthProvider>
                        <ProtectedCustomerRoute>
                          <CustomerOrders />
                        </ProtectedCustomerRoute>
                      </CustomerAuthProvider>
                    }
                  />
                  <Route
                    path="/dashboard/orders/:id"
                    element={
                      <CustomerAuthProvider>
                        <ProtectedCustomerRoute>
                          <CustomerOrderDetail />
                        </ProtectedCustomerRoute>
                      </CustomerAuthProvider>
                    }
                  />
                  <Route
                    path="/dashboard/messages"
                    element={
                      <CustomerAuthProvider>
                        <ProtectedCustomerRoute>
                          <CustomerMessages />
                        </ProtectedCustomerRoute>
                      </CustomerAuthProvider>
                    }
                  />
                  <Route
                    path="/dashboard/profile"
                    element={
                      <CustomerAuthProvider>
                        <ProtectedCustomerRoute>
                          <CustomerProfile />
                        </ProtectedCustomerRoute>
                      </CustomerAuthProvider>
                    }
                  />

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
                    <Route path="quotes" element={<AdminQuotesList />} />
                    <Route path="quotes/:id" element={<AdminQuoteDetail />} />
                    <Route path="orders" element={<AdminOrdersList />} />
                    <Route path="orders/:id" element={<AdminOrderDetail />} />
                    <Route path="partners" element={<AdminPartners />} />
                    <Route path="settings" element={<AdminSettings />} />
                    <Route path="settings/*" element={<AdminSettings />} />
                    <Route
                      path="settings/purge-quotes"
                      element={<PurgeDraftQuotes />}
                    />
                    <Route path="analytics" element={<AdminAIAnalytics />} />
                    <Route path="ai/analytics" element={<AdminAIAnalytics />} />
                    <Route path="patterns" element={<Patterns />} />
                    <Route path="learning" element={<Learning />} />
                    <Route path="thresholds" element={<Thresholds />} />
                    <Route path="ai/knowledge" element={<AIKnowledgeBase />} />
                    <Route path="staff" element={<AdminStaffManagement />} />
                    <Route path="reports" element={<AdminReports />} />
                    <Route path="ar" element={<AccountsReceivable />} />
                    <Route path="customers" element={<CustomersList />} />
                    <Route path="customers/:id" element={<CustomerDetail />} />
                    <Route path="ocr-word-count" element={<OCRWordCountPage />} />
                    <Route path="ocr-word-count/:batchId" element={<OCRBatchResultsPage />} />
                    <Route path="preprocess-ocr" element={<PreprocessOCRPage />} />

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
                      path="settings/intended-uses"
                      element={<IntendedUsesSettings />}
                    />
                    <Route
                      path="settings/pickup-locations"
                      element={<PickupLocationsSettings />}
                    />
                    <Route
                      path="settings/payment-methods"
                      element={<PaymentMethodsSettings />}
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
                    <Route
                      path="settings/file-categories"
                      element={<FileCategoriesSettings />}
                    />
                    <Route
                      path="settings/tracking"
                      element={<TrackingSettings />}
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
