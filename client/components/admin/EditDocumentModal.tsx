import { useState, useEffect } from "react";
import { X, Save, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface OrderDocument {
  id: string;
  original_filename: string;
  detected_document_type: string;
  detected_language: string;
  target_language: string;
  word_count: number;
  page_count: number;
  billable_pages: number;
  assessed_complexity: string;
  complexity_multiplier: number;
  line_total: number;
  certification_type_id: string;
  certification_price: number;
}

interface DocumentType {
  id: string;
  code: string;
  name: string;
}

interface CertificationType {
  id: string;
  code: string;
  name: string;
  price: number;
}

interface EditDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: OrderDocument;
  onSave: (updatedDoc: OrderDocument) => void;
}

const COMPLEXITY_OPTIONS = [
  { value: "simple", label: "Simple", multiplier: 0.8 },
  { value: "standard", label: "Standard", multiplier: 1.0 },
  { value: "complex", label: "Complex", multiplier: 1.3 },
  { value: "highly_complex", label: "Highly Complex", multiplier: 1.5 },
];

export default function EditDocumentModal({
  isOpen,
  onClose,
  document,
  onSave,
}: EditDocumentModalProps) {
  // Form state
  const [documentType, setDocumentType] = useState(document.detected_document_type);
  const [wordCount, setWordCount] = useState(document.word_count.toString());
  const [pageCount, setPageCount] = useState(document.page_count.toString());
  const [complexity, setComplexity] = useState(document.assessed_complexity || "easy");
  const [certificationCode, setCertificationCode] = useState(document.certification_type_id);

  // Reference data
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [certificationTypes, setCertificationTypes] = useState<CertificationType[]>([]);

  // Settings
  const [baseRate, setBaseRate] = useState(65);
  const [wordsPerPage, setWordsPerPage] = useState(225);

  // UI state
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadReferenceData();
      // Reset form state when document changes
      setDocumentType(document.detected_document_type);
      setWordCount(document.word_count.toString());
      setPageCount(document.page_count.toString());
      setComplexity(document.assessed_complexity || "easy");
      setCertificationCode(document.certification_type_id);
    }
  }, [isOpen, document]);

  const loadReferenceData = async () => {
    setLoading(true);
    try {
      const [docTypesRes, certTypesRes, settingsRes] = await Promise.all([
        supabase.from("document_types").select("id, code, name").eq("is_active", true).order("name"),
        supabase.from("certification_types").select("id, code, name, price").eq("is_active", true).order("sort_order"),
        supabase.from("app_settings").select("setting_key, setting_value").in("setting_key", ["base_rate_per_page", "words_per_page"]),
      ]);

      setDocumentTypes(docTypesRes.data || []);
      setCertificationTypes(certTypesRes.data || []);

      if (settingsRes.data) {
        settingsRes.data.forEach((s) => {
          if (s.setting_key === "base_rate_per_page") setBaseRate(parseFloat(s.setting_value) || 65);
          if (s.setting_key === "words_per_page") setWordsPerPage(parseInt(s.setting_value) || 225);
        });
      }
    } catch (err) {
      console.error("Error loading reference data:", err);
      toast.error("Failed to load reference data");
    } finally {
      setLoading(false);
    }
  };

  // Calculate derived values
  const parsedWordCount = parseInt(wordCount) || 0;
  const parsedPageCount = parseInt(pageCount) || 1;
  const complexityMultiplier = COMPLEXITY_OPTIONS.find(c => c.value === complexity)?.multiplier || 1.0;
  const selectedCert = certificationTypes.find(c => c.id === certificationCode);
  const certificationPrice = selectedCert?.price || 0;

  // Calculate billable pages: CEIL((words / 225) * complexity * 10) / 10
  const rawBillablePages = (parsedWordCount / wordsPerPage) * complexityMultiplier;
  const billablePages = Math.max(1, Math.ceil(rawBillablePages * 10) / 10);

  // Calculate line total: billable_pages * base_rate (translation only, no certification)
  // Rounded up to nearest $2.50
  const rawTranslationCost = billablePages * baseRate;
  const translationCost = Math.ceil(rawTranslationCost / 2.5) * 2.5;
  const lineTotal = translationCost;

  const handleSave = () => {
    const updatedDoc: OrderDocument = {
      ...document,
      detected_document_type: documentType,
      word_count: parsedWordCount,
      page_count: parsedPageCount,
      billable_pages: billablePages,
      assessed_complexity: complexity,
      complexity_multiplier: complexityMultiplier,
      certification_type_id: certificationCode,
      certification_price: certificationPrice,
      line_total: lineTotal,
    };
    onSave(updatedDoc);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Edit Document</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
            </div>
          ) : (
            <>
              {/* Filename (readonly) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Filename
                </label>
                <p className="px-3 py-2 bg-gray-100 rounded-lg text-gray-700 truncate">
                  {document.original_filename}
                </p>
              </div>

              {/* Document Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Document Type
                </label>
                <select
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                >
                  {documentTypes.map((dt) => (
                    <option key={dt.id} value={dt.code}>
                      {dt.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Word Count & Page Count */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Word Count
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={wordCount}
                    onChange={(e) => setWordCount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Page Count
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={pageCount}
                    onChange={(e) => setPageCount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
              </div>

              {/* Complexity */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Complexity
                </label>
                <select
                  value={complexity}
                  onChange={(e) => setComplexity(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                >
                  {COMPLEXITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} ({opt.multiplier}x)
                    </option>
                  ))}
                </select>
              </div>

              {/* Certification Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Certification Type
                </label>
                <select
                  value={certificationCode}
                  onChange={(e) => setCertificationCode(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                >
                  {certificationTypes.map((ct) => (
                    <option key={ct.id} value={ct.id}>
                      {ct.name} (${ct.price.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Calculated Values */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Billable Pages:</span>
                  <span className="font-medium">{billablePages.toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Translation Cost:</span>
                  <span className="font-medium">${translationCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Certification:</span>
                  <span className="font-medium">${certificationPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t pt-2 font-semibold">
                  <span>Line Total:</span>
                  <span>${lineTotal.toFixed(2)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
}
