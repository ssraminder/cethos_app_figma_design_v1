import { format } from 'date-fns';
import { Link } from 'react-router-dom';

interface Message {
  id: string;
  sender_type: string;
  message_type?: string;
  metadata?: {
    quote_number?: string;
    quote_id?: string;
    order_number?: string;
    order_id?: string;
    amount?: number;
    status?: string;
  };
  created_at: string;
}

interface SystemMessageCardProps {
  message: Message;
}

export default function SystemMessageCard({ message }: SystemMessageCardProps) {
  const { message_type, metadata } = message;

  const cardConfig: Record<string, { icon: string; title: string; bgColor: string; borderColor: string }> = {
    quote_created: {
      icon: '📋',
      title: 'Quote Created',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200'
    },
    quote_ready: {
      icon: '✅',
      title: 'Quote Ready',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200'
    },
    payment_received: {
      icon: '💳',
      title: 'Payment Received',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200'
    },
    order_status: {
      icon: '📦',
      title: 'Order Update',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200'
    },
    delivery_complete: {
      icon: '🎉',
      title: 'Delivered!',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200'
    }
  };

  const config = cardConfig[message_type || ''] || {
    icon: 'ℹ️',
    title: 'Update',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200'
  };

  return (
    <div className="flex justify-center my-4">
      <div className={`max-w-sm w-full ${config.bgColor} ${config.borderColor} border rounded-xl p-4`}>
        <div className="flex items-start gap-3">
          <span className="text-2xl">{config.icon}</span>
          <div className="flex-1">
            <h4 className="font-medium text-gray-900">{config.title}</h4>

            {metadata?.quote_number && (
              <p className="text-sm text-gray-600">
                Quote #{metadata.quote_number}
              </p>
            )}

            {metadata?.order_number && (
              <p className="text-sm text-gray-600">
                Order #{metadata.order_number}
              </p>
            )}

            {metadata?.amount && (
              <p className="text-sm font-medium text-gray-900 mt-1">
                ${metadata.amount.toFixed(2)} CAD
              </p>
            )}

            {metadata?.status && (
              <p className="text-sm text-gray-600 mt-1">
                Status: {metadata.status}
              </p>
            )}

            {/* Link to quote/order */}
            {metadata?.quote_number && metadata?.quote_id && (
              <Link
                to={`/dashboard/quotes/${metadata.quote_id}`}
                className="text-sm text-teal-600 hover:text-teal-700 mt-2 inline-flex items-center gap-1"
              >
                View Quote →
              </Link>
            )}

            {metadata?.order_number && metadata?.order_id && (
              <Link
                to={`/dashboard/orders/${metadata.order_id}`}
                className="text-sm text-teal-600 hover:text-teal-700 mt-2 inline-flex items-center gap-1"
              >
                View Order →
              </Link>
            )}
          </div>
        </div>

        <p className="text-xs text-gray-500 text-center mt-3">
          {format(new Date(message.created_at), 'h:mm a')}
        </p>
      </div>
    </div>
  );
}
