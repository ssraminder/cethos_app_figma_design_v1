import { ElementType, useEffect, useState, useRef } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  ShoppingCart,
  Brain,
  BookOpen,
  Users,
  BarChart3,
  Settings,
  Menu,
  X,
  ChevronLeft,
  LogOut,
  DollarSign,
  UserCircle,
  FileSearch,
  Scissors,
  Handshake,
  UserPlus,
  Zap,
  Receipt,
  FileSpreadsheet,
  HelpCircle,
  Bell,
  ChevronRight,
  CalendarDays,
  Image,
  Globe,
  Tag,
  PenTool,
  FolderOpen,
  Link2,
  MonitorPlay,
} from "lucide-react";
import { useBranding } from "../../context/BrandingContext";
import { useAdminAuthContext } from "../../context/AdminAuthContext";
import NotificationProvider from "./NotificationProvider";

interface NavItem {
  label: string;
  path: string;
  icon: ElementType;
  section?: string;
  isChild?: boolean;
  children?: NavItem[];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    path: "/admin/dashboard",
    icon: LayoutDashboard,
    section: "Main",
  },
  {
    label: "Blog",
    path: "/admin/blog",
    icon: PenTool,
    section: "Content",
    children: [
      { label: "Posts", path: "/admin/blog", icon: FileText },
      { label: "Categories", path: "/admin/blog/categories", icon: FolderOpen },
      { label: "Authors", path: "/admin/blog/authors", icon: Users },
    ],
  },
  {
    label: "Calendar",
    path: "/admin/calendar",
    icon: CalendarDays,
    section: "Content",
  },
  {
    label: "Media Library",
    path: "/admin/media",
    icon: Image,
    section: "Content",
  },
  {
    label: "Tracking Pixels",
    path: "/admin/settings/tracking",
    icon: MonitorPlay,
    section: "Marketing",
  },
  {
    label: "SEO Settings",
    path: "/admin/seo",
    icon: Globe,
    section: "Marketing",
  },
  {
    label: "Redirects",
    path: "/admin/redirects",
    icon: Link2,
    section: "Marketing",
  },
  { label: "Quotes", path: "/admin/quotes", icon: FileText, section: "Operations" },
  {
    label: "Fast Quote",
    path: "/admin/quotes/fast-create",
    icon: Zap,
    section: "Operations",
    isChild: true,
  },
  {
    label: "Orders",
    path: "/admin/orders",
    icon: ShoppingCart,
    section: "Operations",
  },
  {
    label: "Partners",
    path: "/admin/partners",
    icon: Handshake,
    section: "Operations",
  },
  {
    label: "OCR Word Count",
    path: "/admin/ocr-word-count",
    icon: FileSearch,
    section: "Operations",
  },
  {
    label: "Preprocess & OCR",
    path: "/admin/preprocess-ocr",
    icon: Scissors,
    section: "Operations",
  },
  {
    label: "AI Analytics",
    path: "/admin/analytics",
    icon: Brain,
    section: "AI",
  },
  {
    label: "AI Knowledge Base",
    path: "/admin/ai/knowledge",
    icon: BookOpen,
    section: "AI",
  },
  {
    label: "Vendors",
    path: "/admin/vendors",
    icon: Users,
    section: "Vendors",
  },
  {
    label: "Recruitment",
    path: "/admin/recruitment",
    icon: UserPlus,
    section: "Vendors",
  },
  { label: "Staff", path: "/admin/staff", icon: Users, section: "Management" },
  {
    label: "Customers",
    path: "/admin/customers",
    icon: UserCircle,
    section: "Management",
  },
  {
    label: "Accounts Receivable",
    path: "/admin/ar",
    icon: DollarSign,
    section: "Management",
  },
  {
    label: "Vendor Invoices",
    path: "/admin/invoices/vendor",
    icon: FileSpreadsheet,
    section: "Management",
  },
  {
    label: "Customer Invoices",
    path: "/admin/invoices/customer",
    icon: FileSpreadsheet,
    section: "Management",
    isChild: true,
  },
  {
    label: "Quick Payment",
    path: "/admin/quick-payment",
    icon: Zap,
    section: "Management",
  },
  {
    label: "Payment History",
    path: "/admin/quick-payment/history",
    icon: Receipt,
    section: "Management",
    isChild: true,
  },
  {
    label: "Reports",
    path: "/admin/reports",
    icon: BarChart3,
    section: "Management",
  },
  {
    label: "Settings",
    path: "/admin/settings",
    icon: Settings,
    section: "Config",
  },
];

