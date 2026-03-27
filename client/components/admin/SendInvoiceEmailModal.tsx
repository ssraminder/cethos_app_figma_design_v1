import { useState } from "react";
import { Mail, Loader2, X } from "lucide-react";

interface SendInvoiceEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (customMessage: string) => Promise<void>;
  invoiceNumber: string;
  customerEmail: string;
  isSending: boolean;
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

  if (!isOpen) return null;

  const handleSend = async () => {
    await onSend(customMessage.trim());
  };

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
          <div className="bg-indigo-50 rounded-md p-3 text-sm">
            <p className="text-indigo-800">
              Invoice <span className="font-semibold">{invoiceNumber}</span> will
              be sent to:
            </p>
            <p className="text-indigo-900 font-medium mt-1">{customerEmail}</p>
          </div>

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
            disabled={isSending}
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
