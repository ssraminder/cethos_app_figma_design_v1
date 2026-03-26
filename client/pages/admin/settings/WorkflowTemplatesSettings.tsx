import React, { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Star,
  Check,
  FileText,
  Zap,
  Circle,
  ChevronDown,
  ChevronRight,
  X,
  Pencil,
  Trash2,
  Loader2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import AdminSettingsLayout from "@/components/admin/settings/AdminSettingsLayout";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

// ── Types ──

interface Template {
  id: string;
  code: string;
  name: string;
  description: string | null;
  service_id: string | null;
  service_name: string | null;
  is_default: boolean;
  is_active: boolean;
  step_count: number;
  steps: Step[];
  created_at: string;
  updated_at: string;
}

interface Step {
  id: string;
  step_number: number;
  name: string;
  service_id: string | null;
  service_name: string | null;
  actor_type: string;
  default_actor_type?: string;
  allowed_actor_types?: string[];
  assignment_mode: string;
  auto_assign_rule: string | null;
  auto_advance: boolean;
  is_optional: boolean;
  requires_file_upload: boolean;
  calculation_unit: string | null;
  instructions: string | null;
  estimated_hours: number | null;
}

interface ServiceOption {
  id: string;
  code: string;
  name: string;
  category: string;
}

interface StepFormData {
  name: string;
  service_id: string;
  actor_type: string;
  allowed_actor_types: string[];
  assignment_mode: string;
  auto_assign_rule: string;
  auto_advance: boolean;
  is_optional: boolean;
  requires_file_upload: boolean;
  instructions: string;
  estimated_hours: string;
  showAdvanced: boolean;
}

interface TemplateFormData {
  name: string;
  code: string;
  description: string;
  is_default: boolean;
  is_active: boolean;
}

// ── Constants ──

const actorTypes = [
  { value: "external_vendor", label: "Vendor" },
  { value: "internal_work", label: "Internal (Work)" },
  { value: "internal_review", label: "Internal (Review)" },
  { value: "customer", label: "Customer" },
  { value: "automated", label: "Automated" },
];

const assignmentModes = [
  { value: "manual", label: "Manual" },
  { value: "auto", label: "Auto-assign" },
  { value: "auto_offer", label: "Auto-offer (multiple vendors)" },
];

const autoAssignRules = [
  { value: "preferred", label: "Preferred vendor" },
  { value: "cheapest", label: "Cheapest rate" },
  { value: "highest_rated", label: "Highest rated" },
  { value: "round_robin", label: "Round robin" },
  { value: "same_as_previous", label: "Same as previous step" },
];

const actorTypeColors: Record<string, { bg: string; text: string; border: string }> = {
  external_vendor: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-400" },
  internal_work: { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-400" },
  internal_review: { bg: "bg-indigo-100", text: "text-indigo-700", border: "border-indigo-400" },
  customer: { bg: "bg-green-100", text: "text-green-700", border: "border-green-400" },
  automated: { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-400" },
};

const categoryLabels: Record<string, string> = {
  translation: "Translation",
  review_qa: "Review & QA",
  interpretation: "Interpretation",
  multimedia: "Multimedia",
  technology: "Technology",
  other: "Other",
};

const defaultStepForm: StepFormData = {
  name: "",
  service_id: "",
  actor_type: "external_vendor",
  allowed_actor_types: ["external_vendor"],
  assignment_mode: "manual",
  auto_assign_rule: "",
  auto_advance: false,
  is_optional: false,
  requires_file_upload: true,
  instructions: "",
  estimated_hours: "",
  showAdvanced: false,
};

const defaultTemplateForm: TemplateFormData = {
  name: "",
  code: "",
  description: "",
  is_default: false,
  is_active: true,
};

function generateCode(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// ── Component ──

export default function WorkflowTemplatesSettings() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [formData, setFormData] = useState<TemplateFormData>(defaultTemplateForm);
  const [formSteps, setFormSteps] = useState<StepFormData[]>([{ ...defaultStepForm }]);
  const [saving, setSaving] = useState(false);

  // Deactivate confirmation
  const [deactivateTarget, setDeactivateTarget] = useState<Template | null>(null);

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

  // ── Data Fetching ──

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/manage-workflow-templates?active_only=false`,
        { headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
      );
      const data = await res.json();
      if (data.templates) {
        setTemplates(data.templates);
      } else {
        setError("Failed to load templates");
      }
    } catch (err) {
      console.error("Failed to fetch templates:", err);
      setError("Failed to load workflow templates");
    }
  }, [SUPABASE_URL, SUPABASE_ANON_KEY]);

  const fetchServices = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from("services")
        .select("id, code, name, category")
        .eq("is_active", true)
        .order("category")
        .order("name");
      if (fetchError) throw fetchError;
      setServices(data || []);
    } catch (err) {
      console.error("Failed to fetch services:", err);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchTemplates(), fetchServices()]);
      setLoading(false);
    };
    load();
  }, [fetchTemplates, fetchServices]);

  // ── Modal Handlers ──

  const openCreateModal = () => {
    setEditingTemplate(null);
    setFormData({ ...defaultTemplateForm });
    setFormSteps([{ ...defaultStepForm }]);
    setShowModal(true);
  };

  const openEditModal = (template: Template) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      code: template.code,
      description: template.description || "",
      is_default: template.is_default,
      is_active: template.is_active,
    });
    setFormSteps(
      template.steps
        .sort((a, b) => a.step_number - b.step_number)
        .map((s) => ({
          name: s.name,
          service_id: s.service_id || "",
          actor_type: s.actor_type,
          allowed_actor_types: s.allowed_actor_types || [s.actor_type],
          assignment_mode: s.assignment_mode,
          auto_assign_rule: s.auto_assign_rule || "",
          auto_advance: s.auto_advance,
          is_optional: s.is_optional,
          requires_file_upload: s.requires_file_upload,
          instructions: s.instructions || "",
          estimated_hours: s.estimated_hours != null ? String(s.estimated_hours) : "",
          showAdvanced: !!(s.instructions || s.estimated_hours),
        }))
    );
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingTemplate(null);
  };

  // ── Step Management ──

  const addStep = () => {
    setFormSteps((prev) => [...prev, { ...defaultStepForm }]);
  };

  const removeStep = (index: number) => {
    if (formSteps.length <= 1) return;
    setFormSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const moveStep = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= formSteps.length) return;
    setFormSteps((prev) => {
      const arr = [...prev];
      [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
      return arr;
    });
  };

  const updateStep = (index: number, field: keyof StepFormData, value: any) => {
    setFormSteps((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        const updated = { ...s, [field]: value };
        // Reset auto_assign_rule when switching away from "auto"
        if (field === "assignment_mode" && value !== "auto") {
          updated.auto_assign_rule = "";
        }
        return updated;
      })
    );
  };

  // ── Name → Code auto-generation ──

  const handleNameChange = (name: string) => {
    setFormData((prev) => ({
      ...prev,
      name,
      // Only auto-generate code in create mode
      ...(editingTemplate ? {} : { code: generateCode(name) }),
    }));
  };

  // ── Save ──

  const handleSave = async () => {
    // Validation
    if (!formData.name.trim()) {
      toast.error("Template name is required");
      return;
    }
    if (!formData.code.trim()) {
      toast.error("Template code is required");
      return;
    }
    if (formSteps.length === 0) {
      toast.error("At least one step is required");
      return;
    }
    for (let i = 0; i < formSteps.length; i++) {
      if (!formSteps[i].name.trim()) {
        toast.error(`Step ${i + 1} name is required`);
        return;
      }
    }

    setSaving(true);
    try {
      const payload: any = {
        code: formData.code,
        name: formData.name,
        description: formData.description || null,
        is_default: formData.is_default,
        is_active: formData.is_active,
        steps: formSteps.map((s, i) => ({
          step_number: i + 1,
          name: s.name,
          service_id: s.service_id || null,
          actor_type: s.actor_type,
          allowed_actor_types: s.allowed_actor_types.length > 0 ? s.allowed_actor_types : [s.actor_type],
          default_actor_type: s.actor_type,
          assignment_mode: s.assignment_mode,
          auto_assign_rule: s.assignment_mode === "auto" ? (s.auto_assign_rule || null) : null,
          auto_advance: s.auto_advance,
          is_optional: s.is_optional,
          requires_file_upload: s.requires_file_upload,
          instructions: s.instructions || null,
          estimated_hours: s.estimated_hours ? Number(s.estimated_hours) : null,
        })),
      };

      if (editingTemplate) {
        payload.template_id = editingTemplate.id;
      }

      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/manage-workflow-templates`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify(payload),
        }
      );
      const result = await res.json();

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(
          editingTemplate
            ? "Template updated successfully"
            : "Template created successfully"
        );
        closeModal();
        await fetchTemplates();
      }
    } catch (err) {
      console.error("Save error:", err);
      toast.error("Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  // ── Deactivate ──

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/manage-workflow-templates?template_id=${deactivateTarget.id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        }
      );
      const result = await res.json();
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`"${deactivateTarget.name}" deactivated`);
        await fetchTemplates();
      }
    } catch (err) {
      console.error("Deactivate error:", err);
      toast.error("Failed to deactivate template");
    } finally {
      setDeactivateTarget(null);
    }
  };

  // ── Group services by category ──

  const servicesByCategory = services.reduce<Record<string, ServiceOption[]>>(
    (acc, s) => {
      if (!acc[s.category]) acc[s.category] = [];
      acc[s.category].push(s);
      return acc;
    },
    {}
  );

  // ── Render Helpers ──

  const ActorBadge = ({ type }: { type: string }) => {
    const colors = actorTypeColors[type] || actorTypeColors.automated;
    const label = actorTypes.find((a) => a.value === type)?.label || type;
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors.bg} ${colors.text}`}
      >
        {label}
      </span>
    );
  };

  const StepFlags = ({ step }: { step: Step }) => (
    <span className="flex items-center gap-2 text-xs text-gray-500">
      {step.requires_file_upload && (
        <span className="flex items-center gap-0.5" title="File upload required">
          <FileText className="h-3 w-3" /> file required
        </span>
      )}
      {step.auto_advance && (
        <span className="flex items-center gap-0.5" title="Auto-advance">
          <Zap className="h-3 w-3" /> auto-advance
        </span>
      )}
      {step.is_optional && (
        <span className="flex items-center gap-0.5" title="Optional">
          <Circle className="h-3 w-3" /> optional
        </span>
      )}
    </span>
  );

  // ── Main Render ──

  return (
    <AdminSettingsLayout
      title="Workflow Templates"
      description="Process templates for order workflows. Each template defines the steps vendors and staff follow."
      breadcrumbs={[
        { label: "Settings", href: "/admin/settings" },
        { label: "Workflow Templates" },
      ]}
      loading={loading}
      error={error}
      actions={
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          Create Template
        </button>
      }
    >
      {/* Templates Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Code
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Steps
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Flags
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {templates.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                  No workflow templates found. Create one to get started.
                </td>
              </tr>
            )}
            {templates.map((t) => (
              <React.Fragment key={t.id}>
                {/* Template Row */}
                <tr
                  onClick={() =>
                    setExpandedId(expandedId === t.id ? null : t.id)
                  }
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {expandedId === t.id ? (
                        <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      )}
                      <span
                        className={`font-semibold ${
                          t.is_active ? "text-gray-900" : "text-gray-400"
                        }`}
                      >
                        {t.name}
                      </span>
                      {!t.is_active && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
                          Inactive
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <code className="text-sm text-gray-600 bg-gray-50 px-2 py-1 rounded">
                      {t.code}
                    </code>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                      {t.step_count}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {t.is_default && (
                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                      )}
                      {t.is_active && (
                        <Check className="h-4 w-4 text-green-600" />
                      )}
                    </div>
                  </td>
                </tr>

                {/* Expanded Row */}
                {expandedId === t.id && (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 bg-gray-50">
                      {/* Steps Pipeline */}
                      <div className="space-y-2 mb-4">
                        {t.steps
                          .sort((a, b) => a.step_number - b.step_number)
                          .map((step) => (
                            <div
                              key={step.id}
                              className="flex items-center gap-3 text-sm"
                            >
                              <span className="font-medium text-gray-700 w-6 text-right">
                                {step.step_number}.
                              </span>
                              <span className="font-medium text-gray-900 min-w-[120px]">
                                {step.name}
                              </span>
                              <ActorBadge type={step.actor_type} />
                              {step.allowed_actor_types && step.allowed_actor_types.length > 1 && (
                                <span className="text-xs text-indigo-500" title={`Can switch to: ${step.allowed_actor_types.join(', ')}`}>
                                  +{step.allowed_actor_types.length - 1} type{step.allowed_actor_types.length - 1 > 1 ? 's' : ''}
                                </span>
                              )}
                              <span className="text-gray-500">
                                {assignmentModes.find(
                                  (m) => m.value === step.assignment_mode
                                )?.label || step.assignment_mode}
                              </span>
                              <StepFlags step={step} />
                            </div>
                          ))}
                      </div>

                      {/* Description */}
                      {t.description && (
                        <p className="text-sm text-gray-600 italic mb-4">
                          "{t.description}"
                        </p>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditModal(t);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit Template
                        </button>
                        {t.is_active && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeactivateTarget(t);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Deactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Create/Edit Modal ── */}
      <Dialog open={showModal} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Edit Workflow Template" : "Create Workflow Template"}
            </DialogTitle>
            <DialogDescription>
              {editingTemplate
                ? "Update the template details and process steps."
                : "Define a new workflow template with its process steps."}
            </DialogDescription>
          </DialogHeader>

          {/* Template Info */}
          <div className="space-y-4 border-b border-gray-200 pb-6">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
              Template Info
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="e.g. Standard TEP"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) =>
                    !editingTemplate &&
                    setFormData((prev) => ({ ...prev, code: e.target.value }))
                  }
                  readOnly={!!editingTemplate}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono ${
                    editingTemplate
                      ? "bg-gray-100 text-gray-500 cursor-not-allowed"
                      : "focus:outline-none focus:ring-2 focus:ring-blue-500"
                  }`}
                  placeholder="auto_generated_from_name"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, description: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                rows={2}
                placeholder="Brief description of this workflow template"
              />
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={formData.is_default}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, is_default: e.target.checked }))
                  }
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-gray-700">Default template</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, is_active: e.target.checked }))
                  }
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-gray-700">Active</span>
              </label>
            </div>
          </div>

          {/* Process Steps */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
                Process Steps
              </h3>
              <span className="text-xs text-gray-500">
                {formSteps.length} step{formSteps.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="space-y-3">
              {formSteps.map((step, index) => {
                const colors =
                  actorTypeColors[step.actor_type] || actorTypeColors.automated;
                return (
                  <div
                    key={index}
                    className={`bg-gray-50 rounded-lg p-4 border-l-4 ${colors.border}`}
                  >
                    {/* Step Header */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold text-gray-700">
                        Step {index + 1}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveStep(index, "up")}
                          disabled={index === 0}
                          className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move up"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveStep(index, "down")}
                          disabled={index === formSteps.length - 1}
                          className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move down"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeStep(index)}
                          disabled={formSteps.length <= 1}
                          className="p-1 text-red-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed ml-1"
                          title="Remove step"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Step Name */}
                    <div className="mb-3">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Step Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={step.name}
                        onChange={(e) =>
                          updateStep(index, "name", e.target.value)
                        }
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="e.g. Translation, Editing, QA Review"
                      />
                    </div>

                    {/* Service + Actor + Assignment */}
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Service
                        </label>
                        <select
                          value={step.service_id}
                          onChange={(e) =>
                            updateStep(index, "service_id", e.target.value)
                          }
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                        >
                          <option value="">— None —</option>
                          {Object.entries(servicesByCategory).map(
                            ([cat, svcs]) => (
                              <optgroup
                                key={cat}
                                label={categoryLabels[cat] || cat}
                              >
                                {svcs.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}
                                  </option>
                                ))}
                              </optgroup>
                            )
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Actor Type <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={step.actor_type}
                          onChange={(e) =>
                            updateStep(index, "actor_type", e.target.value)
                          }
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                        >
                          {actorTypes.map((a) => (
                            <option key={a.value} value={a.value}>
                              {a.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Assignment Mode <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={step.assignment_mode}
                          onChange={(e) =>
                            updateStep(
                              index,
                              "assignment_mode",
                              e.target.value
                            )
                          }
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                        >
                          {assignmentModes.map((m) => (
                            <option key={m.value} value={m.value}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Allowed Actor Types */}
                    <div className="mb-3">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Allowed Actor Types
                      </label>
                      <div className="flex flex-wrap gap-3">
                        {actorTypes.filter(a => a.value !== 'automated').map((a) => (
                          <label key={a.value} className="flex items-center gap-1.5 text-xs text-gray-700">
                            <input
                              type="checkbox"
                              checked={step.allowed_actor_types.includes(a.value)}
                              onChange={(e) => {
                                const current = step.allowed_actor_types;
                                const updated = e.target.checked
                                  ? [...current, a.value]
                                  : current.filter((t: string) => t !== a.value);
                                // Must have at least one allowed type
                                if (updated.length === 0) return;
                                updateStep(index, "allowed_actor_types" as keyof StepFormData, updated);
                              }}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            {a.label}
                          </label>
                        ))}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        Steps with multiple allowed types can be switched at runtime.
                      </div>
                    </div>

                    {/* Auto-assign rule (conditional) */}
                    {step.assignment_mode === "auto" && (
                      <div className="mb-3">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Auto-Assign Rule
                        </label>
                        <select
                          value={step.auto_assign_rule}
                          onChange={(e) =>
                            updateStep(
                              index,
                              "auto_assign_rule",
                              e.target.value
                            )
                          }
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                        >
                          <option value="">— Select rule —</option>
                          {autoAssignRules.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Checkboxes */}
                    <div className="flex items-center gap-5 mb-2">
                      <label className="flex items-center gap-1.5 text-xs text-gray-700">
                        <input
                          type="checkbox"
                          checked={step.requires_file_upload}
                          onChange={(e) =>
                            updateStep(
                              index,
                              "requires_file_upload",
                              e.target.checked
                            )
                          }
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        File upload
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-gray-700">
                        <input
                          type="checkbox"
                          checked={step.auto_advance}
                          onChange={(e) =>
                            updateStep(
                              index,
                              "auto_advance",
                              e.target.checked
                            )
                          }
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Auto-advance
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-gray-700">
                        <input
                          type="checkbox"
                          checked={step.is_optional}
                          onChange={(e) =>
                            updateStep(
                              index,
                              "is_optional",
                              e.target.checked
                            )
                          }
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Optional
                      </label>
                    </div>

                    {/* Advanced Section (Collapsible) */}
                    <div>
                      <button
                        type="button"
                        onClick={() =>
                          updateStep(
                            index,
                            "showAdvanced",
                            !step.showAdvanced
                          )
                        }
                        className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                      >
                        {step.showAdvanced ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                        Advanced options
                      </button>
                      {step.showAdvanced && (
                        <div className="mt-2 space-y-3 pl-4 border-l-2 border-gray-200">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Instructions
                            </label>
                            <textarea
                              value={step.instructions}
                              onChange={(e) =>
                                updateStep(
                                  index,
                                  "instructions",
                                  e.target.value
                                )
                              }
                              className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                              rows={2}
                              placeholder="Default instructions for this step"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Estimated Hours
                            </label>
                            <input
                              type="number"
                              value={step.estimated_hours}
                              onChange={(e) =>
                                updateStep(
                                  index,
                                  "estimated_hours",
                                  e.target.value
                                )
                              }
                              className="w-32 px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                              min="0"
                              step="0.5"
                              placeholder="0"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add Step Button */}
            <button
              type="button"
              onClick={addStep}
              className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Add Step
            </button>
          </div>

          {/* Footer */}
          <DialogFooter className="border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={closeModal}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Saving..." : "Save Template"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Deactivate Confirmation ── */}
      <AlertDialog
        open={!!deactivateTarget}
        onOpenChange={(open) => !open && setDeactivateTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate "{deactivateTarget?.name}"?
              This template will no longer be available for new orders, but
              existing orders using it will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivate}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminSettingsLayout>
  );
}
