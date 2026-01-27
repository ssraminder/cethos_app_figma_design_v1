import React from "react";
import { Globe, Users, DollarSign, FileText } from "lucide-react";

interface QuoteDetails {
  // Step 2 Data
  source_language_name: string;
  source_language_code: string;
  target_language_name: string;
  target_language_code: string;
  intended_use_name: string;
  country_of_issue: string;
  service_province?: string;
  special_instructions?: string;

  // Step 3 Data
  customer_name: string;
  customer_email: string;
  customer_phone: string;

  // Pricing
  subtotal: number;
  certification_total: number;
  tax_amount: number;
  total: number;
}

interface QuoteDetailsPanelProps {
  quoteData: QuoteDetails | null;
  loading?: boolean;
}

export default function QuoteDetailsPanel({
  quoteData,
  loading = false,
}: QuoteDetailsPanelProps) {
  const [expandedSection, setExpandedSection] = React.useState<string>("translation");

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="space-y-3">
          <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
        </div>
      </div>
    );
  }

  if (!quoteData) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
        <p className="text-sm text-gray-500">No quote details available</p>
      </div>
    );
  }

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? "" : section);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg divide-y">
      {/* Step 2: Translation Requirements */}
      <div>
        <button
          onClick={() => toggleSection("translation")}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-gray-600" />
            <h3 className="text-sm font-semibold text-gray-900">Translation Details</h3>
          </div>
          <span className="text-gray-400">
            {expandedSection === "translation" ? "−" : "+"}
          </span>
        </button>

        {expandedSection === "translation" && (
          <div className="px-4 py-3 space-y-2 bg-gray-50 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Source Language:</span>
              <span className="font-medium text-gray-900">
                {quoteData.source_language_name}{" "}
                <span className="text-xs text-gray-500">
                  ({quoteData.source_language_code})
                </span>
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Target Language:</span>
              <span className="font-medium text-gray-900">
                {quoteData.target_language_name}{" "}
                <span className="text-xs text-gray-500">
                  ({quoteData.target_language_code})
                </span>
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Purpose:</span>
              <span className="font-medium text-gray-900">
                {quoteData.intended_use_name}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Country of Issue:</span>
              <span className="font-medium text-gray-900">
                {quoteData.country_of_issue || "—"}
              </span>
            </div>

            {quoteData.service_province && (
              <div className="flex justify-between">
                <span className="text-gray-600">Service Province:</span>
                <span className="font-medium text-gray-900">
                  {quoteData.service_province}
                </span>
              </div>
            )}

            {quoteData.special_instructions && (
              <div className="col-span-2 mt-2 p-2 bg-white rounded border border-gray-200">
                <p className="text-xs font-medium text-gray-600 mb-1">Special Instructions:</p>
                <p className="text-xs text-gray-700 whitespace-pre-wrap">
                  {quoteData.special_instructions}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Step 3: Contact Information */}
      <div>
        <button
          onClick={() => toggleSection("contact")}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-600" />
            <h3 className="text-sm font-semibold text-gray-900">Contact Information</h3>
          </div>
          <span className="text-gray-400">
            {expandedSection === "contact" ? "−" : "+"}
          </span>
        </button>

        {expandedSection === "contact" && (
          <div className="px-4 py-3 space-y-2 bg-gray-50 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Name:</span>
              <span className="font-medium text-gray-900">
                {quoteData.customer_name}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Email:</span>
              <a
                href={`mailto:${quoteData.customer_email}`}
                className="font-medium text-blue-600 hover:text-blue-700"
              >
                {quoteData.customer_email}
              </a>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Phone:</span>
              <a
                href={`tel:${quoteData.customer_phone}`}
                className="font-medium text-blue-600 hover:text-blue-700"
              >
                {quoteData.customer_phone}
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Pricing Summary */}
      <div>
        <button
          onClick={() => toggleSection("pricing")}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-gray-600" />
            <h3 className="text-sm font-semibold text-gray-900">Pricing</h3>
          </div>
          <span className="text-gray-400">
            {expandedSection === "pricing" ? "−" : "+"}
          </span>
        </button>

        {expandedSection === "pricing" && (
          <div className="px-4 py-3 space-y-2 bg-gray-50 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal:</span>
              <span className="font-medium text-gray-900">
                ${Number(quoteData.subtotal).toFixed(2)}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Certification:</span>
              <span className="font-medium text-gray-900">
                ${Number(quoteData.certification_total).toFixed(2)}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Tax:</span>
              <span className="font-medium text-gray-900">
                ${Number(quoteData.tax_amount).toFixed(2)}
              </span>
            </div>

            <div className="border-t pt-2 flex justify-between font-semibold">
              <span className="text-gray-900">Total:</span>
              <span className="text-lg text-green-600">
                ${Number(quoteData.total).toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
