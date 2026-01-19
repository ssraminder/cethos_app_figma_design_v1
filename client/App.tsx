import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Details from "./pages/Details";
import Review from "./pages/Review";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/details" element={<Details />} />
          <Route path="/review" element={<Review />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

const rootElement = document.getElementById("root")!;

// Avoid creating multiple roots during hot module replacement
if (!rootElement.hasAttribute('data-root-initialized')) {
  rootElement.setAttribute('data-root-initialized', 'true');
  const root = createRoot(rootElement);
  root.render(<App />);

  // Store root for HMR
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      rootElement.removeAttribute('data-root-initialized');
    });
  }
} else {
  // If root already exists, just re-render
  const root = createRoot(rootElement);
  root.render(<App />);
}
