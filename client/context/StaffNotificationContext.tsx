import { createContext, useContext, useState, useCallback } from "react";

interface StaffNotificationContextValue {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
  incrementUnread: () => void;
  resetUnread: () => void;
}

const StaffNotificationContext = createContext<StaffNotificationContextValue>({
  unreadCount: 0,
  setUnreadCount: () => {},
  incrementUnread: () => {},
  resetUnread: () => {},
});

export function StaffNotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [unreadCount, setUnreadCount] = useState(0);

  const incrementUnread = useCallback(() => {
    setUnreadCount((prev) => prev + 1);
  }, []);

  const resetUnread = useCallback(() => {
    setUnreadCount(0);
  }, []);

  return (
    <StaffNotificationContext.Provider
      value={{ unreadCount, setUnreadCount, incrementUnread, resetUnread }}
    >
      {children}
    </StaffNotificationContext.Provider>
  );
}

export function useStaffNotifications() {
  return useContext(StaffNotificationContext);
}
