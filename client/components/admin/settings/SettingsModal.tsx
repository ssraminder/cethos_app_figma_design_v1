import React, { ReactNode, useState, useEffect } from "react";
import { X } from "lucide-react";

interface FieldOption {
  value: string;
  label: string;
}

interface FormField {
  name: string;
  label: string;
  type: "text" | "number" | "textarea" | "select" | "checkbox";
  required?: boolean;
  placeholder?: string;
  helperText?: string;
  options?: FieldOption[];
  step?: number;
  min?: number;
  max?: number;
}

// Support both old (children-based) and new (fields-based) interfaces
interface SettingsModalBaseProps {
  isOpen?: boolean; // For old interface
  onClose: () => void;
  title: string;
  size?: "sm" | "md" | "lg";
}

// Old interface (children-based)
interface SettingsModalChildrenProps extends SettingsModalBaseProps {
  children: ReactNode;
  onSave: () => void;
  saveLabel?: string;
  saving?: boolean;
  // Ensure fields and initialData are not present
  fields?: never;
  initialData?: never;
}

// New interface (fields-based)
interface SettingsModalFieldsProps extends SettingsModalBaseProps {
  fields: FormField[];
  initialData: Record<string, any>;
  onSave: (data: Record<string, any>) => Promise<void>;
  // Ensure children, saveLabel, and saving are not present
  children?: never;
  saveLabel?: never;
  saving?: never;
}

type SettingsModalProps = SettingsModalChildrenProps | SettingsModalFieldsProps;

export default function SettingsModal(props: SettingsModalProps) {
  const { onClose, title, size = "md" } = props;

  // For fields-based interface
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Determine which interface is being used
  const isFieldsBased = "fields" in props && props.fields !== undefined;

  // For old interface, check if modal should be shown
  if ("isOpen" in props && !props.isOpen) return null;

  useEffect(() => {
    if (isFieldsBased && props.initialData) {
      setFormData(props.initialData);
    }
  }, [isFieldsBased, props.initialData]);

  const handleChange = (name: string, value: any) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const validate = () => {
    if (!isFieldsBased) return true;

    const newErrors: Record<string, string> = {};
    props.fields.forEach((field) => {
      if (field.required && !formData[field.name]) {
        newErrors[field.name] = `${field.label} is required`;
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    if (isFieldsBased) {
      setSaving(true);
      try {
        await props.onSave(formData);
        // onClose will be called by parent after successful save
      } catch (error) {
        console.error("Save error:", error);
      } finally {
        setSaving(false);
      }
    }
  };

  const handleSaveClick = () => {
    if (!isFieldsBased) {
      (props as SettingsModalChildrenProps).onSave();
    }
  };

  const sizeClasses = {
    sm: "max-w-md",
    md: "max-w-2xl",
    lg: "max-w-4xl",
  };

  const currentSaving = isFieldsBased ? saving : props.saving || false;
  const saveLabel = isFieldsBased ? "Save" : props.saveLabel || "Save";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div
          className={`relative bg-white rounded-lg shadow-xl w-full ${sizeClasses[size]} max-h-[90vh] ${isFieldsBased ? "flex flex-col" : "overflow-y-auto"}`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              type="button"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          {isFieldsBased ? (
            // Fields-based form
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
              <div className="px-6 py-4 space-y-4">
                {props.fields.map((field) => (
                  <div key={field.name}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {field.label}
                      {field.required && (
                        <span className="text-red-500 ml-1">*</span>
                      )}
                    </label>

                    {field.type === "text" && (
                      <input
                        type="text"
                        value={formData[field.name] || ""}
                        onChange={(e) =>
                          handleChange(field.name, e.target.value)
                        }
                        placeholder={field.placeholder}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    )}

                    {field.type === "number" && (
                      <input
                        type="number"
                        value={formData[field.name] || ""}
                        onChange={(e) =>
                          handleChange(field.name, parseFloat(e.target.value))
                        }
                        placeholder={field.placeholder}
                        step={field.step}
                        min={field.min}
                        max={field.max}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    )}

                    {field.type === "textarea" && (
                      <textarea
                        value={formData[field.name] || ""}
                        onChange={(e) =>
                          handleChange(field.name, e.target.value)
                        }
                        placeholder={field.placeholder}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    )}

                    {field.type === "select" && (
                      <select
                        value={formData[field.name] || ""}
                        onChange={(e) =>
                          handleChange(field.name, e.target.value)
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {field.options?.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    )}

                    {field.type === "checkbox" && (
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData[field.name] || false}
                          onChange={(e) =>
                            handleChange(field.name, e.target.checked)
                          }
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm text-gray-600">
                          {field.helperText}
                        </span>
                      </div>
                    )}

                    {field.helperText && field.type !== "checkbox" && (
                      <p className="text-xs text-gray-500 mt-1">
                        {field.helperText}
                      </p>
                    )}

                    {errors[field.name] && (
                      <p className="text-xs text-red-600 mt-1">
                        {errors[field.name]}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={currentSaving}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50 font-medium text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={currentSaving}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
                >
                  {currentSaving ? "Saving..." : saveLabel}
                </button>
              </div>
            </form>
          ) : (
            // Children-based layout
            <>
              <div className="px-6 py-4">{props.children}</div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={onClose}
                  disabled={currentSaving}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50 font-medium text-sm"
                  type="button"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveClick}
                  disabled={currentSaving}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
                  type="button"
                >
                  {currentSaving ? "Saving..." : saveLabel}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
