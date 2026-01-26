declare namespace JSX {
  interface IntrinsicElements {
    "cethos-header": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        "active-page"?: string;
        variant?: "default" | "transparent" | "dark";
        "hide-cta"?: string;
      },
      HTMLElement
    >;
    "cethos-footer": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        variant?: "default" | "minimal";
        "hide-newsletter"?: string;
      },
      HTMLElement
    >;
  }
}

export {};
