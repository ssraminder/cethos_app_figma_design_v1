import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { supabase } from "../../lib/supabase";

// ── Types ──────────────────────────────────────────────────────────

interface TaskSummary {
  my_assignments: number;
  pending_counters: number;
  overdue_steps: number;
  unreviewed_deliveries: number;
  unassigned_steps: number;
  expiring_offers: number;
  total: number;
}

interface Task {
  task_type:
    | "my_assignment"
    | "pending_counter"
    | "overdue_step"
    | "unreviewed_delivery"
    | "unassigned_step"
    | "expiring_offer";
  urgency: "critical" | "high" | "medium";
  step_id: string;
  order_id: string;
  order_number: string | null;
  step_name: string;
  source_language: string | null;
  target_language: string | null;
  // pending_counter
  offer_id?: string;
  vendor_name?: string;
  vendor_id?: string;
  original_rate?: number;
  original_total?: number;
  counter_rate?: number;
  counter_total?: number;
  counter_deadline?: string;
  counter_note?: string;
  submitted_at?: string;
  // overdue_step
  deadline?: string;
  hours_overdue?: number;
  // unreviewed_delivery
  delivered_at?: string;
  file_count?: number;
  // unassigned_step + my_assignment
  step_number?: number;
  // my_assignment
  actor_type?: string;
  step_status?: string;
  requires_file_upload?: boolean;
  instructions?: string | null;
  hours_to_deadline?: number | null;
  // expiring_offer
  expires_at?: string;
  hours_remaining?: number;
}

type FilterType =
  | "all"
  | "pending_counter"
  | "overdue_step"
  | "unreviewed_delivery"
  | "unassigned_step"
  | "expiring_offer";

type TabKey = "mine" | "all";

// ── Helpers ────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  if (diffMs < 0) {
    // future
    const absDiff = Math.abs(diffMs);
    if (absDiff < 60_000) return "in less than a minute";
    if (absDiff < 3_600_000) return `in ${Math.round(absDiff / 60_000)}m`;
    if (absDiff < 86_400_000) return `in ${Math.round(absDiff / 3_600_000)}h`;
    return `in ${Math.round(absDiff / 86_400_000)}d`;
  }
  if (diffMs < 60_000) return "just now";
  if (diffMs < 3_600_000) return `${Math.round(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.round(diffMs / 3_600_000)}h ago`;
  return `${Math.round(diffMs / 86_400_000)}d ago`;
}

