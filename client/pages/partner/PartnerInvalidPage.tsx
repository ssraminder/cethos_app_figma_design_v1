// PartnerInvalidPage.tsx
// Shown when /p/:code has an invalid, inactive, or missing partner code

import { Link } from "react-router-dom";

export default function PartnerInvalidPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-6">
          <svg
            className="w-8 h-8 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"
            />
          </svg>
        </div>

        {/* Message */}
        <h1 className="text-2xl font-semibold text-gray-800 mb-3">
          This link is no longer active
        </h1>
        <p className="text-gray-500 mb-8">
          The partner page you're looking for isn't available. You can get a
          quote directly at our website.
        </p>

        {/* CTA */}
        <Link
          to="/quote"
          className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Get a Quote
        </Link>

        {/* Secondary link */}
        <p className="mt-6 text-sm text-gray-400">
          <a
            href="https://www.cethos.com"
            className="hover:text-gray-600"
          >
            Visit CETHOS Translations
          </a>
        </p>
      </div>
    </div>
  );
}
