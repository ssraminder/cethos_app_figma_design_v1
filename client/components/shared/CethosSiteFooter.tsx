import { useEffect, useState } from "react";

interface CethosSiteFooterProps {
  variant?: "default" | "minimal";
  hideNewsletter?: boolean;
}

export default function CethosSiteFooter({
  variant = "default",
  hideNewsletter = false,
}: CethosSiteFooterProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (customElements.get("cethos-footer")) {
      setIsLoaded(true);
      return;
    }

    const checkLoaded = window.setInterval(() => {
      if (customElements.get("cethos-footer")) {
        setIsLoaded(true);
        clearInterval(checkLoaded);
      }
    }, 100);

    const timeout = window.setTimeout(() => {
      clearInterval(checkLoaded);
      if (!customElements.get("cethos-footer")) {
        const script = document.createElement("script");
        script.src = "https://cethos.com/embed/cethos-components.js";
        script.onload = () => setIsLoaded(true);
        document.body.appendChild(script);
      }
    }, 5000);

    return () => {
      clearInterval(checkLoaded);
      clearTimeout(timeout);
    };
  }, []);

  return (
    <>
      {!isLoaded && <div className="h-64 bg-[#0C2340] animate-pulse" />}

      <cethos-footer
        variant={variant}
        hide-newsletter={hideNewsletter ? "true" : undefined}
        style={{ display: isLoaded ? "block" : "none" }}
      />
    </>
  );
}
