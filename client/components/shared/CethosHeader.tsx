import { useEffect, useState } from "react";

interface CethosHeaderProps {
  activePage?: string;
  variant?: "default" | "transparent" | "dark";
  hideCta?: boolean;
}

export default function CethosHeader({
  activePage = "",
  variant = "default",
  hideCta = false,
}: CethosHeaderProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (customElements.get("cethos-header")) {
      setIsLoaded(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cethos.com/embed/cethos-components.js";
    script.async = true;

    script.onload = () => {
      customElements.whenDefined("cethos-header").then(() => {
        setIsLoaded(true);
      });
    };

    script.onerror = () => {
      console.error("Failed to load Cethos components");
      const fallbackScript = document.createElement("script");
      fallbackScript.src =
        "https://lmzoyezvsjgsxveoakdr.supabase.co/storage/v1/object/public/web-assets/components/cethos-components.js";
      fallbackScript.onload = () => setIsLoaded(true);
      document.body.appendChild(fallbackScript);
    };

    document.body.appendChild(script);
  }, []);

  return (
    <>
      {!isLoaded && (
        <div className="h-16 bg-white border-b border-gray-200 animate-pulse" />
      )}

      <cethos-header
        active-page={activePage}
        variant={variant}
        hide-cta={hideCta ? "true" : undefined}
        style={{ display: isLoaded ? "block" : "none" }}
      />
    </>
  );
}
