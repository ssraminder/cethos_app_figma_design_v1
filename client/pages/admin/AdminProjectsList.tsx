// AdminProjectsList.tsx
//
// Minimal list of internal projects so staff can see what's accumulating
// from real orders. Search by PRJ-YYYY-NNNNN, client label, name, or
// company name.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, Search } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";

interface ProjectRow {
  id: string;
  project_number: string;
  client_project_number: string | null;
  name: string | null;
  is_active: boolean;
  updated_at: string;
  customer: { full_name: string | null; company_name: string | null } | null;
  company: { name: string } | null;
}

export default function AdminProjectsList() {
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      let q = supabase
        .from("internal_projects")
        .select(
          "id, project_number, client_project_number, name, is_active, updated_at, customer:customers(full_name, company_name), company:companies(name)",
        )
        .order("updated_at", { ascending: false })
        .limit(200);
      if (!includeInactive) {
        q = q.eq("is_active", true);
      }
      const { data, error: err } = await q;
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      setRows((data as unknown as ProjectRow[]) || []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [includeInactive]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => {
      const haystack = [
        r.project_number,
        r.client_project_number,
        r.name,
        r.company?.name,
        r.customer?.company_name,
        r.customer?.full_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [rows, query]);

  return (
    <div className="px-4 sm:px-6 py-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Briefcase className="w-6 h-6 text-teal-600" />
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="p-4 border-b flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by PRJ number, client label, or company"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 whitespace-nowrap">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="rounded border-gray-300"
            />
            Include inactive
          </label>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading…</div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-red-700">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            {rows.length === 0
              ? "No projects yet. They'll appear here as quotes and orders are created."
              : "No projects match the search."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="text-left px-5 py-2 font-medium">Project</th>
                <th className="text-left px-5 py-2 font-medium">Client label</th>
                <th className="text-left px-5 py-2 font-medium">Customer / company</th>
                <th className="text-left px-5 py-2 font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <Link
                      to={`/admin/projects/${r.id}`}
                      className="font-medium text-teal-700 hover:text-teal-800"
                    >
                      {r.project_number}
                    </Link>
                    {!r.is_active && (
                      <span className="ml-2 text-xs text-gray-500 italic">
                        inactive
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-700">
                    {r.client_project_number || (
                      <span className="text-gray-400 italic">—</span>
                    )}
                    {r.name && (
                      <div className="text-xs text-gray-500">{r.name}</div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-700">
                    {r.company?.name ||
                      r.customer?.company_name ||
                      r.customer?.full_name ||
                      "—"}
                  </td>
                  <td className="px-5 py-3 text-gray-500">
                    {format(new Date(r.updated_at), "MMM d, yyyy")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
