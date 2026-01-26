import { Outlet, useSearchParams } from "react-router-dom";
import CethosHeader from "../shared/CethosHeader";

interface QuoteFlowLayoutProps {
  children?: React.ReactNode;
}

export default function QuoteFlowLayout({ children }: QuoteFlowLayoutProps) {
  const [searchParams] = useSearchParams();
  const embedMode = searchParams.get("embed") === "true";

  return (
    <div className="min-h-screen flex flex-col">
      {!embedMode && <CethosHeader hideCta />}

      <main className="flex-1">{children || <Outlet />}</main>
    </div>
  );
}