function formatDeadline(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatCurrency(n: number): string {
  return `$${n.toFixed(2)}`;
}

function langPair(source: string | null, target: string | null): string {
  if (source && target) return `${source} → ${target}`;
  if (target) return target;
  return "";
}

// ── Summary Card Configs ───────────────────────────────────────────

const CARD_CONFIG: {
  key: FilterType;
  label: string;
  taskType: FilterType;
  activeColor: string;
  activeBg: string;
  activeBorder: string;
}[] = [
  {
    key: "pending_counter",
    label: "Counters",
    taskType: "pending_counter",
    activeColor: "text-yellow-700",
    activeBg: "bg-yellow-50",
    activeBorder: "border-yellow-300",
  },
  {
    key: "overdue_step",
    label: "Overdue",
    taskType: "overdue_step",
    activeColor: "text-red-700",
    activeBg: "bg-red-50",
    activeBorder: "border-red-300",
  },
  {
    key: "unreviewed_delivery",
    label: "Reviews",
    taskType: "unreviewed_delivery",
    activeColor: "text-blue-700",
    activeBg: "bg-blue-50",
    activeBorder: "border-blue-300",
  },
  {
    key: "unassigned_step",
    label: "Assign",
    taskType: "unassigned_step",
    activeColor: "text-amber-700",
    activeBg: "bg-amber-50",
    activeBorder: "border-amber-300",
  },
  {
    key: "expiring_offer",
    label: "Expiring",
    taskType: "expiring_offer",
    activeColor: "text-orange-700",
    activeBg: "bg-orange-50",
    activeBorder: "border-orange-300",
  },
];

const SUMMARY_KEYS: Record<string, keyof TaskSummary> = {
  pending_counter: "pending_counters",
  overdue_step: "overdue_steps",
  unreviewed_delivery: "unreviewed_deliveries",
  unassigned_step: "unassigned_steps",
  expiring_offer: "expiring_offers",
};

// ── Urgency Badge ──────────────────────────────────────────────────

function UrgencyBadge({ urgency }: { urgency: string }) {
  const styles: Record<string, string> = {
    critical: "bg-red-100 text-red-700",
    high: "bg-orange-100 text-orange-700",
    medium: "bg-yellow-100 text-yellow-700",
  };
  return (
    <span
      className={`px-2 py-0.5 text-xs rounded-full font-medium ${styles[urgency] || styles.medium}`}
    >
      {urgency.charAt(0).toUpperCase() + urgency.slice(1)}
    </span>
  );
}

// ── Task Card Renderers ────────────────────────────────────────────

function PendingCounterCard({ task }: { task: Task }) {
  const pair = langPair(task.source_language, task.target_language);
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base">🔔</span>
            <span className="font-medium text-gray-900 text-sm">
              Counter-Proposal
            </span>
            <span className="text-gray-500 text-sm">·</span>
            <span className="text-sm text-gray-700">
              {task.order_number || task.order_id.slice(0, 8)}
            </span>
            {pair && (
              <>
                <span className="text-gray-500 text-sm">·</span>
                <span className="text-sm text-gray-600">
                  {task.step_name} ({pair})
                </span>
              </>
            )}
          </div>
          <p className="text-sm text-gray-700 mt-1">
            {task.vendor_name} proposes{" "}
            <span className="font-medium">
              {formatCurrency(task.counter_total ?? task.counter_rate ?? 0)}
            </span>
            {task.original_total != null && (
              <span className="text-gray-500">
                {" "}
                (was {formatCurrency(task.original_total)})
              </span>
            )}
          </p>
          {task.counter_note && (
            <p className="text-sm text-gray-500 italic mt-0.5">
              "{task.counter_note}"
            </p>
          )}
          {task.submitted_at && (
            <p className="text-xs text-gray-400 mt-1">
              Submitted {relativeTime(task.submitted_at)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <UrgencyBadge urgency={task.urgency} />
          <Link
            to={`/admin/orders/${task.order_id}`}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium whitespace-nowrap"
          >
            View Order →
          </Link>
        </div>
      </div>
    </div>
  );
}

function OverdueStepCard({ task }: { task: Task }) {
  const pair = langPair(task.source_language, task.target_language);
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base">⏰</span>
            <span className="font-medium text-gray-900 text-sm">Overdue</span>
            <span className="text-gray-500 text-sm">·</span>
            <span className="text-sm text-gray-700">
              {task.order_number || task.order_id.slice(0, 8)}
            </span>
            {pair && (
              <>
                <span className="text-gray-500 text-sm">·</span>
                <span className="text-sm text-gray-600">
                  {task.step_name} ({pair})
                </span>
              </>
            )}
          </div>
          <p className="text-sm text-gray-700 mt-1">
            {task.vendor_name || "No vendor"} ·{" "}
            <span className="font-medium text-red-600">
              {task.hours_overdue != null
                ? `${Math.round(task.hours_overdue)}h overdue`
                : "Overdue"}
            </span>
            {task.deadline && (
              <span className="text-gray-500">
                {" "}
                (deadline was {formatDeadline(task.deadline)})
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <UrgencyBadge urgency={task.urgency} />
          <Link
            to={`/admin/orders/${task.order_id}`}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium whitespace-nowrap"
          >
            View Order →
          </Link>
        </div>
      </div>
    </div>
  );
}

function UnreviewedDeliveryCard({ task }: { task: Task }) {
  const pair = langPair(task.source_language, task.target_language);
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base">📦</span>
            <span className="font-medium text-gray-900 text-sm">
              Delivery Ready
            </span>
            <span className="text-gray-500 text-sm">·</span>
            <span className="text-sm text-gray-700">
              {task.order_number || task.order_id.slice(0, 8)}
            </span>
            {pair && (
              <>
                <span className="text-gray-500 text-sm">·</span>
                <span className="text-sm text-gray-600">
                  {task.step_name} ({pair})
                </span>
              </>
            )}
          </div>
          <p className="text-sm text-gray-700 mt-1">
            {task.vendor_name} delivered{" "}
            {task.file_count != null
              ? `${task.file_count} file${task.file_count !== 1 ? "s" : ""}`
              : "files"}
            {task.delivered_at && (
              <span className="text-gray-500">
                {" "}
                · {formatDeadline(task.delivered_at)}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <UrgencyBadge urgency={task.urgency} />
          <Link
            to={`/admin/orders/${task.order_id}`}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium whitespace-nowrap"
          >
            View Order →
          </Link>
        </div>
      </div>
    </div>
  );
}

function UnassignedStepCard({ task }: { task: Task }) {
  const pair = langPair(task.source_language, task.target_language);
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base">👤</span>
            <span className="font-medium text-gray-900 text-sm">
              Needs Assignment
            </span>
            <span className="text-gray-500 text-sm">·</span>
            <span className="text-sm text-gray-700">
              {task.order_number || task.order_id.slice(0, 8)}
            </span>
            {pair && (
              <>
                <span className="text-gray-500 text-sm">·</span>
                <span className="text-sm text-gray-600">
                  {task.step_name} ({pair})
                </span>
              </>
            )}
          </div>
          <p className="text-sm text-gray-700 mt-1">
            {task.step_number != null ? `Step ${task.step_number}` : "Step"} · No
            vendor assigned · Workflow in progress
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <UrgencyBadge urgency={task.urgency} />
          <Link
            to={`/admin/orders/${task.order_id}`}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium whitespace-nowrap"
          >
            View Order →
          </Link>
        </div>
      </div>
    </div>
  );
}

function ExpiringOfferCard({ task }: { task: Task }) {
  const pair = langPair(task.source_language, task.target_language);
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base">⏳</span>
            <span className="font-medium text-gray-900 text-sm">
              Offer Expiring
            </span>
            <span className="text-gray-500 text-sm">·</span>
            <span className="text-sm text-gray-700">
              {task.order_number || task.order_id.slice(0, 8)}
            </span>
            {pair && (
              <>
                <span className="text-gray-500 text-sm">·</span>
                <span className="text-sm text-gray-600">
                  {task.step_name} ({pair})
                </span>
              </>
            )}
          </div>
          <p className="text-sm text-gray-700 mt-1">
            {task.vendor_name} · Expires{" "}
            {task.hours_remaining != null
              ? `in ${Math.round(task.hours_remaining)}h`
              : task.expires_at
                ? relativeTime(task.expires_at)
                : "soon"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <UrgencyBadge urgency={task.urgency} />
          <Link
            to={`/admin/orders/${task.order_id}`}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium whitespace-nowrap"
          >
            View Order →
          </Link>
        </div>
      </div>
    </div>
  );
}

function MyAssignmentCard({ task }: { task: Task }) {
  const pair = langPair(task.source_language, task.target_language);
  const actorLabel =
    task.actor_type === "internal_review" ? "Internal review" : "Internal work";
  const statusLabel =
    task.step_status === "revision_requested"
      ? "Revision requested"
      : task.step_status === "in_progress"
        ? "In progress"
        : task.step_status === "accepted"
          ? "Accepted — ready to start"
          : task.step_status || "Assigned";
  const deadlineHint =
    task.hours_to_deadline != null && task.deadline
      ? task.hours_to_deadline < 0
        ? `${Math.abs(task.hours_to_deadline)}h overdue (${formatDeadline(task.deadline)})`
        : `Due in ${task.hours_to_deadline}h (${formatDeadline(task.deadline)})`
      : task.deadline
        ? `Due ${formatDeadline(task.deadline)}`
        : "No deadline";
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base">📝</span>
            <span className="font-medium text-gray-900 text-sm">{actorLabel}</span>
            <span className="text-gray-500 text-sm">·</span>
            <span className="text-sm text-gray-700">
              {task.order_number || task.order_id.slice(0, 8)}
            </span>
            {pair && (
              <>
                <span className="text-gray-500 text-sm">·</span>
                <span className="text-sm text-gray-600">
                  {task.step_name} ({pair})
                </span>
              </>
            )}
            {!pair && (
              <>
                <span className="text-gray-500 text-sm">·</span>
                <span className="text-sm text-gray-600">{task.step_name}</span>
              </>
            )}
          </div>
          <p className="text-sm text-gray-700 mt-1">
            {statusLabel}
            {task.requires_file_upload && (
              <span className="text-gray-500"> · file upload required</span>
            )}
            {task.file_count != null && task.file_count > 0 && (
              <span className="text-gray-500">
                {" "}
                · {task.file_count} file
                {task.file_count !== 1 ? "s" : ""} delivered
              </span>
            )}
          </p>
          <p className="text-xs text-gray-400 mt-1">{deadlineHint}</p>
          {task.instructions && (
            <p className="text-xs text-gray-500 italic mt-1 line-clamp-2">
              "{task.instructions}"
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <UrgencyBadge urgency={task.urgency} />
          <Link
            to={`/admin/orders/${task.order_id}`}
            className="text-purple-600 hover:text-purple-800 text-sm font-medium whitespace-nowrap"
          >
            Open step →
          </Link>
        </div>
      </div>
    </div>
  );
}

function TaskCard({ task }: { task: Task }) {
  switch (task.task_type) {
    case "my_assignment":
      return <MyAssignmentCard task={task} />;
    case "pending_counter":
      return <PendingCounterCard task={task} />;
    case "overdue_step":
      return <OverdueStepCard task={task} />;
    case "unreviewed_delivery":
      return <UnreviewedDeliveryCard task={task} />;
    case "unassigned_step":
      return <UnassignedStepCard task={task} />;
    case "expiring_offer":
      return <ExpiringOfferCard task={task} />;
    default:
      return null;
  }
}

// ── Main Page ──────────────────────────────────────────────────────

export default function StaffTasks() {
  const [summary, setSummary] = useState<TaskSummary | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tab, setTab] = useState<TabKey>("mine");
  const [filter, setFilter] = useState<FilterType>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialFocusAppliedRef = useRef(false);

  const fetchTasks = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        const { data, error: fnError } = await supabase.functions.invoke(
          "get-staff-tasks"
        );

        if (fnError) throw fnError;
        if (!data?.success) throw new Error(data?.error || "Failed to load tasks");

        setSummary(data.summary);
        setTasks(data.tasks || []);
        setLastUpdated(new Date());
        if (!initialFocusAppliedRef.current) {
          initialFocusAppliedRef.current = true;
          // Land on the user's own queue when they have items; otherwise
          // jump straight to the ops queue so the page isn't empty.
          if ((data.summary?.my_assignments ?? 0) === 0) {
            setTab("all");
          }
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to load tasks";
        setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  // Initial fetch
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Auto-refresh every 60s
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      fetchTasks(true);
    }, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchTasks]);

  const handleRefresh = () => {
    fetchTasks(false);
  };

  const handleCardClick = (type: FilterType) => {
    setFilter((prev) => (prev === type ? "all" : type));
  };

  const myTasks = tasks.filter((t) => t.task_type === "my_assignment");
  const opsTasks = tasks.filter((t) => t.task_type !== "my_assignment");
  const opsFiltered =
    filter === "all" ? opsTasks : opsTasks.filter((t) => t.task_type === filter);
  const myCount = summary?.my_assignments ?? 0;
  const opsCount = summary
    ? summary.total - (summary.my_assignments ?? 0)
    : 0;

  const updatedLabel = lastUpdated
    ? `Updated ${relativeTime(lastUpdated.toISOString())}`
    : "";

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          {summary && summary.total > 0 && (
            <p className="text-sm text-gray-500 mt-0.5">
              {summary.total} open task{summary.total !== 1 ? "s" : ""} across
              the team
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {updatedLabel && (
            <span className="text-xs text-gray-400">{updatedLabel}</span>
          )}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw
              className={`w-4 h-4 ${loading || refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex gap-6" aria-label="Tasks tabs">
          <button
            type="button"
            onClick={() => setTab("mine")}
            className={`py-2 px-1 border-b-2 text-sm font-medium transition ${
              tab === "mine"
                ? "border-purple-600 text-purple-700"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            My Tasks
            <span
              className={`ml-2 inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 text-xs rounded-full ${
                tab === "mine"
                  ? "bg-purple-100 text-purple-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {myCount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTab("all")}
            className={`py-2 px-1 border-b-2 text-sm font-medium transition ${
              tab === "all"
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            All Tasks
            <span
              className={`ml-2 inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 text-xs rounded-full ${
                tab === "all"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {opsCount}
            </span>
          </button>
        </nav>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !summary && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse"
            >
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* My Tasks tab */}
      {!loading && summary && tab === "mine" && (
        <>
          {myTasks.length > 0 ? (
            <div>
              {myTasks.map((task, idx) => (
                <TaskCard
                  key={`${task.task_type}-${task.step_id}-${idx}`}
                  task={task}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-lg font-medium text-gray-700">
                Nothing assigned to you right now.
              </p>
              <p className="text-sm text-gray-500 mt-1">
                When a workflow step is assigned to you, it'll show up here.
              </p>
              {opsCount > 0 && (
                <button
                  type="button"
                  onClick={() => setTab("all")}
                  className="text-sm text-blue-600 hover:text-blue-800 mt-3"
                >
                  See all team tasks ({opsCount}) →
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* All Tasks tab */}
      {!loading && summary && tab === "all" && (
        <>
          {/* Ops summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
            {CARD_CONFIG.map((card) => {
              const count = summary[SUMMARY_KEYS[card.key]] ?? 0;
              const isActive = filter === card.key;
              const hasItems = count > 0;
              return (
                <button
                  key={card.key}
                  onClick={() => handleCardClick(card.key)}
                  className={`bg-white rounded-lg border p-4 text-center cursor-pointer transition hover:shadow-md ${
                    isActive
                      ? `ring-2 ring-blue-500 ${card.activeBg} ${card.activeBorder}`
                      : hasItems
                        ? `${card.activeBorder} ${card.activeBg}`
                        : "border-gray-200"
                  }`}
                >
                  <div
                    className={`text-2xl font-bold ${
                      hasItems ? card.activeColor : "text-gray-300"
                    }`}
                  >
                    {count}
                  </div>
                  <div
                    className={`text-xs font-medium mt-1 ${
                      hasItems ? card.activeColor : "text-gray-400"
                    }`}
                  >
                    {card.label}
                  </div>
                </button>
              );
            })}
          </div>

          {opsFiltered.length > 0 ? (
            <div>
              {opsFiltered.map((task, idx) => (
                <TaskCard
                  key={`${task.task_type}-${task.step_id}-${idx}`}
                  task={task}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              {filter === "all" && opsCount === 0 ? (
                <>
                  <div className="text-4xl mb-3">✅</div>
                  <p className="text-lg font-medium text-gray-700">
                    All caught up!
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    No team tasks need attention right now.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-500">
                    No{" "}
                    {CARD_CONFIG.find((c) => c.key === filter)?.label.toLowerCase() ||
                      ""}{" "}
                    tasks right now.
                  </p>
                  <button
                    onClick={() => setFilter("all")}
                    className="text-sm text-blue-600 hover:text-blue-800 mt-2"
                  >
                    Show all team tasks
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
