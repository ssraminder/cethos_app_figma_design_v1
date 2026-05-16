// Generic structured-diff component.
// Used initially for the email-vs-plan alignment check; the same component is
// reusable for plan-vs-delivery, source-vs-target identity, PO scope vs work
// performed, and round-N vs round-N+1 findings (per the plan §13).

import { Badge } from "@/components/ui/badge";

export type DiffStatus = "aligned" | "partial" | "conflict" | "missing" | "needs_clarification";

export type DiffRow = {
  field: string;
  left: string | null;
  right: string | null;
  status: DiffStatus;
};

export type StructuredDiffProps = {
  leftLabel: string;
  rightLabel: string;
  rows: DiffRow[];
  summary?: string | null;
};

const STATUS_STYLE: Record<DiffStatus, string> = {
  aligned: "bg-green-100 text-green-800 border-green-300",
  partial: "bg-yellow-100 text-yellow-800 border-yellow-300",
  conflict: "bg-red-100 text-red-800 border-red-300",
  missing: "bg-gray-100 text-gray-700 border-gray-300",
  needs_clarification: "bg-blue-100 text-blue-800 border-blue-300",
};

export default function StructuredDiff({ leftLabel, rightLabel, rows, summary }: StructuredDiffProps) {
  return (
    <div className="w-full overflow-x-auto border rounded-md bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left p-2 font-medium w-32">Field</th>
            <th className="text-left p-2 font-medium">{leftLabel}</th>
            <th className="text-left p-2 font-medium">{rightLabel}</th>
            <th className="text-left p-2 font-medium w-36">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={4} className="p-4 text-center text-gray-500 italic">No rows</td></tr>
          )}
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-b-0">
              <td className="p-2 font-medium align-top">{r.field}</td>
              <td className="p-2 align-top whitespace-pre-wrap text-gray-700">{r.left ?? <span className="text-gray-400 italic">—</span>}</td>
              <td className="p-2 align-top whitespace-pre-wrap text-gray-700">{r.right ?? <span className="text-gray-400 italic">—</span>}</td>
              <td className="p-2 align-top">
                <Badge variant="outline" className={`text-[10px] uppercase border ${STATUS_STYLE[r.status]}`}>
                  {r.status.replace("_", " ")}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {summary && (
        <div className="px-3 py-2 border-t bg-gray-50 text-xs text-gray-700">
          {summary}
        </div>
      )}
    </div>
  );
}
