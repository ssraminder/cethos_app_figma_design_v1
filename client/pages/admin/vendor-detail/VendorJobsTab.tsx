import { Link } from "react-router-dom";
import { Briefcase, ExternalLink } from "lucide-react";
import type { TabProps } from "./types";
import { JOB_STATUS_COLORS, formatDate } from "./constants";
import { getLanguageName } from "./data/languages";

export default function VendorJobsTab({ vendorData }: TabProps) {
  const { activeJobs } = vendorData;

  if (activeJobs.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-10 text-center">
        <Briefcase className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-400">
          No active jobs assigned to this vendor
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
      <h3 className="text-xs font-semibold text-gray-500 mb-4 uppercase tracking-wider">
        Active Jobs ({activeJobs.length})
      </h3>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-gray-100">
              <th className="pb-2 text-xs font-medium text-gray-500 uppercase">
                Order #
              </th>
              <th className="pb-2 text-xs font-medium text-gray-500 uppercase">
                Step
              </th>
              <th className="pb-2 text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="pb-2 text-xs font-medium text-gray-500 uppercase">
                Language
              </th>
              <th className="pb-2 text-xs font-medium text-gray-500 uppercase">
                Deadline
              </th>
              <th className="pb-2 text-xs font-medium text-gray-500 uppercase text-right">
                Rate
              </th>
              <th className="pb-2 text-xs font-medium text-gray-500 uppercase text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {activeJobs.map((job, i) => (
              <tr key={`${job.order_id}-${job.step_number}-${i}`}>
                <td className="py-2.5 text-gray-800 font-mono text-xs">
                  {job.order_number}
                </td>
                <td className="py-2.5 text-gray-800">
                  {job.step_number}. {job.step_name}
                </td>
                <td className="py-2.5">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${
                      JOB_STATUS_COLORS[job.status] ??
                      "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {job.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="py-2.5 text-gray-600 text-xs">
                  {job.source_language && job.target_language
                    ? `${getLanguageName(job.source_language)} \u2192 ${getLanguageName(job.target_language)}`
                    : "—"}
                </td>
                <td className="py-2.5 text-gray-600 text-xs">
                  {job.deadline ? formatDate(job.deadline) : "—"}
                </td>
                <td className="py-2.5 text-right font-mono text-gray-800 text-xs">
                  {job.rate != null
                    ? `${job.currency ?? "$"}${job.rate}`
                    : "—"}
                </td>
                <td className="py-2.5 text-right">
                  <Link
                    to={`/admin/orders/${job.order_id}`}
                    className="inline-flex items-center gap-1 text-xs text-teal-600 hover:text-teal-800"
                  >
                    View Order
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
