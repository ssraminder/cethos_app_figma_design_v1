import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  DollarSign,
  AlertTriangle,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { callPaymentApi, formatCurrency, formatDate } from "@/lib/payment-api";
import RecordPaymentModal from "./RecordPaymentModal";

interface BalanceData {
  outstanding_balance: number;
  unallocated_credits: number;
  overdue_amount: number;
  recent_payments: {
    id: string;
    payment_date: string;
    amount: number;
    payment_method_name: string | null;
  }[];
}

interface CustomerARSummaryProps {
  customerId: string;
  customerName: string;
}

export default function CustomerARSummary({
  customerId,
  customerName,
}: CustomerARSummaryProps) {
  const [data, setData] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const result = await callPaymentApi("manage-customer-payments", {
          action: "get_customer_balance",
          customer_id: customerId,
        });
        setData(result);
      } catch (err) {
        console.error("Failed to load customer balance:", err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [customerId]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <h3 className="text-base font-semibold text-gray-800 mb-4">
          <DollarSign className="w-4 h-4 inline mr-2" />
          Accounts Receivable
        </h3>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading...
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <>
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-800">
            <DollarSign className="w-4 h-4 inline mr-2" />
            Accounts Receivable
          </h3>
          <button
            onClick={() => setShowPaymentModal(true)}
            className="px-3 py-1.5 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg"
          >
            Record Payment
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              Outstanding
            </p>
            <p className="text-lg font-bold text-gray-900">
              {formatCurrency(data.outstanding_balance || 0)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              Unallocated
            </p>
            <p className="text-lg font-bold text-gray-900">
              {formatCurrency(data.unallocated_credits || 0)}
            </p>
            {(data.unallocated_credits || 0) > 0 && (
              <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
                Credits available
              </span>
            )}
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              Overdue
            </p>
            <p className="text-lg font-bold text-gray-900">
              {formatCurrency(data.overdue_amount || 0)}
            </p>
            {(data.overdue_amount || 0) > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">
                <AlertTriangle className="w-3 h-3" />
                Overdue
              </span>
            )}
          </div>
        </div>

        {/* Recent Payments */}
        {data.recent_payments && data.recent_payments.length > 0 && (
          <div className="border-t border-gray-200 pt-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Recent Payments
            </p>
            <div className="space-y-2">
              {data.recent_payments.slice(0, 3).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-gray-600">
                    {formatDate(p.payment_date)}
                  </span>
                  <span className="text-gray-500 text-xs">
                    {p.payment_method_name || ""}
                  </span>
                  <Link
                    to={`/admin/payments/${p.id}`}
                    className="font-medium text-gray-900 hover:text-teal-600"
                  >
                    {formatCurrency(p.amount)}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* View All link */}
        <div className="border-t border-gray-200 pt-3 mt-3">
          <Link
            to={`/admin/payments?search=${encodeURIComponent(customerName)}`}
            className="inline-flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700 font-medium"
          >
            View All Payments
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      <RecordPaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onSuccess={() => {
          setShowPaymentModal(false);
          // Refresh data
          window.location.reload();
        }}
        customerId={customerId}
        customerName={customerName}
      />
    </>
  );
}
