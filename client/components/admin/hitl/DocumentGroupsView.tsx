import React, { useState, useEffect } from "react";
import { FileText, RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { DEFAULT_WORDS_PER_PAGE } from "@/types/document-editor";

// ============================================
// INTERFACES
// ============================================

interface GroupPage {
  id: string;
  pageNumber: number;
  wordCount: number;
  complexity: string;
  complexityMultiplier: number;
  billablePages: number;
}

interface DocumentGroup {
  id: string;
  name: string;
  documentType: string;
  holderName?: string;
  countryOfIssue?: string;
  sourceFile: string;
  pages: GroupPage[];
  certificationTypeId: string;
  certificationName: string;
  certificationPrice: number;
}

interface CertificationType {
  id: string;
  code: string;
  name: string;
  price: number;
}

interface DocumentGroupsViewProps {
  groups: DocumentGroup[];
  onReanalyze: (groupId: string) => Promise<void>;
  onCertificationChange: (groupId: string, certTypeId: string) => Promise<void>;
  baseRate: number;
  languageMultiplier: number;
}

// ============================================
// COMPONENT
// ============================================

export default function DocumentGroupsView({
  groups,
  onReanalyze,
  onCertificationChange,
  baseRate,
  languageMultiplier,
}: DocumentGroupsViewProps) {
  const [certificationTypes, setCertificationTypes] = useState<
    CertificationType[]
  >([]);
  const [reanalyzingGroupId, setReanalyzingGroupId] = useState<string | null>(
    null
  );
  const [updatingCertGroupId, setUpdatingCertGroupId] = useState<string | null>(
    null
  );

  // Fetch certification types on mount
  useEffect(() => {
    const fetchCertTypes = async () => {
      const { data, error } = await supabase
        .from("certification_types")
        .select("id, code, name, price")
        .eq("is_active", true)
        .order("price");

      if (error) {
        console.error("Error fetching certification types:", error);
        return;
      }

      if (data) {
        setCertificationTypes(data);
      }
    };
    fetchCertTypes();
  }, []);

  // ============================================
  // CALCULATIONS (Display Only - Server Persists)
  // ============================================

  const calculatePageBillable = (
    wordCount: number,
    complexityMultiplier: number
  ): number => {
    // CEIL((words / 225) x complexity x 10) / 10 = Round UP to 0.10
    return (
      Math.ceil((wordCount / DEFAULT_WORDS_PER_PAGE) * complexityMultiplier * 10) / 10
    );
  };

  const calculateGroupTotalBillable = (pages: GroupPage[]): number => {
    const total = pages.reduce((sum, p) => sum + p.billablePages, 0);
    return Math.max(1.0, total); // Minimum 1.0 billable page per group
  };

  const calculateTranslationCost = (totalBillable: number): number => {
    // Round to nearest $2.50
    return (
      Math.ceil((totalBillable * baseRate * languageMultiplier) / 2.5) * 2.5
    );
  };

  const calculateGroupTotal = (
    pages: GroupPage[],
    certificationPrice: number
  ): number => {
    const totalBillable = calculateGroupTotalBillable(pages);
    const translationCost = calculateTranslationCost(totalBillable);
    return translationCost + certificationPrice;
  };

  const calculateSubtotal = (): number => {
    return groups.reduce((sum, group) => {
      return sum + calculateGroupTotal(group.pages, group.certificationPrice);
    }, 0);
  };

  // Get page range string (e.g., "pages 1-3" or "pages 1, 3, 5")
  const getPageRange = (pages: GroupPage[]): string => {
    if (pages.length === 0) return "";
    const pageNumbers = pages.map((p) => p.pageNumber).sort((a, b) => a - b);

    // Check if consecutive
    const isConsecutive = pageNumbers.every(
      (n, i) => i === 0 || n === pageNumbers[i - 1] + 1
    );

    if (isConsecutive && pageNumbers.length > 1) {
      return `pages ${pageNumbers[0]}-${pageNumbers[pageNumbers.length - 1]}`;
    }
    return `page${pageNumbers.length > 1 ? "s" : ""} ${pageNumbers.join(", ")}`;
  };

  // ============================================
  // HANDLERS
  // ============================================

  const handleReanalyze = async (groupId: string) => {
    setReanalyzingGroupId(groupId);
    try {
      await onReanalyze(groupId);
    } finally {
      setReanalyzingGroupId(null);
    }
  };

  const handleCertificationChange = async (
    groupId: string,
    certTypeId: string
  ) => {
    setUpdatingCertGroupId(groupId);
    try {
      await onCertificationChange(groupId, certTypeId);
    } finally {
      setUpdatingCertGroupId(null);
    }
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Document Groups</h2>
        <button
          onClick={() => groups.forEach((g) => handleReanalyze(g.id))}
          className="inline-flex items-center gap-2 text-sm text-teal-600 hover:text-teal-700"
          disabled={reanalyzingGroupId !== null}
        >
          <RefreshCw className="w-4 h-4" />
          Re-analyze All
        </button>
      </div>

      {/* Document Groups */}
      <div className="space-y-4">
        {groups.map((group) => {
          const totalBillable = calculateGroupTotalBillable(group.pages);
          const roundedBillable = Math.round(totalBillable * 10) / 10;
          const translationCost = calculateTranslationCost(totalBillable);
          const groupTotal = calculateGroupTotal(
            group.pages,
            group.certificationPrice
          );
          const isReanalyzing = reanalyzingGroupId === group.id;
          const isUpdatingCert = updatingCertGroupId === group.id;

          return (
            <div
              key={group.id}
              className="bg-white border border-gray-200 rounded-lg overflow-hidden"
            >
              {/* Group Header */}
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-gray-400" />
                    <div>
                      <h3 className="font-medium text-gray-900">
                        {group.name}: {group.documentType}
                      </h3>
                      <div className="text-sm text-gray-500 mt-1">
                        {group.holderName && (
                          <span>Holder: {group.holderName}</span>
                        )}
                        {group.holderName && group.countryOfIssue && (
                          <span> | </span>
                        )}
                        {group.countryOfIssue && (
                          <span>Country: {group.countryOfIssue}</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        Source: {group.sourceFile} ({getPageRange(group.pages)})
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleReanalyze(group.id)}
                    disabled={isReanalyzing}
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
                  >
                    {isReanalyzing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Re-analyze
                  </button>
                </div>
              </div>

              {/* Page Breakdown Table */}
              <div className="p-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-2 py-2 text-left font-medium text-gray-600">
                        Page
                      </th>
                      <th className="px-2 py-2 text-left font-medium text-gray-600">
                        Words
                      </th>
                      <th className="px-2 py-2 text-left font-medium text-gray-600">
                        xComplexity
                      </th>
                      <th className="px-2 py-2 text-right font-medium text-gray-600">
                        Billable
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {group.pages.map((page) => (
                      <tr key={page.id}>
                        <td className="px-2 py-2">{page.pageNumber}</td>
                        <td className="px-2 py-2">{page.wordCount}</td>
                        <td className="px-2 py-2">
                          x{page.complexityMultiplier.toFixed(2)}
                        </td>
                        <td className="px-2 py-2 text-right font-medium">
                          {page.billablePages.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    {/* Total Row */}
                    <tr className="border-t border-gray-300 bg-gray-50">
                      <td colSpan={3} className="px-2 py-2 font-medium">
                        Total:
                      </td>
                      <td className="px-2 py-2 text-right font-semibold">
                        {totalBillable.toFixed(2)} → {roundedBillable.toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Pricing Section */}
              <div className="px-4 pb-4 border-t border-gray-200 pt-4">
                <div className="space-y-2">
                  {/* Certification */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">
                        Certification:
                      </span>
                      <select
                        value={group.certificationTypeId}
                        onChange={(e) =>
                          handleCertificationChange(group.id, e.target.value)
                        }
                        disabled={isUpdatingCert}
                        className="border border-gray-300 rounded px-2 py-1 text-sm disabled:opacity-50"
                      >
                        {certificationTypes.map((ct) => (
                          <option key={ct.id} value={ct.id}>
                            {ct.name} (${ct.price.toFixed(2)})
                          </option>
                        ))}
                      </select>
                    </div>
                    <span className="font-medium">
                      ${group.certificationPrice.toFixed(2)}
                    </span>
                  </div>

                  {/* Translation Cost */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">
                      Translation: {roundedBillable.toFixed(2)} x ${baseRate.toFixed(2)} x{" "}
                      {languageMultiplier.toFixed(2)} =
                    </span>
                    <span className="font-medium">
                      ${translationCost.toFixed(2)}
                    </span>
                  </div>

                  {/* Document Total */}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                    <span className="font-semibold text-gray-900">
                      Document Total:
                    </span>
                    <span className="font-bold text-lg text-teal-600">
                      ${groupTotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Subtotal */}
      <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <span className="text-lg font-semibold text-teal-900">SUBTOTAL:</span>
          <span className="text-2xl font-bold text-teal-700">
            ${calculateSubtotal().toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
