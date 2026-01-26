import { Outlet } from "react-router-dom";
import CethosHeader from "../shared/CethosHeader";
import CethosSiteFooter from "../shared/CethosSiteFooter";

interface PublicLayoutProps {
  children?: React.ReactNode;
  activePage?: string;
  showFooter?: boolean;
}

export default function PublicLayout({
  children,
  activePage = "",
  showFooter = true,
}: PublicLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <CethosHeader activePage={activePage} />

      <main className="flex-1">{children || <Outlet />}</main>

      {showFooter && <CethosSiteFooter />}
    </div>
  );
}
