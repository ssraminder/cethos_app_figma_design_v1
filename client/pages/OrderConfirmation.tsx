import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { CheckCircle2, Mail, Loader2, AlertCircle } from "lucide-react";
import {
  trackQuoteSubmission,
  trackGoogleAdsConversion,
  getReferralSource,
} from "@/lib/tracking";
import { useTrackingSettings } from "@/hooks/useTrackingSettings";

// ── OrderConfirmation ──────────────────────────────────────────────────────
// Landing page for customers redirected here by Stripe Payment Links.
//
// Stripe Payment Links (created by the `create-payment-link` edge function)
// don't have a `session_id` we can pass back to OrderSuccess, so we key by
// `quote_id` from the URL params instead. We look up the order that was
// created for this quote when the stripe-webhook fired.
//
// Race: the webhook can lag the redirect by a few seconds. We retry once.
// ──────────────────────────────────────────────────────────────────────────

interface OrderDetails {
  id: string;
  order_number: string;
  total_amount: number;
  status: string;
  estimated_delivery_date: string | null;
  customer_email: string;
}

export default function OrderConfirmation() {
  const { quoteId } = useParams<{ quoteId: string }>();

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const conversionTracked = useRef(false);
  const { settings: trackingSettings } = useTrackingSettings();

  useEffect(() => {
    if (!quoteId) {
      setLoading(false);
      setError("Invalid confirmation link");
      return;
    }
    fetchOrderByQuote(quoteId);
  }, [quoteId]);

  const fetchOrderByQuote = async (qid: string) => {
    try {
      const found = await findOrderForQuote(qid);
      if (found) {
        applyOrder(found);
        return;
      }

      // Race: webhook may not have created the order yet.
      // Wait 2s and retry once before failing.
      await new Promise((r) => setTimeout(r, 2000));
      const retry = await findOrderForQuote(qid);
      if (retry) {
        applyOrder(retry);
        return;
      }

      throw new Error(
        "Your payment is being processed. Please check your email for confirmation.",
      );
    } catch (err: any) {
      console.error("OrderConfirmation lookup failed:", err);
      setError(err.message || "Could not find your order");
    } finally {
      setLoading(false);
    }
  };

  const findOrderForQuote = async (
    qid: string,
  ): Promise<OrderDetails | null> => {
    const { data, error: qErr } = await supabase
      .from("orders")
      .select(
        `id, order_number, total_amount, status, estimated_delivery_date,
         customer:customers(email)`,
      )
      .eq("quote_id", qid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (qErr) throw qErr;
    if (!data) return null;

    return {
      id: data.id,
      order_number: data.order_number,
      total_amount: Number(data.total_amount),
      status: data.status,
      estimated_delivery_date: data.estimated_delivery_date,
      customer_email: (data.customer as any)?.email || "",
    };
  };

  const applyOrder = (o: OrderDetails) => {
    setOrder(o);

    // Fire conversion events once
    if (!conversionTracked.current) {
      conversionTracked.current = true;
      const referral = getReferralSource();
      trackQuoteSubmission({
        quoteId: o.id,
        serviceType: "payment_completed",
        totalAmount: o.total_amount,
        sourceUrl: referral?.sourceUrl || "",
        sourceLocation: referral?.sourceLocation || "",
      });

      if (
        trackingSettings.google_ads_conversion_id &&
        trackingSettings.google_ads_purchase_label
      ) {
        trackGoogleAdsConversion({
          sendTo: `${trackingSettings.google_ads_conversion_id}/${trackingSettings.google_ads_purchase_label}`,
          value: o.total_amount,
          currency: "CAD",
          transactionId: o.order_number,
        });
      }
    }
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-green-500 px-6 py-8 text-center">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold text-white">
              Payment Successful!
            </h1>
            <p className="text-green-100 mt-1">Thank you for your order</p>
          </div>

          <div className="px-6 py-6">
            {order && (
              <>
                <div className="text-center mb-6 pb-6 border-b border-gray-100">
                  <p className="text-sm text-gray-500 mb-1">Order Number</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {order.order_number}
                  </p>
                </div>

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

            <div className="flex flex-col gap-3">
              <Link
                to="/quote"
                className="w-full py-3 px-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium text-center"
              >
                Return to Quote Form
              </Link>
            </div>
          </div>
        </div>

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
