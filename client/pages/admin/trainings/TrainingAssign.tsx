import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Trash2, UserPlus, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import {
  getTrainingBySlug,
  listAssignableStaff,
  listAssignments,
  createAssignments,
  deleteAssignment,
  Training,
  StaffUserLite,
  TrainingAssignment,
} from "@/lib/trainings";
import { useAdminAuthContext } from "@/context/AdminAuthContext";

export default function TrainingAssign() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAdminAuthContext();

  const [training, setTraining] = useState<Training | null>(null);
  const [staff, setStaff] = useState<StaffUserLite[]>([]);
  const [assignments, setAssignments] = useState<
    (TrainingAssignment & { staff: StaffUserLite | null })[]
  >([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dueDate, setDueDate] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      navigate(`/admin/trainings/${slug}`);
      return;
    }
    reload();
  }, [slug, isAdmin]);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const t = await getTrainingBySlug(slug);
      if (!t) {
        setError("Training not found.");
        return;
      }
      setTraining(t);
      const [s, a] = await Promise.all([
        listAssignableStaff(),
        listAssignments(t.id),
      ]);
      setStaff(s);
      setAssignments(a);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  const alreadyAssignedIds = useMemo(
    () => new Set(assignments.map((a) => a.staff_user_id)),
    [assignments],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function handleSubmit() {
    if (!training || selected.size === 0) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const due = dueDate ? new Date(dueDate).toISOString() : null;
      await createAssignments(training.id, Array.from(selected), due);
      setSelected(new Set());
      setDueDate("");
      setSuccess(`Assigned to ${selected.size} staff member(s).`);
      await reload();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(assignmentId: string) {
    if (!confirm("Remove this assignment? Their progress will be lost.")) return;
    try {
      await deleteAssignment(assignmentId);
      await reload();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }

  if (loading) return <div className="p-6 text-gray-500">Loading…</div>;
  if (!training) return null;

  const assignable = staff.filter((s) => !alreadyAssignedIds.has(s.id));

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link
        to={`/admin/trainings/${training.slug}`}
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        {training.title}
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Assign training</h1>
        <p className="text-sm text-gray-600 mt-1">{training.title}</p>
      </header>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          {success}
        </div>
      )}

      <section className="mb-8 bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">
          Assign to new staff
        </h2>

        {assignable.length === 0 ? (
          <p className="text-sm text-gray-500">
            All active staff already have this training.
          </p>
        ) : (
          <>
            <div className="max-h-64 overflow-y-auto border border-gray-100 rounded-lg divide-y">
              {assignable.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggle(s.id)}
                    className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {s.full_name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{s.email}</p>
                  </div>
                  <span className="text-xs text-gray-500 capitalize">
                    {s.role.replace("_", " ")}
                  </span>
                </label>
              ))}
            </div>

            <div className="mt-4 flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Due date (optional)
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                />
              </div>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving || selected.size === 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
              >
                <UserPlus className="w-4 h-4" />
                Assign {selected.size > 0 ? `(${selected.size})` : ""}
              </button>
            </div>
          </>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-900 mb-3">
          Current assignments ({assignments.length})
        </h2>

        {assignments.length === 0 ? (
          <div className="p-8 bg-white border border-gray-200 rounded-lg text-center text-sm text-gray-500">
            No one has been assigned yet.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg divide-y">
            {assignments.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 p-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {a.staff?.full_name ?? "(unknown)"}
                  </p>
                  <p className="text-xs text-gray-500">{a.staff?.email}</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>Assigned {format(new Date(a.assigned_at), "MMM d")}</span>
                  {a.due_at && (
                    <span>Due {format(new Date(a.due_at), "MMM d")}</span>
                  )}
                  {a.completed_at ? (
                    <span className="flex items-center gap-1 text-green-700">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Done
                    </span>
                  ) : a.started_at ? (
                    <span className="text-amber-700">In progress</span>
                  ) : (
                    <span className="text-gray-400">Not started</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(a.id)}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                  title="Remove assignment"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