// Map paths to breadcrumb labels
const BREADCRUMB_MAP: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/dashboard": "Dashboard",
  "/admin/blog": "Blog",
  "/admin/blog/categories": "Categories",
  "/admin/blog/authors": "Authors",
  "/admin/blog/new": "New Post",
  "/admin/calendar": "Calendar",
  "/admin/media": "Media Library",
  "/admin/seo": "SEO Settings",
  "/admin/redirects": "Redirects",
  "/admin/quotes": "Quotes",
  "/admin/quotes/fast-create": "Fast Quote",
  "/admin/orders": "Orders",
  "/admin/partners": "Partners",
  "/admin/ocr-word-count": "OCR Word Count",
  "/admin/preprocess-ocr": "Preprocess & OCR",
  "/admin/analytics": "AI Analytics",
  "/admin/ai/knowledge": "AI Knowledge Base",
  "/admin/vendors": "Vendors",
  "/admin/vendors/new": "New Vendor",
  "/admin/recruitment": "Recruitment",
  "/admin/staff": "Staff",
  "/admin/customers": "Customers",
  "/admin/ar": "Accounts Receivable",
  "/admin/invoices/vendor": "Vendor Invoices",
  "/admin/invoices/customer": "Customer Invoices",
  "/admin/quick-payment": "Quick Payment",
  "/admin/quick-payment/history": "Payment History",
  "/admin/reports": "Reports",
  "/admin/settings": "Settings",
  "/admin/settings/tracking": "Tracking Pixels",
  "/admin/settings/pricing": "Pricing",
  "/admin/settings/complexity": "Complexity",
  "/admin/settings/turnaround": "Turnaround",
  "/admin/settings/document-types": "Document Types",
  "/admin/settings/certifications": "Certifications",
  "/admin/settings/delivery": "Delivery Options",
  "/admin/settings/tax": "Tax Rates",
  "/admin/settings/hours": "Business Hours",
  "/admin/settings/holidays": "Holidays",
  "/admin/settings/ai-prompts": "AI Prompts",
  "/admin/settings/ocr": "OCR",
  "/admin/settings/intended-uses": "Intended Uses",
  "/admin/settings/pickup-locations": "Pickup Locations",
  "/admin/settings/payment-methods": "Payment Methods",
  "/admin/settings/same-day": "Same Day",
  "/admin/settings/language-tiers": "Language Tiers",
  "/admin/settings/languages": "Languages",
  "/admin/settings/file-categories": "File Categories",
  "/admin/settings/services": "Services",
  "/admin/settings/workflows": "Workflows",
};

