import React, { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

interface AdminSettingsLayoutProps {
  title: string;
  description?: string;
  breadcrumbs?: { label: string; href?: string }[];
  children: ReactNode;
  actions?: ReactNode;
  loading?: boolean;
  error?: string | null;
}

export default function AdminSettingsLayout({
  title,
  description,
  breadcrumbs,
  children,
  actions,
  loading,
  error,
}: AdminSettingsLayoutProps) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          {/* Breadcrumbs */}
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav className="flex items-center text-sm text-gray-500 mb-2">
              {breadcrumbs.map((crumb, index) => (
                <React.Fragment key={index}>
                  {crumb.href ? (
                    <button
                      onClick={() => navigate(crumb.href!)}
                      className="hover:text-gray-700 font-medium"
                    >
                      {crumb.label}
                    </button>
                  ) : (
                    <span className="text-gray-900 font-medium">
                      {crumb.label}
                    </span>
                  )}
                  {index < breadcrumbs.length - 1 && (
                    <span className="mx-2">/</span>
                  )}
                </React.Fragment>
              ))}
            </nav>
          )}

          {/* Title and Actions */}
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
              {description && (
                <p className="text-sm text-gray-600 mt-1">{description}</p>
              )}
            </div>
            {actions && <div className="ml-4 flex gap-3">{actions}</div>}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
