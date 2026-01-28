import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { MessageSquare, X } from "lucide-react";

// Notification sound - using a free online notification sound
const NOTIFICATION_SOUND_URL =
  "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3";

interface Notification {
  id: string;
  customerName: string;
  message: string;
  timestamp: Date;
}

export default function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
  const showBrowserNotification = (customerName: string, message: string) => {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(`New message from ${customerName}`, {
        body: message.substring(0, 100) + (message.length > 100 ? "..." : ""),
        icon: "/favicon.ico",
        tag: "cethos-message",
      });
    }
  };

  // Request notification permission on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Subscribe to ALL customer messages
  useEffect(() => {
    console.log("🔔 Setting up global notification listener");

    const channel = supabase
      .channel("admin-notifications")
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

          // Play sound
          playSound();

          // Show browser notification
          showBrowserNotification(customerName, payload.new.message_text);

          // Add to in-app notifications
          const newNotification: Notification = {
            id: payload.new.id,
            customerName,
            message: payload.new.message_text,
            timestamp: new Date(),
          };

          setNotifications((prev) => [newNotification, ...prev].slice(0, 5));

          // Auto-dismiss after 10 seconds
          setTimeout(() => {
            setNotifications((prev) =>
              prev.filter((n) => n.id !== newNotification.id),
            );
          }, 10000);
        },
      )
      .subscribe((status) => {
        console.log("🔔 Global notification subscription status:", status);
      });

    return () => {
      console.log("🔕 Unsubscribing from global notifications");
      supabase.removeChannel(channel);
    };
  }, []);

  // Dismiss notification
  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <>
      {children}

      {/* Toast Notifications */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className="bg-white border border-gray-200 rounded-xl shadow-lg p-4 w-80 animate-slide-in"
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {notification.customerName}
                </p>
                <p className="text-sm text-gray-600 truncate">
                  {notification.message}
                </p>
              </div>
              <button
                onClick={() => dismissNotification(notification.id)}
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
