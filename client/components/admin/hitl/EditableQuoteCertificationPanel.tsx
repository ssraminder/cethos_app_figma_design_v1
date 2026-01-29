import React, { useState, useEffect } from "react";
import {
  Award,
  ChevronDown,
  ChevronUp,
  Edit3,
  Save,
  X,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

interface CertificationType {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  is_default: boolean;
  is_active: boolean;
}

interface QuoteCertificationData {
  quote_id: string;
  current_certification_type_id?: string;
  current_certification_name?: string;
  document_count: number;
}

interface EditableQuoteCertificationPanelProps {
  certificationData: QuoteCertificationData | null;
  staffId?: string;
  loading?: boolean;
  onUpdate?: () => void;
}

export default function EditableQuoteCertificationPanel({
  certificationData,
  staffId,
  loading = false,
  onUpdate,
}: EditableQuoteCertificationPanelProps) {
  console.log("🎖️ EditableQuoteCertificationPanel rendering:", {
    certificationData,
    staffId,
    loading,
  });

  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [certificationTypes, setCertificationTypes] = useState<
    CertificationType[]
  >([]);
  const [selectedCertificationId, setSelectedCertificationId] = useState<
    string | null
  >(null);

  useEffect(() => {
    fetchCertificationTypes();
  }, []);

  useEffect(() => {
    if (certificationData?.current_certification_type_id) {
      setSelectedCertificationId(
        certificationData.current_certification_type_id,
      );
    }
  }, [certificationData?.current_certification_type_id]);

  const fetchCertificationTypes = async () => {
    try {
      const { data, error } = await supabase
        .from("certification_types")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      setCertificationTypes(data || []);

      // Set default if no current selection
      if (!certificationData?.current_certification_type_id && data?.length) {
        const defaultCert = data.find((c) => c.is_default);
        if (defaultCert) {
          setSelectedCertificationId(defaultCert.id);
        }
      }
    } catch (error) {
      console.error("Error fetching certification types:", error);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    // Reset to current value
    setSelectedCertificationId(
      certificationData?.current_certification_type_id || null,
    );
  };

  const handleSave = async () => {
    if (!certificationData?.quote_id || !selectedCertificationId) {
      alert("Please select a certification type");
      return;
    }

    if (
      !confirm(
        `This will apply the selected certification to all ${certificationData.document_count} document(s) in this quote. Continue?`,
      )
    ) {
      return;
    }

    setIsSaving(true);
    try {
      // Get selected certification details
      const selectedCert = certificationTypes.find(
        (c) => c.id === selectedCertificationId,
      );
      if (!selectedCert) throw new Error("Certification type not found");

      // Get all quote files for this quote
      const { data: quoteFiles, error: filesError } = await supabase
        .from("quote_files")
        .select("id")
        .eq("quote_id", certificationData.quote_id);

      if (filesError) throw filesError;

      if (!quoteFiles || quoteFiles.length === 0) {
        alert("No documents found in this quote");
        setIsSaving(false);
        return;
      }

      // For each quote file, update or insert the primary certification
      for (const file of quoteFiles) {
        // Check if there's already a primary certification
        const { data: existing, error: checkError } = await supabase
          .from("document_certifications")
          .select("id")
          .eq("quote_file_id", file.id)
          .eq("is_primary", true)
          .single();

        if (existing) {
          // Update existing primary certification
          const { error: updateError } = await supabase
            .from("document_certifications")
            .update({
              certification_type_id: selectedCertificationId,
              price: selectedCert.price,
              added_by: staffId || null,
              added_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);

          if (updateError) throw updateError;
        } else {
          // Insert new primary certification
          const { error: insertError } = await supabase
            .from("document_certifications")
            .insert({
              quote_file_id: file.id,
              certification_type_id: selectedCertificationId,
              is_primary: true,
              price: selectedCert.price,
              added_by: staffId || null,
              added_at: new Date().toISOString(),
            });

          if (insertError) throw insertError;
        }
      }

      // Recalculate certification total at quote level
      const totalCertificationCost =
        quoteFiles.length * Number(selectedCert.price);

      const { error: quoteUpdateError } = await supabase
        .from("quotes")
        .update({
          certification_total: totalCertificationCost,
          updated_at: new Date().toISOString(),
        })
        .eq("id", certificationData.quote_id);

      if (quoteUpdateError) throw quoteUpdateError;

      // Log activity
      if (staffId) {
        await supabase.from("staff_activity_log").insert({
          staff_id: staffId,
          activity_type: "quote_certification_updated",
          details: {
            quote_id: certificationData.quote_id,
            certification_type: selectedCert.name,
            certification_id: selectedCert.id,
            document_count: quoteFiles.length,
            total_cost: totalCertificationCost,
          },
        });
      }

      alert(
        `✅ Certification updated successfully for ${quoteFiles.length} document(s)!`,
      );
      setIsEditing(false);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Failed to update certification:", error);
      alert("Failed to update certification: " + (error as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
        </div>
      </div>
    );
  }

  if (!certificationData) {
    return null;
  }

  const selectedCert = certificationTypes.find(
    (c) => c.id === selectedCertificationId,
  );

  return (
    <div className="bg-white border border-gray-200 rounded-lg divide-y">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4 text-purple-600" />
          <h3 className="text-sm font-semibold text-gray-900">
            Quote Certification
          </h3>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 py-3 space-y-3 text-sm">
          {/* Info Alert */}
          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded">
            <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-900">
              This certification will be applied to all{" "}
              <strong>{certificationData.document_count} document(s)</strong> in
              this quote as the primary certification.
            </p>
          </div>

          {!isEditing ? (
            /* View Mode */
            <div className="space-y-3">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <span className="text-sm text-gray-600 block mb-1">
                    Current Certification:
                  </span>
                  <span className="text-base font-semibold text-gray-900">
                    {certificationData.current_certification_name ||
                      selectedCert?.name ||
                      "Not Set"}
                  </span>
                  {selectedCert && (
                    <>
                      <p className="text-xs text-gray-500 mt-1">
                        {selectedCert.description}
                      </p>
                      <p className="text-sm font-medium text-purple-700 mt-2">
                        ${Number(selectedCert.price).toFixed(2)} per document
                      </p>
                      <p className="text-xs text-gray-600">
                        Total:{" "}
                        <strong>
                          $
                          {(
                            Number(selectedCert.price) *
                            certificationData.document_count
                          ).toFixed(2)}
                        </strong>{" "}
                        ({certificationData.document_count} document
                        {certificationData.document_count !== 1 ? "s" : ""})
                      </p>
                    </>
                  )}
                </div>
                <button
                  onClick={handleEdit}
                  className="flex items-center gap-2 px-3 py-2 text-blue-700 hover:bg-blue-50 rounded border border-blue-300"
                >
                  <Edit3 className="w-4 h-4" />
                  Edit
                </button>
              </div>
            </div>
          ) : (
            /* Edit Mode */
            <div className="space-y-3 bg-gray-50 p-4 rounded border border-gray-200">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Select Certification Type *
                </label>
                <select
                  value={selectedCertificationId || ""}
                  onChange={(e) => setSelectedCertificationId(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  disabled={isSaving}
                >
                  <option value="">-- Select Certification --</option>
                  {certificationTypes.map((cert) => (
                    <option key={cert.id} value={cert.id}>
                      {cert.name} - ${Number(cert.price).toFixed(2)}
                      {cert.is_default ? " (Default)" : ""}
                    </option>
                  ))}
                </select>

                {selectedCert && (
                  <div className="mt-3 p-3 bg-white border border-gray-200 rounded">
                    <p className="text-xs text-gray-700 mb-2">
                      <strong>Description:</strong> {selectedCert.description}
                    </p>
                    <p className="text-sm font-medium text-purple-700">
                      Cost per document: $
                      {Number(selectedCert.price).toFixed(2)}
                    </p>
                    <p className="text-sm font-semibold text-gray-900 mt-1">
                      Total for {certificationData.document_count} document
                      {certificationData.document_count !== 1 ? "s" : ""}:{" "}
                      <span className="text-purple-700">
                        $
                        {(
                          Number(selectedCert.price) *
                          certificationData.document_count
                        ).toFixed(2)}
                      </span>
                    </p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSave}
                  disabled={isSaving || !selectedCertificationId}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
