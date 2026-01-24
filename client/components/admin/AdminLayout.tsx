import { ElementType, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  ShoppingCart,
  ClipboardCheck,
  Brain,
  Users,
  BarChart3,
  Settings,
  Menu,
  X,
  ChevronLeft,
  LogOut,
} from "lucide-react";
import { useBranding } from "../../context/BrandingContext";
import { useAdminAuthContext } from "../../context/AdminAuthContext";

interface NavItem {
  label: string;
  path: string;
  icon: ElementType;
  section?: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    path: "/admin/dashboard",
    icon: LayoutDashboard,
    section: "Main",
  },
  { label: "Quotes", path: "/admin/quotes", icon: FileText, section: "Main" },
  { label: "Orders", path: "/admin/orders", icon: ShoppingCart, section: "Main" },
  {
    label: "HITL Queue",
    path: "/admin/hitl",
    icon: ClipboardCheck,
    section: "Main",
  },
  { label: "AI Analytics", path: "/admin/analytics", icon: Brain, section: "AI" },
  { label: "Staff", path: "/admin/staff", icon: Users, section: "Management" },
  {
    label: "Reports",
    path: "/admin/reports",
    icon: BarChart3,
    section: "Management",
  },
  { label: "Settings", path: "/admin/settings", icon: Settings, section: "Config" },
];

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const branding = useBranding();
  const { session, signOut } = useAdminAuthContext();

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const saved = localStorage.getItem("admin_sidebar_open");
    if (saved !== null) {
      setSidebarOpen(JSON.parse(saved));
    }
  }, []);

  const toggleSidebar = () => {
    const nextState = !sidebarOpen;
    setSidebarOpen(nextState);
    localStorage.setItem("admin_sidebar_open", JSON.stringify(nextState));
  };

  const isActivePath = (path: string) => {
    if (path === "/admin/dashboard") {
      return (
        location.pathname === "/admin" || location.pathname === "/admin/dashboard"
      );
    }

    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  const renderNavItems = (isMobile = false) => {
    let currentSection = "";

    return NAV_ITEMS.map((item) => {
      const Icon = item.icon;
      const active = isActivePath(item.path);

      const sectionHeader =
        item.section && item.section !== currentSection && (sidebarOpen || isMobile)
          ? (() => {
              currentSection = item.section || "";
              return (
                <div
                  key={`section-${item.section}`}
                  className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider mt-4 first:mt-0"
                >
                  {item.section}
                </div>
              );
            })()
          : null;

      return (
        <div key={item.path}>
          {sectionHeader}
          <NavLink
            to={item.path}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mx-2 transition-colors ${
              active
                ? "bg-teal-50 text-teal-700 font-medium"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            } ${!sidebarOpen && !isMobile ? "justify-center" : ""}`}
            title={!sidebarOpen && !isMobile ? item.label : undefined}
          >
            <Icon className={`w-5 h-5 flex-shrink-0 ${active ? "text-teal-600" : ""}`} />
            {(sidebarOpen || isMobile) && <span>{item.label}</span>}
          </NavLink>
        </div>
      );
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside
        className={`hidden lg:flex flex-col bg-white border-r border-gray-200 transition-all duration-300 ${
          sidebarOpen ? "w-64" : "w-20"
        }`}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200">
          {sidebarOpen ? (
            <div className="flex items-center gap-2 min-w-0">
              {branding.logoUrl ? (
                <img
                  src={branding.logoUrl}
                  alt={branding.companyName}
                  className="h-8"
                />
              ) : (
                <span className="font-bold text-lg text-gray-900 truncate">
                  {branding.companyName || "CETHOS"}
                </span>
              )}
              <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded font-medium">
                Admin
              </span>
            </div>
          ) : (
            <div className="w-full flex justify-center">
              <span className="font-bold text-xl text-teal-600">C</span>
            </div>
          )}
          <button
            onClick={toggleSidebar}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <ChevronLeft
              className={`w-5 h-5 transition-transform ${
                !sidebarOpen ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">{renderNavItems()}</nav>

        <div className="border-t border-gray-200 p-4">
          {sidebarOpen ? (
            <div className="flex items-center justify-between gap-3">
              <div className="truncate">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {session?.staffName || session?.staffEmail || "Staff"}
                </p>
                <p className="text-xs text-gray-500 capitalize">
                  {session?.staffRole?.replace("_", " ") || ""}
                </p>
              </div>
              <button
                onClick={signOut}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <button
              onClick={signOut}
              className="w-full flex justify-center p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          )}
        </div>
      </aside>

      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-200 z-40 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          {branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={branding.companyName}
              className="h-8"
            />
          ) : (
            <span className="font-bold text-lg text-gray-900">
              {branding.companyName || "CETHOS"}
            </span>
          )}
          <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded font-medium">
            Admin
          </span>
        </div>
        <button
          onClick={() => setMobileMenuOpen((open) => !open)}
          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/50"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        className={`lg:hidden fixed top-16 left-0 bottom-0 w-72 bg-white border-r border-gray-200 z-30 transform transition-transform duration-300 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <nav className="py-4 overflow-y-auto h-full">
          {renderNavItems(true)}

          <div className="border-t border-gray-200 mt-4 pt-4 mx-2">
            <button
              onClick={signOut}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-red-600 hover:bg-red-50 rounded-lg"
            >
              <LogOut className="w-5 h-5" />
              <span>Logout</span>
            </button>
          </div>
        </nav>
      </aside>

      <main className="flex-1 lg:pt-0 pt-16 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
