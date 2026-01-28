import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../../context/CustomerAuthContext";
import CustomerLayout from "../../components/layouts/CustomerLayout";
import {
  Package,
  Calendar,
  DollarSign,
  ArrowLeft,
  Download,
  MessageSquare,
  CheckCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Order {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  tax_amount: number;
  created_at: string;
  updated_at: string;
  quote_id: string;
  estimated_completion_date: string | null;
}

const STATUS_TIMELINE = [
  { status: "paid", label: "Payment Confirmed" },
  { status: "in_production", label: "In Production" },
  { status: "ready_for_pickup", label: "Ready" },
  { status: "out_for_delivery", label: "Out for Delivery" },
  { status: "delivered", label: "Delivered" },
  { status: "completed", label: "Completed" },
];

const STATUS_COLORS: Record<string, string> = {
  paid: "bg-green-100 text-green-800",
  in_production: "bg-blue-100 text-blue-800",
  ready_for_pickup: "bg-purple-100 text-purple-800",
  out_for_delivery: "bg-yellow-100 text-yellow-800",
  delivered: "bg-teal-100 text-teal-800",
  completed: "bg-gray-100 text-gray-800",
  cancelled: "bg-red-100 text-red-800",
};

export default function CustomerOrderDetail() {
  const { id } = useParams();
  const { customer } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);

  useEffect(() => {
    if (id && customer?.id) {
      loadOrder();
    }
  }, [id, customer?.id]);

  const loadOrder = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", id)
        .eq("customer_id", customer?.id)
        .single();

      if (error) throw error;
      setOrder(data);
    } catch (err) {
      console.error("Failed to load order:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadInvoice = async () => {
    try {
      setDownloadingInvoice(true);

      const response = await fetch(
        `/functions/v1/generate-invoice-pdf?order_id=${order?.id}`
      );

      if (!response.ok) {
        throw new Error("Failed to generate invoice");
      }

      const html = await response.text();

      // Open in new window for printing or saving
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
      }
    } catch (err) {
      console.error("Failed to download invoice:", err);
      alert("Failed to download invoice. Please try again.");
    } finally {
      setDownloadingInvoice(false);
    }
  };

  const getCurrentStatusIndex = () => {
    return STATUS_TIMELINE.findIndex((s) => s.status === order?.status);
  };

  if (loading) {
    return (
      <CustomerLayout>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </CustomerLayout>
    );
  }

  if (!order) {
    return (
      <CustomerLayout>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700">Order not found</p>
            <Link
              to="/dashboard/orders"
              className="text-red-600 hover:text-red-700 text-sm mt-2 inline-block"
            >
              ← Back to orders
            </Link>
          </div>
        </div>
      </CustomerLayout>
    );
  }

  const currentStatusIndex = getCurrentStatusIndex();

  return (
    <CustomerLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <Link
          to="/dashboard/orders"
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Orders
        </Link>

        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                {order.order_number}
              </h1>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Ordered: {new Date(order.created_at).toLocaleDateString()}
                </div>
                {order.estimated_completion_date && (
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    Est. Completion:{" "}
                    {new Date(
                      order.estimated_completion_date
                    ).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>
            <span
              className={`px-4 py-2 rounded-full text-sm font-medium ${
                STATUS_COLORS[order.status] || "bg-gray-100 text-gray-800"
              }`}
            >
              {STATUS_TIMELINE.find((s) => s.status === order.status)?.label ||
                order.status}
            </span>
          </div>

          {/* Status Timeline */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-sm font-medium text-gray-900 mb-4">
              Order Progress
            </h3>
            <div className="relative">
              {/* Progress Line */}
              <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-200">
                <div
                  className="h-full bg-teal-600 transition-all duration-500"
                  style={{
                    width: `${(currentStatusIndex / (STATUS_TIMELINE.length - 1)) * 100}%`,
                  }}
                ></div>
              </div>

              {/* Status Points */}
              <div className="relative flex justify-between">
                {STATUS_TIMELINE.map((timelineStatus, index) => {
                  const isCompleted = index <= currentStatusIndex;
                  const isCurrent = index === currentStatusIndex;

                  return (
                    <div key={timelineStatus.status} className="flex flex-col items-center">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                          isCompleted
                            ? "bg-teal-600 text-white"
                            : "bg-gray-200 text-gray-400"
                        } ${isCurrent ? "ring-4 ring-teal-100" : ""}`}
                      >
                        {isCompleted ? (
                          <CheckCircle className="w-5 h-5" />
                        ) : (
                          <div className="w-2 h-2 bg-current rounded-full"></div>
                        )}
                      </div>
                      <p
                        className={`text-xs mt-2 text-center max-w-20 ${
                          isCompleted ? "text-gray-900 font-medium" : "text-gray-500"
                        }`}
                      >
                        {timelineStatus.label}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Order Summary */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Order Summary
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal</span>
              <span className="font-medium text-gray-900">
                ${(order.total_amount - (order.tax_amount || 0)).toFixed(2)}
              </span>
            </div>
            {order.tax_amount > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Tax</span>
                <span className="font-medium text-gray-900">
                  ${order.tax_amount.toFixed(2)}
                </span>
              </div>
            )}
            <div className="flex justify-between pt-3 border-t border-gray-200">
              <span className="text-lg font-semibold text-gray-900">Total</span>
              <span className="text-lg font-bold text-teal-600">
                ${order.total_amount.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={handleDownloadInvoice}
            disabled={downloadingInvoice}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-white border-2 border-gray-300 text-gray-700 rounded-lg hover:border-teal-500 hover:bg-teal-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-5 h-5" />
            {downloadingInvoice ? "Generating..." : "Download Invoice"}
          </button>

          <Link
            to="/dashboard/messages"
            className="flex items-center justify-center gap-2 px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
          >
            <MessageSquare className="w-5 h-5" />
            Message Staff
          </Link>
        </div>
      </div>
    </CustomerLayout>
  );
}
