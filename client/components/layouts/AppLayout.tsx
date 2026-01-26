import { Outlet } from "react-router-dom";
import CethosHeader from "../shared/CethosHeader";
import CethosSiteFooter from "../shared/CethosSiteFooter";

export default function AppLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <CethosHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <CethosSiteFooter />
    </div>
  );
}
