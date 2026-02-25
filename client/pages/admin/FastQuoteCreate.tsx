import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAdminAuthContext } from "../../context/AdminAuthContext";
import { toast } from "sonner";
import SearchableSelect from "@/components/ui/SearchableSelect";
import {
  ArrowLeft,
  Zap,
  Plus,
  Trash2,
  Loader2,
  Upload,
  FileText,
  ImageIcon,
  X,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface Language {
  id: string;
  name: string;
  native_name: string;
  code: string;
  multiplier: number;
  is_source_available: boolean;
  is_target_available: boolean;
}

interface IntendedUse {
  id: string;
  name: string;
  description: string | null;
  default_certification_type_id: string | null;
}

interface Country {
  id: string;
  code: string;
  name: string;
  is_common: boolean;
}

interface CertificationType {
  id: string;
  code: string;
  name: string;
  price: number;
}

interface TurnaroundOption {
  id: string;
  code: string;
  name: string;
  multiplier: number;
  fee_type: string;
  fee_value: number;
  estimated_days: number;
}

interface DeliveryOption {
  id: string;
  code: string;
  name: string;
  price: number;
}

interface TaxRate {
  id: string;
  region_code: string;
  region_name: string;
  tax_name: string;
  rate: number;
}

interface DocumentType {
  id: string;
  code: string;
  name: string;
}

interface FileAttachment {
  file: File;
  id: string;
}

interface DocumentRow {
  id: string;
  label: string;
  documentTypeId: string;
  pageCount: number;
  wordCount: string;
  complexity: "easy" | "medium" | "hard";
  certificationTypeId: string;
  expanded: boolean;
  files: FileAttachment[];
  billablePagesOverride: number | null;
  perPageRateOverride: number | null;
}

interface ValidationErrors {
  [key: string]: string;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const COMPLEXITY_OPTIONS = [
  { value: "easy" as const, label: "Easy", multiplier: 1.0 },
  { value: "medium" as const, label: "Medium", multiplier: 1.15 },
  { value: "hard" as const, label: "Hard", multiplier: 1.25 },
];

const ENTRY_POINT_OPTIONS = [
  { value: "staff_manual", label: "Staff Manual" },
  { value: "phone_order", label: "Phone Order" },
  { value: "walk_in", label: "Walk-In" },
  { value: "email_request", label: "Email Request" },
];

const ACCEPTED_FILE_TYPES =
  ".pdf,.jpg,.jpeg,.png,.gif,.webp,.tiff,application/pdf,image/*";
const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/tiff",
];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function getComplexityMultiplier(
  complexity: "easy" | "medium" | "hard",
): number {
  const map = { easy: 1.0, medium: 1.15, hard: 1.25 };
  return map[complexity];
}

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function FastQuoteCreate() {
  const navigate = useNavigate();
  const { session } = useAdminAuthContext();
  const firstErrorRef = useRef<HTMLElement | null>(null);

  // ─── Loading state ───
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");

  // ─── Dropdown data ───
  const [languages, setLanguages] = useState<Language[]>([]);
  const [intendedUses, setIntendedUses] = useState<IntendedUse[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [certificationTypes, setCertificationTypes] = useState<
    CertificationType[]
  >([]);
  const [turnaroundOptions, setTurnaroundOptions] = useState<
    TurnaroundOption[]
  >([]);
  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOption[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [baseRate, setBaseRate] = useState(65.0);
  const [wordsPerPage, setWordsPerPage] = useState(225);

  // ─── Customer Section ───
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [customerType, setCustomerType] = useState<"individual" | "business">(
    "individual",
  );
  const [companyName, setCompanyName] = useState("");
  const [taxRateId, setTaxRateId] = useState("");
  const [existingCustomerId, setExistingCustomerId] = useState<string | null>(
    null,
  );
  const [existingCustomerBanner, setExistingCustomerBanner] = useState("");

  // ─── Translation Details ───
  const [sourceLanguageId, setSourceLanguageId] = useState("");
  const [targetLanguageId, setTargetLanguageId] = useState("");
  const [intendedUseId, setIntendedUseId] = useState("");
  const [countryOfIssue, setCountryOfIssue] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");

  // ─── Documents ───
  const [documents, setDocuments] = useState<DocumentRow[]>([
    {
      id: generateId(),
      label: "",
      documentTypeId: "",
      pageCount: 1,
      wordCount: "",
      complexity: "easy",
      certificationTypeId: "",
      expanded: true,
      files: [],
      billablePagesOverride: null,
      perPageRateOverride: null,
    },
  ]);

  // ─── Pricing & Delivery ───
  const [turnaroundOptionId, setTurnaroundOptionId] = useState("");
  const [deliveryOptionId, setDeliveryOptionId] = useState("");
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">(
    "percentage",
  );
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [surchargeEnabled, setSurchargeEnabled] = useState(false);
  const [surchargeType, setSurchargeType] = useState<"percentage" | "fixed">(
    "percentage",
  );
  const [surchargeValue, setSurchargeValue] = useState("");
  const [surchargeReason, setSurchargeReason] = useState("");

  // ─── Quote Settings ───
  const [entryPoint, setEntryPoint] = useState("staff_manual");
  const [internalNotes, setInternalNotes] = useState("");

  // ─── Validation ───
  const [errors, setErrors] = useState<ValidationErrors>({});

  // ═══════════════════════════════════════════════════════════════
  // DATA FETCHING
  // ═══════════════════════════════════════════════════════════════

  useEffect(() => {
    const fetchData = async () => {
      setIsLoadingData(true);
      setLoadError(null);

      try {
        const [
          langRes,
          usesRes,
          countriesRes,
          certRes,
          turnRes,
          delivRes,
          taxRes,
          docTypesRes,
          settingsRes,
        ] = await Promise.all([
          supabase
            .from("languages")
            .select(
              "id,name,native_name,code,multiplier,is_source_available,is_target_available",
            )
            .eq("is_active", true)
            .order("sort_order"),
          supabase
            .from("intended_uses")
            .select("id,name,description,default_certification_type_id")
            .eq("is_active", true)
            .order("name"),
          supabase
            .from("countries")
            .select("id,code,name,is_common")
            .eq("is_active", true)
            .order("is_common", { ascending: false })
            .order("name"),
          supabase
            .from("certification_types")
            .select("id,code,name,price")
            .eq("is_active", true)
            .order("sort_order"),
          supabase
            .from("turnaround_options")
            .select("id,code,name,multiplier,fee_type,fee_value,estimated_days")
            .eq("is_active", true)
            .order("sort_order"),
          supabase
            .from("delivery_options")
            .select("id,code,name,price")
            .eq("is_active", true)
            .eq("is_physical", true)
            .eq("category", "delivery"),
          supabase
            .from("tax_rates")
            .select("id,region_code,region_name,tax_name,rate")
            .eq("is_active", true)
            .order("region_name"),
          supabase
            .from("document_types")
            .select("id,code,name")
            .eq("is_active", true)
            .order("sort_order"),
          supabase
            .from("app_settings")
            .select("key,value")
            .in("key", ["base_rate", "words_per_page"]),
        ]);

        if (langRes.error) throw new Error("Failed to load languages");
        if (usesRes.error) throw new Error("Failed to load intended uses");
        if (countriesRes.error) throw new Error("Failed to load countries");
        if (certRes.error)
          throw new Error("Failed to load certification types");
        if (turnRes.error)
          throw new Error("Failed to load turnaround options");
        if (delivRes.error)
          throw new Error("Failed to load delivery options");
        if (taxRes.error) throw new Error("Failed to load tax rates");
        if (docTypesRes.error)
          throw new Error("Failed to load document types");

        setLanguages(langRes.data || []);
        setIntendedUses(usesRes.data || []);
        setCountries(countriesRes.data || []);
        setCertificationTypes(certRes.data || []);
        setTurnaroundOptions(turnRes.data || []);
        setDeliveryOptions(delivRes.data || []);
        setTaxRates(taxRes.data || []);
        setDocumentTypes(docTypesRes.data || []);

        // Parse app settings
        if (settingsRes.data) {
          for (const setting of settingsRes.data) {
            if (setting.key === "base_rate") {
              setBaseRate(parseFloat(setting.value) || 65.0);
            }
            if (setting.key === "words_per_page") {
              setWordsPerPage(parseInt(setting.value) || 225);
            }
          }
        }

        // Set default tax rate (Alberta)
        const abTax = (taxRes.data || []).find(
          (t: TaxRate) => t.region_code === "AB",
        );
        if (abTax) {
          setTaxRateId(abTax.id);
        }

        // Set default turnaround (Standard)
        const standardTurn = (turnRes.data || []).find(
          (t: TurnaroundOption) =>
            t.code === "standard" || t.name.toLowerCase().includes("standard"),
        );
        if (standardTurn) {
          setTurnaroundOptionId(standardTurn.id);
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to load form data";
        setLoadError(message);
        console.error("Failed to load data:", err);
      } finally {
        setIsLoadingData(false);
      }
    };

    fetchData();
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // CUSTOMER EMAIL LOOKUP
  // ═══════════════════════════════════════════════════════════════

  const handleEmailBlur = useCallback(async () => {
    if (!email.trim()) return;

    try {
      const { data: customer } = await supabase
        .from("customers")
        .select("id, full_name, phone, customer_type, company_name")
        .eq("email", email.trim().toLowerCase())
        .maybeSingle();

      if (customer) {
        setExistingCustomerId(customer.id);
        setExistingCustomerBanner(customer.full_name || "Unknown");
        if (customer.full_name) setFullName(customer.full_name);
        if (customer.phone) setPhone(customer.phone);
        if (customer.customer_type) setCustomerType(customer.customer_type);
        if (customer.company_name) setCompanyName(customer.company_name);
      } else {
        setExistingCustomerId(null);
        setExistingCustomerBanner("");
      }
    } catch {
      // Non-critical
    }
  }, [email]);

  // ═══════════════════════════════════════════════════════════════
  // INTENDED USE → default certification
  // ═══════════════════════════════════════════════════════════════

  const handleIntendedUseChange = useCallback(
    (useId: string) => {
      setIntendedUseId(useId);
      const use = intendedUses.find((u) => u.id === useId);
      if (use?.default_certification_type_id) {
        setDocuments((prev) =>
          prev.map((doc) => ({
            ...doc,
            certificationTypeId: use.default_certification_type_id!,
          })),
        );
      }
    },
    [intendedUses],
  );

  // ═══════════════════════════════════════════════════════════════
  // DOCUMENT MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  const addDocument = useCallback(() => {
    setDocuments((prev) => {
      const lastDoc = prev[prev.length - 1];
      return [
        ...prev,
        {
          id: generateId(),
          label: "",
          documentTypeId: "",
          pageCount: 1,
          wordCount: "",
          complexity: "easy",
          certificationTypeId: lastDoc?.certificationTypeId || "",
          expanded: true,
          files: [],
          billablePagesOverride: null,
          perPageRateOverride: null,
        },
      ];
    });
  }, []);

  const removeDocument = useCallback((docId: string) => {
    setDocuments((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((d) => d.id !== docId);
    });
  }, []);

  const updateDocument = useCallback(
    (docId: string, updates: Partial<DocumentRow>) => {
      setDocuments((prev) =>
        prev.map((d) => (d.id === docId ? { ...d, ...updates } : d)),
      );
    },
    [],
  );

  const addFileToDocument = useCallback((docId: string, files: FileList) => {
    const newFiles: FileAttachment[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
        toast.error(`"${file.name}" is not an accepted file type`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`"${file.name}" exceeds 25MB limit`);
        continue;
      }
      newFiles.push({ file, id: generateId() });
    }
    if (newFiles.length > 0) {
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === docId ? { ...d, files: [...d.files, ...newFiles] } : d,
        ),
      );
    }
  }, []);

  const removeFileFromDocument = useCallback(
    (docId: string, fileId: string) => {
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === docId
            ? { ...d, files: d.files.filter((f) => f.id !== fileId) }
            : d,
        ),
      );
    },
    [],
  );

  // ═══════════════════════════════════════════════════════════════
  // PRICING CALCULATIONS
  // ═══════════════════════════════════════════════════════════════

  const targetLanguage = useMemo(
    () => languages.find((l) => l.id === targetLanguageId),
    [languages, targetLanguageId],
  );

  const sourceLanguage = useMemo(
    () => languages.find((l) => l.id === sourceLanguageId),
    [languages, sourceLanguageId],
  );

  const selectedTaxRate = useMemo(
    () => taxRates.find((t) => t.id === taxRateId),
    [taxRates, taxRateId],
  );

  const selectedTurnaround = useMemo(
    () => turnaroundOptions.find((t) => t.id === turnaroundOptionId),
    [turnaroundOptions, turnaroundOptionId],
  );

  const selectedDelivery = useMemo(
    () => deliveryOptions.find((d) => d.id === deliveryOptionId),
    [deliveryOptions, deliveryOptionId],
  );

  const langMultiplier = targetLanguage?.multiplier ?? 1.0;

  const perPageRate = useMemo(() => {
    return Math.ceil((baseRate * langMultiplier) / 2.5) * 2.5;
  }, [baseRate, langMultiplier]);

  const documentPricing = useMemo(() => {
    return documents.map((doc) => {
      const complexityMult = getComplexityMultiplier(doc.complexity);
      const wc = parseInt(doc.wordCount) || 0;
      const pc = doc.pageCount || 1;

      let autoBillablePages: number;
      if (wc > 0) {
        const raw = (wc / wordsPerPage) * complexityMult;
        autoBillablePages = Math.ceil(raw * 10) / 10;
      } else {
        autoBillablePages = Math.ceil(pc * complexityMult * 10) / 10;
      }

      const billablePages = doc.billablePagesOverride ?? autoBillablePages;
      const docPerPageRate = doc.perPageRateOverride ?? perPageRate;

      const cert = certificationTypes.find(
        (c) => c.id === doc.certificationTypeId,
      );
      const certFee = cert?.price || 0;
      const translationCost = billablePages * docPerPageRate;
      const lineTotal = translationCost + certFee;

      return {
        docId: doc.id,
        label: doc.label,
        autoBillablePages,
        billablePages,
        autoPerPageRate: perPageRate,
        perPageRate: docPerPageRate,
        translationCost,
        certFee,
        lineTotal,
        complexityMult,
      };
    });
  }, [documents, perPageRate, wordsPerPage, certificationTypes]);

  const totals = useMemo(() => {
    const translationSubtotal = documentPricing.reduce(
      (sum, d) => sum + d.translationCost,
      0,
    );
    const certificationTotal = documentPricing.reduce(
      (sum, d) => sum + d.certFee,
      0,
    );
    const subtotalBeforeAdj = translationSubtotal + certificationTotal;

    // Rush fee
    let rushFee = 0;
    const isRush =
      selectedTurnaround &&
      selectedTurnaround.code !== "standard" &&
      selectedTurnaround.fee_value > 0;
    if (isRush && selectedTurnaround) {
      if (selectedTurnaround.fee_type === "percentage") {
        rushFee = subtotalBeforeAdj * (selectedTurnaround.fee_value / 100);
      } else {
        rushFee = selectedTurnaround.fee_value;
      }
    }

    // Delivery
    const deliveryFee = selectedDelivery?.price || 0;

    // Discount
    let discountAmount = 0;
    if (discountEnabled && parseFloat(discountValue)) {
      const dv = parseFloat(discountValue);
      if (discountType === "percentage") {
        discountAmount = subtotalBeforeAdj * (dv / 100);
      } else {
        discountAmount = dv;
      }
    }

    // Surcharge
    let surchargeAmount = 0;
    if (surchargeEnabled && parseFloat(surchargeValue)) {
      const sv = parseFloat(surchargeValue);
      if (surchargeType === "percentage") {
        surchargeAmount = subtotalBeforeAdj * (sv / 100);
      } else {
        surchargeAmount = sv;
      }
    }

    const subtotal =
      subtotalBeforeAdj +
      rushFee +
      deliveryFee -
      discountAmount +
      surchargeAmount;
    const taxRate = selectedTaxRate?.rate || 0;
    const taxAmount = subtotal * taxRate;
    const total = subtotal + taxAmount;

    return {
      translationSubtotal,
      certificationTotal,
      subtotalBeforeAdj,
      rushFee,
      isRush: !!isRush,
      deliveryFee,
      discountAmount,
      surchargeAmount,
      subtotal,
      taxRate,
      taxAmount,
      total,
    };
  }, [
    documentPricing,
    selectedTurnaround,
    selectedDelivery,
    selectedTaxRate,
    discountEnabled,
    discountType,
    discountValue,
    surchargeEnabled,
    surchargeType,
    surchargeValue,
  ]);

  // ═══════════════════════════════════════════════════════════════
  // VALIDATION
  // ═══════════════════════════════════════════════════════════════

  const validate = (): boolean => {
    const errs: ValidationErrors = {};

    if (!fullName.trim()) errs.fullName = "Full name is required";
    if (!email.trim() && !phone.trim())
      errs.email = "Email or phone is required";
    if (customerType === "business" && !companyName.trim())
      errs.companyName = "Company name is required for business";
    if (!taxRateId) errs.taxRateId = "Province/Tax Region is required";
    if (!sourceLanguageId)
      errs.sourceLanguageId = "Source language is required";
    if (!targetLanguageId)
      errs.targetLanguageId = "Target language is required";
    if (sourceLanguageId && targetLanguageId && sourceLanguageId === targetLanguageId)
      errs.targetLanguageId = "Target language must differ from source";
    if (!intendedUseId) errs.intendedUseId = "Intended use is required";

    documents.forEach((doc, i) => {
      if (!doc.label.trim())
        errs[`doc_${i}_label`] = "Document label is required";
      if (!doc.pageCount || doc.pageCount < 1)
        errs[`doc_${i}_pageCount`] = "Page count must be at least 1";
    });

    if (discountEnabled) {
      if (!parseFloat(discountValue))
        errs.discountValue = "Discount amount is required";
      if (!discountReason.trim())
        errs.discountReason = "Discount reason is required";
    }
    if (surchargeEnabled) {
      if (!parseFloat(surchargeValue))
        errs.surchargeValue = "Surcharge amount is required";
      if (!surchargeReason.trim())
        errs.surchargeReason = "Surcharge reason is required";
    }

    setErrors(errs);

    if (Object.keys(errs).length > 0) {
      // Scroll to first error
      const firstKey = Object.keys(errs)[0];
      const el = document.querySelector(`[data-field="${firstKey}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return false;
    }

    return true;
  };

  // ═══════════════════════════════════════════════════════════════
  // SUBMISSION
  // ═══════════════════════════════════════════════════════════════

  const handleSubmit = async () => {
    if (!validate()) return;
    if (!session?.staffId) {
      toast.error("You must be logged in to create a quote");
      return;
    }

    setIsSubmitting(true);

    try {
      // Build request body
      const requestBody = {
        staffId: session.staffId,
        customer: {
          existingCustomerId: existingCustomerId,
          fullName: fullName.trim(),
          email: email.trim().toLowerCase() || null,
          phone: phone.trim() || null,
          customerType,
          companyName:
            customerType === "business" ? companyName.trim() : null,
        },
        quote: {
          sourceLanguageId,
          targetLanguageId,
          intendedUseId: intendedUseId || null,
          countryOfIssue: countryOfIssue || null,
          specialInstructions: specialInstructions.trim() || null,
          taxRateId: taxRateId || null,
          taxRate: totals.taxRate,
          turnaroundOptionId: turnaroundOptionId || null,
          isRush: totals.isRush,
          rushFee: totals.rushFee,
          physicalDeliveryOptionId: deliveryOptionId || null,
          deliveryFee: totals.deliveryFee,
          entryPoint,
          manualQuoteNotes: internalNotes.trim() || null,
          isManualQuote: true,
        },
        documents: documents.map((doc, i) => {
          const pricing = documentPricing[i];
          const docType = documentTypes.find(
            (dt) => dt.id === doc.documentTypeId,
          );
          return {
            label: doc.label.trim(),
            documentType: docType?.code || null,
            pageCount: doc.pageCount,
            wordCount: parseInt(doc.wordCount) || 0,
            complexity: doc.complexity,
            complexityMultiplier: pricing.complexityMult,
            billablePages: pricing.billablePages,
            certificationTypeId: doc.certificationTypeId || null,
            certificationPrice: pricing.certFee,
            perPageRate: pricing.perPageRate,
            translationCost: pricing.translationCost,
            lineTotal: pricing.lineTotal,
          };
        }),
        pricing: {
          translationSubtotal: totals.translationSubtotal,
          certificationTotal: totals.certificationTotal,
          subtotal: totals.subtotal,
          discountType: discountEnabled ? discountType : null,
          discountValue: discountEnabled ? parseFloat(discountValue) || 0 : 0,
          discountAmount: totals.discountAmount,
          discountReason: discountEnabled ? discountReason : "",
          surchargeType: surchargeEnabled ? surchargeType : null,
          surchargeValue: surchargeEnabled
            ? parseFloat(surchargeValue) || 0
            : 0,
          surchargeAmount: totals.surchargeAmount,
          surchargeReason: surchargeEnabled ? surchargeReason : "",
          taxRate: totals.taxRate,
          taxAmount: totals.taxAmount,
          total: totals.total,
        },
      };

      // Call edge function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-fast-quote`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify(requestBody),
        },
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to create quote");
      }

      const { quoteId, quoteNumber } = result;

      // Upload files via edge function (service role bypasses RLS)
      const allFiles = documents.flatMap((doc, docIdx) =>
        doc.files.map((f) => ({ ...f, docIdx })),
      );

      if (allFiles.length > 0) {
        const uploadUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-staff-quote-file`;
        for (let i = 0; i < allFiles.length; i++) {
          setUploadProgress(`Uploading files ${i + 1}/${allFiles.length}...`);
          const fileItem = allFiles[i];
          try {
            const formData = new FormData();
            formData.append("file", fileItem.file);
            formData.append("quoteId", quoteId);
            formData.append("staffId", session.staffId);

            const uploadResp = await fetch(uploadUrl, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              },
              body: formData,
            });

            const uploadResult = await uploadResp.json();
            if (!uploadResp.ok || !uploadResult.success) {
              console.error("File upload error:", uploadResult.error);
              toast.error(`Failed to upload "${fileItem.file.name}": ${uploadResult.error}`);
            }
          } catch (err) {
            console.error("File upload error:", err);
          }
        }
        setUploadProgress("");
      }

      toast.success(`Quote ${quoteNumber} created successfully`);
      navigate(`/admin/quotes/${quoteId}`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to create quote";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
      setUploadProgress("");
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // RENDER — LOADING / ERROR
  // ═══════════════════════════════════════════════════════════════

  if (isLoadingData) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-4 bg-gray-200 rounded w-96" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-200 rounded-xl" />
              ))}
            </div>
            <div className="h-96 bg-gray-200 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
          <p className="text-red-700 font-medium">{loadError}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // HELPER: error class
  // ═══════════════════════════════════════════════════════════════

  const inputClass = (fieldName: string) =>
    `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors ${
      errors[fieldName]
        ? "border-red-400 focus:ring-red-400"
        : "border-gray-300 focus:ring-teal-500 focus:border-teal-500"
    }`;

  const fieldError = (fieldName: string) =>
    errors[fieldName] ? (
      <p className="mt-1 text-xs text-red-500">{errors[fieldName]}</p>
    ) : null;

  // ═══════════════════════════════════════════════════════════════
  // SOURCE / TARGET LANGUAGE OPTIONS
  // ═══════════════════════════════════════════════════════════════

  const sourceLanguageOptions = languages
    .filter((l) => l.is_source_available)
    .map((l) => ({
      value: l.id,
      label: `${l.name} (${l.native_name})`,
    }));

  const targetLanguageOptions = languages
    .filter((l) => l.is_target_available && l.id !== sourceLanguageId)
    .map((l) => ({
      value: l.id,
      label: `${l.name} (${l.native_name})`,
    }));

  const countryOptions = countries.map((c) => ({
    value: c.id,
    label: c.name,
    group: c.is_common ? "Common" : "All Countries",
  }));

  const taxRateOptions = taxRates.map((t) => ({
    value: t.id,
    label: `${t.region_name} — ${t.tax_name} (${(t.rate * 100).toFixed(0)}%)`,
  }));

  const intendedUseOptions = intendedUses.map((u) => ({
    value: u.id,
    label: u.name,
  }));

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/admin/quotes"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          Quotes
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Fast Quote
            </h1>
            <p className="text-sm text-gray-500">
              Create a priced quote manually — no OCR or AI processing
            </p>
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        {/* LEFT COLUMN — FORM */}
        <div className="space-y-6">
          {/* ──── SECTION 1: Customer Information ──── */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Customer Information
            </h2>

            {existingCustomerBanner && (
              <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                Existing customer found: {existingCustomerBanner}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div data-field="fullName">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={inputClass("fullName")}
                  placeholder="e.g. Maria Garcia"
                />
                {fieldError("fullName")}
              </div>

              <div data-field="email">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email{" "}
                  {!phone.trim() && (
                    <span className="text-red-500">*</span>
                  )}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={handleEmailBlur}
                  className={inputClass("email")}
                  placeholder="customer@example.com"
                />
                {fieldError("email")}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone{" "}
                  {!email.trim() && (
                    <span className="text-red-500">*</span>
                  )}
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputClass("phone")}
                  placeholder="+1 (XXX) XXX-XXXX"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer Type
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCustomerType("individual")}
                    className={`flex-1 px-3 py-2 text-sm border rounded-lg transition-colors ${
                      customerType === "individual"
                        ? "bg-teal-50 border-teal-300 text-teal-700 font-medium"
                        : "border-gray-300 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    Individual
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerType("business")}
                    className={`flex-1 px-3 py-2 text-sm border rounded-lg transition-colors ${
                      customerType === "business"
                        ? "bg-teal-50 border-teal-300 text-teal-700 font-medium"
                        : "border-gray-300 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    Business
                  </button>
                </div>
              </div>

              {customerType === "business" && (
                <div data-field="companyName">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Company Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className={inputClass("companyName")}
                    placeholder="Company name"
                  />
                  {fieldError("companyName")}
                </div>
              )}

              <div data-field="taxRateId">
                <SearchableSelect
                  label="Province / Tax Region"
                  required
                  options={taxRateOptions}
                  value={taxRateId}
                  onChange={setTaxRateId}
                  placeholder="Select tax region..."
                  error={errors.taxRateId}
                />
              </div>
            </div>
          </div>

          {/* ──── SECTION 2: Translation Details ──── */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Translation Details
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div data-field="sourceLanguageId">
                <SearchableSelect
                  label="Source Language"
                  required
                  options={sourceLanguageOptions}
                  value={sourceLanguageId}
                  onChange={setSourceLanguageId}
                  placeholder="Select source language..."
                  error={errors.sourceLanguageId}
                />
              </div>

              <div data-field="targetLanguageId">
                <SearchableSelect
                  label="Target Language"
                  required
                  options={targetLanguageOptions}
                  value={targetLanguageId}
                  onChange={setTargetLanguageId}
                  placeholder="Select target language..."
                  error={errors.targetLanguageId}
                />
              </div>

              <div data-field="intendedUseId">
                <SearchableSelect
                  label="Intended Use"
                  required
                  options={intendedUseOptions}
                  value={intendedUseId}
                  onChange={handleIntendedUseChange}
                  placeholder="Search intended use..."
                  error={errors.intendedUseId}
                />
              </div>

              <div>
                <SearchableSelect
                  label="Country of Issue"
                  options={countryOptions}
                  value={countryOfIssue}
                  onChange={setCountryOfIssue}
                  placeholder="Select country..."
                  groupOrder={["Common", "All Countries"]}
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Special Instructions
                </label>
                <textarea
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder="Optional instructions for this quote..."
                />
              </div>
            </div>
          </div>

          {/* ──── SECTION 3: Documents ──── */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Documents
              </h2>
              <button
                type="button"
                onClick={addDocument}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Document
              </button>
            </div>

            <div className="space-y-4">
              {documents.map((doc, idx) => {
                const pricing = documentPricing[idx];
                const cert = certificationTypes.find(
                  (c) => c.id === doc.certificationTypeId,
                );

                return (
                  <div
                    key={doc.id}
                    className="border border-gray-200 rounded-lg overflow-hidden"
                  >
                    {/* Document Header */}
                    <div
                      className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer"
                      onClick={() =>
                        updateDocument(doc.id, { expanded: !doc.expanded })
                      }
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-500">
                          Document {idx + 1}
                        </span>
                        <div
                          className="flex-1 min-w-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            value={doc.label}
                            onChange={(e) =>
                              updateDocument(doc.id, {
                                label: e.target.value,
                              })
                            }
                            className={`w-full px-2 py-1 text-sm border rounded ${
                              errors[`doc_${idx}_label`]
                                ? "border-red-400"
                                : "border-gray-300"
                            } focus:outline-none focus:ring-1 focus:ring-teal-500`}
                            placeholder="e.g. Birth Certificate - Maria"
                            data-field={`doc_${idx}_label`}
                          />
                        </div>
                        {pricing && (
                          <span className="text-sm font-semibold text-gray-700 tabular-nums whitespace-nowrap">
                            ${pricing.lineTotal.toFixed(2)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeDocument(doc.id);
                          }}
                          disabled={documents.length <= 1}
                          className="p-1.5 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title="Remove document"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        {doc.expanded ? (
                          <ChevronUp className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    </div>

                    {/* Document Body */}
                    {doc.expanded && (
                      <div className="px-4 py-4 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Left — Document Details */}
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                Document Type
                              </label>
                              <select
                                value={doc.documentTypeId}
                                onChange={(e) =>
                                  updateDocument(doc.id, {
                                    documentTypeId: e.target.value,
                                  })
                                }
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                              >
                                <option value="">Select type...</option>
                                {documentTypes.map((dt) => (
                                  <option key={dt.id} value={dt.id}>
                                    {dt.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div data-field={`doc_${idx}_pageCount`}>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Page Count{" "}
                                  <span className="text-red-500">*</span>
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  value={doc.pageCount}
                                  onChange={(e) =>
                                    updateDocument(doc.id, {
                                      pageCount:
                                        parseInt(e.target.value) || 1,
                                    })
                                  }
                                  className={inputClass(
                                    `doc_${idx}_pageCount`,
                                  )}
                                />
                                {fieldError(`doc_${idx}_pageCount`)}
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Word Count
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  value={doc.wordCount}
                                  onChange={(e) =>
                                    updateDocument(doc.id, {
                                      wordCount: e.target.value,
                                    })
                                  }
                                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                                  placeholder="Optional"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                Complexity{" "}
                                <span className="text-red-500">*</span>
                              </label>
                              <div className="flex gap-1">
                                {COMPLEXITY_OPTIONS.map((opt) => (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() =>
                                      updateDocument(doc.id, {
                                        complexity: opt.value,
                                      })
                                    }
                                    className={`flex-1 px-2 py-1.5 text-xs border rounded-lg transition-colors ${
                                      doc.complexity === opt.value
                                        ? "bg-teal-50 border-teal-300 text-teal-700 font-medium"
                                        : "border-gray-300 text-gray-600 hover:bg-gray-50"
                                    }`}
                                  >
                                    {opt.label}
                                    {doc.complexity === opt.value && (
                                      <span className="ml-1 text-teal-500">
                                        {opt.multiplier}x
                                      </span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Right — Pricing Details */}
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                Certification Type
                              </label>
                              <select
                                value={doc.certificationTypeId}
                                onChange={(e) =>
                                  updateDocument(doc.id, {
                                    certificationTypeId: e.target.value,
                                  })
                                }
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                              >
                                <option value="">None</option>
                                {certificationTypes.map((ct) => (
                                  <option key={ct.id} value={ct.id}>
                                    {ct.name} — ${ct.price.toFixed(2)}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">
                                  Cert. Fee
                                </label>
                                <div className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-700 tabular-nums">
                                  ${(cert?.price || 0).toFixed(2)}
                                </div>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">
                                  Per-Page Rate
                                </label>
                                <div className="relative flex items-center">
                                  <span className="absolute left-3 text-sm text-gray-500 pointer-events-none">$</span>
                                  <input
                                    type="number"
                                    min={0}
                                    step={2.5}
                                    value={doc.perPageRateOverride ?? pricing?.autoPerPageRate ?? ""}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      updateDocument(doc.id, {
                                        perPageRateOverride: val === "" ? null : parseFloat(val),
                                      });
                                    }}
                                    onBlur={(e) => {
                                      if (e.target.value === "") {
                                        updateDocument(doc.id, { perPageRateOverride: null });
                                      }
                                    }}
                                    className="w-full pl-7 pr-14 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 tabular-nums"
                                  />
                                  <span className="absolute right-3 text-sm text-gray-500 pointer-events-none">/ page</span>
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">
                                  Billable Pages
                                </label>
                                <input
                                  type="number"
                                  min={0.1}
                                  step={0.1}
                                  value={doc.billablePagesOverride ?? pricing?.autoBillablePages ?? ""}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    updateDocument(doc.id, {
                                      billablePagesOverride: val === "" ? null : parseFloat(val),
                                    });
                                  }}
                                  onBlur={(e) => {
                                    if (e.target.value === "") {
                                      updateDocument(doc.id, { billablePagesOverride: null });
                                    }
                                  }}
                                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 tabular-nums"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">
                                  Line Total
                                </label>
                                <div className="px-3 py-2 text-sm bg-teal-50 border border-teal-200 rounded-lg text-teal-700 font-semibold tabular-nums">
                                  ${pricing?.lineTotal.toFixed(2)}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* File Attachment */}
                        <div className="pt-3 border-t border-gray-100">
                          <label className="block text-xs font-medium text-gray-500 mb-2">
                            Attach source document (optional)
                          </label>
                          <div
                            className="border-2 border-dashed border-gray-200 rounded-lg p-3 text-center hover:border-gray-300 transition-colors cursor-pointer"
                            onClick={() =>
                              document
                                .getElementById(`file-input-${doc.id}`)
                                ?.click()
                            }
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (e.dataTransfer.files.length > 0) {
                                addFileToDocument(
                                  doc.id,
                                  e.dataTransfer.files,
                                );
                              }
                            }}
                          >
                            <input
                              id={`file-input-${doc.id}`}
                              type="file"
                              accept={ACCEPTED_FILE_TYPES}
                              multiple
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files && e.target.files.length > 0) {
                                  addFileToDocument(doc.id, e.target.files);
                                  e.target.value = "";
                                }
                              }}
                            />
                            <Upload className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                            <p className="text-xs text-gray-500">
                              Drop files here or click to browse
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              PDF, JPEG, PNG, GIF, WEBP, TIFF — max 25MB
                            </p>
                          </div>

                          {doc.files.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {doc.files.map((f) => (
                                <div
                                  key={f.id}
                                  className="flex items-center justify-between px-3 py-1.5 bg-gray-50 rounded text-sm"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    {f.file.type === "application/pdf" ? (
                                      <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />
                                    ) : (
                                      <ImageIcon className="w-4 h-4 text-blue-500 flex-shrink-0" />
                                    )}
                                    <span className="truncate text-gray-700">
                                      {f.file.name}
                                    </span>
                                    <span className="text-xs text-gray-400 flex-shrink-0">
                                      {(f.file.size / 1024).toFixed(0)} KB
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeFileFromDocument(doc.id, f.id)
                                    }
                                    className="p-1 text-gray-400 hover:text-red-500"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addDocument}
              className="mt-4 w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg hover:text-gray-700 hover:border-gray-400 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Document
            </button>
          </div>

          {/* ──── SECTION 4: Pricing & Delivery ──── */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Pricing & Delivery
            </h2>

            {/* Turnaround */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Turnaround <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {turnaroundOptions.map((opt) => {
                  const isSelected = turnaroundOptionId === opt.id;
                  const feeLabel =
                    opt.fee_value > 0
                      ? opt.fee_type === "percentage"
                        ? `+${opt.fee_value}%`
                        : `+$${opt.fee_value.toFixed(2)}`
                      : "No extra fee";

                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTurnaroundOptionId(opt.id)}
                      className={`text-left px-4 py-3 border rounded-lg transition-all ${
                        isSelected
                          ? "bg-teal-50 border-teal-300 ring-2 ring-teal-200"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <p
                        className={`text-sm font-medium ${isSelected ? "text-teal-700" : "text-gray-800"}`}
                      >
                        {opt.name}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        ~{opt.estimated_days} day
                        {opt.estimated_days !== 1 ? "s" : ""}
                      </p>
                      <p
                        className={`text-xs mt-1 ${
                          opt.fee_value > 0
                            ? "text-amber-600 font-medium"
                            : "text-gray-400"
                        }`}
                      >
                        {feeLabel}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Physical Delivery */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Physical Delivery
              </label>
              <select
                value={deliveryOptionId}
                onChange={(e) => setDeliveryOptionId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">None — digital delivery only</option>
                {deliveryOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name} — ${opt.price.toFixed(2)}
                  </option>
                ))}
              </select>
            </div>

            {/* Discount */}
            <div className="mb-4 border-t border-gray-100 pt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={discountEnabled}
                  onChange={(e) => setDiscountEnabled(e.target.checked)}
                  className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  Apply Discount
                </span>
              </label>

              {discountEnabled && (
                <div className="mt-3 pl-6 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Type
                    </label>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setDiscountType("percentage")}
                        className={`flex-1 px-2 py-1.5 text-xs border rounded-lg ${
                          discountType === "percentage"
                            ? "bg-teal-50 border-teal-300 text-teal-700"
                            : "border-gray-300 text-gray-600"
                        }`}
                      >
                        Percentage %
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiscountType("fixed")}
                        className={`flex-1 px-2 py-1.5 text-xs border rounded-lg ${
                          discountType === "fixed"
                            ? "bg-teal-50 border-teal-300 text-teal-700"
                            : "border-gray-300 text-gray-600"
                        }`}
                      >
                        Fixed $
                      </button>
                    </div>
                  </div>
                  <div data-field="discountValue">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Amount
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      className={inputClass("discountValue")}
                      placeholder={discountType === "percentage" ? "%" : "$"}
                    />
                    {fieldError("discountValue")}
                    {totals.discountAmount > 0 && (
                      <p className="text-xs text-green-600 mt-1">
                        - ${totals.discountAmount.toFixed(2)}
                      </p>
                    )}
                  </div>
                  <div data-field="discountReason">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Reason <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={discountReason}
                      onChange={(e) => setDiscountReason(e.target.value)}
                      className={inputClass("discountReason")}
                      placeholder="Reason for discount"
                    />
                    {fieldError("discountReason")}
                  </div>
                </div>
              )}
            </div>

            {/* Surcharge */}
            <div className="border-t border-gray-100 pt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={surchargeEnabled}
                  onChange={(e) => setSurchargeEnabled(e.target.checked)}
                  className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  Apply Surcharge
                </span>
              </label>

              {surchargeEnabled && (
                <div className="mt-3 pl-6 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Type
                    </label>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setSurchargeType("percentage")}
                        className={`flex-1 px-2 py-1.5 text-xs border rounded-lg ${
                          surchargeType === "percentage"
                            ? "bg-teal-50 border-teal-300 text-teal-700"
                            : "border-gray-300 text-gray-600"
                        }`}
                      >
                        Percentage %
                      </button>
                      <button
                        type="button"
                        onClick={() => setSurchargeType("fixed")}
                        className={`flex-1 px-2 py-1.5 text-xs border rounded-lg ${
                          surchargeType === "fixed"
                            ? "bg-teal-50 border-teal-300 text-teal-700"
                            : "border-gray-300 text-gray-600"
                        }`}
                      >
                        Fixed $
                      </button>
                    </div>
                  </div>
                  <div data-field="surchargeValue">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Amount
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={surchargeValue}
                      onChange={(e) => setSurchargeValue(e.target.value)}
                      className={inputClass("surchargeValue")}
                      placeholder={surchargeType === "percentage" ? "%" : "$"}
                    />
                    {fieldError("surchargeValue")}
                    {totals.surchargeAmount > 0 && (
                      <p className="text-xs text-amber-600 mt-1">
                        + ${totals.surchargeAmount.toFixed(2)}
                      </p>
                    )}
                  </div>
                  <div data-field="surchargeReason">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Reason <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={surchargeReason}
                      onChange={(e) => setSurchargeReason(e.target.value)}
                      className={inputClass("surchargeReason")}
                      placeholder="Reason for surcharge"
                    />
                    {fieldError("surchargeReason")}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ──── SECTION 5: Quote Settings ──── */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Quote Settings
            </h2>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Entry Point
              </label>
              <div className="flex flex-wrap gap-2">
                {ENTRY_POINT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setEntryPoint(opt.value)}
                    className={`px-3 py-1.5 text-sm border rounded-lg transition-colors ${
                      entryPoint === opt.value
                        ? "bg-teal-50 border-teal-300 text-teal-700 font-medium"
                        : "border-gray-300 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Internal Notes
              </label>
              <textarea
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                placeholder="Internal context — not visible to customer"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 text-base font-medium text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {uploadProgress || "Creating Quote..."}
              </>
            ) : (
              <>
                Create Quote
                <span className="ml-1">&rarr;</span>
              </>
            )}
          </button>
        </div>

        {/* RIGHT COLUMN — PRICE SUMMARY (STICKY) */}
        <div className="lg:self-start lg:sticky lg:top-6">
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 bg-gray-50 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                Price Summary
              </h3>
            </div>

            <div className="px-5 py-4 space-y-3">
              {/* Per-document breakdown */}
              {documentPricing.map((dp, idx) => (
                <div
                  key={documents[idx]?.id || idx}
                  className="pb-3 border-b border-gray-100 last:border-0"
                >
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {dp.label || `Document ${idx + 1}`}
                  </p>
                  <div className="mt-1 text-xs text-gray-500 space-y-0.5">
                    <div className="flex justify-between">
                      <span>
                        {dp.billablePages.toFixed(1)} pages x $
                        {dp.perPageRate.toFixed(2)}
                      </span>
                      <span className="tabular-nums">
                        ${dp.translationCost.toFixed(2)}
                      </span>
                    </div>
                    {dp.certFee > 0 && (
                      <div className="flex justify-between">
                        <span>+ Certification</span>
                        <span className="tabular-nums">
                          ${dp.certFee.toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between font-medium text-gray-700">
                      <span>Line Total</span>
                      <span className="tabular-nums">
                        ${dp.lineTotal.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {/* Totals section */}
              <div className="pt-2 space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Translation Subtotal</span>
                  <span className="tabular-nums">
                    ${totals.translationSubtotal.toFixed(2)}
                  </span>
                </div>

                {totals.certificationTotal > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Certification Total</span>
                    <span className="tabular-nums">
                      ${totals.certificationTotal.toFixed(2)}
                    </span>
                  </div>
                )}

                {totals.isRush && totals.rushFee > 0 && (
                  <div className="flex justify-between text-amber-600">
                    <span>
                      Rush Fee
                      {selectedTurnaround?.fee_type === "percentage" &&
                        ` (${selectedTurnaround.fee_value}%)`}
                    </span>
                    <span className="tabular-nums">
                      +${totals.rushFee.toFixed(2)}
                    </span>
                  </div>
                )}

                {totals.deliveryFee > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Delivery Fee</span>
                    <span className="tabular-nums">
                      +${totals.deliveryFee.toFixed(2)}
                    </span>
                  </div>
                )}

                {totals.discountAmount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>
                      Discount
                      {discountType === "percentage" &&
                        ` (${discountValue}%)`}
                    </span>
                    <span className="tabular-nums">
                      -${totals.discountAmount.toFixed(2)}
                    </span>
                  </div>
                )}

                {totals.surchargeAmount > 0 && (
                  <div className="flex justify-between text-amber-600">
                    <span>
                      Surcharge
                      {surchargeType === "percentage" &&
                        ` (${surchargeValue}%)`}
                    </span>
                    <span className="tabular-nums">
                      +${totals.surchargeAmount.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>

              {/* Subtotal + Tax */}
              <div className="pt-3 border-t border-gray-200 space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-700">
                  <span>Subtotal</span>
                  <span className="font-medium tabular-nums">
                    ${totals.subtotal.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>
                    {selectedTaxRate
                      ? `${selectedTaxRate.tax_name} (${(selectedTaxRate.rate * 100).toFixed(0)}%)`
                      : "Tax"}
                  </span>
                  <span className="tabular-nums">
                    ${totals.taxAmount.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Grand Total */}
              <div className="pt-3 border-t-2 border-gray-300">
                <div className="flex justify-between items-center">
                  <span className="text-base font-bold text-gray-900">
                    TOTAL
                  </span>
                  <span className="text-xl font-bold text-gray-900 tabular-nums">
                    ${totals.total.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Rate info */}
              {sourceLanguage && targetLanguage && (
                <p className="text-xs text-gray-400 pt-2">
                  Rates based on {sourceLanguage.name} &rarr;{" "}
                  {targetLanguage.name} (multiplier: {langMultiplier}x)
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
