import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, CheckCircle2, Clock, Users } from "lucide-react";
import { listMyTrainings, TrainingWithStats } from "@/lib/trainings";
import { useAdminAuthContext } from "@/context/AdminAuthContext";

export default function TrainingsList() {
  const { isAdmin } = useAdminAuthContext();
  const [trainings, setTrainings] = useState<TrainingWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listMyTrainings()
      .then(setTrainings)
      .catch((e) => setError(e.message ?? String(e)))
      .finally(() => setLoading(false));
  }, []);

  const visible = isAdmin
    ? trainings
    : trainings.filter((t) => t.my_assignment !== null);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Trainings</h1>
        <p className="text-sm text-gray-600 mt-1">
          {isAdmin
            ? "Manage staff trainings and track progress."
            : "Trainings assigned to you."}
        </p>
      </header>

      {loading && <p className="text-gray-500">Loading…</p>}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {!loading && visible.length === 0 && (
        <div className="p-12 bg-white border border-gray-200 rounded-lg text-center">
          <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-700 font-medium">
            {isAdmin ? "No trainings exist yet." : "No trainings assigned to you."}
          </p>
          {!isAdmin && (
            <p className="text-sm text-gray-500 mt-1">
              Ask an admin to assign one to you.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {visible.map((t) => {
          const hasAssignment = t.my_assignment !== null;
          const progress = t.lesson_count
            ? Math.round((t.my_progress_count / t.lesson_count) * 100)
            : 0;
          const completed = hasAssignment && t.my_assignment!.completed_at;

          return (
            <Link
              key={t.id}
              to={`/admin/trainings/${t.slug}`}
              className="block bg-white border border-gray-200 rounded-lg p-5 hover:border-teal-400 hover:shadow-cethos-card transition"
            >
              <div className="flex items-start justify-between mb-2">
                <h2 className="text-lg font-semibold text-gray-900">{t.title}</h2>
                {completed && (
                  <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Completed
                  </span>
                )}
                {hasAssignment && !completed && (
                  <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                    <Clock className="w-3.5 h-3.5" />
                    In progress
                  </span>
                )}
              </div>
              {t.description && (
                <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                  {t.description}
                </p>
              )}
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>{t.lesson_count} lessons</span>
                {hasAssignment && (
                  <span>
                    {t.my_progress_count}/{t.lesson_count} complete ({progress}%)
                  </span>
                )}
                {isAdmin && !hasAssignment && (
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    Not assigned to you
                  </span>
                )}
              </div>
              {hasAssignment && (
                <div className="mt-3 w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-teal-500 h-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
