import { X } from "lucide-react";

interface SummaryData {
  totalInvoices: number;
  fullyPaid: { gross: number; net: number; tax: number };
  partiallyPaid: { gross: number; net: number; tax: number };
  unpaid: { gross: number; net: number; tax: number };
}

interface SummaryPanelProps {
  open: boolean;
  onClose: () => void;
  data: SummaryData | null;
  loading: boolean;
}

function fmtCurrency(val: number): string {
  return val.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  });
}

export type { SummaryData };

export default function SummaryPanel({
  open,
  onClose,
  data,
  loading,
}: SummaryPanelProps) {
  if (!open) return null;

  const total = data
    ? {
        gross:
          data.fullyPaid.gross +
          data.partiallyPaid.gross +
          data.unpaid.gross,
        net:
          data.fullyPaid.net +
          data.partiallyPaid.net +
          data.unpaid.net,
        tax:
          data.fullyPaid.tax +
          data.partiallyPaid.tax +
          data.unpaid.tax,
      }
    : { gross: 0, net: 0, tax: 0 };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-xl z-50 flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Invoice Summary
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : data ? (
            <div className="space-y-6">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-gray-500">Total Invoices</p>
                <p className="text-3xl font-semibold text-gray-900 mt-1">
                  {data.totalInvoices.toLocaleString()}
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 pr-4 font-medium text-gray-500">
                        Status
                      </th>
                      <th className="text-right py-2 px-2 font-medium text-gray-500">
                        Gross CAD
                      </th>
                      <th className="text-right py-2 px-2 font-medium text-gray-500">
                        Net CAD
                      </th>
                      <th className="text-right py-2 pl-2 font-medium text-gray-500">
                        Tax CAD
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="py-2.5 pr-4">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-green-500" />
                          Fully Paid
                        </span>
                      </td>
                      <td className="text-right py-2.5 px-2 tabular-nums">
                        {fmtCurrency(data.fullyPaid.gross)}
                      </td>
                      <td className="text-right py-2.5 px-2 tabular-nums">
                        {fmtCurrency(data.fullyPaid.net)}
                      </td>
                      <td className="text-right py-2.5 pl-2 tabular-nums">
                        {fmtCurrency(data.fullyPaid.tax)}
                      </td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-2.5 pr-4">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-yellow-500" />
                          Partially Paid
                        </span>
                      </td>
                      <td className="text-right py-2.5 px-2 tabular-nums">
                        {fmtCurrency(data.partiallyPaid.gross)}
                      </td>
                      <td className="text-right py-2.5 px-2 tabular-nums">
                        {fmtCurrency(data.partiallyPaid.net)}
                      </td>
                      <td className="text-right py-2.5 pl-2 tabular-nums">
                        {fmtCurrency(data.partiallyPaid.tax)}
                      </td>
                    </tr>
                    <tr className="border-b border-gray-200">
                      <td className="py-2.5 pr-4">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-red-500" />
                          Unpaid
                        </span>
                      </td>
                      <td className="text-right py-2.5 px-2 tabular-nums">
                        {fmtCurrency(data.unpaid.gross)}
                      </td>
                      <td className="text-right py-2.5 px-2 tabular-nums">
                        {fmtCurrency(data.unpaid.net)}
                      </td>
                      <td className="text-right py-2.5 pl-2 tabular-nums">
                        {fmtCurrency(data.unpaid.tax)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4 font-semibold text-gray-900">
                        TOTAL
                      </td>
                      <td className="text-right py-2.5 px-2 font-semibold text-gray-900 tabular-nums">
                        {fmtCurrency(total.gross)}
                      </td>
                      <td className="text-right py-2.5 px-2 font-semibold text-gray-900 tabular-nums">
                        {fmtCurrency(total.net)}
                      </td>
                      <td className="text-right py-2.5 pl-2 font-semibold text-gray-900 tabular-nums">
                        {fmtCurrency(total.tax)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-12">
              No data available
            </p>
          )}
        </div>
      </div>
    </>
  );
}
