import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import CustomerInfoPanel from "./CustomerInfoPanel";
import DocumentFilesPanel from "./DocumentFilesPanel";
import QuoteDetailsPanel from "./QuoteDetailsPanel";
import EditableTranslationDetailsPanel from "./EditableTranslationDetailsPanel";
import ContactInfoPanel from "./ContactInfoPanel";
import EditablePricingSummaryPanel from "./EditablePricingSummaryPanel";
import EditableBillingAddressPanel from "./EditableBillingAddressPanel";
import EditableShippingAddressPanel from "./EditableShippingAddressPanel";
import EditableQuoteCertificationPanel from "./EditableQuoteCertificationPanel";
import InternalNotesPanel from "./InternalNotesPanel";
import MessagePanel from "../../messaging/MessagePanel";
import DocumentManagementPanel from "./DocumentManagementPanel";

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
  onRefreshFiles?: () => void;
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
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set([
      "customer",
      "documents",
      "analysis",
      "certification",
      "billing",
      "shipping",
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

      {/* Document Management */}
      {reviewData?.id && onRefreshFiles && (
        <CollapsibleSection id="documents" title="Document Management">
          <div className="space-y-4">
            <DocumentManagementPanel
              quoteId={reviewData.id}
              files={quoteFiles}
              onFilesUploaded={onRefreshFiles}
            />
            <DocumentFilesPanel files={quoteFiles} loading={loading} />
          </div>
        </CollapsibleSection>
      )}

      {/* Document Analysis & Pricing */}
      <CollapsibleSection id="analysis" title="Document Analysis & Pricing">
        {children}
      </CollapsibleSection>

      {/* Translation Details - Editable */}
      <CollapsibleSection id="translation" title="Translation Details">
        <EditableTranslationDetailsPanel
          translationData={
            reviewData
              ? {
                  quote_id: reviewData.id,
                  source_language_id:
                    (reviewData as any).source_language_id || "",
                  source_language_name:
                    (reviewData as any).source_language?.name || "",
                  source_language_code:
                    (reviewData as any).source_language?.code || "",
                  target_language_id:
                    (reviewData as any).target_language_id || "",
                  target_language_name:
                    (reviewData as any).target_language?.name || "",
                  target_language_code:
                    (reviewData as any).target_language?.code || "",
                  intended_use_id: (reviewData as any).intended_use_id || "",
                  intended_use_name:
                    (reviewData as any).intended_use?.name || "",
                  country_of_issue: (reviewData as any).country_of_issue || "",
                  service_province: (reviewData as any).service_province,
                  special_instructions: (reviewData as any)
                    .special_instructions,
                }
              : null
          }
          loading={loading}
          onUpdate={onRefreshFiles}
        />
      </CollapsibleSection>

      {/* Pricing Summary - Editable with Discounts/Surcharges and Quote Certification */}
      <CollapsibleSection id="pricing" title="Pricing Summary">
        <EditablePricingSummaryPanel
          pricingData={
            reviewData
              ? {
                  quote_id: reviewData.id,
                  subtotal:
                    (reviewData as any).subtotal || reviewData.subtotal || 0,
                  certification_total:
                    (reviewData as any).certification_total ||
                    reviewData.certification_total ||
                    0,
                  rush_fee: (reviewData as any).rush_fee || 0,
                  delivery_fee: (reviewData as any).delivery_fee || 0,
                  tax_amount:
                    (reviewData as any).tax_amount ||
                    reviewData.tax_amount ||
                    0,
                  tax_rate: (reviewData as any).tax_rate || 0,
                  total: (reviewData as any).total || reviewData.total || 0,
                  document_count: quoteFiles.length || 0,
                  current_certification_type_id:
                    (reviewData as any).certification_type_id || undefined,
                }
              : null
          }
          staffId={staffId}
          loading={loading}
          onUpdate={onRefreshFiles}
        />
      </CollapsibleSection>

      {/* Billing Address - Editable */}
      {(() => {
        console.log("🏢 Billing section - reviewData?.id:", reviewData?.id);
        console.log("🏢 Billing section - reviewData:", reviewData);
        return reviewData?.id ? (
          <CollapsibleSection id="billing" title="Billing Address">
            {(() => {
              console.log("🏢 Rendering billing panel with:", {
                quoteId: reviewData.id,
                billingAddress: (reviewData as any).billing_address,
                customerName: reviewData.customer_name,
                customerEmail: reviewData.customer_email,
              });
              return (
                <EditableBillingAddressPanel
                  quoteId={reviewData.id}
                  billingAddress={(reviewData as any).billing_address || null}
                  customerName={reviewData.customer_name}
                  customerEmail={reviewData.customer_email}
                  loading={loading}
                  onUpdate={onRefreshFiles}
                />
              );
            })()}
          </CollapsibleSection>
        ) : null;
      })()}

      {/* Shipping Address & Delivery - Editable */}
      {(() => {
        console.log("🚚 Shipping section - reviewData?.id:", reviewData?.id);
        return reviewData?.id ? (
          <CollapsibleSection id="shipping" title="Shipping & Delivery">
            {(() => {
              console.log("🚚 Rendering shipping panel with:", {
                quoteId: reviewData.id,
                shippingAddress: (reviewData as any).shipping_address,
                physicalDeliveryOptionId: (reviewData as any)
                  .physical_delivery_option_id,
                customerName: reviewData.customer_name,
              });
              return (
                <EditableShippingAddressPanel
                  quoteId={reviewData.id}
                  shippingAddress={(reviewData as any).shipping_address || null}
                  physicalDeliveryOptionId={
                    (reviewData as any).physical_delivery_option_id || null
                  }
                  customerName={reviewData.customer_name}
                  loading={loading}
                  onUpdate={onRefreshFiles}
                />
              );
            })()}
          </CollapsibleSection>
        ) : null;
      })()}

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
