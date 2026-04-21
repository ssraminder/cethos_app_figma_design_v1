// AdminCreateOrder.tsx
//
// Non-certified project entry point: Quote OR Direct Order modes.
// Certified translations continue through FastQuoteCreate.
//
// Quote mode         → calls create-fast-quote (pay-link flow)
// Direct Order mode  → calls admin-create-order (AR customers only, invoice on delivery)

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAdminAuthContext } from "../../context/AdminAuthContext";
import { toast } from "sonner";
import SearchableSelect from "@/components/ui/SearchableSelect";
import CustomerSearch, { CustomerHit } from "@/components/shared/CustomerSearch";
import { ArrowLeft, Plus, Trash2, Loader2, AlertCircle, Briefcase, Zap } from "lucide-react";

// ═════════════════════════════════════════════════════════════════
// TYPES
// ═════════════════════════════════════════════════════════════════

type Mode = "quote" | "direct_order";
type CalcUnit = "per_page" | "per_word" | "per_hour" | "per_minute" | "flat";

interface ServiceRow {
  id: string;
  code: string;
  name: string;
  category: string;
  default_calculation_units: string[];
  customer_facing: boolean;
  is_active: boolean;
  sort_order: number;
}

interface LanguageRow {
  id: string;
  name: string;
  code: string;
  is_source_available: boolean;
  is_target_available: boolean;
}

interface ARCustomer {
  id: string;
  full_name: string | null;
  email: string | null;
  company_name: string | null;
  customer_type: string | null;
  is_ar_customer: boolean;
  payment_terms: string | null;
  currency: string | null;
  default_tax_rate_id: string | null;
  invoicing_branch_id: number | null;
  requires_po: boolean | null;
  requires_client_project_number: boolean | null;
}

interface BranchRow {
  id: number;
  code: string;
  legal_name: string | null;
  is_default: boolean;
  is_active: boolean;
}

interface TaxRateRow {
  id: string;
  region_code: string | null;
  region_name: string | null;
  tax_name: string | null;
  rate: number;
  is_active: boolean;
}

interface WorkflowTemplateRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  service_id: string | null;
  is_default: boolean;
  is_active: boolean;
  step_count?: number;
}

interface LineItem {
  id: string;
  description: string;
  calculationUnit: CalcUnit;
  unitQuantity: string;
  baseRate: string;
}

const UNIT_LABELS: Record<CalcUnit, string> = {
  per_page: "Per page",
  per_word: "Per word",
  per_hour: "Per hour",
  per_minute: "Per minute",
  flat: "Flat fee",
};

const nextId = () => `li-${Math.random().toString(36).slice(2, 10)}`;

const newLine = (unit: CalcUnit = "per_word"): LineItem => ({
  id: nextId(),
  description: "",
  calculationUnit: unit,
  unitQuantity: "",
  baseRate: "",
});

const num = (v: string): number => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

// ═════════════════════════════════════════════════════════════════
// COMPONENT
// ═════════════════════════════════════════════════════════════════

