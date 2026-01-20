// app/admin/layout.tsx
// Layout wrapper for all admin pages - provides staff auth context

import { StaffAuthProvider } from '@/contexts/StaffAuthContext';

export const metadata = {
  title: 'Cethos Staff Portal',
  description: 'Staff administration portal for Cethos Translation Services',
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <StaffAuthProvider>
      <div className="min-h-screen bg-gray-50">
        {children}
      </div>
    </StaffAuthProvider>
  );
}
