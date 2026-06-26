import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Users,
  ClipboardList,
} from "lucide-react";
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

  const staffTrainings = visible.filter(
    (t) => (t as any).audience !== "linguist",
  );
  const vendorTrainings = visible.filter(
    (t) => (t as any).audience === "linguist",
  );

  const renderCard = (t: TrainingWithStats) => {
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
          <h3 className="text-lg font-semibold text-gray-900">{t.title}</h3>
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
  };

  const Section = ({
    title,
    subtitle,
    items,
  }: {
    title: string;
    subtitle: string;
    items: TrainingWithStats[];
  }) =>
    items.length === 0 ? null : (
      <section className="mb-8">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            {title}
          </h2>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">{items.map(renderCard)}</div>
      </section>
    );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trainings</h1>
          <p className="text-sm text-gray-600 mt-1">
            {isAdmin
              ? "All staff and vendor trainings in one place, grouped by who they are for."
              : "Trainings assigned to you."}
          </p>
        </div>
        {isAdmin && (
          <Link
            to="/admin/qms/training-records"
            className="flex-shrink-0 inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-900"
          >
            <ClipboardList className="w-4 h-4" />
            Completion records
          </Link>
        )}
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
            {isAdmin
              ? "No trainings exist yet."
              : "No trainings assigned to you."}
          </p>
          {!isAdmin && (
            <p className="text-sm text-gray-500 mt-1">
              Ask an admin to assign one to you.
            </p>
          )}
        </div>
      )}

      {isAdmin ? (
        <>
          <Section
            title="Staff trainings"
            subtitle="For internal Cethos staff — taken here in the admin portal."
            items={staffTrainings}
          />
          <Section
            title="Vendor trainings"
            subtitle="For vendors / linguists — taken in the vendor portal."
            items={vendorTrainings}
          />
        </>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visible.map(renderCard)}
        </div>
      )}
    </div>
  );
}
