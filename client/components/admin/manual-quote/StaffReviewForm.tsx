import { useState, useEffect } from "react";
import { Edit2, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { FileWithAnalysis } from "./StaffFileUploadForm";
import { QuotePricing } from "./StaffPricingForm";

interface CustomerData {
  id?: string;
  email: string;
  phone: string;
  fullName: string;
  customerType: "individual" | "business";
  companyName?: string;
}

interface QuoteData {
  sourceLanguageId?: string;
  targetLanguageId?: string;
  intendedUseId?: string;
  countryOfIssue?: string;
  specialInstructions?: string;
}

interface Language {
  id: string;
  name: string;
  native_name: string;
  code: string;
}

interface IntendedUse {
  id: string;
  name: string;
}

interface Country {
  code: string;
  name: string;
}

interface StaffReviewFormProps {
  customer: CustomerData | null;
  quote: QuoteData;
  files: FileWithAnalysis[];
  pricing: QuotePricing;
  staffNotes: string;
  onStaffNotesChange: (notes: string) => void;
  onEditSection: (section: "customer" | "translation" | "files" | "pricing") => void;
  onPrevious: () => void;
  onSubmit: (sendNotification: boolean) => Promise<void>;
  submitting?: boolean;
}

export default function StaffReviewForm({
  customer,
  quote,
  files,
  pricing,
  staffNotes,
  onStaffNotesChange,
  onEditSection,
  onPrevious,
  onSubmit,
  submitting = false,
}: StaffReviewFormProps) {
  const [languages, setLanguages] = useState<Record<string, Language>>({});
  const [intendedUses, setIntendedUses] = useState<Record<string, IntendedUse>>(
    {}
  );
  const [countries, setCountries] = useState<Record<string, Country>>({});
  const [sendNotification, setSendNotification] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load reference data
  useEffect(() => {
    const loadData = async () => {
      const [langsRes, usesRes, countriesRes] = await Promise.all([
        supabase.from("languages").select("*"),
        supabase.from("intended_uses").select("*"),
        supabase.from("countries").select("*"),
      ]);

      const langsMap: Record<string, Language> = {};
      langsRes.data?.forEach((lang: any) => {
        langsMap[lang.id] = lang;
      });
      setLanguages(langsMap);

      const usesMap: Record<string, IntendedUse> = {};
      usesRes.data?.forEach((use: any) => {
        usesMap[use.id] = use;
      });
      setIntendedUses(usesMap);

      const countriesMap: Record<string, Country> = {};
      countriesRes.data?.forEach((country: any) => {
        countriesMap[country.code] = country;
      });
      setCountries(countriesMap);

      setLoading(false);
    };

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-gray-600">Loading review data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Section 1: Customer Summary */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Customer Information</h3>
          <button
            onClick={() => onEditSection("customer")}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
          >
            <Edit2 className="w-4 h-4" />
            Edit
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Full Name
              </p>
              <p className="text-gray-900">{customer?.fullName}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Customer Type
              </p>
              <p className="text-gray-900 capitalize">{customer?.customerType}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Email
              </p>
              <p className="text-gray-900">{customer?.email}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Phone
              </p>
              <p className="text-gray-900">{customer?.phone}</p>
            </div>
            {customer?.customerType === "business" && customer?.companyName && (
              <div className="col-span-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Company Name
                </p>
                <p className="text-gray-900">{customer.companyName}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Section 2: Translation Details */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Translation Details</h3>
          <button
            onClick={() => onEditSection("translation")}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
          >
            <Edit2 className="w-4 h-4" />
            Edit
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Source Language
              </p>
              <p className="text-gray-900">
                {languages[quote.sourceLanguageId!]?.name ||
                  quote.sourceLanguageId}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Target Language
              </p>
              <p className="text-gray-900">
                {languages[quote.targetLanguageId!]?.name ||
                  quote.targetLanguageId}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Language Pair
              </p>
              <p className="text-gray-900">
                {languages[quote.sourceLanguageId!]?.name} →{" "}
                {languages[quote.targetLanguageId!]?.name}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Intended Use
              </p>
              <p className="text-gray-900">
                {intendedUses[quote.intendedUseId!]?.name ||
                  quote.intendedUseId}
              </p>
            </div>
            {quote.countryOfIssue && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Country of Issue
                </p>
                <p className="text-gray-900">
                  {countries[quote.countryOfIssue]?.name ||
                    quote.countryOfIssue}
                </p>
              </div>
            )}
            {quote.specialInstructions && (
              <div className="col-span-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Special Instructions
                </p>
                <p className="text-gray-900 whitespace-pre-wrap">
                  {quote.specialInstructions}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Section 3: Files & Analysis Summary */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">
            Files & Analysis ({files.length} files)
          </h3>
          <button
            onClick={() => onEditSection("files")}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
          >
            <Edit2 className="w-4 h-4" />
            Edit
          </button>
        </div>
        <div className="p-6 space-y-4">
          {files.length === 0 ? (
            <div className="text-gray-600 italic">No files uploaded</div>
          ) : (
            files.map((file) => (
              <div
                key={file.id}
                className="border border-gray-200 rounded-md p-4 space-y-3"
              >
                <div className="font-medium text-gray-900">{file.name}</div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {file.detectedLanguage && (
                    <div>
                      <p className="text-gray-600">Detected Language</p>
                      <p className="font-medium text-gray-900">
                        {file.detectedLanguage}
                      </p>
                    </div>
                  )}
                  {file.detectedDocumentType && (
                    <div>
                      <p className="text-gray-600">Document Type</p>
                      <p className="font-medium text-gray-900">
                        {file.detectedDocumentType}
                      </p>
                    </div>
                  )}
                  {file.pageCount && (
                    <div>
                      <p className="text-gray-600">Pages</p>
                      <p className="font-medium text-gray-900">
                        {file.pageCount}
                      </p>
                    </div>
                  )}
                  {file.complexity && (
                    <div>
                      <p className="text-gray-600">Complexity</p>
                      <p className="font-medium text-gray-900 capitalize">
                        {file.complexity}
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {file.analysisStatus === "completed" ? (
                    <div className="flex items-center gap-2 text-green-700">
                      <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
                      Analysis Completed
                    </div>
                  ) : file.analysisStatus === "analyzing" ? (
                    <div className="flex items-center gap-2 text-blue-700">
                      <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                      Analyzing...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-amber-700">
                      <AlertCircle className="w-4 h-4" />
                      Analysis Not Available
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Section 4: Detailed Pricing Breakdown */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Pricing Breakdown</h3>
          <button
            onClick={() => onEditSection("pricing")}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
          >
            <Edit2 className="w-4 h-4" />
            Edit
          </button>
        </div>
        <div className="p-6 space-y-6">
          {/* Per-File Details */}
          {pricing.filePrices.map((filePrice, idx) => (
            <div key={filePrice.fileId} className="border-b border-gray-200 pb-4">
              <div className="font-medium text-gray-900 mb-3">
                {idx + 1}. {filePrice.fileName}
              </div>
              <div className="space-y-2 text-sm ml-4">
                <div className="flex justify-between text-gray-600">
                  <span>
                    Translation ({filePrice.billablePages} pages × $
                    {filePrice.baseRate.toFixed(2)} × {filePrice.languageMultiplier.toFixed(2)}x ×
                    {filePrice.complexityMultiplier.toFixed(2)}x):
                  </span>
                  <span className="font-medium text-gray-900">
                    ${filePrice.translationCost.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Certification:</span>
                  <span className="font-medium text-gray-900">
                    ${filePrice.certificationCost.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-2 font-semibold text-gray-900">
                  <span>Subtotal:</span>
                  <span>${filePrice.lineTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          ))}

          {/* Quote-Level Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 space-y-3">
            <div className="flex justify-between text-gray-700">
              <span>Documents Subtotal:</span>
              <span className="font-medium text-gray-900">
                ${pricing.documentSubtotal.toFixed(2)}
              </span>
            </div>

            {pricing.rushFee > 0 && (
              <div className="flex justify-between text-amber-700">
                <span>Rush Service (30%):</span>
                <span className="font-medium text-amber-900">
                  +${pricing.rushFee.toFixed(2)}
                </span>
              </div>
            )}

            {pricing.deliveryFee > 0 && (
              <div className="flex justify-between text-gray-700">
                <span>Delivery:</span>
                <span className="font-medium text-gray-900">
                  +${pricing.deliveryFee.toFixed(2)}
                </span>
              </div>
            )}

            {pricing.discountAmount > 0 && (
              <div className="flex justify-between text-green-700">
                <span>
                  Discount ({pricing.discountReason}):
                </span>
                <span className="font-medium text-green-900">
                  -${pricing.discountAmount.toFixed(2)}
                </span>
              </div>
            )}

            {pricing.surchargeAmount > 0 && (
              <div className="flex justify-between text-orange-700">
                <span>
                  Surcharge ({pricing.surchargeReason}):
                </span>
                <span className="font-medium text-orange-900">
                  +${pricing.surchargeAmount.toFixed(2)}
                </span>
              </div>
            )}

            <div className="border-t border-blue-200 pt-3 flex justify-between">
              <span className="text-gray-700">Pre-tax Total:</span>
              <span className="font-medium text-gray-900">
                ${pricing.preTaxTotal.toFixed(2)}
              </span>
            </div>

            <div className="flex justify-between text-gray-700">
              <span>GST ({(pricing.taxRate * 100).toFixed(1)}%):</span>
              <span className="font-medium text-gray-900">
                ${pricing.taxAmount.toFixed(2)}
              </span>
            </div>

            <div className="border-t border-blue-200 pt-3 flex justify-between text-lg font-bold text-blue-600">
              <span>TOTAL:</span>
              <span>${pricing.total.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Section 5: Staff Notes */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Internal Notes</h3>
          <p className="text-xs text-gray-600 mt-1">
            Not visible to customer
          </p>
        </div>
        <div className="p-6">
          <textarea
            placeholder="Internal notes about this quote (not visible to customer)..."
            maxLength={2000}
            value={staffNotes}
            onChange={(e) => onStaffNotesChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={4}
          />
          <p className="text-xs text-gray-600 mt-2">
            {staffNotes.length}/2000 characters
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 justify-between">
        <button
          onClick={onPrevious}
          disabled={submitting}
          className="px-6 py-3 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 font-medium disabled:opacity-50"
        >
          Previous
        </button>

        <div className="flex gap-4">
          <button
            onClick={() => onSubmit(false)}
            disabled={submitting}
            className="px-6 py-3 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 font-medium disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Save as Draft"}
          </button>

          <button
            onClick={() => onSubmit(true)}
            disabled={submitting}
            className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium disabled:opacity-50"
          >
            {submitting ? "Creating Quote..." : "Create Quote"}
          </button>
        </div>
      </div>
    </div>
  );
}
