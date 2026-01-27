import React, { useState } from "react";
import { Globe, ChevronDown, ChevronUp } from "lucide-react";

interface TranslationDetailsData {
  source_language_name: string;
  source_language_code: string;
  target_language_name: string;
  target_language_code: string;
  intended_use_name: string;
  country_of_issue: string;
  service_province?: string;
  special_instructions?: string;
}

interface TranslationDetailsPanelProps {
  translationData: TranslationDetailsData | null;
  loading?: boolean;
}

export default function TranslationDetailsPanel({
  translationData,
  loading = false,
}: TranslationDetailsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
        </div>
      </div>
    );
  }

  if (!translationData) {
    return null;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg divide-y">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-gray-900">
            Translation Details
          </h3>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 py-3 space-y-3 text-sm">
          {/* Source Language */}
          <div>
            <p className="text-xs text-gray-500 mb-1">Source Language</p>
            <p className="font-medium text-gray-900">
              {translationData.source_language_name || (
                <span className="text-red-600">Not specified</span>
              )}
              {translationData.source_language_code && (
                <span className="text-gray-500 ml-1">
                  ({translationData.source_language_code})
                </span>
              )}
            </p>
          </div>

          {/* Target Language */}
          <div>
            <p className="text-xs text-gray-500 mb-1">Target Language</p>
            <p className="font-medium text-gray-900">
              {translationData.target_language_name || (
                <span className="text-red-600">Not specified</span>
              )}
              {translationData.target_language_code && (
                <span className="text-gray-500 ml-1">
                  ({translationData.target_language_code})
                </span>
              )}
            </p>
          </div>

          {/* Purpose */}
          <div>
            <p className="text-xs text-gray-500 mb-1">Purpose</p>
            <p className="font-medium text-gray-900">
              {translationData.intended_use_name || (
                <span className="text-gray-400 italic">Not specified</span>
              )}
            </p>
          </div>

          {/* Country of Issue */}
          <div>
            <p className="text-xs text-gray-500 mb-1">Country of Issue</p>
            <p className="font-medium text-gray-900">
              {translationData.country_of_issue || (
                <span className="text-gray-400 italic">Not specified</span>
              )}
            </p>
          </div>

          {/* Service Province (optional) */}
          {translationData.service_province && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Service Province</p>
              <p className="font-medium text-gray-900">
                {translationData.service_province}
              </p>
            </div>
          )}

          {/* Special Instructions (optional) */}
          {translationData.special_instructions && (
            <div>
              <p className="text-xs text-gray-500 mb-1">
                Special Instructions
              </p>
              <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded border border-gray-200">
                {translationData.special_instructions}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
