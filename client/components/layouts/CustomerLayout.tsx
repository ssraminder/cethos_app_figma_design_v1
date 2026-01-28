import { ReactNode, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { MessageSquare, FileText, Package, User, LogOut, Menu, X } from "lucide-react";
import { useAuth } from "../../context/CustomerAuthContext";
import { useBranding } from "../../context/BrandingContext";

interface CustomerLayoutProps {
  children: ReactNode;
}

export default function CustomerLayout({ children }: CustomerLayoutProps) {
  const { customer, signOut } = useAuth();
  const { companyName, logoUrl, loading } = useBranding();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/");
    } catch (error) {
      console.error("Failed to sign out:", error);
    }
  };

  const navItems = [
    { path: "/dashboard", label: "Dashboard", icon: FileText },
    { path: "/dashboard/quotes", label: "Quotes", icon: FileText },
    { path: "/dashboard/orders", label: "Orders", icon: Package },
    { path: "/dashboard/messages", label: "Messages", icon: MessageSquare },
    { path: "/dashboard/profile", label: "Profile", icon: User },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Hamburger Menu Button - Mobile Only */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>

            {/* Logo */}
            <Link to="/dashboard" className="flex items-center gap-2">
              {logoUrl ? (
                <img src={logoUrl} alt={companyName} className="h-8 w-auto" />
              ) : (
                <>
                  <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg flex items-center justify-center">
                    <span className="text-white font-bold text-lg">C</span>
                  </div>
                  <span className="text-xl sm:text-2xl font-bold text-teal-600">
                    {companyName || "CETHOS"}
                  </span>
                </>
              )}
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-8">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-teal-50 text-teal-700"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* User menu */}
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-700 hidden sm:block">
                {customer?.full_name}
              </span>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer */}
          <div className="fixed top-0 left-0 h-full w-64 bg-white shadow-xl z-50 md:hidden">
            <div className="p-4">
              {/* Close Button */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  {logoUrl ? (
                    <img src={logoUrl} alt={companyName} className="h-8 w-auto" />
                  ) : (
                    <>
                      <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg flex items-center justify-center">
                        <span className="text-white font-bold text-lg">C</span>
                      </div>
                      <span className="text-xl font-bold text-teal-600">
                        {companyName || "CETHOS"}
                      </span>
                    </>
                  )}
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* User Info */}
              <div className="pb-4 mb-4 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-teal-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {customer?.full_name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {customer?.email}
                    </p>
                  </div>
                </div>
              </div>

              {/* Navigation Items */}
              <nav className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-teal-50 text-teal-700"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              {/* Logout Button */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-3 px-4 py-3 w-full text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center text-sm text-gray-500">
            <p>
              &copy; {new Date().getFullYear()} CETHOS Translation Services. All
              rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
