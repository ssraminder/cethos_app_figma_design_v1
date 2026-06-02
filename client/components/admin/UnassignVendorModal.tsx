// UnassignVendorModal — extracted from OrderWorkflowSection.tsx (R11 full split).
// Self-contained modal: collects a reason + notes, decides what to do with the
// existing payable (cancel / adjust / keep), optionally retracts open offers
// and preserves delivered files, then calls update-workflow-step{action:
// 'unassign_vendor'}. No behavior change vs the inlined version.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAdminAuthContext } from "@/context/AdminAuthContext";

interface UnassignVendorModalProps {
  isOpen: boolean;
  onClose: () => void;
  step: any;
  onConfirm: () => void;
}

export default function UnassignVendorModal({ isOpen, onClose, step, onConfirm }: UnassignVendorModalProps) {
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [payableAction, setPayableAction] = useState('cancel');
  const [adjustedAmount, setAdjustedAmount] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [retractOffers, setRetractOffers] = useState(true);
  const [preserveFiles, setPreserveFiles] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { session: currentStaff } = useAdminAuthContext();

  const reasons = [
    { value: 'project_cancelled', label: 'Project cancelled', defaultPayable: 'cancel' },
    { value: 'client_cancelled', label: 'Client cancelled order', defaultPayable: 'cancel' },
    { value: 'vendor_unresponsive', label: 'Vendor unresponsive', defaultPayable: 'cancel' },
    { value: 'quality_issues', label: 'Quality issues', defaultPayable: 'adjust' },
    { value: 'deadline_missed', label: 'Deadline missed', defaultPayable: 'adjust' },
    { value: 'vendor_requested', label: 'Vendor requested removal', defaultPayable: 'cancel' },
    { value: 'reassigning', label: 'Reassigning to another vendor', defaultPayable: 'cancel' },
    { value: 'scope_change', label: 'Scope change', defaultPayable: 'adjust' },
    { value: 'other', label: 'Other', defaultPayable: 'cancel' },
  ];

  useEffect(() => {
    const selected = reasons.find(r => r.value === reason);
    if (selected) setPayableAction(selected.defaultPayable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reason]);

  const payableAmount = step.payable ? parseFloat(step.payable.total) || 0 : 0;
  const hasPayable = !!step.payable && step.payable.status !== 'cancelled';
  const hasDeliveredFiles = step.delivered_file_paths?.length > 0;

  const handleSubmit = async () => {
    if (!reason) { toast.error('Please select a reason'); return; }
    if (reason === 'other' && !notes.trim()) { toast.error('Please provide details for "Other" reason'); return; }
    if (payableAction === 'adjust' && (!adjustedAmount || parseFloat(adjustedAmount) < 0)) {
      toast.error('Please enter a valid adjustment amount'); return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('update-workflow-step', {
        body: {
          step_id: step.id,
          action: 'unassign_vendor',
          staff_id: (currentStaff as any)?.id,
          reason,
          notes: notes || undefined,
          payable_action: hasPayable ? payableAction : 'cancel',
          adjusted_amount: payableAction === 'adjust' ? parseFloat(adjustedAmount) : undefined,
          adjustment_reason: payableAction === 'adjust' ? (adjustmentReason || `Adjusted: ${reason}`) : undefined,
          retract_offers: retractOffers,
          preserve_files: preserveFiles,
        },
      });

      if (error || !data?.success) {
        toast.error(data?.error || 'Failed to unassign vendor');
        return;
      }

      toast.success(`${step.vendor_name || 'Vendor'} unassigned from ${step.name}`);
      onConfirm();
      onClose();
    } catch (err) {
      toast.error('Failed to unassign vendor');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-800">
            Unassign Vendor — Step {step.step_number}: {step.name}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="p-4 space-y-4">
          <div className="bg-gray-50 rounded p-3 text-sm">
            <div className="font-medium text-gray-700">Current vendor: {step.vendor_name}</div>
            <div className="text-gray-500 mt-1">
              Status: {step.status}
              {hasPayable && ` · Payable: $${payableAmount.toFixed(2)} (${step.payable.status})`}
              {hasDeliveredFiles && ` · ${step.delivered_file_paths.length} file(s) delivered`}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="">Select a reason...</option>
              {reasons.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Additional notes {reason === 'other' ? '*' : '(optional)'}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Provide additional context..."
              rows={2}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>

          {hasPayable && (
            <div className="border-t pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payable Action — ${payableAmount.toFixed(2)} {step.payable.currency}
              </label>

              <div className="space-y-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" name="payableAction" value="cancel"
                    checked={payableAction === 'cancel'}
                    onChange={() => setPayableAction('cancel')}
                    className="mt-1" />
                  <div>
                    <div className="text-sm font-medium">Cancel payable ($0 owed)</div>
                    <div className="text-xs text-gray-500">No payment to vendor. Use when no useful work was done.</div>
                  </div>
                </label>

                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" name="payableAction" value="adjust"
                    checked={payableAction === 'adjust'}
                    onChange={() => setPayableAction('adjust')}
                    className="mt-1" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">Adjust payable amount</div>
                    <div className="text-xs text-gray-500">Pay a portion for partial work completed.</div>
                    {payableAction === 'adjust' && (
                      <div className="mt-2 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">Amount:</span>
                          <input
                            type="number" step="0.01" min="0"
                            max={payableAmount}
                            value={adjustedAmount}
                            onChange={(e) => setAdjustedAmount(e.target.value)}
                            placeholder={`Max: ${payableAmount.toFixed(2)}`}
                            className="w-32 border border-gray-300 rounded px-2 py-1 text-sm"
                          />
                          <span className="text-xs text-gray-400">
                            was ${payableAmount.toFixed(2)}
                          </span>
                        </div>
                        <input
                          type="text"
                          value={adjustmentReason}
                          onChange={(e) => setAdjustmentReason(e.target.value)}
                          placeholder="Reason for adjustment..."
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                        />
                      </div>
                    )}
                  </div>
                </label>

                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" name="payableAction" value="keep"
                    checked={payableAction === 'keep'}
                    onChange={() => setPayableAction('keep')}
                    className="mt-1" />
                  <div>
                    <div className="text-sm font-medium">Keep full payable (${payableAmount.toFixed(2)})</div>
                    <div className="text-xs text-gray-500">Pay full agreed amount despite unassignment.</div>
                  </div>
                </label>
              </div>
            </div>
          )}

          <div className="border-t pt-4 space-y-2">
            {step.status === 'offered' && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={retractOffers}
                  onChange={(e) => setRetractOffers(e.target.checked)}
                  className="rounded border-gray-300" />
                <span className="text-sm text-gray-600">Retract all active offers for this step</span>
              </label>
            )}

            {hasDeliveredFiles && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={preserveFiles}
                  onChange={(e) => setPreserveFiles(e.target.checked)}
                  className="rounded border-gray-300" />
                <span className="text-sm text-gray-600">
                  Preserve delivered files as source for next vendor
                  <span className="text-gray-400 ml-1">({step.delivered_file_paths.length} files)</span>
                </span>
              </label>
            )}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-700">
            ⚠️ This will remove {step.vendor_name} from this step and reset it to "Pending".
             You'll need to find and assign a new vendor.
            {step.status === 'in_progress' && ' The vendor may have work in progress.'}
            {step.status === 'delivered' && ' The vendor has already delivered files.'}
          </div>
        </div>

        <div className="flex justify-end gap-3 p-4 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !reason}
            className="px-4 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? 'Unassigning...' : 'Unassign Vendor'}
          </button>
        </div>
      </div>
    </div>
  );
}
