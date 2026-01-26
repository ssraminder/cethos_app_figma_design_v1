import { useEffect, useRef } from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "cethos-footer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          minimal?: boolean;
          "hide-locations"?: boolean;
        },
        HTMLElement
      >;
    }
  }
}

interface CethosSiteFooterProps {
  minimal?: boolean;
  hideLocations?: boolean;
}

export default function CethosSiteFooter({
  minimal,
  hideLocations,
}: CethosSiteFooterProps) {
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
    <cethos-footer
      minimal={minimal || undefined}
      hide-locations={hideLocations || undefined}
    />
  );
}
