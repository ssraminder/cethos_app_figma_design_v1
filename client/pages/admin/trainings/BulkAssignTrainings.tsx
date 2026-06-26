import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, GraduationCap, Users } from "lucide-react";
import {
  listMyTrainings,
  listAssignableStaff,
  createAssignmentsBulk,
  TrainingWithStats,
  StaffUserLite,
} from "@/lib/trainings";

export default function BulkAssignTrainings() {
  const [trainings, setTrainings] = useState<TrainingWithStats[]>([]);
  const [staff, setStaff] = useState<StaffUserLite[]>([]);
  const [selectedTrainings, setSelectedTrainings] = useState<Set<string>>(
    new Set(),
  );
  const [selectedStaff, setSelectedStaff] = useState<Set<string>>(new Set());
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneCount, setDoneCount] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([listMyTrainings(), listAssignableStaff()])
      .then(([t, s]) => {
        // Phase 1: staff trainings only (vendor assignment is Phase 2).
        setTrainings(t.filter((x) => (x as any).audience !== "linguist"));
        setStaff(s);
      })
      .catch((e) => setError(e.message ?? String(e)))
      .finally(() => setLoading(false));
  }, []);

  function toggleTraining(id: string) {
    setSelectedTrainings((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleStaff(id: string) {
    setSelectedStaff((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAllStaff() {
    setSelectedStaff((prev) =>
      prev.size === staff.length ? new Set() : new Set(staff.map((s) => s.id)),
    );
  }

  async function handleAssign() {
    if (selectedTrainings.size === 0 || selectedStaff.size === 0 || saving)
      return;
    setSaving(true);
    setError(null);
    setDoneCount(null);
    try {
      const due = dueDate ? new Date(dueDate).toISOString() : null;
      const n = await createAssignmentsBulk(
        Array.from(selectedTrainings),
        Array.from(selectedStaff),
        due,
      );
      setDoneCount(n);
      setSelectedTrainings(new Set());
      setSelectedStaff(new Set());
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  const canAssign = selectedTrainings.size > 0 && selectedStaff.size > 0;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link
        to="/admin/trainings"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        All trainings
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Assign trainings</h1>
        <p className="text-sm text-gray-600 mt-1">
          Select one or more staff trainings and one or more staff members, then
          assign them all in one go.
        </p>
      </header>

      {loading && <p className="text-gray-500">Loading…</p>}

      {doneCount !== null && (
        <div className="mb-5 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          Assigned {doneCount} training–staff{" "}
          {doneCount === 1 ? "pair" : "pairs"}. Re-existing assignments were left
          unchanged.
        </div>
      )}
      {error && (
        <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {!loading && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Trainings */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-semibold text-gray-900">
                Staff trainings
              </span>
              <span className="text-xs text-gray-500">
                ({selectedTrainings.size} selected)
              </span>
            </div>
            <div className="max-h-[26rem] overflow-y-auto divide-y">
              {trainings.map((t) => (
                <label
                  key={t.id}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedTrainings.has(t.id)}
                    onChange={() => toggleTraining(t.id)}
                    className="mt-1 h-4 w-4 accent-teal-600"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">
                      {t.title}
                    </span>
                    <span className="block text-xs text-gray-500">
                      {t.lesson_count} lessons
                    </span>
                  </span>
                </label>
              ))}
              {trainings.length === 0 && (
                <p className="px-4 py-6 text-sm text-gray-500 text-center">
                  No staff trainings.
                </p>
              )}
            </div>
          </div>

          {/* Staff */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-semibold text-gray-900">Staff</span>
              <span className="text-xs text-gray-500">
                ({selectedStaff.size} selected)
              </span>
              <button
                type="button"
                onClick={toggleAllStaff}
                className="ml-auto text-xs text-teal-700 hover:text-teal-900"
              >
                {selectedStaff.size === staff.length
                  ? "Clear all"
                  : "Select all"}
              </button>
            </div>
            <div className="max-h-[26rem] overflow-y-auto divide-y">
              {staff.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedStaff.has(s.id)}
                    onChange={() => toggleStaff(s.id)}
                    className="h-4 w-4 accent-teal-600"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">
                      {s.full_name}
                    </span>
                    <span className="block text-xs text-gray-500">
                      {s.email} · {s.role}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {!loading && (
        <div className="mt-6 flex items-center gap-4 flex-wrap">
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
            onClick={handleAssign}
            disabled={!canAssign || saving}
            className="inline-flex items-center gap-2 px-5 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            {saving
              ? "Assigning…"
              : `Assign ${selectedTrainings.size || ""} training${selectedTrainings.size === 1 ? "" : "s"} to ${selectedStaff.size || ""} staff`.replace(
                  /\s+/g,
                  " ",
                )}
          </button>
        </div>
      )}
    </div>
  );
}
