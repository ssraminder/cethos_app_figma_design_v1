import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function OrderSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    if (sessionId) {
      fetchOrder();
    } else {
      setLoading(false);
    }
  }, [sessionId]);

  const fetchOrder = async () => {
    try {
      // Find order by Stripe session (via quote)
      const { data: quote } = await supabase
        .from('quotes')
        .select('converted_to_order_id')
        .eq('stripe_checkout_session_id', sessionId)
        .single();

      if (quote?.converted_to_order_id) {
        const { data: orderData } = await supabase
          .from('orders')
          .select('*, customer:customers(*)')
          .eq('id', quote.converted_to_order_id)
          .single();

        setOrder(orderData);
      }
    } catch (err) {
      console.error('Error fetching order:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Processing your order...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-lg mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          {/* Success Icon */}
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Successful!</h1>
          <p className="text-gray-600 mb-6">Thank you for your order.</p>

          {order ? (
            <>
              {/* Order Details */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
                <div className="flex justify-between mb-2">
                  <span className="text-gray-600">Order Number</span>
                  <span className="font-semibold">{order.order_number}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-600">Amount Paid</span>
                  <span className="font-semibold">${order.amount_paid?.toFixed(2)} CAD</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Status</span>
                  <span className="px-2 py-1 bg-green-100 text-green-800 text-sm rounded-full">
                    Paid
                  </span>
                </div>
              </div>

              {/* What's Next */}
              <div className="text-left mb-6">
                <h2 className="font-semibold text-gray-800 mb-2">What happens next?</h2>
                <ol className="text-sm text-gray-600 space-y-2">
                  <li className="flex gap-2">
                    <span className="font-medium">1.</span>
                    Our translators will begin working on your documents
                  </li>
                  <li className="flex gap-2">
                    <span className="font-medium">2.</span>
                    You'll receive an email when your translation is ready
                  </li>
                  <li className="flex gap-2">
                    <span className="font-medium">3.</span>
                    Download your certified translation from your dashboard
                  </li>
                </ol>
              </div>

              {/* Confirmation Email */}
              <p className="text-sm text-gray-500 mb-6">
                A confirmation email has been sent to<br />
                <span className="font-medium">{order.customer?.email}</span>
              </p>
            </>
          ) : (
            <p className="text-gray-600 mb-6">
              Your order is being processed. You'll receive a confirmation email shortly.
            </p>
          )}

          {/* Actions */}
          <div className="space-y-3">
            {order && (
              <button
                onClick={() => navigate(`/order/${order.id}`)}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700"
              >
                View Order Details
              </button>
            )}
            <button
              onClick={() => navigate('/')}
              className="w-full border border-gray-300 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-50"
            >
              Return to Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
