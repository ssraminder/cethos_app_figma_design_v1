import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Complexity, CertificationType } from "@/types/document-editor";
import {
  COMPLEXITY_OPTIONS,
  DEFAULT_DOCUMENT_TYPES,
  generateGroupLabel,
} from "@/types/document-editor";

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (
    label: string,
    documentType: string,
    complexity: Complexity,
    holderName: string | null,
    certificationTypeId: string | null
  ) => void;
  documentTypes?: string[];
  certificationTypes?: CertificationType[];
  suggestedDocType?: string;
  suggestedHolderName?: string;
}

export default function CreateGroupModal({
  isOpen,
  onClose,
  onCreate,
  documentTypes = DEFAULT_DOCUMENT_TYPES,
  certificationTypes = [],
  suggestedDocType,
  suggestedHolderName,
}: CreateGroupModalProps) {
  // Form state
  const [documentType, setDocumentType] = useState(suggestedDocType || documentTypes[0] || "");
  const [holderName, setHolderName] = useState(suggestedHolderName || "");
  const [customLabel, setCustomLabel] = useState("");
  const [complexity, setComplexity] = useState<Complexity>("easy");
  const [certificationTypeId, setCertificationTypeId] = useState<string>("");
  const [useCustomLabel, setUseCustomLabel] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setDocumentType(suggestedDocType || documentTypes[0] || "");
      setHolderName(suggestedHolderName || "");
      setCustomLabel("");
      setComplexity("easy");
      setCertificationTypeId("");
      setUseCustomLabel(false);
    }
  }, [isOpen, suggestedDocType, suggestedHolderName, documentTypes]);

  // Generate preview label
  const previewLabel = useCustomLabel
    ? customLabel
    : generateGroupLabel(documentType, holderName || null);

  // Handle submit
  const handleSubmit = () => {
    const label = useCustomLabel ? customLabel : previewLabel;
    onCreate(
      label,
      documentType,
      complexity,
      holderName || null,
      certificationTypeId || null
    );
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Create Document Group
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-4">
          {/* Document Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Document Type <span className="text-red-500">*</span>
            </label>
            <Select value={documentType} onValueChange={setDocumentType}>
              <SelectTrigger>
                <SelectValue placeholder="Select document type..." />
              </SelectTrigger>
              <SelectContent>
                {documentTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Holder Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Holder Name (Optional)
            </label>
            <Input
              type="text"
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              placeholder="e.g., John Smith"
            />
            <p className="text-xs text-gray-500 mt-1">
              Used to group documents for the same person
            </p>
          </div>

          {/* Custom Label Toggle */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useCustomLabel}
                onChange={(e) => setUseCustomLabel(e.target.checked)}
                className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm text-gray-700">Use custom label</span>
            </label>
          </div>

          {/* Custom Label Input (conditional) */}
          {useCustomLabel && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Custom Label
              </label>
              <Input
                type="text"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="Enter custom label..."
              />
            </div>
          )}

          {/* Label Preview */}
          <div className="bg-gray-50 rounded-lg p-3">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Group Label Preview
            </label>
            <p className="font-medium text-gray-900">{previewLabel || "—"}</p>
          </div>

          {/* Complexity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Complexity
            </label>
            <div className="flex gap-2">
              {COMPLEXITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setComplexity(opt.value)}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    complexity === opt.value
                      ? "bg-teal-600 text-white border-teal-600"
                      : "bg-white text-gray-700 border-gray-300 hover:border-teal-300"
                  }`}
                >
                  {opt.label}
                  <span className="block text-xs opacity-75">{opt.multiplier}x</span>
                </button>
              ))}
            </div>
          </div>

          {/* Certification Type */}
          {certificationTypes.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Certification Type
              </label>
              <Select
                value={certificationTypeId}
                onValueChange={setCertificationTypeId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select certification (optional)..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {certificationTypes.map((cert) => (
                    <SelectItem key={cert.id} value={cert.id}>
                      {cert.name} (${cert.price.toFixed(2)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!documentType || (useCustomLabel && !customLabel)}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Create Group
          </button>
        </div>
      </div>
    </div>
  );
}
