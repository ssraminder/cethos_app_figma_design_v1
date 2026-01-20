import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot, type Root } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QuoteProvider } from "./context/QuoteContext";
import Index from "./pages/Index";
import Success from "./pages/Success";
import NotFound from "./pages/NotFound";
import Login from "./pages/admin/Login";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <QuoteProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/success" element={<Success />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </QuoteProvider>
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
