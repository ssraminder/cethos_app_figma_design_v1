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
import { BrandingProvider } from "./context/BrandingContext";
import Index from "./pages/Index";
import Success from "./pages/Success";
import NotFound from "./pages/NotFound";

// Admin pages
import AdminLogin from "./pages/admin/Login";
import HITLQueue from "./pages/admin/HITLQueue";
import HITLReviewDetail from "./pages/admin/HITLReviewDetail";
import AdminSettings from "./pages/admin/AdminSettings";

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

                {/* Admin routes */}
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route path="/admin/hitl" element={<HITLQueue />} />
                <Route
                  path="/admin/hitl/:reviewId"
                  element={<HITLReviewDetail />}
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