export default function AdminCreateOrder() {
  const navigate = useNavigate();
  const { session } = useAdminAuthContext();

  const [mode, setMode] = useState<Mode>("quote");

  // ── Reference data ──
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [languages, setLanguages] = useState<LanguageRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRateRow[]>([]);
  const [workflowTemplates, setWorkflowTemplates] = useState<WorkflowTemplateRow[]>([]);
  const [workflowTemplateCode, setWorkflowTemplateCode] = useState<string>("");
  const [loadingRefs, setLoadingRefs] = useState(true);

  // ── Form state ──
  const [customer, setCustomer] = useState<ARCustomer | null>(null);
  const [serviceId, setServiceId] = useState<string>("");
  const [sourceLanguageId, setSourceLanguageId] = useState<string>("");
  const [targetLanguageId, setTargetLanguageId] = useState<string>("");
  const [lineItems, setLineItems] = useState<LineItem[]>([newLine()]);

  const [rushFee, setRushFee] = useState<string>("");
  const [deliveryFee, setDeliveryFee] = useState<string>("");
  const [taxRate, setTaxRate] = useState<string>("0.05");
  const [selectedTaxRateId, setSelectedTaxRateId] = useState<string>("");
  const [specialInstructions, setSpecialInstructions] = useState<string>("");
  const [promisedDeliveryDate, setPromisedDeliveryDate] = useState<string>("");
  const [currency, setCurrency] = useState<string>("CAD");
  const [branchId, setBranchId] = useState<number | null>(null);
  const [poNumber, setPoNumber] = useState<string>("");
  const [clientProjectNumber, setClientProjectNumber] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  // ── New-customer inline form ──
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newCustomerType, setNewCustomerType] = useState<string>("business");
  const [newIsAR, setNewIsAR] = useState(false);
  const [newPaymentTerms, setNewPaymentTerms] = useState<string>("net_30");
  const [newCurrency, setNewCurrency] = useState<string>("CAD");
  const [newTaxRateId, setNewTaxRateId] = useState<string>("");
  const [newBranchId, setNewBranchId] = useState<number | null>(null);
  const [savingCustomer, setSavingCustomer] = useState(false);

  // ── Company autocomplete (companies table is the source of truth for
  //    shared currency/tax/branch/terms across employees of the same biz) ──
  interface CompanyRow {
    id: string;
    name: string;
    currency: string | null;
    default_tax_rate_id: string | null;
    invoicing_branch_id: number | null;
    payment_terms: string | null;
    is_ar_customer: boolean | null;
  }
  const [companySuggestions, setCompanySuggestions] = useState<CompanyRow[]>([]);
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const [linkedCompanyId, setLinkedCompanyId] = useState<string | null>(null);
  const companyDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    const q = newCompany.trim();
    if (companyDebounceRef.current) window.clearTimeout(companyDebounceRef.current);
    if (q.length < 2) {
      setCompanySuggestions([]);
      return;
    }
    companyDebounceRef.current = window.setTimeout(async () => {
      const esc = q.replace(/[,%]/g, "");
      const { data } = await supabase
        .from("companies")
        .select(
          "id, name, currency, default_tax_rate_id, invoicing_branch_id, payment_terms, is_ar_customer",
        )
        .ilike("name", `%${esc}%`)
        .limit(8);
      setCompanySuggestions((data as CompanyRow[]) || []);
    }, 200);
    return () => {
      if (companyDebounceRef.current) window.clearTimeout(companyDebounceRef.current);
    };
  }, [newCompany]);

  // Apply a picked company's shared settings into the new-customer form.
  const applyCompanyDefaults = (c: CompanyRow) => {
    setNewCompany(c.name);
    setLinkedCompanyId(c.id);
    if (c.currency) setNewCurrency(c.currency);
    if (c.default_tax_rate_id) setNewTaxRateId(c.default_tax_rate_id);
    if (c.invoicing_branch_id !== null && c.invoicing_branch_id !== undefined) {
      setNewBranchId(c.invoicing_branch_id);
    }
    if (c.payment_terms) setNewPaymentTerms(c.payment_terms);
    if (c.is_ar_customer !== null && c.is_ar_customer !== undefined) {
      setNewIsAR(!!c.is_ar_customer);
    }
  };

  // ── Load reference data once ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [svcRes, langRes, brRes, taxRes, tmplRes] = await Promise.all([
        supabase
          .from("services")
          .select(
            "id, code, name, category, default_calculation_units, customer_facing, is_active, sort_order",
          )
          .eq("is_active", true)
          .order("category")
          .order("sort_order"),
        supabase
          .from("languages")
          .select("id, name, code, is_source_available, is_target_available")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("branches")
          .select("id, code, legal_name, is_default, is_active")
          .eq("is_active", true)
          .order("id"),
        supabase
          .from("tax_rates")
          .select("id, region_code, region_name, tax_name, rate, is_active")
          .eq("is_active", true)
          .order("region_name"),
        supabase
          .from("workflow_templates")
          .select("id, code, name, description, service_id, is_default, is_active")
          .eq("is_active", true)
          .order("name"),
      ]);
      if (cancelled) return;
      setServices((svcRes.data as ServiceRow[]) ?? []);
      setLanguages((langRes.data as LanguageRow[]) ?? []);
      const br = (brRes.data as BranchRow[]) ?? [];
      setBranches(br);
      // Default branch = the one flagged is_default; else the first active
      const def = br.find((b) => b.is_default) || br[0] || null;
      if (def) setBranchId(def.id);
      setTaxRates((taxRes.data as TaxRateRow[]) ?? []);
      const templates = (tmplRes.data as WorkflowTemplateRow[]) ?? [];
      // Enrich with step count
      if (templates.length > 0) {
        const { data: stepCounts } = await supabase
          .from("workflow_template_steps")
          .select("template_id")
          .in(
            "template_id",
            templates.map((t) => t.id),
          );
        const countMap: Record<string, number> = {};
        for (const row of stepCounts || []) {
          countMap[(row as any).template_id] =
            (countMap[(row as any).template_id] || 0) + 1;
        }
        for (const t of templates) t.step_count = countMap[t.id] || 0;
      }
      setWorkflowTemplates(templates);
      setLoadingRefs(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Derived ──
  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId) || null,
    [serviceId, services],
  );

  const allowedUnits: CalcUnit[] = useMemo(() => {
    const defaults = (selectedService?.default_calculation_units ?? [
      "per_page",
      "per_word",
      "per_hour",
      "per_minute",
      "flat",
    ]) as string[];
    // Always allow flat as an override
    const set = new Set<CalcUnit>([...defaults as CalcUnit[], "flat"]);
    return Array.from(set);
  }, [selectedService]);

  const totals = useMemo(() => {
    const lineTotals = lineItems.map((li) => {
      const qty = li.calculationUnit === "flat" ? 1 : num(li.unitQuantity);
      const rate = num(li.baseRate);
      return Math.round(qty * rate * 100) / 100;
    });
    const subtotal = Math.round(lineTotals.reduce((a, b) => a + b, 0) * 100) / 100;
    const rush = num(rushFee);
    const delivery = num(deliveryFee);
    const rate = num(taxRate);
    const preTax = subtotal + rush + delivery;
    const tax = Math.round(preTax * rate * 100) / 100;
    const total = Math.round((preTax + tax) * 100) / 100;
    return { lineTotals, subtotal, rush, delivery, rate, tax, total };
  }, [lineItems, rushFee, deliveryFee, taxRate]);

  // ── New customer: when Direct Order is active, default to AR-approved ──
  useEffect(() => {
    if (mode === "direct_order" && creatingCustomer && !newIsAR) {
      setNewIsAR(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, creatingCustomer]);

  const handleCreateCustomer = async () => {
    const name = newFullName.trim();
    const email = newEmail.trim().toLowerCase();
    const phone = newPhone.trim();
    if (!name) {
      toast.error("Full name is required");
      return;
    }
    if (!email && !phone) {
      toast.error("Email or phone is required");
      return;
    }
    setSavingCustomer(true);
    try {
      // For business types, find-or-create a company row so currency/tax/
      // branch/terms are stored once and shared across employees.
      let companyId: string | null = null;
      const isBusiness =
        newCustomerType !== "individual" && newCompany.trim().length > 0;
      if (isBusiness) {
        if (linkedCompanyId) {
          companyId = linkedCompanyId;
          // Keep the company row in sync if the user tweaked AR/terms inline.
          await supabase
            .from("companies")
            .update({
              currency: newCurrency,
              default_tax_rate_id: newTaxRateId || null,
              invoicing_branch_id: newBranchId ?? branchId,
              payment_terms: newIsAR ? newPaymentTerms : "immediate",
              is_ar_customer: newIsAR,
            })
            .eq("id", linkedCompanyId);
        } else {
          // Try to find an existing company by case-insensitive name first
          // (the autocomplete may not have surfaced it).
          const { data: existing } = await supabase
            .from("companies")
            .select("id")
            .ilike("name", newCompany.trim())
            .maybeSingle();
          if (existing?.id) {
            companyId = existing.id;
          } else {
            const { data: created, error: coErr } = await supabase
              .from("companies")
              .insert({
                name: newCompany.trim(),
                currency: newCurrency,
                default_tax_rate_id: newTaxRateId || null,
                invoicing_branch_id: newBranchId ?? branchId,
                payment_terms: newIsAR ? newPaymentTerms : "immediate",
                is_ar_customer: newIsAR,
              })
              .select("id")
              .single();
            if (coErr || !created) {
              throw new Error(
                coErr?.message || "Failed to create company record",
              );
            }
            companyId = created.id;
          }
        }
      }

      const { data, error } = await supabase
        .from("customers")
        .insert({
          full_name: name,
          email: email || null,
          phone: phone || null,
          customer_type: newCustomerType,
          company_name:
            newCustomerType !== "individual" ? newCompany.trim() || null : null,
          company_id: companyId,
          is_ar_customer: newIsAR,
          payment_terms: newIsAR ? newPaymentTerms : "immediate",
          currency: newCurrency,
          default_tax_rate_id: newTaxRateId || null,
          invoicing_branch_id: newBranchId ?? branchId,
        })
        .select(
          "id, full_name, email, company_name, customer_type, is_ar_customer, payment_terms, currency, default_tax_rate_id, invoicing_branch_id, requires_po, requires_client_project_number",
        )
        .single();
      if (error || !data) {
        throw new Error(error?.message || "Failed to create customer");
      }
      const c = data as ARCustomer;
      setCustomer(c);
      inheritFromCustomer(c);
      setCreatingCustomer(false);
      setLinkedCompanyId(null);
      // Reset fields
      setNewFullName("");
      setNewEmail("");
      setNewPhone("");
      setNewCompany("");
      toast.success(`Customer ${data.full_name || data.email} created`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to create customer");
    } finally {
      setSavingCustomer(false);
    }
  };

  // Helper: inherit per-customer defaults onto the project form
  const inheritFromCustomer = (c: ARCustomer) => {
    if (c.currency) setCurrency(c.currency);
    if (c.invoicing_branch_id) setBranchId(c.invoicing_branch_id);
    if (c.default_tax_rate_id) {
      setSelectedTaxRateId(c.default_tax_rate_id);
      const tr = taxRates.find((t) => t.id === c.default_tax_rate_id);
      if (tr) setTaxRate(String(tr.rate));
    } else if (c.currency && c.currency !== "CAD") {
      // Non-CAD customer with no configured tax rate → start at 0 instead
      // of the CAD GST default. Admin can still type a rate in manually.
      setSelectedTaxRateId("");
      setTaxRate("0");
    }
  };

  // When the user flips currency to non-CAD and hasn't picked a specific
  // tax rate, reset to 0 — CAD GST shouldn't land on a USD/EUR invoice.
  useEffect(() => {
    if (currency !== "CAD" && !selectedTaxRateId) {
      setTaxRate("0");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency]);

  // ── Customer selection ──
  const handleCustomerSelect = async (hit: CustomerHit) => {
    const { data, error } = await supabase
      .from("customers")
      .select(
        "id, full_name, email, company_name, customer_type, is_ar_customer, payment_terms, currency, default_tax_rate_id, invoicing_branch_id, requires_po, requires_client_project_number",
      )
      .eq("id", hit.id)
      .maybeSingle();
    if (error || !data) {
      toast.error("Failed to load customer");
      return;
    }
    const c = data as ARCustomer;
    setCustomer(c);
    inheritFromCustomer(c);
  };

  const customerLabel = customer
    ? customer.company_name || customer.full_name || customer.email || customer.id
    : undefined;

  const canDirectOrder = !!customer?.is_ar_customer;

  // ── Line-item handlers ──
  const addLine = () =>
    setLineItems((prev) => [...prev, newLine(allowedUnits[0] ?? "per_word")]);
  const removeLine = (id: string) =>
    setLineItems((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== id)));
  const updateLine = (id: string, patch: Partial<LineItem>) =>
    setLineItems((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  // When service changes, snap any out-of-range units onto the first allowed unit
  useEffect(() => {
    if (!selectedService) return;
    setLineItems((prev) =>
      prev.map((l) =>
        allowedUnits.includes(l.calculationUnit)
          ? l
          : { ...l, calculationUnit: allowedUnits[0] ?? "per_word" },
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  // When service changes, auto-pick the matching default workflow template
  useEffect(() => {
    if (!serviceId || workflowTemplates.length === 0) return;
    const forService = workflowTemplates.filter(
      (t) => t.service_id === serviceId,
    );
    const pick =
      forService.find((t) => t.is_default) ||
      forService[0] ||
      workflowTemplates.find((t) => t.is_default) ||
      null;
    if (pick && !workflowTemplateCode) setWorkflowTemplateCode(pick.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId, workflowTemplates]);

  // Templates to display in the dropdown: service-matched first, then others
  const workflowTemplateOptions = useMemo(() => {
    const matching = workflowTemplates.filter(
      (t) => t.service_id === serviceId,
    );
    const other = workflowTemplates.filter((t) => t.service_id !== serviceId);
    return [
      ...matching.map((t) => ({ ...t, group: "Matches service" })),
      ...other.map((t) => ({ ...t, group: "Other templates" })),
    ];
  }, [workflowTemplates, serviceId]);

  // ── Validation ──
  const validate = (): string | null => {
    if (!customer) return "Pick a customer";
    if (!serviceId) return "Pick a service";
    if (!sourceLanguageId) return "Pick a source language";
    if (!targetLanguageId) return "Pick a target language";
    if (!branchId) return "Pick an invoicing branch";
    if (mode === "direct_order" && !customer.is_ar_customer) {
      return "Direct orders require an AR-approved customer";
    }
    if (customer.requires_po && !poNumber.trim()) {
      return `${customer.full_name || "Customer"} requires a PO number`;
    }
    if (
      customer.requires_client_project_number &&
      !clientProjectNumber.trim()
    ) {
      return `${customer.full_name || "Customer"} requires a client project number`;
    }
    for (const li of lineItems) {
      if (!li.description.trim()) return "Every line item needs a description";
      const qty = li.calculationUnit === "flat" ? 1 : num(li.unitQuantity);
      if (qty <= 0) return "Every line item needs a positive quantity";
      if (num(li.baseRate) <= 0) return "Every line item needs a positive rate";
    }
    return null;
  };

  // Warn (non-blocking) if PO / project # are blank and the customer doesn't
  // strictly require them. Returns false if the user cancelled.
  const confirmMissingReferences = (): boolean => {
    if (!customer) return true;
    const missing: string[] = [];
    if (!customer.requires_po && !poNumber.trim()) missing.push("PO number");
    if (
      !customer.requires_client_project_number &&
      !clientProjectNumber.trim()
    ) {
      missing.push("Client project number");
    }
    if (missing.length === 0) return true;
    return window.confirm(
      `No ${missing.join(" or ")} entered. These are recommended for AR reconciliation. Continue anyway?`,
    );
  };

  // Upload attached files into quote_files after the quote has been created.
  const uploadAttachedFiles = async (quoteId: string) => {
    if (files.length === 0) return;
    setUploadingFiles(true);
    try {
      for (const f of files) {
        const safeName = f.name.replace(/[^A-Za-z0-9._-]/g, "_");
        const storagePath = `quote/${quoteId}/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("quote-files")
          .upload(storagePath, f, {
            contentType: f.type || "application/octet-stream",
            upsert: false,
          });
        if (upErr) {
          console.error("File upload failed:", upErr.message);
          continue;
        }
        await supabase.from("quote_files").insert({
          quote_id: quoteId,
          original_filename: f.name,
          storage_path: storagePath,
          file_size: f.size,
          mime_type: f.type || "application/octet-stream",
          upload_status: "uploaded",
          is_staff_created: true,
        });
      }
    } finally {
      setUploadingFiles(false);
    }
  };

  // ── Submit ──
  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    if (!session?.staffId) {
      toast.error("You must be logged in");
      return;
    }
    if (!confirmMissingReferences()) return;

    setSubmitting(true);
    try {
      const documents = lineItems.map((li) => {
        const qty = li.calculationUnit === "flat" ? 1 : num(li.unitQuantity);
        const rate = num(li.baseRate);
        return {
          label: li.description.trim(),
          calculationUnit: li.calculationUnit,
          unitQuantity: qty,
          baseRate: rate,
          lineTotal: Math.round(qty * rate * 100) / 100,
        };
      });

      const pricing = {
        subtotal: totals.subtotal,
        certificationTotal: 0,
        rushFee: totals.rush,
        deliveryFee: totals.delivery,
        taxRate: totals.rate,
        taxAmount: totals.tax,
        total: totals.total,
        currency,
      };

      if (mode === "quote") {
        // create-fast-quote body
        const body = {
          staffId: session.staffId,
          customer: {
            existingCustomerId: customer!.id,
            fullName: customer!.full_name || customer!.company_name || "",
            email: customer!.email,
            customerType: customer!.customer_type,
            companyName: customer!.company_name,
          },
          quote: {
            serviceId,
            sourceLanguageId,
            targetLanguageId,
            specialInstructions: specialInstructions.trim() || null,
            taxRate: totals.rate,
            taxRateId: selectedTaxRateId || null,
            rushFee: totals.rush,
            deliveryFee: totals.delivery,
            isRush: totals.rush > 0,
            promisedDeliveryDate: promisedDeliveryDate || null,
            entryPoint: "admin_non_certified",
            manualQuoteNotes: specialInstructions.trim() || null,
            currency,
            invoicingBranchId: branchId,
            poNumber: poNumber.trim() || null,
            clientProjectNumber: clientProjectNumber.trim() || null,
          },
          documents,
          pricing,
        };
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-fast-quote`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify(body),
          },
        );
        const data = await res.json();
        if (!data?.success) {
          throw new Error(data?.error || "Quote creation failed");
        }
        await uploadAttachedFiles(data.quoteId);
        toast.success(`Quote ${data.quoteNumber} created`);
        navigate(`/admin/quotes/${data.quoteId}`);
        return;
      }

      // Direct order mode
      const body = {
        staffId: session.staffId,
        customer: { existingCustomerId: customer!.id },
        order: {
          serviceId,
          sourceLanguageId,
          targetLanguageId,
          specialInstructions: specialInstructions.trim() || null,
          promisedDeliveryDate: promisedDeliveryDate || null,
          isRush: totals.rush > 0,
          notes: specialInstructions.trim() || null,
          taxRateId: selectedTaxRateId || null,
          currency,
          invoicingBranchId: branchId,
          poNumber: poNumber.trim() || null,
          clientProjectNumber: clientProjectNumber.trim() || null,
          workflowTemplateCode: workflowTemplateCode || null,
        },
        documents,
        pricing,
      };
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-order`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json();
      if (!data?.success) {
        throw new Error(data?.error || "Direct order creation failed");
      }
      if (data.quoteId) await uploadAttachedFiles(data.quoteId);
      toast.success(`Order ${data.orderNumber} created`);
      navigate(`/admin/orders/${data.orderId}`);
    } catch (e: any) {
      toast.error(e?.message || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  // ═════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════

  // Group services for grouped picker
  const servicesByCategory = useMemo(() => {
    const map = new Map<string, ServiceRow[]>();
    for (const s of services) {
      const arr = map.get(s.category) || [];
      arr.push(s);
      map.set(s.category, arr);
    }
    return Array.from(map.entries());
  }, [services]);

  const serviceOptions = useMemo(
    () =>
      servicesByCategory.flatMap(([cat, items]) =>
        items.map((s) => ({
          value: s.id,
          label: `${s.name}`,
          group: cat.replace(/_/g, " "),
        })),
      ),
    [servicesByCategory],
  );

  const sourceLangOptions = useMemo(
    () =>
      languages
        .filter((l) => l.is_source_available)
        .map((l) => ({ value: l.id, label: l.name })),
    [languages],
  );
  const targetLangOptions = useMemo(
    () =>
      languages
        .filter((l) => l.is_target_available)
        .map((l) => ({ value: l.id, label: l.name })),
    [languages],
  );

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/admin/orders"
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> Orders
          </Link>
          <h1 className="text-2xl font-semibold">New project</h1>
        </div>
        <Link
          to="/admin/quotes/fast-create"
          className="text-sm text-teal-600 hover:underline"
        >
          Certified fast quote →
        </Link>
      </div>

      {/* Mode toggle */}
      <div className="bg-white border rounded-lg p-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("quote")}
            className={`flex-1 flex items-center gap-2 rounded-md border px-4 py-3 text-sm font-medium transition ${
              mode === "quote"
                ? "border-teal-500 bg-teal-50 text-teal-900"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <Zap className="w-4 h-4" />
            <div className="text-left">
              <div>Quote</div>
              <div className="text-xs font-normal text-gray-500">
                Customer pays via link, then becomes an order
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setMode("direct_order")}
            className={`flex-1 flex items-center gap-2 rounded-md border px-4 py-3 text-sm font-medium transition ${
              mode === "direct_order"
                ? "border-teal-500 bg-teal-50 text-teal-900"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
            title="Create an open order — invoice on delivery (AR customers only)"
          >
            <Briefcase className="w-4 h-4" />
            <div className="text-left">
              <div>Direct order</div>
              <div className="text-xs font-normal text-gray-500">
                Skip quote — invoice on delivery (AR customers)
              </div>
            </div>
          </button>
        </div>
        {mode === "direct_order" && customer && !customer.is_ar_customer && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <strong>{customerLabel}</strong> is not AR-approved. Either mark
              them as AR on the{" "}
              <Link
                to={`/admin/customers/${customer.id}`}
                className="underline"
              >
                customer page
              </Link>
              , pick a different customer, or switch back to Quote mode.
            </div>
          </div>
        )}
      </div>

      {loadingRefs ? (
        <div className="flex items-center justify-center py-10 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <>
          {/* Customer */}
          <section className="bg-white border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">Customer</h2>
              {!customer && !creatingCustomer && (
                <button
                  type="button"
                  onClick={() => setCreatingCustomer(true)}
                  className="text-xs text-teal-600 hover:text-teal-700 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add new customer
                </button>
              )}
            </div>

            {customer ? (
              <div className="flex items-center justify-between rounded-md border bg-gray-50 px-3 py-2">
                <div className="text-sm">
                  <div className="font-medium">{customerLabel}</div>
                  <div className="text-xs text-gray-500 flex gap-2 flex-wrap">
                    <span>{customer.customer_type || "individual"}</span>
                    {customer.is_ar_customer && (
                      <span className="text-teal-700 font-medium">
                        AR · {customer.payment_terms || "net_30"}
                      </span>
                    )}
                    {!customer.is_ar_customer && mode === "direct_order" && (
                      <span className="text-amber-600 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> not AR-approved
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCustomer(null)}
                  className="text-sm text-gray-500 hover:text-red-600"
                >
                  Change
                </button>
              </div>
            ) : creatingCustomer ? (
              <div className="rounded-md border border-gray-200 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-700">
                    New customer
                  </span>
                  <button
                    type="button"
                    onClick={() => setCreatingCustomer(false)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">
                      Full name *
                    </label>
                    <input
                      type="text"
                      value={newFullName}
                      onChange={(e) => setNewFullName(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">
                      Customer type
                    </label>
                    <select
                      value={newCustomerType}
                      onChange={(e) => setNewCustomerType(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="individual">Individual</option>
                      <option value="business">Business</option>
                      <option value="corporate">Corporate</option>
                      <option value="sme">SME</option>
                      <option value="lsp">LSP</option>
                      <option value="legal">Legal</option>
                      <option value="immigration">Immigration</option>
                      <option value="educational">Educational</option>
                      <option value="non_profit">Non-profit</option>
                      <option value="government_federal">
                        Government · federal
                      </option>
                      <option value="government_provincial">
                        Government · provincial
                      </option>
                      <option value="government_municipal">
                        Government · municipal
                      </option>
                      <option value="registry">Registry</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  {newCustomerType !== "individual" && (
                    <div className="md:col-span-2 relative">
                      <label className="block text-[11px] text-gray-500 mb-1">
                        Company name
                      </label>
                      <input
                        type="text"
                        value={newCompany}
                        onChange={(e) => {
                          setNewCompany(e.target.value);
                          setCompanyDropdownOpen(true);
                        }}
                        onFocus={() =>
                          companySuggestions.length > 0 &&
                          setCompanyDropdownOpen(true)
                        }
                        onBlur={() =>
                          // Delay close to allow click on suggestion
                          setTimeout(() => setCompanyDropdownOpen(false), 150)
                        }
                        placeholder="Start typing — existing companies will appear"
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                      {companyDropdownOpen &&
                        companySuggestions.length > 0 && (
                          <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-20 max-h-56 overflow-y-auto">
                            <ul className="divide-y divide-gray-100">
                              {companySuggestions.map((co) => (
                                <li key={co.id}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      applyCompanyDefaults(co);
                                      setCompanyDropdownOpen(false);
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-teal-50"
                                  >
                                    <div className="font-medium">{co.name}</div>
                                    <div className="text-[11px] text-gray-500 flex gap-2">
                                      <span>{co.currency || "CAD"}</span>
                                      {co.is_ar_customer && (
                                        <span className="text-teal-700">
                                          AR · {co.payment_terms || "net_30"}
                                        </span>
                                      )}
                                    </div>
                                  </button>
                                </li>
                              ))}
                              {newCompany.trim() &&
                                !companySuggestions.some(
                                  (c) =>
                                    c.name.toLowerCase() ===
                                    newCompany.trim().toLowerCase(),
                                ) && (
                                  <li>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setLinkedCompanyId(null);
                                        setCompanyDropdownOpen(false);
                                      }}
                                      className="w-full text-left px-3 py-1.5 text-xs text-teal-700 bg-teal-50/50 hover:bg-teal-50"
                                    >
                                      + Create new: “{newCompany.trim()}”
                                    </button>
                                  </li>
                                )}
                            </ul>
                          </div>
                        )}
                      <p className="text-[11px] text-gray-400 mt-1">
                        Existing companies load as you type. A new name is
                        saved when you create the customer.
                      </p>
                    </div>
                  )}
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">
                      Currency
                    </label>
                    <select
                      value={newCurrency}
                      onChange={(e) => setNewCurrency(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="CAD">CAD</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                      <option value="AUD">AUD</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">
                      Default tax rate
                    </label>
                    <select
                      value={newTaxRateId}
                      onChange={(e) => setNewTaxRateId(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="">— none —</option>
                      {taxRates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.region_name || t.region_code} · {t.tax_name}{" "}
                          {(Number(t.rate) * 100).toFixed(2)}%
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[11px] text-gray-500 mb-1">
                      Invoicing branch
                    </label>
                    <select
                      value={newBranchId ?? branchId ?? ""}
                      onChange={(e) =>
                        setNewBranchId(
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                      className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.legal_name || b.code}
                          {b.is_default ? " (default)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2 flex items-center gap-3 pt-1">
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={newIsAR}
                        onChange={(e) => setNewIsAR(e.target.checked)}
                        className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                      />
                      AR-approved (net-terms invoicing)
                    </label>
                    {newIsAR && (
                      <select
                        value={newPaymentTerms}
                        onChange={(e) => setNewPaymentTerms(e.target.value)}
                        className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      >
                        <option value="immediate">Immediate</option>
                        <option value="net_15">Net 15</option>
                        <option value="net_30">Net 30</option>
                        <option value="net_60">Net 60</option>
                      </select>
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCreatingCustomer(false)}
                    className="text-xs text-gray-600 hover:text-gray-800 px-3 py-1.5"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateCustomer}
                    disabled={savingCustomer}
                    className="rounded-md bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium px-3 py-1.5 disabled:opacity-50 flex items-center gap-1"
                  >
                    {savingCustomer && (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    )}
                    Create customer
                  </button>
                </div>
              </div>
            ) : (
              <CustomerSearch
                onSelect={handleCustomerSelect}
                placeholder="Search existing customer…"
              />
            )}
          </section>

          {/* Service + languages */}
          <section className="bg-white border rounded-lg p-4 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Service</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-3">
                <label className="block text-xs text-gray-600 mb-1">
                  Service type
                </label>
                <SearchableSelect
                  options={serviceOptions as any}
                  value={serviceId}
                  onChange={setServiceId}
                  placeholder="Pick a service…"
                />
                {selectedService && (
                  <p className="text-xs text-gray-500 mt-1">
                    Default units:{" "}
                    {(selectedService.default_calculation_units || []).map((u) =>
                      UNIT_LABELS[u as CalcUnit] || u,
                    ).join(" · ") || "—"}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Source language
                </label>
                <SearchableSelect
                  options={sourceLangOptions as any}
                  value={sourceLanguageId}
                  onChange={setSourceLanguageId}
                  placeholder="Source…"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Target language
                </label>
                <SearchableSelect
                  options={targetLangOptions as any}
                  value={targetLanguageId}
                  onChange={setTargetLanguageId}
                  placeholder="Target…"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Promised delivery
                </label>
                <input
                  type="date"
                  value={promisedDeliveryDate}
                  onChange={(e) => setPromisedDeliveryDate(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="md:col-span-3">
                <label className="block text-xs text-gray-600 mb-1">
                  Workflow template
                </label>
                <select
                  value={workflowTemplateCode}
                  onChange={(e) => setWorkflowTemplateCode(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">
                    — pick later on the order page —
                  </option>
                  {["Matches service", "Other templates"].map((grp) => {
                    const rows = workflowTemplateOptions.filter(
                      (t) => t.group === grp,
                    );
                    if (rows.length === 0) return null;
                    return (
                      <optgroup key={grp} label={grp}>
                        {rows.map((t) => (
                          <option key={t.id} value={t.code}>
                            {t.name}
                            {typeof t.step_count === "number"
                              ? ` · ${t.step_count} steps`
                              : ""}
                            {t.is_default ? " · default" : ""}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
                <p className="text-[11px] text-gray-500 mt-1">
                  Applied to direct orders immediately. For quotes, we'll
                  suggest it again when the quote converts to an order.
                </p>
              </div>
            </div>
          </section>

          {/* Line items */}
          <section className="bg-white border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">Line items</h2>
              <button
                type="button"
                onClick={addLine}
                className="text-sm flex items-center gap-1 text-teal-600 hover:text-teal-700"
              >
                <Plus className="w-4 h-4" /> Add line
              </button>
            </div>
            <div className="space-y-2">
              {lineItems.map((li, idx) => {
                const qty = li.calculationUnit === "flat" ? 1 : num(li.unitQuantity);
                const lineTotal = Math.round(qty * num(li.baseRate) * 100) / 100;
                return (
                  <div
                    key={li.id}
                    className="grid grid-cols-12 gap-2 items-start rounded-md border border-gray-200 p-3"
                  >
                    <div className="col-span-12 md:col-span-4">
                      <label className="block text-[11px] text-gray-500 mb-1">
                        Description
                      </label>
                      <input
                        type="text"
                        value={li.description}
                        onChange={(e) =>
                          updateLine(li.id, { description: e.target.value })
                        }
                        placeholder={`Line ${idx + 1}`}
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <label className="block text-[11px] text-gray-500 mb-1">
                        Unit
                      </label>
                      <select
                        value={li.calculationUnit}
                        onChange={(e) =>
                          updateLine(li.id, {
                            calculationUnit: e.target.value as CalcUnit,
                            unitQuantity:
                              e.target.value === "flat" ? "1" : li.unitQuantity,
                          })
                        }
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      >
                        {allowedUnits.map((u) => (
                          <option key={u} value={u}>
                            {UNIT_LABELS[u]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <label className="block text-[11px] text-gray-500 mb-1">
                        Quantity
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        disabled={li.calculationUnit === "flat"}
                        value={li.calculationUnit === "flat" ? "1" : li.unitQuantity}
                        onChange={(e) =>
                          updateLine(li.id, { unitQuantity: e.target.value })
                        }
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-100"
                      />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <label className="block text-[11px] text-gray-500 mb-1">
                        Rate
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={li.baseRate}
                        onChange={(e) =>
                          updateLine(li.id, { baseRate: e.target.value })
                        }
                        placeholder="0.00"
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                    <div className="col-span-8 md:col-span-1 flex flex-col justify-end">
                      <label className="block text-[11px] text-gray-500 mb-1">
                        Total
                      </label>
                      <div className="text-sm font-medium py-1.5">
                        ${lineTotal.toFixed(2)}
                      </div>
                    </div>
                    <div className="col-span-4 md:col-span-1 flex items-end justify-end">
                      <button
                        type="button"
                        onClick={() => removeLine(li.id)}
                        disabled={lineItems.length <= 1}
                        className="text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed p-1"
                        title="Remove line"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Admin fields: branch + PO + client project number */}
          <section className="bg-white border rounded-lg p-4 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Admin fields</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Invoicing branch
                </label>
                <select
                  value={branchId ?? ""}
                  onChange={(e) =>
                    setBranchId(e.target.value ? Number(e.target.value) : null)
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">— pick branch —</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.legal_name || b.code}
                      {b.is_default ? " (default)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  PO number{" "}
                  {customer?.requires_po && (
                    <span className="text-red-500">*</span>
                  )}
                </label>
                <input
                  type="text"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  placeholder={
                    customer?.requires_po ? "Required by this customer" : "Optional — recommended"
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Client project number{" "}
                  {customer?.requires_client_project_number && (
                    <span className="text-red-500">*</span>
                  )}
                </label>
                <input
                  type="text"
                  value={clientProjectNumber}
                  onChange={(e) => setClientProjectNumber(e.target.value)}
                  placeholder={
                    customer?.requires_client_project_number
                      ? "Required by this customer"
                      : "Optional — recommended"
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
          </section>

          {/* Files */}
          <section className="bg-white border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">
                Source files
              </h2>
              <label className="text-xs text-teal-600 hover:text-teal-700 cursor-pointer flex items-center gap-1">
                <Plus className="w-3 h-3" />
                Attach files
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const chosen = Array.from(e.target.files || []);
                    if (chosen.length) setFiles((prev) => [...prev, ...chosen]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {files.length === 0 ? (
              <p className="text-xs text-gray-500">
                No files attached. Source documents, reference material, TMs,
                glossaries — all welcome.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 border rounded-md">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center justify-between px-3 py-2 text-sm"
                  >
                    <div className="truncate mr-2">
                      <span className="text-gray-900">{f.name}</span>
                      <span className="text-xs text-gray-500 ml-2">
                        {(f.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setFiles((prev) => prev.filter((_, idx) => idx !== i))
                      }
                      className="text-gray-400 hover:text-red-600 p-1"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Extras + totals */}
          <section className="bg-white border rounded-lg p-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">Totals</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Currency
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="CAD">CAD</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="AUD">AUD</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Rush fee
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={rushFee}
                  onChange={(e) => setRushFee(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Delivery fee
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Tax rate
                </label>
                <select
                  value={selectedTaxRateId}
                  onChange={(e) => {
                    setSelectedTaxRateId(e.target.value);
                    const tr = taxRates.find((t) => t.id === e.target.value);
                    if (tr) setTaxRate(String(tr.rate));
                    else if (!e.target.value) setTaxRate("0");
                  }}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">Manual ({(Number(taxRate) * 100).toFixed(2)}%)</option>
                  {taxRates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.region_name || t.region_code} · {t.tax_name}{" "}
                      {(Number(t.rate) * 100).toFixed(2)}%
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border-t pt-3 grid grid-cols-2 gap-y-1 text-sm">
              <div className="text-gray-600">Subtotal</div>
              <div className="text-right">${totals.subtotal.toFixed(2)}</div>
              {totals.rush > 0 && (
                <>
                  <div className="text-gray-600">Rush fee</div>
                  <div className="text-right">${totals.rush.toFixed(2)}</div>
                </>
              )}
              {totals.delivery > 0 && (
                <>
                  <div className="text-gray-600">Delivery fee</div>
                  <div className="text-right">${totals.delivery.toFixed(2)}</div>
                </>
              )}
              <div className="text-gray-600">Tax ({(totals.rate * 100).toFixed(2)}%)</div>
              <div className="text-right">${totals.tax.toFixed(2)}</div>
              <div className="font-semibold">Total</div>
              <div className="text-right font-semibold">
                ${totals.total.toFixed(2)} {currency}
              </div>
            </div>
          </section>

          {/* Notes */}
          <section className="bg-white border rounded-lg p-4 space-y-2">
            <label className="block text-sm font-semibold text-gray-700">
              Special instructions / internal notes
            </label>
            <textarea
              rows={3}
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="Anything the team or vendor should know…"
            />
          </section>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 pb-10">
            <Link
              to="/admin/orders"
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </Link>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-5 py-2 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {(submitting || uploadingFiles) && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              {uploadingFiles
                ? "Uploading files…"
                : mode === "quote"
                ? "Create quote"
                : "Create direct order"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