function getBreadcrumbs(pathname: string): { label: string; path: string }[] {
  const crumbs: { label: string; path: string }[] = [];

  // Always start with the section
  if (pathname === "/admin" || pathname === "/admin/dashboard") {
    return [{ label: "Dashboard", path: "/admin/dashboard" }];
  }

  // Build breadcrumbs from the path
  const segments = pathname.replace(/^\/admin\/?/, "").split("/").filter(Boolean);
  let currentPath = "/admin";

  for (let i = 0; i < segments.length; i++) {
    currentPath += "/" + segments[i];
    const label = BREADCRUMB_MAP[currentPath];
    if (label) {
      crumbs.push({ label, path: currentPath });
    } else {
      // Dynamic segment (like an ID) - try to make it readable
      const seg = segments[i];
      if (seg === "edit") {
        crumbs.push({ label: "Edit", path: currentPath });
      } else if (seg === "new") {
        crumbs.push({ label: "New", path: currentPath });
      } else {
        crumbs.push({ label: seg.length > 12 ? "Detail" : seg, path: currentPath });
      }
    }
  }

  return crumbs;
}

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["Blog"]));
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [headerDropdownOpen, setHeaderDropdownOpen] = useState(false);
  const location = useLocation();
  const branding = useBranding();
  const { session, signOut } = useAdminAuthContext();
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const headerDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const saved = localStorage.getItem("admin_sidebar_open");
    if (saved !== null) {
      setSidebarOpen(JSON.parse(saved));
    }
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
      }
      if (headerDropdownRef.current && !headerDropdownRef.current.contains(e.target as Node)) {
        setHeaderDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleSidebar = () => {
    const nextState = !sidebarOpen;
    setSidebarOpen(nextState);
    localStorage.setItem("admin_sidebar_open", JSON.stringify(nextState));
  };

  const toggleSection = (label: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const isActivePath = (path: string) => {
    if (path === "/admin/dashboard") {
      return (
        location.pathname === "/admin" ||
        location.pathname === "/admin/dashboard"
      );
    }
    if (path === "/admin/blog") {
      return (
        location.pathname === "/admin/blog" ||
        (location.pathname.startsWith("/admin/blog/") &&
          !location.pathname.startsWith("/admin/blog/categories") &&
          !location.pathname.startsWith("/admin/blog/authors"))
      );
    }
    return (
      location.pathname === path || location.pathname.startsWith(path + "/")
    );
  };

  const getInitials = (name?: string) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const breadcrumbs = getBreadcrumbs(location.pathname);

  const renderNavItems = (isMobile = false) => {
    let currentSection = "";

    return NAV_ITEMS.map((item) => {
      const Icon = item.icon;
      const active = isActivePath(item.path);
      const hasChildren = item.children && item.children.length > 0;
      const isExpanded = expandedSections.has(item.label);
      const isChildActive = hasChildren && item.children!.some((c) => isActivePath(c.path));

      const sectionHeader =
        item.section &&
        item.section !== currentSection &&
        !item.isChild &&
        (sidebarOpen || isMobile)
          ? (() => {
              currentSection = item.section || "";
              return (
                <div
                  key={`section-${item.section}`}
                  className="px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mt-5 first:mt-0"
                >
                  {item.section}
                </div>
              );
            })()
          : (() => {
              if (item.section) currentSection = item.section;
              return null;
            })();

      if (hasChildren) {
        return (
          <div key={item.path}>
            {sectionHeader}
            <button
              onClick={() => toggleSection(item.label)}
              className={`w-full flex items-center gap-3 px-3 py-2 mx-2 rounded-lg transition-colors text-left ${
                isChildActive
                  ? "text-white bg-[#1e293b]"
                  : "text-slate-400 hover:text-slate-200 hover:bg-[#1e293b]/50"
              } ${!sidebarOpen && !isMobile ? "justify-center mx-1 px-2" : ""}`}
              title={!sidebarOpen && !isMobile ? item.label : undefined}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {(sidebarOpen || isMobile) && (
                <>
                  <span className="flex-1 text-sm">{item.label}</span>
                  <ChevronRight
                    className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                  />
                </>
              )}
            </button>
            {(sidebarOpen || isMobile) && isExpanded && (
              <div className="mt-0.5">
                {item.children!.map((child) => {
                  const ChildIcon = child.icon;
                  const childActive = isActivePath(child.path);
                  return (
                    <NavLink
                      key={child.path}
                      to={child.path}
                      className={`flex items-center gap-3 pl-8 pr-3 py-1.5 mx-2 rounded-lg transition-colors ${
                        childActive
                          ? "text-white bg-[#1e293b] border-l-[3px] border-[#0d9488] ml-2 pl-[29px]"
                          : "text-slate-500 hover:text-slate-300 hover:bg-[#1e293b]/50"
                      }`}
                    >
                      <ChildIcon className="w-4 h-4 flex-shrink-0" />
                      <span className="text-[13px]">{child.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        );
      }

      return (
        <div key={item.path}>
          {sectionHeader}
          <NavLink
            to={item.path}
            className={`flex items-center gap-3 px-3 py-2 mx-2 rounded-lg transition-colors ${
              active
                ? "text-white bg-[#1e293b] border-l-[3px] border-[#0d9488] font-medium ml-2 pl-[9px]"
                : "text-slate-400 hover:text-slate-200 hover:bg-[#1e293b]/50"
            } ${!sidebarOpen && !isMobile ? "justify-center mx-1 px-2" : ""} ${
              item.isChild && (sidebarOpen || isMobile) ? "ml-6 pl-3" : ""
            }`}
            title={!sidebarOpen && !isMobile ? item.label : undefined}
          >
            <Icon
              className={`flex-shrink-0 ${active ? "text-[#0d9488]" : ""} ${
                item.isChild ? "w-4 h-4" : "w-5 h-5"
              }`}
            />
            {(sidebarOpen || isMobile) && (
              <span className={`${item.isChild ? "text-[13px]" : "text-sm"}`}>
                {item.label}
              </span>
            )}
          </NavLink>
        </div>
      );
    });
  };

  return (
    <NotificationProvider>
      <div className="admin-panel min-h-screen bg-[#f8fafc] flex">
        {/* Desktop Sidebar */}
        <aside
          className={`hidden lg:flex flex-col bg-[#0f172a] transition-all duration-300 flex-shrink-0 ${
            sidebarOpen ? "w-[260px]" : "w-16"
          }`}
        >
          {/* Logo */}
          <div className="h-14 flex items-center justify-between px-4 border-b border-slate-700/50">
            {sidebarOpen ? (
              <NavLink to="/admin" className="flex items-center gap-2 flex-1 overflow-hidden">
                {branding.logoDarkUrl || branding.logoUrl ? (
                  <img
                    src={branding.logoDarkUrl || branding.logoUrl}
                    alt={branding.companyName}
                    className="h-7 max-w-[120px] object-contain flex-shrink-0 brightness-0 invert"
                  />
                ) : (
                  <span className="font-bold text-lg text-white tracking-tight truncate">
                    CETHOS
                  </span>
                )}
              </NavLink>
            ) : (
              <NavLink to="/admin" className="w-full flex justify-center">
                <span className="font-bold text-xl text-[#0d9488]">C</span>
              </NavLink>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 py-3 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            {renderNavItems()}
          </nav>

          {/* Bottom User Section */}
          <div className="border-t border-slate-700/50 p-3">
            {sidebarOpen ? (
              <div className="relative" ref={userDropdownRef}>
                <button
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[#1e293b] transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-[#0d9488] flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                    {getInitials(session?.staffName)}
                  </div>
                  <div className="flex-1 text-left truncate">
                    <p className="text-sm font-medium text-slate-200 truncate">
                      {session?.staffName || "Staff"}
                    </p>
                    <p className="text-xs text-slate-500 capitalize truncate">
                      {session?.staffRole?.replace("_", " ") || ""}
                    </p>
                  </div>
                </button>

                {userDropdownOpen && (
                  <div className="absolute bottom-full left-0 right-0 mb-1 bg-[#1e293b] rounded-lg border border-slate-700 shadow-lg py-1 z-50">
                    <NavLink
                      to="/admin/settings"
                      className="flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:bg-[#0f172a] hover:text-white transition-colors"
                      onClick={() => setUserDropdownOpen(false)}
                    >
                      <Settings className="w-4 h-4" />
                      Settings
                    </NavLink>
                    <button
                      onClick={() => { setUserDropdownOpen(false); signOut(); }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-[#0f172a] hover:text-red-300 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={signOut}
                className="w-full flex justify-center p-2 text-slate-500 hover:text-red-400 hover:bg-[#1e293b] rounded-lg transition-colors"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            )}

            {/* Collapse toggle */}
            <button
              onClick={toggleSidebar}
              className="w-full flex items-center justify-center mt-2 p-1.5 text-slate-500 hover:text-slate-300 hover:bg-[#1e293b] rounded-lg transition-colors"
              title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              <ChevronLeft
                className={`w-4 h-4 transition-transform ${
                  !sidebarOpen ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>
        </aside>

        {/* Mobile Header */}
        <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-[#0f172a] z-40 flex items-center justify-between px-4">
          <NavLink to="/admin" className="flex items-center gap-2 flex-1 overflow-hidden mr-4">
            {branding.logoDarkUrl || branding.logoUrl ? (
              <img
                src={branding.logoDarkUrl || branding.logoUrl}
                alt={branding.companyName}
                className="h-7 max-w-[150px] object-contain flex-shrink-0 brightness-0 invert"
              />
            ) : (
              <span className="font-bold text-lg text-white tracking-tight truncate">
                CETHOS
              </span>
            )}
          </NavLink>
          <button
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="p-2 text-slate-300 hover:bg-[#1e293b] rounded-lg"
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>

        {/* Mobile Overlay */}
        {mobileMenuOpen && (
          <div
            className="lg:hidden fixed inset-0 z-30 bg-black/60"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Mobile Sidebar */}
        <aside
          className={`lg:hidden fixed top-14 left-0 bottom-0 w-72 bg-[#0f172a] z-30 transform transition-transform duration-300 overflow-y-auto ${
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <nav className="py-3">
            {renderNavItems(true)}

            <div className="border-t border-slate-700/50 mt-4 pt-4 mx-2">
              <button
                onClick={signOut}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-red-400 hover:bg-[#1e293b] rounded-lg"
              >
                <LogOut className="w-5 h-5" />
                <span>Logout</span>
              </button>
            </div>
          </nav>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-h-screen lg:pt-0 pt-14">
          {/* Top Header Bar */}
          <header className="h-14 bg-white border-b border-[#e2e8f0] flex items-center justify-between px-6 flex-shrink-0 sticky top-0 z-20">
            {/* Breadcrumbs */}
            <nav className="flex items-center gap-1.5 text-sm min-w-0">
              {breadcrumbs.map((crumb, i) => (
                <span key={crumb.path} className="flex items-center gap-1.5 min-w-0">
                  {i > 0 && (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  )}
                  {i === breadcrumbs.length - 1 ? (
                    <span className="text-[#0f172a] font-medium truncate">
                      {crumb.label}
                    </span>
                  ) : (
                    <NavLink
                      to={crumb.path}
                      className="text-[#64748b] hover:text-[#0f172a] transition-colors truncate"
                    >
                      {crumb.label}
                    </NavLink>
                  )}
                </span>
              ))}
            </nav>

            {/* Right side actions */}
            <div className="flex items-center gap-1">
              <NavLink
                to="/admin/help"
                className="p-2 text-[#64748b] hover:text-[#0f172a] hover:bg-slate-100 rounded-lg transition-colors"
                title="Help"
              >
                <HelpCircle className="w-5 h-5" />
              </NavLink>

              <button
                className="p-2 text-[#64748b] hover:text-[#0f172a] hover:bg-slate-100 rounded-lg transition-colors relative"
                title="Notifications"
              >
                <Bell className="w-5 h-5" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#dc2626] rounded-full" />
              </button>

              {/* Header User Dropdown */}
              <div className="relative ml-2" ref={headerDropdownRef}>
                <button
                  onClick={() => setHeaderDropdownOpen(!headerDropdownOpen)}
                  className="w-8 h-8 rounded-full bg-[#0d9488] flex items-center justify-center text-white text-xs font-medium hover:ring-2 hover:ring-[#0d9488]/30 transition-all"
                >
                  {getInitials(session?.staffName)}
                </button>

                {headerDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg border border-[#e2e8f0] shadow-lg py-1 z-50">
                    <div className="px-4 py-2 border-b border-[#e2e8f0]">
                      <p className="text-sm font-medium text-[#0f172a] truncate">
                        {session?.staffName || "Staff"}
                      </p>
                      <p className="text-xs text-[#64748b] truncate">
                        {session?.staffEmail}
                      </p>
                    </div>
                    <NavLink
                      to="/admin/settings"
                      className="flex items-center gap-2 px-4 py-2 text-sm text-[#64748b] hover:bg-slate-50 hover:text-[#0f172a] transition-colors"
                      onClick={() => setHeaderDropdownOpen(false)}
                    >
                      <Settings className="w-4 h-4" />
                      Settings
                    </NavLink>
                    <button
                      onClick={() => { setHeaderDropdownOpen(false); signOut(); }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[#dc2626] hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1">
            <Outlet />
          </main>
        </div>
      </div>
    </NotificationProvider>
  );
}
