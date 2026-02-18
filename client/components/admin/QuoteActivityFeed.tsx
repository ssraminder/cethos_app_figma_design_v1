import { useEffect, useState } from "react";
import {
  Activity,
  CheckCircle,
  Clock,
  CreditCard,
  FileText,
  Link as LinkIcon,
  MessageSquare,
  Send,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface ActivityEvent {
  id: string;
  type:
    | "quote_created"
    | "quote_link_sent"
    | "message_sent"
    | "manual_payment"
    | "payment_request_sent"
    | "order_created"
    | "quote_expires"
    | "other";
  label: string;
  sublabel?: string;
  timestamp: string;
  isFuture?: boolean;
}

interface QuoteActivityFeedProps {
  quoteId: string;
  quote: {
    id: string;
    quote_number: string;
    created_at: string;
    expires_at: string;
    [key: string]: any;
  };
  supabase: any;
}

export default function QuoteActivityFeed({
  quoteId,
  quote,
  supabase,
}: QuoteActivityFeedProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!quoteId || !quote) return;

    let cancelled = false;

    const fetchActivity = async () => {
      setLoading(true);

      try {
        // Query A: quote-level activity + Query order in parallel
        const [quoteActivityResult, orderResult] = await Promise.all([
          supabase
            .from("staff_activity_log")
            .select(
              "id, action_type, entity_type, entity_id, details, created_at, staff_id"
            )
            .eq("entity_type", "quote")
            .eq("entity_id", quoteId)
            .order("created_at", { ascending: false }),
          supabase
            .from("orders")
            .select("id, order_number, created_at, total_amount")
            .eq("quote_id", quoteId)
            .maybeSingle(),
        ]);

        if (cancelled) return;

        const quoteActivity = quoteActivityResult.data || [];
        const order = orderResult.data;

        // Query B & C: order-level activity + payment requests (if order exists)
        let orderActivity: any[] = [];
        let paymentRequests: any[] = [];

        if (order) {
          const [orderActivityResult, paymentRequestsResult] =
            await Promise.all([
              supabase
                .from("staff_activity_log")
                .select(
                  "id, action_type, entity_type, entity_id, details, created_at, staff_id"
                )
                .eq("entity_type", "order")
                .eq("entity_id", order.id)
                .order("created_at", { ascending: false }),
              supabase
                .from("payment_requests")
                .select(
                  "id, amount, reason, status, email_sent_at, email_sent_to, created_at, stripe_payment_link_url"
                )
                .eq("order_id", order.id)
                .order("created_at", { ascending: false }),
            ]);

          if (cancelled) return;

          orderActivity = orderActivityResult.data || [];
          paymentRequests = paymentRequestsResult.data || [];
        }

        // Derive events from the quote itself
        const derivedEvents: ActivityEvent[] = [
          {
            id: "created",
            type: "quote_created",
            label: "Quote created",
            sublabel: quote.quote_number,
            timestamp: quote.created_at,
          },
        ];

        if (quote.expires_at) {
          const expiresDate = new Date(quote.expires_at);
          const isFuture = expiresDate > new Date();
          derivedEvents.push({
            id: "expires",
            type: "quote_expires",
            label: isFuture ? "Expires" : "Expired",
            sublabel: format(expiresDate, "MMM d, yyyy"),
            timestamp: quote.expires_at,
            isFuture,
          });
        }

        // Order created event
        if (order) {
          derivedEvents.push({
            id: `order-${order.id}`,
            type: "order_created",
            label: "Quote paid — Order created",
            sublabel: order.order_number,
            timestamp: order.created_at,
          });
        }

        // Normalize Query A (quote activity log)
        const normalizedQuoteActivity: ActivityEvent[] = quoteActivity.map(
          (entry: any) => {
            if (entry.action_type === "send_quote_link_email") {
              return {
                id: entry.id,
                type: "quote_link_sent" as const,
                label: "Quote link sent",
                sublabel: entry.details?.customer_email || "",
                timestamp: entry.created_at,
              };
            }
            if (entry.action_type === "send_message") {
              const preview = entry.details?.message_preview || "";
              return {
                id: entry.id,
                type: "message_sent" as const,
                label: "Message sent to customer",
                sublabel: preview
                  ? preview.substring(0, 60) +
                    (preview.length > 60 ? "…" : "")
                  : "",
                timestamp: entry.created_at,
              };
            }
            return {
              id: entry.id,
              type: "other" as const,
              label: entry.action_type.replace(/_/g, " "),
              sublabel: "",
              timestamp: entry.created_at,
            };
          }
        );

        // Normalize Query B (order activity log)
        const normalizedOrderActivity: ActivityEvent[] = orderActivity
          .filter((entry: any) => entry.action_type === "manual_payment")
          .map((entry: any) => ({
            id: entry.id,
            type: "manual_payment" as const,
            label: `Payment received — ${entry.details?.payment_method_code || ""}`,
            sublabel: entry.details?.amount_paid
              ? `$${Number(entry.details.amount_paid).toFixed(2)}`
              : "",
            timestamp: entry.created_at,
          }));

        // Normalize Query C (payment requests)
        const normalizedPaymentRequests: ActivityEvent[] = paymentRequests
          .filter((pr: any) => pr.email_sent_at)
          .map((pr: any) => ({
            id: `pr-${pr.id}`,
            type: "payment_request_sent" as const,
            label: "Payment link sent",
            sublabel: pr.email_sent_to
              ? `${pr.email_sent_to} — $${Number(pr.amount).toFixed(2)}`
              : `$${Number(pr.amount).toFixed(2)}`,
            timestamp: pr.email_sent_at,
          }));

        // Merge and sort descending
        const allEvents = [
          ...derivedEvents,
          ...normalizedQuoteActivity,
          ...normalizedOrderActivity,
          ...normalizedPaymentRequests,
        ];
        allEvents.sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        if (!cancelled) {
          setEvents(allEvents);
        }
      } catch (err) {
        console.error("Failed to fetch activity feed:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchActivity();

    return () => {
      cancelled = true;
    };
  }, [quoteId, quote?.created_at, quote?.expires_at]);

  const formatTimestamp = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    if (Math.abs(diffMs) < sevenDays) {
      return formatDistanceToNow(date, { addSuffix: true });
    }
    return format(date, "MMM d");
  };

  const formatFullTimestamp = (dateString: string): string => {
    return format(new Date(dateString), "MMM d, yyyy h:mm a");
  };

  const getEventIcon = (event: ActivityEvent) => {
    switch (event.type) {
      case "quote_created":
        return <FileText className="w-4 h-4" />;
      case "quote_link_sent":
        return <Send className="w-4 h-4" />;
      case "message_sent":
        return <MessageSquare className="w-4 h-4" />;
      case "manual_payment":
        return <CreditCard className="w-4 h-4" />;
      case "payment_request_sent":
        return <LinkIcon className="w-4 h-4" />;
      case "order_created":
        return <CheckCircle className="w-4 h-4" />;
      case "quote_expires":
        return <Clock className="w-4 h-4" />;
      case "other":
        return <Activity className="w-4 h-4" />;
    }
  };

  const getIconStyle = (event: ActivityEvent): string => {
    switch (event.type) {
      case "quote_created":
        return "bg-gray-100 text-gray-500";
      case "quote_link_sent":
        return "bg-blue-100 text-blue-600";
      case "message_sent":
        return "bg-purple-100 text-purple-600";
      case "manual_payment":
        return "bg-green-100 text-green-600";
      case "payment_request_sent":
        return "bg-cyan-100 text-cyan-600";
      case "order_created":
        return "bg-green-100 text-green-700";
      case "quote_expires":
        return event.isFuture
          ? "bg-amber-100 text-amber-500"
          : "bg-red-100 text-red-500";
      case "other":
        return "bg-gray-100 text-gray-400";
    }
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Activity</h2>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-gray-200 animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-gray-200 animate-pulse rounded w-3/4" />
                <div className="h-3 bg-gray-100 animate-pulse rounded w-1/2" />
              </div>
              <div className="h-3 bg-gray-100 animate-pulse rounded w-12" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Activity</h2>
        <p className="text-sm text-gray-400">No activity recorded yet</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Activity</h2>

      <div className="relative">
        {/* Connector line */}
        {events.length > 1 && (
          <div
            className="absolute left-[13px] top-[14px] bottom-[14px] w-px bg-gray-200"
            aria-hidden="true"
          />
        )}

        <div className="space-y-3">
          {events.map((event) => (
            <div
              key={event.id}
              className={`relative flex items-start gap-3 ${event.isFuture ? "opacity-50" : ""}`}
            >
              {/* Icon circle */}
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 relative z-10 ${getIconStyle(event)}`}
              >
                {getEventIcon(event)}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pt-0.5">
                <p
                  className={`text-[13px] font-semibold text-gray-900 leading-tight ${event.isFuture ? "italic" : ""}`}
                >
                  {event.label}
                </p>
                {event.sublabel && (
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {event.sublabel}
                  </p>
                )}
              </div>

              {/* Timestamp */}
              <span
                className="text-xs text-gray-400 whitespace-nowrap pt-0.5 flex-shrink-0"
                title={formatFullTimestamp(event.timestamp)}
              >
                {formatTimestamp(event.timestamp)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
