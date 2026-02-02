import React, { useState, useEffect } from "react";
import { X } from "lucide-react";

interface DocumentGroup {
  group_id: string;
  group_label: string;
  document_type: string;
  complexity: string;
}

interface EditGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: DocumentGroup | null;
  onSave: (groupId: string, label: string, documentType: string, complexity: string) => void;
}

const DOCUMENT_TYPES = [
  { value: "", label: "Select type..." },
  { value: "drivers_license", label: "Driver's License" },
  { value: "passport", label: "Passport" },
  { value: "id_card", label: "ID Card" },
  { value: "birth_certificate", label: "Birth Certificate" },
  { value: "marriage_certificate", label: "Marriage Certificate" },
  { value: "death_certificate", label: "Death Certificate" },
  { value: "diploma_degree", label: "Diploma/Degree" },
  { value: "transcript", label: "Academic Transcript" },
  { value: "work_permit", label: "Work Permit" },
  { value: "residence_permit", label: "Residence Permit" },
  { value: "visa", label: "Visa" },
  { value: "bank_statement", label: "Bank Statement" },
  { value: "employment_letter", label: "Employment Letter" },
  { value: "power_of_attorney", label: "Power of Attorney" },
  { value: "court_document", label: "Court Document" },
  { value: "medical_records", label: "Medical Records" },
  { value: "other", label: "Other" },
];

const COMPLEXITY_OPTIONS = [
  { value: "easy", label: "Easy (1.0x) - Clear text, standard forms" },
  { value: "medium", label: "Medium (1.15x) - Some handwriting, stamps" },
  { value: "hard", label: "Hard (1.25x) - Complex layout, poor quality" },
];

export default function EditGroupModal({
  isOpen,
  onClose,
  group,
  onSave,
}: EditGroupModalProps) {
  const [label, setLabel] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [complexity, setComplexity] = useState("easy");

  useEffect(() => {
    if (group) {
      setLabel(group.group_label || "");
      setDocumentType(group.document_type || "");
      setComplexity(group.complexity || "easy");
    }
  }, [group]);

  if (!isOpen || !group) return null;

  const handleSave = () => {
    onSave(group.group_id, label, documentType, complexity);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Edit Document Group</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Document Label
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Italian Driver's License"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Document Type
            </label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              {DOCUMENT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Complexity
            </label>
            <select
              value={complexity}
              onChange={(e) => setComplexity(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              {COMPLEXITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

export type { EditGroupModalProps };
