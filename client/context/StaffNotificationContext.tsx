import { createContext, useContext, useState, useCallback } from "react";

interface StaffNotificationContextValue {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
  incrementUnread: () => void;
  resetUnread: () => void;
  newOrderCount: number;
  incrementNewOrders: () => void;
  resetNewOrders: () => void;
  newQuoteCount: number;
  incrementNewQuotes: () => void;
  resetNewQuotes: () => void;
}

const StaffNotificationContext = createContext<StaffNotificationContextValue>({
  unreadCount: 0,
  setUnreadCount: () => {},
  incrementUnread: () => {},
  resetUnread: () => {},
  newOrderCount: 0,
  incrementNewOrders: () => {},
  resetNewOrders: () => {},
  newQuoteCount: 0,
  incrementNewQuotes: () => {},
  resetNewQuotes: () => {},
});

export function StaffNotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [newOrderCount, setNewOrderCount] = useState(0);
  const [newQuoteCount, setNewQuoteCount] = useState(0);

  const incrementUnread = useCallback(() => {
    setUnreadCount((prev) => prev + 1);
  }, []);

  const resetUnread = useCallback(() => {
    setUnreadCount(0);
  }, []);

  const incrementNewOrders = useCallback(() => {
    setNewOrderCount((prev) => prev + 1);
  }, []);

  const resetNewOrders = useCallback(() => {
    setNewOrderCount(0);
  }, []);

  const incrementNewQuotes = useCallback(() => {
    setNewQuoteCount((prev) => prev + 1);
  }, []);

  const resetNewQuotes = useCallback(() => {
    setNewQuoteCount(0);
  }, []);

  return (
    <StaffNotificationContext.Provider
      value={{
        unreadCount, setUnreadCount, incrementUnread, resetUnread,
        newOrderCount, incrementNewOrders, resetNewOrders,
        newQuoteCount, incrementNewQuotes, resetNewQuotes,
      }}
    >
      {children}
    </StaffNotificationContext.Provider>
  );
}

export function useStaffNotifications() {
  return useContext(StaffNotificationContext);
}
