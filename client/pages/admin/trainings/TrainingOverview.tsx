import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Circle, Clock, UserPlus } from "lucide-react";
import {
  getTrainingBySlug,
  getLessons,
  getMyAssignment,
  getLessonProgress,
  confirmTrainingComplete,
  updateTrainingAudience,
  Training,
  TrainingLesson,
  TrainingAssignment,
  LessonProgress,
} from "@/lib/trainings";
import { useAdminAuthContext } from "@/context/AdminAuthContext";

export default function TrainingOverview() {
  const { slug = "" } = useParams();
  const { isAdmin } = useAdminAuthContext();
  const [training, setTraining] = useState<Training | null>(null);
  const [lessons, setLessons] = useState<TrainingLesson[]>([]);
  const [assignment, setAssignment] = useState<TrainingAssignment | null>(null);
  const [progress, setProgress] = useState<LessonProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function handleConfirmComplete() {
    if (!training || confirming) return;
    setConfirming(true);
    try {
      await confirmTrainingComplete(training.id);
      const now = new Date().toISOString();
      setAssignment({ ...(assignment ?? ({} as TrainingAssignment)), completed_at: now });
      setProgress(
        lessons.map(
          (l) => ({ lesson_id: l.id, acknowledged_at: now }) as LessonProgress,
        ),
      );
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setConfirming(false);
    }
  }

  const [changingType, setChangingType] = useState(false);

  async function handleChangeType(audience: "staff" | "linguist") {
    if (!training || changingType) return;
    setChangingType(true);
    setError(null);
    try {
      await updateTrainingAudience(training.id, audience);
      setTraining({ ...training, audience } as Training);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setChangingType(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const t = await getTrainingBySlug(slug);
        if (cancelled) return;
        if (!t) {
          setError("Training not found.");
          setLoading(false);
          return;
        }
        setTraining(t);
        const ls = await getLessons(t.id);
        if (cancelled) return;
        setLessons(ls);
        const a = await getMyAssignment(t.id);
        if (cancelled) return;
        setAssignment(a);
        if (a) {
          const p = await getLessonProgress(a.id);
          if (cancelled) return;
          setProgress(p);
        }
      } catch (e: any) {
        setError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const ackedLessonIds = useMemo(
    () => new Set(progress.filter((p) => p.acknowledged_at).map((p) => p.lesson_id)),
    [progress],
  );

  const totalMinutes = lessons.reduce((acc, l) => acc + (l.estimated_minutes ?? 0), 0);
  const ackedCount = ackedLessonIds.size;
  const pct = lessons.length ? Math.round((ackedCount / lessons.length) * 100) : 0;

  if (loading) return <div className="p-6 text-gray-500">Loading…</div>;
  if (error)
    return (
      <div className="p-6">
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      </div>
    );
  if (!training) return null;

  const notAssigned = !assignment && !isAdmin;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link
        to="/admin/trainings"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        All trainings
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{training.title}</h1>
        {training.description && (
          <p className="text-sm text-gray-600 mt-2">{training.description}</p>
        )}
        <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
          <span>{lessons.length} lessons</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            ~{totalMinutes} min
          </span>
          {assignment?.completed_at && (
            <span className="flex items-center gap-1 text-green-700">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Completed
            </span>
          )}
        </div>

        {isAdmin && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {(training as any).audience === "linguist" ? (
              <Link
                to={`/admin/trainings/${training.slug}/assign-vendors`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700"
              >
                <UserPlus className="w-4 h-4" />
                Assign to vendors
              </Link>
            ) : (
              <Link
                to={`/admin/trainings/${training.slug}/assign`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700"
              >
                <UserPlus className="w-4 h-4" />
                Assign to staff
              </Link>
            )}
            <label className="inline-flex items-center gap-2 text-sm text-gray-600">
              <span>Type:</span>
              <select
                value={
                  (training as any).audience === "linguist"
                    ? "linguist"
                    : "staff"
                }
                onChange={(e) =>
                  handleChangeType(e.target.value as "staff" | "linguist")
                }
                disabled={changingType}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm disabled:opacity-50"
              >
                <option value="staff">Staff</option>
                <option value="linguist">Vendor</option>
              </select>
              {changingType && (
                <span className="text-xs text-gray-400">Saving…</span>
              )}
            </label>
          </div>
        )}
      </header>

      {notAssigned && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
          This training wasn't formally assigned to you — you can still complete
          it below, and your completion will be recorded.
        </div>
      )}

      {assignment && lessons.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>
              {ackedCount}/{lessons.length} lessons complete
            </span>
            <span>{pct}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-teal-500 h-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg divide-y">
        {lessons.map((lesson) => {
          const acked = ackedLessonIds.has(lesson.id);
          return (
            <Link
              key={lesson.id}
              to={`/admin/trainings/${training.slug}/${lesson.slug}`}
              className="flex items-center gap-4 p-4 hover:bg-gray-50 transition"
            >
              <div className="flex-shrink-0">
                {acked ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                ) : (
                  <Circle className="w-5 h-5 text-gray-300" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-gray-500">
                    Lesson {lesson.order_index}
                  </span>
                  <span className="text-xs text-gray-400">
                    · {lesson.estimated_minutes} min
                  </span>
                </div>
                <p className="font-medium text-gray-900">{lesson.title}</p>
              </div>
            </Link>
          );
        })}
        {lessons.length === 0 && (
          <div className="p-8 text-center text-gray-500 text-sm">
            No lessons yet.
          </div>
        )}
      </div>

      {!assignment?.completed_at && lessons.length > 0 && (
        <div className="mt-6 p-5 bg-teal-50 border border-teal-200 rounded-lg">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={confirmChecked}
              onChange={(e) => setConfirmChecked(e.target.checked)}
              className="mt-1 h-4 w-4 accent-teal-600"
            />
            <span className="text-sm text-teal-900">
              I confirm I have read and understood all {lessons.length} lessons
              in this training.
            </span>
          </label>
          <button
            type="button"
            onClick={handleConfirmComplete}
            disabled={!confirmChecked || confirming}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            {confirming ? "Saving…" : "Complete training"}
          </button>
        </div>
      )}

      {assignment?.completed_at && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          You completed this training.
        </div>
      )}
    </div>
  );
}
