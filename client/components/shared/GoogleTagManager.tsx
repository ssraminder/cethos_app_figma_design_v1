import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useTrackingSettings } from "@/hooks/useTrackingSettings";

/**
 * Database-driven Google Tag Manager / Analytics component.
 *
 * Reads tag IDs from the `app_settings` table and dynamically injects
 * the corresponding scripts into <head>. Sends page_view events on
 * route changes for GA4. Also supports custom <script> injection
 * via the `custom_head_scripts` setting.
 *
 * Mount once at the app root (inside BrowserRouter).
 */
export default function GoogleTagManager() {
  const { settings, loading } = useTrackingSettings();
  const location = useLocation();
  const injectedRef = useRef(false);

  // Inject scripts once when settings load
  useEffect(() => {
    if (loading || injectedRef.current) return;
    if (!settings.tracking_enabled) return;

    injectedRef.current = true;

    // --- Google Tag Manager (container snippet) ---
    if (settings.google_tag_manager_id) {
      const gtmId = settings.google_tag_manager_id;

      // Head script
      const gtmScript = document.createElement("script");
      gtmScript.id = "gtm-head";
      gtmScript.textContent = `
        (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
        new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
        j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
        'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
        })(window,document,'script','dataLayer','${gtmId}');
      `;
      document.head.appendChild(gtmScript);

      // Body noscript iframe
      const noscript = document.createElement("noscript");
      noscript.id = "gtm-body";
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.googletagmanager.com/ns.html?id=${gtmId}`;
      iframe.height = "0";
      iframe.width = "0";
      iframe.style.display = "none";
      iframe.style.visibility = "hidden";
      noscript.appendChild(iframe);
      document.body.insertBefore(noscript, document.body.firstChild);
    }

    // --- Google Analytics 4 (gtag.js) ---
    if (settings.google_analytics_id) {
      const gaId = settings.google_analytics_id;

      const gaScript = document.createElement("script");
      gaScript.id = "ga4-script";
      gaScript.async = true;
      gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
      document.head.appendChild(gaScript);

      const gaInit = document.createElement("script");
      gaInit.id = "ga4-init";
      gaInit.textContent = `
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${gaId}', { send_page_view: false });
      `;
      document.head.appendChild(gaInit);
    }

    // --- Custom head scripts ---
    for (const script of settings.custom_head_scripts) {
      const el = document.createElement("script");
      el.id = `custom-script-${script.id}`;
      if (script.src) {
        el.async = true;
        el.src = script.src;
      }
      if (script.inline) {
        el.textContent = script.inline;
      }
      document.head.appendChild(el);
    }

    // Cleanup on unmount
    return () => {
      for (const id of [
        "gtm-head",
        "gtm-body",
        "ga4-script",
        "ga4-init",
        ...settings.custom_head_scripts.map((s) => `custom-script-${s.id}`),
      ]) {
        document.getElementById(id)?.remove();
      }
      injectedRef.current = false;
    };
  }, [loading, settings]);

  // Send page_view on route changes for GA4
  useEffect(() => {
    if (!settings.tracking_enabled || !settings.google_analytics_id) return;

    const w = window as any;
    if (typeof w.gtag === "function") {
      w.gtag("event", "page_view", {
        page_path: location.pathname + location.search,
        page_title: document.title,
      });
    }
  }, [location, settings.tracking_enabled, settings.google_analytics_id]);

  // This component renders nothing
  return null;
}
