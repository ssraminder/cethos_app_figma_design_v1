import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import {
  getTrainingBySlug,
  getLessons,
  getMyAssignment,
  getLessonProgress,
  markLessonAcknowledged,
  recordLessonViewed,
  Training,
  TrainingLesson as TrainingLessonType,
  TrainingAssignment,
} from "@/lib/trainings";

export default function TrainingLesson() {
  const { slug = "", lessonSlug = "" } = useParams();
  const navigate = useNavigate();

  const [training, setTraining] = useState<Training | null>(null);
  const [lessons, setLessons] = useState<TrainingLessonType[]>([]);
  const [assignment, setAssignment] = useState<TrainingAssignment | null>(null);
  const [ackedLessonIds, setAckedLessonIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAck, setBusyAck] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
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
          setAckedLessonIds(
            new Set(p.filter((x) => x.acknowledged_at).map((x) => x.lesson_id)),
          );
          const currentLesson = ls.find((l) => l.slug === lessonSlug);
          if (currentLesson) {
            await recordLessonViewed(a.id, currentLesson.id);
          }
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
  }, [slug, lessonSlug]);

  const currentIdx = useMemo(
    () => lessons.findIndex((l) => l.slug === lessonSlug),
    [lessons, lessonSlug],
  );
  const current = currentIdx >= 0 ? lessons[currentIdx] : null;
  const prev = currentIdx > 0 ? lessons[currentIdx - 1] : null;
  const next = currentIdx >= 0 && currentIdx < lessons.length - 1
    ? lessons[currentIdx + 1]
    : null;
  const acked = current ? ackedLessonIds.has(current.id) : false;

  async function handleAcknowledge() {
    if (!assignment || !current || busyAck) return;
    setBusyAck(true);
    try {
      await markLessonAcknowledged(assignment.id, current.id);
      setAckedLessonIds((prev) => {
        const n = new Set(prev);
        n.add(current.id);
        return n;
      });
      if (next) {
        navigate(`/admin/trainings/${slug}/${next.slug}`);
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusyAck(false);
    }
  }

  if (loading) return <div className="p-6 text-gray-500">Loading…</div>;
  if (error)
    return (
      <div className="p-6">
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      </div>
    );
  if (!training || !current) return null;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link
        to={`/admin/trainings/${training.slug}`}
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        {training.title}
      </Link>

      <header className="mb-6 pb-4 border-b border-gray-200">
        <div className="flex items-baseline gap-2 text-xs text-gray-500 mb-1">
          <span>
            Lesson {current.order_index} of {lessons.length}
          </span>
          <span>· {current.estimated_minutes} min</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{current.title}</h1>
      </header>

      <article className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-a:text-teal-600 prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-pink-700 prose-code:before:content-none prose-code:after:content-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {current.body_markdown}
        </ReactMarkdown>
      </article>

      {current.screenshot_paths?.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {current.screenshot_paths.map((src) => (
            <button
              key={src}
              type="button"
              onClick={() => setZoomedImage(src)}
              className="block bg-gray-50 border border-gray-200 rounded-lg overflow-hidden hover:border-teal-400 transition"
            >
              <img
                src={src}
                alt=""
                className="w-full h-auto"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                  (e.currentTarget.parentElement as HTMLElement).insertAdjacentHTML(
                    "beforeend",
                    '<div class="p-8 text-center text-gray-400 text-xs">Screenshot not yet captured</div>',
                  );
                }}
              />
            </button>
          ))}
        </div>
      )}

      {current.key_rules?.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
            Key rules
          </h2>
          <div className="space-y-3">
            {current.key_rules.map((kr, i) => (
              <div
                key={i}
                className="flex gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg"
              >
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-900 text-sm">{kr.rule}</p>
                  <p className="text-xs text-amber-800 mt-1">
                    <span className="font-semibold">Why: </span>
                    {kr.reason}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {current.route_reference && (
        <section className="mt-8 p-4 bg-teal-50 border border-teal-200 rounded-lg">
          <p className="text-sm text-teal-900 font-medium mb-1">Try it yourself</p>
          <Link
            to={current.route_reference}
            target="_blank"
            className="inline-flex items-center gap-1 text-sm text-teal-700 hover:text-teal-900 underline"
          >
            Open {current.route_reference}
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </section>
      )}

      <nav className="mt-10 flex items-center justify-between border-t border-gray-200 pt-6">
        <div>
          {prev ? (
            <Link
              to={`/admin/trainings/${training.slug}/${prev.slug}`}
              className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-4 h-4" />
              {prev.title}
            </Link>
          ) : (
            <span />
          )}
        </div>

        <div className="flex items-center gap-3">
          {assignment ? (
            acked ? (
              <span className="inline-flex items-center gap-1 text-sm text-green-700">
                <CheckCircle2 className="w-4 h-4" />
                Acknowledged
              </span>
            ) : (
              <button
                type="button"
                onClick={handleAcknowledge}
                disabled={busyAck}
                className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                I've read this
              </button>
            )
          ) : (
            <span className="text-xs text-gray-500">
              Progress tracking requires an assignment.
            </span>
          )}

          {next && (
            <Link
              to={`/admin/trainings/${training.slug}/${next.slug}`}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm text-gray-700 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Next
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </nav>

      {zoomedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8 cursor-zoom-out"
          onClick={() => setZoomedImage(null)}
        >
          <img
            src={zoomedImage}
            alt=""
            className="max-w-full max-h-full rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
