import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import CustomerInfoPanel from "./CustomerInfoPanel";
// OLD DOCUMENT MANAGEMENT - DISABLED 2026-02-03
// import DocumentFilesPanel from "./DocumentFilesPanel";
import AddressesDeliveryPanel from "./AddressesDeliveryPanel";
import InternalNotesPanel from "./InternalNotesPanel";
import MessagePanel from "../../messaging/MessagePanel";
// OLD DOCUMENT MANAGEMENT - DISABLED 2026-02-03
// import DocumentManagementPanel from "./DocumentManagementPanel";

interface QuoteFile {
  id: string;
  original_filename: string;
  file_size: number;
  created_at: string;
  ai_processing_status?: string;
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
  onRefreshFiles?: () => void | Promise<void>;
  children?: React.ReactNode; // Document analysis content
}

export default function HITLPanelLayout({
  reviewData,
  quoteFiles,
  staffId,
  staffName,
  loading = false,
  onSaveInternalNotes,
  onRefreshFiles,
  children,
}: HITLPanelLayoutProps) {
  // Collapsible sections state - default expand important sections
  // Note: "documents" removed - now handled by DocumentFlowEditor in HITLReviewDetail.tsx
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set([
      "customer",
      "analysis",
      "addresses",
    ]),
  );

  const toggleSection = (section: string) => {
    const newSections = new Set(expandedSections);
    if (newSections.has(section)) {
      newSections.delete(section);
    } else {
      newSections.add(section);
    }
    setExpandedSections(newSections);
  };

  const CollapsibleSection = ({
    id,
    title,
    children: sectionChildren,
  }: {
    id: string;
    title: string;
    children: React.ReactNode;
  }) => {
    const isExpanded = expandedSections.has(id);

    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection(id)}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-100 transition-colors"
        >
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-600" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-600" />
          )}
        </button>
        {isExpanded && <div className="p-4 pt-0">{sectionChildren}</div>}
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-6 max-w-6xl mx-auto">
      {/* Customer & Quote Information */}
      <CollapsibleSection id="customer" title="Customer & Quote Information">
        <CustomerInfoPanel
          customerData={
            reviewData
              ? {
                  customer_id: (reviewData as any).customer?.id || "",
                  customer_name:
                    (reviewData as any).customer?.full_name ||
                    reviewData.customer_name ||
                    "",
                  customer_email:
                    (reviewData as any).customer?.email ||
                    reviewData.customer_email ||
                    "",
                  customer_phone: (reviewData as any).customer?.phone || "",
                  quote_number: reviewData.quote_number,
                  total: (reviewData as any).total || reviewData.total || 0,
                  status: reviewData.status,
                  created_at: (reviewData as any).created_at || "",
                  expires_at: (reviewData as any).expires_at || "",
                  entry_point: (reviewData as any).entry_point || "",
                }
              : null
          }
          loading={loading}
        />
      </CollapsibleSection>

      {/* ========== OLD DOCUMENT MANAGEMENT - HIDDEN 2026-02-03 ==========
         Document Management is now handled by DocumentFlowEditor in HITLReviewDetail.tsx
         This section showed duplicate "Document Management" panel with:
         - File Category dropdown
         - "Upload Additional Files" area
         - "Documents (N)" list
      {reviewData?.id && onRefreshFiles && (
        <CollapsibleSection id="documents" title="Document Management">
          <div className="space-y-4">
            <DocumentManagementPanel
              quoteId={reviewData.id}
              staffId={staffId}
              files={quoteFiles}
              onFilesUploaded={onRefreshFiles}
            />
            <DocumentFilesPanel
              files={quoteFiles}
              quoteId={reviewData.id}
              loading={loading}
              onRefresh={onRefreshFiles}
            />
          </div>
        </CollapsibleSection>
      )}
      ========== END OLD DOCUMENT MANAGEMENT ========== */}

      {/* Document Analysis & Pricing */}
      <CollapsibleSection id="analysis" title="Document Analysis & Pricing">
        {children}
      </CollapsibleSection>

      {/* Combined Addresses & Delivery Section */}
      {reviewData?.id && (
        <CollapsibleSection id="addresses" title="Addresses & Delivery">
          <AddressesDeliveryPanel
            quoteId={reviewData.id}
            billingAddress={(reviewData as any).billing_address || null}
            shippingAddress={(reviewData as any).shipping_address || null}
            physicalDeliveryOptionId={(reviewData as any).physical_delivery_option_id || null}
            customerName={reviewData.customer_name}
            customerEmail={reviewData.customer_email}
            loading={loading}
            onUpdate={onRefreshFiles}
          />
        </CollapsibleSection>
      )}

      {/* Internal Notes */}
      <CollapsibleSection id="notes" title="Internal Notes">
        <InternalNotesPanel
          initialNotes={reviewData?.internal_notes || ""}
          onSave={onSaveInternalNotes}
          loading={loading}
        />
      </CollapsibleSection>

      {/* Messaging */}
      {reviewData?.id && staffId && (
        <CollapsibleSection id="messaging" title="Customer Messaging">
          <MessagePanel
            quoteId={reviewData.id}
            staffId={staffId}
            staffName={staffName || "Staff"}
          />
        </CollapsibleSection>
      )}
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
