import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  CreditCard,
  Check,
  Mail,
  Loader2,
  User,
  Building2,
  Globe,
  FileText,
  DollarSign,
  Languages,
  MapPin,
  AlertCircle,
} from "lucide-react";
import { useDropdownOptions } from "@/hooks/useDropdownOptions";

interface PaymentMethod {
  id: string;
  name: string;
  code: string;
  description: string;
  is_online: boolean;
  requires_staff_confirmation: boolean;
  icon: string;
}

interface ReviewData {
  customer: any;
  quote: any;
  pricing: any;
  files: any[];
  entryPoint: string;
  notes: string;
}

interface StaffPaymentReviewFormProps {
  reviewData: ReviewData;
  onSubmit: (paymentMethodId: string, sendPaymentLink: boolean) => void;
  isSubmitting: boolean;
}

export default function StaffPaymentReviewForm({
  reviewData,
  onSubmit,
  isSubmitting,
}: StaffPaymentReviewFormProps) {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<string>("");
  const [sendPaymentLink, setSendPaymentLink] = useState(false);
  const [loading, setLoading] = useState(true);

  const { sourceLanguages, targetLanguages, intendedUses } =
    useDropdownOptions();

  useEffect(() => {
    fetchPaymentMethods();
  }, []);

  const fetchPaymentMethods = async () => {
    if (!supabase) {
      console.error("Supabase client not initialized");
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("payment_methods")
        .select("*")
        .eq("is_active", true)
        .order("display_order");

      if (error) throw error;
      setPaymentMethods(data || []);

      // Auto-select online payment if available
      const onlineMethod = data?.find((m) => m.is_online);
      if (onlineMethod) {
        setSelectedPaymentMethod(onlineMethod.id);
        setSendPaymentLink(true);
      }
    } catch (error) {
      console.error("Error fetching payment methods:", error);
    } finally {
      setLoading(false);
    }
  };

  const selectedMethod = paymentMethods.find(
    (m) => m.id === selectedPaymentMethod,
  );

  const handleSubmit = () => {
    if (!selectedPaymentMethod) {
      alert("Please select a payment method");
      return;
    }
    onSubmit(selectedPaymentMethod, sendPaymentLink);
  };

  // Get language names
  const getSourceLanguageName = () => {
    if (!reviewData.quote?.sourceLanguageId) return "Not specified";
    const lang = sourceLanguages.find(
      (l) => l.id === reviewData.quote.sourceLanguageId,
    );
    return lang?.name || "Unknown";
  };

  const getTargetLanguageName = () => {
    if (!reviewData.quote?.targetLanguageId) return "Not specified";
    const lang = targetLanguages.find(
      (l) => l.id === reviewData.quote.targetLanguageId,
    );
    return lang?.name || "Unknown";
  };

  const getIntendedUseName = () => {
    if (!reviewData.quote?.intendedUseId) return "Not specified";
    const use = intendedUses.find(
      (u) => u.id === reviewData.quote.intendedUseId,
    );
    return use?.name || "Unknown";
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const getEntryPointLabel = () => {
    const entryPointLabels: Record<string, string> = {
      staff_manual: "Manual Entry",
      staff_phone: "Phone Call",
      staff_walkin: "Walk-in",
      staff_email: "Email",
    };
    return entryPointLabels[reviewData.entryPoint] || reviewData.entryPoint;
  };

  return (
    <div className="space-y-6">
      {/* Customer Information */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <User className="w-5 h-5 text-indigo-600" />
            Customer Information
          </h3>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                Full Name
              </p>
              <p className="text-sm font-semibold text-gray-900">
                {reviewData.customer?.fullName || "N/A"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                Customer Type
              </p>
              <div className="flex items-center gap-2">
                {reviewData.customer?.customerType === "business" ? (
                  <Building2 className="w-4 h-4 text-gray-400" />
                ) : (
                  <User className="w-4 h-4 text-gray-400" />
                )}
                <p className="text-sm text-gray-900 capitalize">
                  {reviewData.customer?.customerType || "Individual"}
                </p>
              </div>
            </div>
          </div>

          {reviewData.customer?.companyName && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                Company Name
              </p>
              <p className="text-sm text-gray-900">
                {reviewData.customer.companyName}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                Email
              </p>
              <p className="text-sm text-gray-900">
                {reviewData.customer?.email || "N/A"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                Phone
              </p>
              <p className="text-sm text-gray-900">
                {reviewData.customer?.phone || "N/A"}
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 uppercase mb-1">
              Entry Point
            </p>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
              {getEntryPointLabel()}
            </span>
          </div>
        </div>
      </div>

      {/* Translation Details */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Languages className="w-5 h-5 text-indigo-600" />
            Translation Details
          </h3>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                Source Language
              </p>
              <p className="text-sm text-gray-900">{getSourceLanguageName()}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                Target Language *
              </p>
              <p className="text-sm font-semibold text-gray-900">
                {getTargetLanguageName()}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                Intended Use
              </p>
              <p className="text-sm text-gray-900">{getIntendedUseName()}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                Country of Issue
              </p>
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-gray-400" />
                <p className="text-sm text-gray-900">
                  {reviewData.quote?.countryOfIssue || "Not specified"}
                </p>
              </div>
            </div>
          </div>

          {reviewData.quote?.specialInstructions && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                Special Instructions
              </p>
              <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-md">
                {reviewData.quote.specialInstructions}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Documents */}
      {reviewData.files && reviewData.files.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-600" />
              Documents ({reviewData.files.length})
            </h3>
          </div>
          <div className="px-6 py-4">
            <div className="space-y-2">
              {reviewData.files.map((file, index) => (
                <div
                  key={file.id || index}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {file.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                    Ready
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Pricing Summary */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-indigo-600" />
            Pricing Summary
          </h3>
        </div>
        <div className="px-6 py-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Translation Total</span>
              <span className="font-medium text-gray-900">
                ${reviewData.pricing?.translationTotal?.toFixed(2) || "0.00"}
              </span>
            </div>

            {reviewData.pricing?.certificationTotal > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Certification</span>
                <span className="font-medium text-gray-900">
                  ${reviewData.pricing.certificationTotal.toFixed(2)}
                </span>
              </div>
            )}

            {reviewData.pricing?.discount > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Discount</span>
                <span className="font-medium">
                  -${reviewData.pricing.discount.toFixed(2)}
                </span>
              </div>
            )}

            {reviewData.pricing?.surcharge > 0 && (
              <div className="flex justify-between text-sm text-red-600">
                <span>Surcharge</span>
                <span className="font-medium">
                  +${reviewData.pricing.surcharge.toFixed(2)}
                </span>
              </div>
            )}

            <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
              <span className="text-gray-600">Subtotal</span>
              <span className="font-medium text-gray-900">
                ${reviewData.pricing?.subtotal?.toFixed(2) || "0.00"}
              </span>
            </div>

            {reviewData.pricing?.rushFee > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Rush Fee</span>
                <span className="font-medium text-gray-900">
                  ${reviewData.pricing.rushFee.toFixed(2)}
                </span>
              </div>
            )}

            {reviewData.pricing?.deliveryFee > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Delivery Fee</span>
                <span className="font-medium text-gray-900">
                  ${reviewData.pricing.deliveryFee.toFixed(2)}
                </span>
              </div>
            )}

            <div className="flex justify-between text-sm">
              <span className="text-gray-600">
                Tax ({((reviewData.pricing?.taxRate || 0) * 100).toFixed(1)}%)
              </span>
              <span className="font-medium text-gray-900">
                ${reviewData.pricing?.taxAmount?.toFixed(2) || "0.00"}
              </span>
            </div>

            <div className="flex justify-between text-lg font-bold pt-3 border-t-2 border-gray-900 mt-3">
              <span className="text-gray-900">Total</span>
              <span className="text-indigo-600">
                ${reviewData.pricing?.total?.toFixed(2) || "0.00"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Internal Notes */}
      {reviewData.notes && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900 mb-1">
                Internal Notes
              </p>
              <p className="text-sm text-amber-800">{reviewData.notes}</p>
            </div>
          </div>
        </div>
      )}

      {/* Payment Method Selection */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-indigo-600" />
            Payment Method
          </h3>
        </div>
        <div className="px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="space-y-3">
              {paymentMethods.map((method) => (
                <label
                  key={method.id}
                  className={`flex items-start p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                    selectedPaymentMethod === method.id
                      ? "border-indigo-600 bg-indigo-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value={method.id}
                    checked={selectedPaymentMethod === method.id}
                    onChange={(e) => {
                      setSelectedPaymentMethod(e.target.value);
                      setSendPaymentLink(method.is_online);
                    }}
                    className="mt-1 w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                  />
                  <div className="ml-3 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {method.name}
                      </span>
                      {method.is_online && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                          Online
                        </span>
                      )}
                      {method.requires_staff_confirmation && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                          Needs Confirmation
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      {method.description}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Send Payment Link Option */}
      {selectedMethod?.is_online && reviewData.customer?.email && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={sendPaymentLink}
              onChange={(e) => setSendPaymentLink(e.target.checked)}
              className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-900">
                  Send payment link to customer
                </span>
              </div>
              <p className="text-xs text-blue-700 mt-1">
                Customer will receive an email with a secure payment link to
                complete the order online. Link will expire after 7 days.
              </p>
            </div>
          </label>
        </div>
      )}

      {/* Offline Payment Note */}
      {selectedMethod &&
        !selectedMethod.is_online &&
        selectedMethod.requires_staff_confirmation && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-900">
                  Payment Confirmation Required
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  You'll need to manually confirm this payment after the
                  customer pays. Quote will remain in "Awaiting Payment" status
                  until confirmed.
                </p>
              </div>
            </div>
          </div>
        )}

      {/* Submit Button */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <p className="text-sm text-gray-600">
          Review all details before creating the quote
        </p>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || !selectedPaymentMethod}
          className={`inline-flex items-center gap-2 px-6 py-3 rounded-md text-white font-medium ${
            isSubmitting || !selectedPaymentMethod
              ? "bg-gray-300 cursor-not-allowed"
              : "bg-green-600 hover:bg-green-700"
          }`}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Creating Quote...
            </>
          ) : (
            <>
              <Check className="w-5 h-5" />
              Create Quote{sendPaymentLink && " & Send Link"}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
