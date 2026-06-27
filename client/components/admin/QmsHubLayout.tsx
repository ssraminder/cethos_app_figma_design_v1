/**
 * QmsHubLayout — shared shell for the consolidated QMS Hub.
 *
 * Renders a compact header + a persistent tab bar over an <Outlet/>, so every
 * Quality-domain page (SOPs, Documents, Trainings, Staff competence,
 * Qualification, Quality, Quizzes) lives inside one framed hub while keeping
 * its own URL. The individual pages still own their bodies — this is pure
 * navigation framing, not a rewrite of the management screens.
 */

import { Link, Outlet, useLocation } from "react-router-dom";
import {
  ShieldCheck,
  LayoutDashboard,
  BookOpen,
  Files,
  GraduationCap,
  UserCheck,
  ClipboardCheck,
  HelpCircle,
} from "lucide-react";

interface HubTab {
  id: string;
  label: string;
  icon: React.ElementType;
  to: string;
  match: (pathname: string) => boolean;
}

const TABS: HubTab[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, to: "/admin/qms", match: (p) => p === "/admin/qms" },
  { id: "sops", label: "SOPs", icon: BookOpen, to: "/admin/sops", match: (p) => p.startsWith("/admin/sops") },
  { id: "documents", label: "Documents", icon: Files, to: "/admin/documents", match: (p) => p.startsWith("/admin/documents") },
  {
    id: "trainings",
    label: "Trainings",
    icon: GraduationCap,
    to: "/admin/trainings",
    match: (p) => p.startsWith("/admin/trainings") || p.startsWith("/admin/qms/training-records"),
  },
  { id: "staff", label: "Staff competence", icon: UserCheck, to: "/admin/qms/staff", match: (p) => p.startsWith("/admin/qms/staff") },
  {
    id: "qualification",
    label: "Qualification",
    icon: ClipboardCheck,
    to: "/admin/qms/approvals",
    match: (p) => p.startsWith("/admin/qms/approvals") || p.startsWith("/admin/qms/queue"),
  },
  { id: "quality", label: "Quality", icon: ShieldCheck, to: "/admin/quality", match: (p) => p.startsWith("/admin/quality") },
  { id: "quizzes", label: "Quizzes", icon: HelpCircle, to: "/admin/iso-quizzes", match: (p) => p.startsWith("/admin/iso-quizzes") },
];

// Secondary sub-toggles — shown only when the parent tab is active.
const SUBNAV: Record<string, { label: string; to: string; match: (p: string) => boolean }[]> = {
  trainings: [
    { label: "Courses", to: "/admin/trainings", match: (p) => p.startsWith("/admin/trainings") },
    { label: "Completion records", to: "/admin/qms/training-records", match: (p) => p.startsWith("/admin/qms/training-records") },
  ],
  qualification: [
    { label: "Approvals", to: "/admin/qms/approvals", match: (p) => p.startsWith("/admin/qms/approvals") },
    { label: "Queue", to: "/admin/qms/queue", match: (p) => p.startsWith("/admin/qms/queue") },
  ],
};

export default function QmsHubLayout() {
  const { pathname } = useLocation();
  const activeTab = TABS.find((t) => t.match(pathname)) ?? TABS[0];
  const subnav = SUBNAV[activeTab.id];

  return (
    <div className="min-h-screen bg-[#f6f9fc]">
      {/* Hub header + tab bar */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 pt-4">
          <div className="flex items-center gap-2.5 mb-3">
            <ShieldCheck className="w-6 h-6 text-teal-600 shrink-0" />
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">QMS command centre</h1>
              <p className="text-xs text-slate-500">SOPs · documents · trainings · qualification · quality</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center -mb-px">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = t.id === activeTab.id;
              return (
                <Link
                  key={t.id}
                  to={t.to}
                  className={`flex items-center gap-1.5 px-3 py-2.5 text-sm border-b-2 transition-colors whitespace-nowrap ${
                    active
                      ? "border-teal-600 text-teal-700 font-medium"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Secondary sub-toggle (Trainings / Qualification) */}
        {subnav && (
          <div className="bg-slate-50 border-t border-slate-200">
            <div className="max-w-6xl mx-auto px-6 py-2 flex items-center gap-2">
              {subnav.map((s) => {
                const active = s.match(pathname);
                return (
                  <Link
                    key={s.to}
                    to={s.to}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                      active
                        ? "bg-teal-600 border-teal-600 text-white"
                        : "border-slate-300 text-slate-600 hover:bg-white"
                    }`}
                  >
                    {s.label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <Outlet />
    </div>
  );
}
