import { useState, useCallback } from "react";

// Minimal styled replacement for `window.confirm()`. Native `confirm()` is
// inconsistent with the rest of the styled admin UI (UnassignVendorModal,
// ManagePayableModal, VendorFinderModal) and on some browsers blocks the
// page. This hook returns an async `confirm()` that resolves to true/false
// after the user clicks the styled action. Pair with <ConfirmDialog>.

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
}

interface ConfirmState extends ConfirmDialogOptions {
  open: boolean;
  resolver: ((value: boolean) => void) | null;
}

export function useConfirmDialog() {
  const [state, setState] = useState<ConfirmState>({
    open: false,
    title: "",
    message: "",
    resolver: null,
  });

  const confirm = useCallback(
    (opts: ConfirmDialogOptions): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        setState({ ...opts, open: true, resolver: resolve });
      }),
    [],
  );

  const handleAnswer = useCallback(
    (answer: boolean) => {
      state.resolver?.(answer);
      setState((s) => ({ ...s, open: false, resolver: null }));
    },
    [state.resolver],
  );

  return { confirm, state, handleAnswer };
}

interface ConfirmDialogProps {
  state: ConfirmState;
  onAnswer: (answer: boolean) => void;
}

export function ConfirmDialog({ state, onAnswer }: ConfirmDialogProps) {
  if (!state.open) return null;
  const isDanger = state.tone === "danger";
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
      onClick={() => onAnswer(false)}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">{state.title}</h3>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-gray-700 whitespace-pre-line">{state.message}</p>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2 bg-gray-50">
          <button
            type="button"
            onClick={() => onAnswer(false)}
            className="px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          >
            {state.cancelLabel || "Cancel"}
          </button>
          <button
            type="button"
            onClick={() => onAnswer(true)}
            className={
              "px-3 py-1.5 text-sm rounded-md text-white " +
              (isDanger
                ? "bg-red-600 hover:bg-red-700"
                : "bg-teal-600 hover:bg-teal-700")
            }
          >
            {state.confirmLabel || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
