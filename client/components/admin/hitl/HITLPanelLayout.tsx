import React from "react";
import CustomerInfoPanel from "./CustomerInfoPanel";
import DocumentFilesPanel from "./DocumentFilesPanel";
import QuoteDetailsPanel from "./QuoteDetailsPanel";
import InternalNotesPanel from "./InternalNotesPanel";
import MessagePanel from "../../messaging/MessagePanel";

interface QuoteFile {
  id: string;
  original_filename: string;
  file_size: number;
  created_at: string;
  processing_status?: string;
  storage_path?: string;
  mime_type: string;
}

interface AnalysisResult {
  analysis_id: string;
  quote_file_id: string;
  original_filename: string;
  detected_language: string;
  detected_document_type: string;
  assessed_complexity: string;
  complexity_multiplier: number;
  word_count: number;
  page_count: number;
  billable_pages: number;
  line_total: number;
  certification_code: string;
  certification_name: string;
  certification_price: number;
  total_certification_cost: number;
}

interface ReviewData {
  // From v_hitl_review_detail
  id: string;
  quote_id: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  quote_number: string;
  status: string;
  total: number;
  created_at: string;
  internal_notes?: string;

  // Step 2 Data
  source_language_name: string;
  source_language_code: string;
  target_language_name: string;
  target_language_code: string;
  intended_use_name: string;
  country_of_issue: string;
  service_province?: string;
  special_instructions?: string;

  // Pricing
  subtotal: number;
  certification_total: number;
  tax_amount: number;
}

interface HITLPanelLayoutProps {
  reviewData: ReviewData | null;
  quoteFiles: QuoteFile[];
  staffId?: string;
  staffName?: string;
  loading?: boolean;
  onSaveInternalNotes?: (notes: string) => Promise<void>;
  children?: React.ReactNode; // Center panel content
}

export default function HITLPanelLayout({
  reviewData,
  quoteFiles,
  staffId,
  staffName,
  loading = false,
  onSaveInternalNotes,
  children,
}: HITLPanelLayoutProps) {
  return (
    <div className="grid grid-cols-12 gap-4 h-[calc(100vh-300px)]">
      {/* LEFT PANEL: Customer Info + Document Files + Quote Details (3 columns) */}
      <aside className="col-span-3 space-y-4 overflow-y-auto">
        {/* Customer Info */}
        <CustomerInfoPanel
          customerData={
            reviewData
              ? {
                  customer_id: reviewData.customer_id,
                  customer_name: reviewData.customer_name,
                  customer_email: reviewData.customer_email,
                  customer_phone: reviewData.customer_phone,
                  quote_number: reviewData.quote_number,
                  total: reviewData.total,
                  status: reviewData.status,
                  created_at: reviewData.created_at,
                }
              : null
          }
          loading={loading}
        />

        {/* Document Files */}
        <DocumentFilesPanel files={quoteFiles} loading={loading} />

        {/* Quote Details (Step 2 & 3) */}
        <QuoteDetailsPanel quoteData={reviewData} loading={loading} />
      </aside>

      {/* CENTER PANEL: Document Analysis (6 columns) */}
      <main className="col-span-6 space-y-4 overflow-y-auto">
        {children}
      </main>

      {/* RIGHT PANEL: Messaging + Internal Notes (3 columns) */}
      <aside className="col-span-3 space-y-4 overflow-y-auto flex flex-col">
        {/* Messaging Panel */}
        {reviewData?.quote_id && staffId && (
          <MessagePanel
            quoteId={reviewData.quote_id}
            staffId={staffId}
            staffName={staffName || "Staff"}
          />
        )}

        {/* Internal Notes Panel */}
        <div className="flex-1 overflow-y-auto">
          <InternalNotesPanel
            initialNotes={reviewData?.internal_notes || ""}
            onSave={onSaveInternalNotes}
            loading={loading}
          />
        </div>
      </aside>
    </div>
  );
}

// Responsive hook for adapting layout
export function useResponsiveLayout() {
  const [screenSize, setScreenSize] = React.useState<
    "mobile" | "tablet" | "desktop"
  >("desktop");

  React.useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setScreenSize("mobile");
      } else if (window.innerWidth < 1400) {
        setScreenSize("tablet");
      } else {
        setScreenSize("desktop");
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return screenSize;
}
