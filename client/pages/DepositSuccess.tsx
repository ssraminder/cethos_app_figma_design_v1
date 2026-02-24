import { CheckCircle2 } from "lucide-react";

export default function DepositSuccess() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-[480px] w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        {/* Success Icon */}
        <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-9 h-9 text-white" />
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          Payment Received — Thank You!
        </h1>

        {/* Description */}
        <p className="text-sm text-gray-500 mb-6">
          Your deposit has been received and credited to your account. Our team
          will be in touch shortly to begin your translation.
        </p>

        {/* Divider */}
        <div className="border-t border-gray-200 my-6" />

        {/* Support Contact */}
        <p className="text-sm text-gray-500 mb-6">
          Questions? Contact us at{" "}
          <a
            href="mailto:support@cethos.com"
            className="text-blue-600 hover:underline"
          >
            support@cethos.com
          </a>
        </p>

        {/* Return Button */}
        <a
          href="https://cethos.com"
          className="inline-block w-full py-3 px-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium text-center"
        >
          Return to Homepage
        </a>
      </div>
    </div>
  );
}
