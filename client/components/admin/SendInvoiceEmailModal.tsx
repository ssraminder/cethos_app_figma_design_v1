import { useState, useRef, useEffect } from "react";
import { Mail, Loader2, X, Pencil, Trash2, Plus, Check } from "lucide-react";

interface SendInvoiceEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (customMessage: string, emails: string[]) => Promise<void>;
  invoiceNumber: string;
  customerEmail: string;
  isSending: boolean;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function SendInvoiceEmailModal({
  isOpen,
  onClose,
  onSend,
  invoiceNumber,
  customerEmail,
  isSending,
}: SendInvoiceEmailModalProps) {
  const [customMessage, setCustomMessage] = useState("");
  const [emails, setEmails] = useState<string[]>([customerEmail]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showAddInput, setShowAddInput] = useState(false);
  const [addValue, setAddValue] = useState("");
  const [addError, setAddError] = useState("");
  const [editError, setEditError] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setEmails([customerEmail]);
      setCustomMessage("");
      setEditingIndex(null);
      setShowAddInput(false);
      setAddValue("");
      setAddError("");
      setEditError("");
    }
  }, [isOpen, customerEmail]);

  useEffect(() => {
    if (showAddInput && addInputRef.current) {
      addInputRef.current.focus();
    }
  }, [showAddInput]);

  useEffect(() => {
    if (editingIndex !== null && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingIndex]);

  if (!isOpen) return null;

  const handleSend = async () => {
    const validEmails = emails.filter((e) => isValidEmail(e));
    if (validEmails.length === 0) return;
    await onSend(customMessage.trim(), validEmails);
  };

  const handleDelete = (index: number) => {
    setEmails((prev) => prev.filter((_, i) => i !== index));
    if (editingIndex === index) {
      setEditingIndex(null);
      setEditError("");
    }
  };

  const handleEditStart = (index: number) => {
    setEditingIndex(index);
    setEditValue(emails[index]);
    setEditError("");
    setShowAddInput(false);
    setAddError("");
  };

  const handleEditSave = () => {
    if (editingIndex === null) return;
    const trimmed = editValue.trim();
    if (!trimmed) {
      setEditError("Email cannot be empty");
      return;
    }
    if (!isValidEmail(trimmed)) {
      setEditError("Please enter a valid email address");
      return;
    }
    if (emails.some((e, i) => i !== editingIndex && e.toLowerCase() === trimmed.toLowerCase())) {
      setEditError("This email is already in the list");
      return;
    }
    setEmails((prev) => prev.map((e, i) => (i === editingIndex ? trimmed : e)));
    setEditingIndex(null);
    setEditError("");
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleEditSave();
    } else if (e.key === "Escape") {
      setEditingIndex(null);
      setEditError("");
    }
  };

  const handleAddEmail = () => {
    const trimmed = addValue.trim();
    if (!trimmed) {
      setAddError("Email cannot be empty");
      return;
    }
    if (!isValidEmail(trimmed)) {
      setAddError("Please enter a valid email address");
      return;
    }
    if (emails.some((e) => e.toLowerCase() === trimmed.toLowerCase())) {
      setAddError("This email is already in the list");
      return;
    }
    setEmails((prev) => [...prev, trimmed]);
    setAddValue("");
    setAddError("");
    setShowAddInput(false);
  };

  const handleAddKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddEmail();
    } else if (e.key === "Escape") {
      setShowAddInput(false);
      setAddValue("");
      setAddError("");
    }
  };

  const hasValidEmails = emails.some((e) => isValidEmail(e));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-semibold text-gray-900">
              Send Invoice by Email
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={isSending}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Invoice info */}
          <div className="bg-indigo-50 rounded-md p-3 text-sm">
            <p className="text-indigo-800">
              Invoice <span className="font-semibold">{invoiceNumber}</span> will
              be sent to:
            </p>
          </div>

          {/* Email list */}
          <div className="space-y-2">
            {emails.map((email, index) => (
              <div key={index}>
                {editingIndex === index ? (
                  <div>
                    <div className="flex items-center gap-2">
                      <input
                        ref={editInputRef}
                        type="email"
                        value={editValue}
                        onChange={(e) => {
                          setEditValue(e.target.value);
                          setEditError("");
                        }}
                        onKeyDown={handleEditKeyDown}
                        className={`flex-1 border rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                          editError ? "border-red-300" : "border-gray-300"
                        }`}
                        disabled={isSending}
                      />
                      <button
                        onClick={handleEditSave}
                        disabled={isSending}
                        className="p-1.5 text-green-600 hover:bg-green-50 rounded-md"
                        title="Save"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingIndex(null);
                          setEditError("");
                        }}
                        disabled={isSending}
                        className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-md"
                        title="Cancel"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {editError && (
                      <p className="text-xs text-red-500 mt-1">{editError}</p>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between bg-gray-50 rounded-md px-3 py-2 group">
                    <span className="text-sm text-gray-900">{email}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleEditStart(index)}
                        disabled={isSending}
                        className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                        title="Edit email"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {emails.length > 1 && (
                        <button
                          onClick={() => handleDelete(index)}
                          disabled={isSending}
                          className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                          title="Remove email"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Add email input */}
            {showAddInput ? (
              <div>
                <div className="flex items-center gap-2">
                  <input
                    ref={addInputRef}
                    type="email"
                    value={addValue}
                    onChange={(e) => {
                      setAddValue(e.target.value);
                      setAddError("");
                    }}
                    onKeyDown={handleAddKeyDown}
                    placeholder="Enter email address"
                    className={`flex-1 border rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                      addError ? "border-red-300" : "border-gray-300"
                    }`}
                    disabled={isSending}
                  />
                  <button
                    onClick={handleAddEmail}
                    disabled={isSending}
                    className="p-1.5 text-green-600 hover:bg-green-50 rounded-md"
                    title="Add"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setShowAddInput(false);
                      setAddValue("");
                      setAddError("");
                    }}
                    disabled={isSending}
                    className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-md"
                    title="Cancel"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {addError && (
                  <p className="text-xs text-red-500 mt-1">{addError}</p>
                )}
              </div>
            ) : (
              <button
                onClick={() => {
                  setShowAddInput(true);
                  setEditingIndex(null);
                  setEditError("");
                }}
                disabled={isSending}
                className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
              >
                <Plus className="w-4 h-4" />
                Add another email
              </button>
            )}
          </div>

          {/* Custom message */}
          <div>
            <label
              htmlFor="custom-message"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Add a message <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="custom-message"
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Add a personal note to include in the email..."
              rows={4}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
              disabled={isSending}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <button
            onClick={onClose}
            disabled={isSending}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={isSending || !hasValidEmails}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {isSending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Mail className="w-4 h-4" />
                Send Invoice
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
