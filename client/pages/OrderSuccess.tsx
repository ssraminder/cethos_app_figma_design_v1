import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { CheckCircle2, Mail, Loader2, AlertCircle } from "lucide-react";

interface OrderDetails {
  order_number: string;
  total_amount: number;
  status: string;
  estimated_delivery_date: string;
  customer_email: string;
}

export default function OrderSuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionId) {
      fetchOrderDetails();
    } else {
      setLoading(false);
      setError("No session ID found");
    }
  }, [sessionId]);

  const fetchOrderDetails = async () => {
    try {
      // Find the payment by session ID
      const { data: payment, error: paymentError } = await supabase
        .from("payments")
        .select("order_id")
        .eq("stripe_checkout_session_id", sessionId)
        .single();

      if (paymentError || !payment) {
        // Payment might still be processing, wait and retry
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const { data: retryPayment, error: retryError } = await supabase
          .from("payments")
          .select("order_id")
          .eq("stripe_checkout_session_id", sessionId)
          .single();

        if (retryError || !retryPayment) {
          throw new Error(
            "Order is being processed. Please check your email for confirmation.",
          );
        }

        await fetchOrder(retryPayment.order_id);
        return;
      }

      await fetchOrder(payment.order_id);
    } catch (err: any) {
      console.error("Error fetching order:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrder = async (orderId: string) => {
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select(
        `
        order_number,
        total_amount,
        status,
        estimated_delivery_date,
        customer:customers(email)
      `,
      )
      .eq("id", orderId)
      .single();

    if (orderError || !orderData) {
      throw new Error("Could not find order details");
    }

    setOrder({
      order_number: orderData.order_number,
      total_amount: orderData.total_amount,
      status: orderData.status,
      estimated_delivery_date: orderData.estimated_delivery_date,
      customer_email: (orderData.customer as any)?.email || "",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-green-600 mx-auto mb-4" />
          <p className="mt-4 text-gray-600">Loading your order details...</p>
        </div>
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-yellow-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Processing Your Order
          </h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <p className="text-sm text-gray-500">
            If you don't receive a confirmation email within 5 minutes, please
            contact support at{" "}
            <a
              href="mailto:support@cethos.com"
              className="text-blue-600 hover:underline"
            >
              support@cethos.com
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-lg mx-auto">
        {/* Success Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Green Header */}
          <div className="bg-green-500 px-6 py-8 text-center">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold text-white">
              Payment Successful!
            </h1>
            <p className="text-green-100 mt-1">Thank you for your order</p>
          </div>

          {/* Order Details */}
          <div className="px-6 py-6">
            {order && (
              <>
                {/* Order Number */}
                <div className="text-center mb-6 pb-6 border-b border-gray-100">
                  <p className="text-sm text-gray-500 mb-1">Order Number</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {order.order_number}
                  </p>
                </div>

                {/* Order Info Grid */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <p className="text-sm text-gray-500">Amount Paid</p>
                    <p className="font-semibold text-gray-900">
                      ${order.total_amount.toFixed(2)} CAD
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Status</p>
                    <p className="font-semibold text-green-600 capitalize">
                      {order.status}
                    </p>
                  </div>
                  {order.estimated_delivery_date && (
                    <div className="col-span-2">
                      <p className="text-sm text-gray-500">
                        Estimated Delivery
                      </p>
                      <p className="font-semibold text-gray-900">
                        {new Date(
                          order.estimated_delivery_date,
                        ).toLocaleDateString("en-US", {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  )}
                </div>

                {/* Confirmation Email Notice */}
                <div className="bg-blue-50 rounded-lg p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <Mail className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-gray-900">
                        Confirmation Email Sent
                      </p>
                      <p className="text-sm text-gray-600">
                        We've sent a receipt to {order.customer_email}
                      </p>
                    </div>
                  </div>
                </div>

                {/* What's Next */}
                <div className="mb-6">
                  <h3 className="font-semibold text-gray-900 mb-3">
                    What happens next?
                  </h3>
                  <ol className="space-y-2 text-sm text-gray-600">
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xs font-medium shrink-0">
                        1
                      </span>
                      <span>
                        Our translators will begin working on your documents
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 bg-gray-100 text-gray-600 rounded-full flex items-center justify-center text-xs font-medium shrink-0">
                        2
                      </span>
                      <span>
                        You'll receive an email when your translation is ready
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 bg-gray-100 text-gray-600 rounded-full flex items-center justify-center text-xs font-medium shrink-0">
                        3
                      </span>
                      <span>
                        Download from your dashboard or receive by mail
                      </span>
                    </li>
                  </ol>
                </div>
              </>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <Link
                to="/"
                className="w-full py-3 px-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium text-center"
              >
                Return to Home
              </Link>
            </div>
          </div>
        </div>

        {/* Support Footer */}
        <div className="text-center mt-6">
          <p className="text-sm text-gray-500">
            Questions? Contact us at{" "}
            <a
              href="mailto:support@cethos.com"
              className="text-blue-600 hover:underline"
            >
              support@cethos.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
