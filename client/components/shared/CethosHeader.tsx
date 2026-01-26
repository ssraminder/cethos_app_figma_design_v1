import { useEffect, useRef } from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "cethos-header": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          "current-site"?: string;
          "hide-cta"?: boolean;
          theme?: "light" | "dark";
        },
        HTMLElement
      >;
    }
  }
}

interface CethosHeaderProps {
  currentSite?: string;
  hideCta?: boolean;
  theme?: "light" | "dark";
}

export default function CethosHeader({
  currentSite,
  hideCta,
  theme,
}: CethosHeaderProps) {
  const scriptLoaded = useRef(false);

  useEffect(() => {
    if (scriptLoaded.current) return;

    if (document.querySelector('script[src*="cethos-components.js"]')) {
      scriptLoaded.current = true;
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cethos.com/embed/cethos-components.js";
    script.async = true;
    document.head.appendChild(script);
    scriptLoaded.current = true;
  }, []);

  return (
    <cethos-header
      current-site={currentSite}
      hide-cta={hideCta || undefined}
      theme={theme}
    />
  );
}
