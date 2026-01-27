/**
 * Navigation Helpers
 * Handles entry point-aware navigation for "Start New Quote" buttons
 */

/**
 * Get the entry point from localStorage drafts
 * Returns 'upload_form' or 'order_form'
 */
export const getEntryPointFromStorage = (): string => {
  try {
    const uploadDraft = localStorage.getItem("cethos_upload_draft");
    const quoteDraft = localStorage.getItem("cethos_quote_draft");

    if (uploadDraft) {
      const parsed = JSON.parse(uploadDraft);
      if (parsed?.entryPoint) {
        console.log("📍 Found entry point in upload draft:", parsed.entryPoint);
        return parsed.entryPoint;
      }
    }

    if (quoteDraft) {
      const parsed = JSON.parse(quoteDraft);
      if (parsed?.entryPoint) {
        console.log("📍 Found entry point in quote draft:", parsed.entryPoint);
        return parsed.entryPoint;
      }
    }
  } catch (e) {
    console.error("Error reading entryPoint from storage:", e);
  }

  // Default to upload_form
  console.log("📍 No entry point found, defaulting to upload_form");
  return "upload_form";
};

/**
 * Get the correct route path based on entry point
 */
export const getStartNewQuoteRoute = (entryPoint?: string): string => {
  const ep = entryPoint || getEntryPointFromStorage();

  switch (ep) {
    case "order_form":
      return "/quote?step=1";
    case "upload_form":
    default:
      return "/upload?step=1";
  }
};

/**
 * Clear all quote-related localStorage and navigate to correct start page
 * Use this for "Start New Quote" buttons on confirmation pages
 */
export const handleStartNewQuote = (navigate: (path: string) => void): void => {
  // Get entry point BEFORE clearing storage
  const entryPoint = getEntryPointFromStorage();
  const route = getStartNewQuoteRoute(entryPoint);

  console.log("🚀 Start New Quote");
  console.log("📍 Entry Point:", entryPoint);
  console.log("🔗 Navigating to:", route);

  // Clear storage
  localStorage.removeItem("cethos_upload_draft");
  localStorage.removeItem("cethos_quote_draft");

  // Navigate to correct route
  navigate(route);
};

/**
 * Navigate to start of flow without clearing storage
 * Use this for "Start Over" links within the quote flow
 */
export const handleStartOver = (navigate: (path: string) => void): void => {
  const route = getStartNewQuoteRoute();

  console.log("🔄 Start Over");
  console.log("🔗 Navigating to:", route);

  navigate(route);
};
