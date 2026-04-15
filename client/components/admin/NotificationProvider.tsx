import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { MessageSquare, ShoppingCart, FileText, X } from "lucide-react";
import { useStaffNotifications } from "@/context/StaffNotificationContext";

// Notification sound - using a free online notification sound
const NOTIFICATION_SOUND_URL =
  "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3";

type NotificationType = "message" | "order" | "quote";

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: Date;
  conversationId?: string;
  orderId: string | null;
  quoteId: string | null;
}

export default function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const navigate = useNavigate();
  const { incrementUnread, incrementNewOrders, incrementNewQuotes } = useStaffNotifications();

  // Initialize audio
  useEffect(() => {
    audioRef.current = new Audio(NOTIFICATION_SOUND_URL);
    audioRef.current.volume = 0.5;
  }, []);

  // Play notification sound
  const playSound = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch((err) => {
        console.log("Audio play failed (user interaction required):", err);
      });
    }
  };

  // Show browser notification
  const showBrowserNotification = (title: string, body: string, tag: string = "cethos-notification") => {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, {
        body: body.substring(0, 100) + (body.length > 100 ? "..." : ""),
        icon: "/favicon.ico",
        tag,
      });
    }
  };

  // Request notification permission on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Helper to add a toast notification with auto-dismiss
  const addToast = (notification: Notification) => {
    setNotifications((prev) => [notification, ...prev].slice(0, 5));
    setTimeout(() => {
      setNotifications((prev) =>
        prev.filter((n) => n.id !== notification.id),
      );
    }, 10000);
  };

  // Subscribe to ALL customer messages
  useEffect(() => {
    console.log("🔔 Setting up global notification listeners");

    const channel = supabase
      .channel("admin-notifications")
      // ── New customer messages ──
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_messages",
          filter: "sender_type=eq.customer",
        },
        async (payload) => {
          console.log("🔔 New customer message received:", payload.new);

          // Fetch customer name
          const { data: conversation, error: convError } = await supabase
            .from("customer_conversations")
            .select(`customers(full_name, email)`)
            .eq("id", payload.new.conversation_id)
            .single();

          if (convError) {
            console.error("Error fetching conversation:", convError);
            return;
          }

          const customerName =
            conversation?.customers?.full_name ||
            conversation?.customers?.email ||
            "Customer";

          playSound();
          showBrowserNotification(
            `New message from ${customerName}`,
            payload.new.message_text,
            "cethos-message",
          );
          incrementUnread();

          addToast({
            id: payload.new.id,
            type: "message",
            title: customerName,
            message: payload.new.message_text,
            timestamp: new Date(),
            conversationId: payload.new.conversation_id,
            orderId: payload.new.order_id || null,
            quoteId: payload.new.quote_id || null,
          });
        },
      )
      // ── New orders ──
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
        },
        async (payload) => {
          console.log("🔔 New order received:", payload.new);

          const { data: customer } = await supabase
            .from("customers")
            .select("full_name, email")
            .eq("id", payload.new.customer_id)
            .single();

          const customerName = customer?.full_name || customer?.email || "Customer";
          const orderNum = payload.new.order_number || "New";

          playSound();
          showBrowserNotification(
            `New Order #${orderNum}`,
            `${customerName} placed a new order`,
            "cethos-order",
          );
          incrementNewOrders();

          addToast({
            id: payload.new.id,
            type: "order",
            title: `Order #${orderNum}`,
            message: `New order from ${customerName}`,
            timestamp: new Date(),
            orderId: payload.new.id,
            quoteId: null,
          });
        },
      )
      // ── New quotes ──
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "quotes",
        },
        async (payload) => {
          console.log("🔔 New quote received:", payload.new);

          const { data: customer } = await supabase
            .from("customers")
            .select("full_name, email")
            .eq("id", payload.new.customer_id)
            .single();

          const customerName = customer?.full_name || customer?.email || "Customer";
          const quoteNum = payload.new.quote_number || "New";

          playSound();
          showBrowserNotification(
            `New Quote #${quoteNum}`,
            `${customerName} requested a quote`,
            "cethos-quote",
          );
          incrementNewQuotes();

          addToast({
            id: payload.new.id,
            type: "quote",
            title: `Quote #${quoteNum}`,
            message: `New quote from ${customerName}`,
            timestamp: new Date(),
            quoteId: payload.new.id,
            orderId: null,
          });
        },
      )
      .subscribe((status) => {
        console.log("🔔 Global notification subscription status:", status);
      });

    return () => {
      console.log("🔕 Unsubscribing from global notifications");
      supabase.removeChannel(channel);
    };
  }, [incrementUnread, incrementNewOrders, incrementNewQuotes]);

  // Dismiss notification
  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  // Click on notification to navigate
  const handleNotificationClick = (notification: Notification) => {
    dismissNotification(notification.id);
    if (notification.type === "order" && notification.orderId) {
      navigate(`/admin/orders/${notification.orderId}`);
    } else if (notification.type === "quote" && notification.quoteId) {
      navigate(`/admin/quotes/${notification.quoteId}`);
    } else if (notification.orderId) {
      navigate(`/admin/orders/${notification.orderId}`);
    } else if (notification.quoteId) {
      navigate(`/admin/quotes/${notification.quoteId}`);
    } else {
      navigate("/admin/messages");
    }
  };

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case "order":
        return <ShoppingCart className="w-5 h-5 text-green-600" />;
      case "quote":
        return <FileText className="w-5 h-5 text-blue-600" />;
      default:
        return <MessageSquare className="w-5 h-5 text-blue-600" />;
    }
  };

  const getNotificationBg = (type: NotificationType) => {
    switch (type) {
      case "order":
        return "bg-green-100";
      case "quote":
        return "bg-blue-100";
      default:
        return "bg-blue-100";
    }
  };

  return (
    <>
      {children}

      {/* Toast Notifications */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className="bg-white border border-gray-200 rounded-xl shadow-lg p-4 w-80 animate-slide-in cursor-pointer hover:shadow-xl transition-shadow"
            onClick={() => handleNotificationClick(notification)}
          >
            <div className="flex items-start gap-3">
              <div className={`flex-shrink-0 w-10 h-10 ${getNotificationBg(notification.type)} rounded-full flex items-center justify-center`}>
                {getNotificationIcon(notification.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {notification.title}
                </p>
                <p className="text-sm text-gray-600 truncate">
                  {notification.message}
                </p>
                <p className="text-xs text-teal-600 mt-1">
                  Click to view
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  dismissNotification(notification.id);
                }}
                className="flex-shrink-0 p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add CSS animation */}
      <style>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </>
  );
}
