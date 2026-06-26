import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Search, Users } from "lucide-react";
import {
  getTrainingBySlug,
  listVendorsForAssign,
  assignVendorsBulk,
  type VendorLite,
  type Training,
} from "@/lib/trainings";

const STATUS = ["active", "inactive", "pending_review", "suspended", "applicant"];
const AVAIL = ["available", "busy", "on_leave", "unavailable"];
const VTYPE = [
  ["translator", "Translator"],
  ["editor", "Editor"],
  ["proofreader", "Proofreader"],
  ["cognitive_debriefing", "Cognitive debriefing"],
  ["cd_clinician_consultant", "CD clinician/consultant"],
  ["cd_all", "All CD types"],
  ["external", "External contractors"],
  ["unassigned", "Unassigned type"],
];

const SELECT = "border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white";

export default function VendorAssign() {
  const { slug = "" } = useParams();
  const [training, setTraining] = useState<Training | null>(null);
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    availability: "",
    vendorType: "",
    language: "",
    country: "",
  });
  const [vendors, setVendors] = useState<VendorLite[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneCount, setDoneCount] = useState<number | null>(null);

  useEffect(() => {
    getTrainingBySlug(slug).then(setTraining).catch(() => {});
  }, [slug]);

  async function runSearch() {
    setLoading(true);
    setError(null);
    try {
      const v = await listVendorsForAssign(filters);
      setVendors(v);
      setSelected(new Set());
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function selectAll() {
    setSelected((prev) =>
      prev.size === vendors.length ? new Set() : new Set(vendors.map((v) => v.id)),
    );
  }

  async function assign() {
    if (!training || selected.size === 0 || saving) return;
    setSaving(true);
    setError(null);
    setDoneCount(null);
    try {
      const n = await assignVendorsBulk(
        training.id,
        Array.from(selected),
        dueDate ? new Date(dueDate).toISOString() : null,
      );
      setDoneCount(n);
      setSelected(new Set());
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  const set = (k: keyof typeof filters, v: string) =>
    setFilters((f) => ({ ...f, [k]: v }));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link
        to={`/admin/trainings/${slug}`}
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to training
      </Link>

      <header className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Assign to vendors</h1>
        <p className="text-sm text-gray-600 mt-1">
          {training?.title
            ? `Filter the vendor directory, select all who match, and assign “${training.title}” in bulk.`
            : "Filter the vendor directory, select all who match, and assign in bulk."}
        </p>
      </header>

      {doneCount !== null && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          Assigned to {doneCount} vendor{doneCount === 1 ? "" : "s"}. Already-assigned
          vendors were skipped.
        </div>
      )}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Search name / email / country"
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm sm:col-span-3"
          />
          <select value={filters.status} onChange={(e) => set("status", e.target.value)} className={SELECT}>
            <option value="">Any status</option>
            {STATUS.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
          <select value={filters.availability} onChange={(e) => set("availability", e.target.value)} className={SELECT}>
            <option value="">Any availability</option>
            {AVAIL.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
          <select value={filters.vendorType} onChange={(e) => set("vendorType", e.target.value)} className={SELECT}>
            <option value="">Any type</option>
            {VTYPE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input
            value={filters.language}
            onChange={(e) => set("language", e.target.value)}
            placeholder="Target language (e.g. FR matches FR-CA)"
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          />
          <input
            value={filters.country}
            onChange={(e) => set("country", e.target.value)}
            placeholder="Country (exact)"
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={runSearch}
            className="inline-flex items-center justify-center gap-2 px-4 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
          >
            <Search className="w-4 h-4" />
            Search
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-900">
            {loading ? "Loading…" : `${vendors.length} vendor${vendors.length === 1 ? "" : "s"} match`}
          </span>
          <span className="text-xs text-gray-500">({selected.size} selected)</span>
          {vendors.length > 0 && (
            <button type="button" onClick={selectAll} className="ml-auto text-xs text-teal-700 hover:text-teal-900">
              {selected.size === vendors.length ? "Clear all" : `Select all ${vendors.length}`}
            </button>
          )}
        </div>
        <div className="max-h-[28rem] overflow-y-auto divide-y">
          {vendors.map((v) => (
            <label key={v.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(v.id)}
                onChange={() => toggle(v.id)}
                className="h-4 w-4 accent-teal-600"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-900 truncate">
                  {v.full_name || v.business_name || v.email || v.id}
                </span>
                <span className="block text-xs text-gray-500 truncate">
                  {[v.email, v.vendor_type?.replace(/_/g, " "), v.country, v.status?.replace(/_/g, " ")]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </label>
          ))}
          {!loading && vendors.length === 0 && (
            <p className="px-4 py-8 text-sm text-gray-500 text-center">No vendors match these filters.</p>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          Due date (optional)
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={assign}
          disabled={selected.size === 0 || saving}
          className="inline-flex items-center gap-2 px-5 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
        >
          <CheckCircle2 className="w-4 h-4" />
          {saving ? "Assigning…" : `Assign ${selected.size || ""} vendor${selected.size === 1 ? "" : "s"}`.replace(/\s+/g, " ")}
        </button>
      </div>
    </div>
  );
}
