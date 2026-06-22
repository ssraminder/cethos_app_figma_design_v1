import { useState, useEffect, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Loader2,
  UserPlus,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

// ---------- Constants ----------

const TAB_STATUSES: Record<string, string[]> = {
  // "Needs Attention" = genuine staff-action items only. info_requested is
  // waiting-on-applicant (they're auto-emailed for the missing info via
  // cvp-request-info), so it lives under "In Progress" — not a staff queue.
  attention: ["staff_review", "references_received"],
  // "In Progress" = waiting on applicant or system. Post-submission states
  // (test_submitted, test_assessed) live under "Tests to Review" — the
  // staff-action queue — and are intentionally excluded here to avoid the
  // same applicant showing up on both tabs. references_requested and
  // references_in_progress are also waiting-on-applicant states.
  // references_received goes under Needs Attention — all evidence is in
  // and the next move is staff approval (or reassessment).
  in_progress: [
    "submitted",
    "prescreening",
    "prescreened",
    "info_requested",
    "test_pending",
    "test_sent",
    "test_in_progress",
    "references_requested",
    "references_in_progress",
    "negotiation",
  ],
  decided: ["approved", "rejected", "archived"],
  waitlist: ["waitlisted"],
};

const TAB_LABELS: Record<string, string> = {
  // "Ready for Approval" = the single human-review queue: assessment passed +
  // at least one reference received (per the "request 2, approve on 1 good
  // reference" policy). Backed by the cvp_ready_for_approval view, not a flat
  // status filter — readiness spans applications + test combos + references.
  ready: "Ready for Approval",
  attention: "Needs Attention",
  tests: "Tests to Review",
  in_progress: "In Progress",
  decided: "Decided",
  waitlist: "Waitlist",
};

// "Tests to Review" — applicants with at least one combination genuinely
// needing staff eyes. Two cases:
//   1. test_submitted — just landed, AI hasn't graded yet
//   2. assessed — AI graded as borderline (needs a decision)
// AI auto-approved combos (>=75) are NO LONGER listed here: under the automated
// pipeline the AI assessment is the competence gate, and the single human review
// happens at final approval — not as a separate per-test confirmation step.
// Rejected combos are excluded too (settled by AI).
const TESTS_REVIEW_OR_FILTER = "status.in.(test_submitted,assessed)";

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  prescreening: "Pre-screening",
  prescreened: "Pre-screened",
  test_pending: "Test Pending",
  test_sent: "Test Sent",
  test_in_progress: "Test In Progress",
  test_submitted: "Test Submitted",
  test_assessed: "Test Assessed",
  references_requested: "References Requested",
  references_in_progress: "References In Progress",
  references_received: "References Received",
  negotiation: "Negotiation",
  staff_review: "Staff Review",
  approved: "Approved",
  rejected: "Rejected",
  waitlisted: "Waitlisted",
  archived: "Archived",
  info_requested: "Info Requested",
};

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-gray-100 text-gray-700",
  prescreening: "bg-blue-100 text-blue-700",
  prescreened: "bg-blue-100 text-blue-700",
  test_pending: "bg-yellow-100 text-yellow-700",
  test_sent: "bg-yellow-100 text-yellow-700",
  test_in_progress: "bg-yellow-100 text-yellow-700",
  test_submitted: "bg-indigo-100 text-indigo-700",
  test_assessed: "bg-indigo-100 text-indigo-700",
  negotiation: "bg-purple-100 text-purple-700",
  staff_review: "bg-orange-100 text-orange-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  waitlisted: "bg-cyan-100 text-cyan-700",
  archived: "bg-gray-100 text-gray-500",
  info_requested: "bg-amber-100 text-amber-700",
};

const TIER_LABELS: Record<string, string> = {
  standard: "Standard",
  senior: "Senior",
  expert: "Expert",
};

const TIER_COLORS: Record<string, string> = {
  standard: "bg-gray-100 text-gray-600",
  senior: "bg-blue-100 text-blue-700",
  expert: "bg-purple-100 text-purple-700",
};

// Per-combination chip helpers for the "Tests to Review" tab. The Status
// column on that tab shows one chip per combo (Domain — Outcome) instead of
// the application-level status, so staff can see test results at a glance.
type ChipOutcome = "pass" | "borderline" | "fail" | "pending";

const CHIP_LABEL: Record<ChipOutcome, string> = {
  pass: "Pass",
  borderline: "Borderline",
  fail: "Fail",
  pending: "Pending",
};

const CHIP_COLOR: Record<ChipOutcome, string> = {
  pass: "bg-green-100 text-green-700",
  borderline: "bg-yellow-100 text-yellow-700",
  fail: "bg-red-100 text-red-700",
  pending: "bg-gray-100 text-gray-600",
};

const DOMAIN_LABEL: Record<string, string> = {
  legal: "Legal",
  certified_official: "Certified / Official",
  immigration: "Immigration",
  medical: "Medical",
  life_sciences: "Life Sciences",
  pharmaceutical: "Pharmaceutical",
  financial: "Financial",
  insurance: "Insurance",
  technical: "Technical",
  it_software: "IT & Software",
  automotive_engineering: "Automotive & Engineering",
  energy: "Energy",
  marketing_advertising: "Marketing & Advertising",
  literary_publishing: "Literary & Publishing",
  academic_scientific: "Academic & Scientific",
  government_public: "Government & Public",
  business_corporate: "Business & Corporate",
  gaming_entertainment: "Gaming & Entertainment",
  media_journalism: "Media & Journalism",
  tourism_hospitality: "Tourism & Hospitality",
  general: "General",
  other: "Other",
};

// Combos in pending / test_assigned / test_sent / no_test_available / skipped
// have nothing useful to render — drop them.
const CHIP_VISIBLE_STATUSES = new Set([
  "test_submitted",
  "assessed",
  "approved",
  "rejected",
]);

// certified_official is a staff-only flow — no test is ever sent, no AI
// score recorded. Combos in this domain get cascade-approved when the
// applicant's General test passes (approved + ai_score=null), which my
// first cut of the chip logic mis-rendered as "Pending". Rendering them in
// a test-outcomes column is misleading either way; hide them from the chip
// stack and let the application-level approval reflect the actual decision.
const CHIP_HIDDEN_DOMAINS = new Set(["certified_official"]);

function chipOutcome(c: ComboChip): ChipOutcome {
  if (c.ai_score == null) return "pending";
  if (c.ai_score >= 75) return "pass";
  if (c.ai_score >= 60) return "borderline";
  return "fail";
}

// ---------- Types ----------

interface Application {
  id: string;
  application_number: string;
  full_name: string;
  email: string;
  role_type: string;
  status: string;
  ai_prescreening_score: number | null;
  assigned_tier: string | null;
  country: string;
  created_at: string;
  updated_at: string;
}

interface ComboChip {
  id: string;
  application_id: string;
  domain: string | null;
  ai_score: number | null;
  status: string;
}

type SortField = "full_name" | "ai_prescreening_score" | "created_at";

const PAGE_SIZE = 25;

// ---------- Component ----------

export default function RecruitmentList() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [applications, setApplications] = useState<Application[]>([]);
  const [combosByApp, setCombosByApp] = useState<Record<string, ComboChip[]>>({});
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({
    ready: 0,
    attention: 0,
    tests: 0,
    in_progress: 0,
    decided: 0,
    waitlist: 0,
  });

  // URL-driven state
  const activeTab = searchParams.get("tab") || "attention";
  const search = searchParams.get("search") || "";
  const sortField = (searchParams.get("sort") || "created_at") as SortField;
  const sortAsc = searchParams.get("asc") === "true";
  const page = parseInt(searchParams.get("page") || "1", 10);

  // Filter state — all URL-driven. Status / tier are comma-separated lists,
  // language and country are single values. Empty string = filter off.
  const statusFilter = (searchParams.get("status") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const tierFilter = (searchParams.get("tier") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const srcLangFilter = searchParams.get("src_lang") || "";
  const tgtLangFilter = searchParams.get("tgt_lang") || "";
  const countryFilter = searchParams.get("country") || "";
  const roleFilter = searchParams.get("role") || "";
  const scoreFilter = searchParams.get("score") || ""; // "", "85", "70_84", "lt70"

  const hasAnyFilter =
    statusFilter.length > 0 ||
    tierFilter.length > 0 ||
    Boolean(srcLangFilter) ||
    Boolean(tgtLangFilter) ||
    Boolean(countryFilter) ||
    Boolean(roleFilter) ||
    Boolean(scoreFilter);

  const [searchInput, setSearchInput] = useState(search);

  // Filter options — fetched once. Languages are codes that actually exist
  // on cvp_test_combinations for this org's applications (so the dropdown
  // doesn't list every ISO code, just the ones with data).
  const [availableLanguages, setAvailableLanguages] = useState<{ code: string; name: string }[]>([]);
  const [availableCountries, setAvailableCountries] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Distinct (src, tgt) language ids that appear on any combo. Resolve
      // to (code, name) via the languages table. Static-ish — load once.
      const { data: comboLangs } = await supabase
        .from("cvp_test_combinations")
        .select("source_language_id, target_language_id");
      const langIds = new Set<string>();
      for (const r of (comboLangs ?? []) as { source_language_id: string | null; target_language_id: string | null }[]) {
        if (r.source_language_id) langIds.add(r.source_language_id);
        if (r.target_language_id) langIds.add(r.target_language_id);
      }
      if (langIds.size > 0) {
        const { data: langs } = await supabase
          .from("languages")
          .select("code, name")
          .in("id", Array.from(langIds));
        if (!cancelled && langs) {
          const seen = new Set<string>();
          const opts: { code: string; name: string }[] = [];
          for (const l of langs as { code: string; name: string }[]) {
            const up = (l.code ?? "").toUpperCase();
            if (!up || seen.has(up)) continue;
            seen.add(up);
            opts.push({ code: up, name: l.name ?? up });
          }
          opts.sort((a, b) => a.name.localeCompare(b.name));
          setAvailableLanguages(opts);
        }
      }

      // Distinct countries on cvp_applications. Capped at a reasonable
      // ceiling — current data has ~30 countries.
      const { data: countryRows } = await supabase
        .from("cvp_applications")
        .select("country")
        .not("country", "is", null);
      if (!cancelled && countryRows) {
        const seen = new Set<string>();
        for (const r of countryRows as { country: string | null }[]) {
          const c = (r.country ?? "").trim();
          if (c) seen.add(c);
        }
        setAvailableCountries(Array.from(seen).sort());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch tab counts
  const fetchTabCounts = useCallback(async () => {
    // Compute Tests-to-Review applicant set first. Any applicant with a
    // reviewable combo "wins" that tab and is excluded from In Progress, so
    // an applicant never appears on both — even though their application
    // status (e.g. test_in_progress) would otherwise place them in both.
    let testsAppIds = new Set<string>();
    try {
      const { data } = await supabase
        .from("cvp_test_combinations")
        .select("application_id")
        .or(TESTS_REVIEW_OR_FILTER);
      testsAppIds = new Set(
        (data ?? []).map((r) => (r as { application_id: string }).application_id)
      );
    } catch {
      testsAppIds = new Set();
    }

    // Ready-for-Approval winners "win" their queue and are subtracted from
    // In Progress too (a ready applicant's status is references_requested /
    // references_in_progress / test_in_progress, all of which live under In
    // Progress) so they never appear on both tabs.
    let readyAppIds = new Set<string>();
    try {
      const { data } = await supabase
        .from("cvp_ready_for_approval")
        .select("application_id");
      readyAppIds = new Set(
        (data ?? []).map((r) => (r as { application_id: string }).application_id)
      );
    } catch {
      readyAppIds = new Set();
    }

    const counts: Record<string, number> = {
      tests: testsAppIds.size,
      ready: readyAppIds.size,
    };
    await Promise.all(
      Object.entries(TAB_STATUSES).map(async ([tab, statuses]) => {
        if (tab === "in_progress" && (testsAppIds.size > 0 || readyAppIds.size > 0)) {
          // Status-filter then subtract Tests-to-Review + Ready winners locally.
          const { data, error } = await supabase
            .from("cvp_applications")
            .select("id")
            .in("status", statuses);
          if (error) {
            counts[tab] = 0;
            return;
          }
          counts[tab] = (data ?? []).filter((r) => {
            const id = (r as { id: string }).id;
            return !testsAppIds.has(id) && !readyAppIds.has(id);
          }).length;
          return;
        }
        const { count, error } = await supabase
          .from("cvp_applications")
          .select("*", { count: "exact", head: true })
          .in("status", statuses);
        counts[tab] = error ? 0 : (count ?? 0);
      })
    );
    setTabCounts(counts);
  }, []);

  // Fetch applications for current tab
  const fetchApplications = useCallback(async () => {
    setLoading(true);
    try {
      // When the user is searching, treat the lookup as global — tabs are
      // for browsing, search is for finding. Otherwise a row whose status
      // doesn't match the active tab is invisible (e.g. searching
      // "APP-26-9900" from Needs Attention used to return nothing because
      // that app's status='test_in_progress' lives under In Progress). The
      // row still renders a status badge so the user can see which tab
      // each match belongs to.
      const isSearching = search.trim().length > 0;

      // Build the base id list. The "tests" tab pulls applicant ids from
      // cvp_test_combinations (any combo in test_submitted, assessed, or AI
      // auto-approved). Every other tab is a flat status filter on
      // cvp_applications. Both are skipped when searching.
      let appIds: string[] | null = null;
      if (activeTab === "tests" && !isSearching) {
        const { data: comboRows, error: comboErr } = await supabase
          .from("cvp_test_combinations")
          .select("application_id")
          .or(TESTS_REVIEW_OR_FILTER);
        if (comboErr) throw comboErr;
        appIds = Array.from(
          new Set((comboRows ?? []).map((r) => (r as { application_id: string }).application_id))
        );
        if (appIds.length === 0) {
          setApplications([]);
          setCombosByApp({});
          setTotalCount(0);
          setLoading(false);
          return;
        }
      } else if (activeTab === "ready" && !isSearching) {
        // Ready-for-Approval ids come from the readiness view (assessed + a
        // reference received), then flow through the same .in("id", ...) path.
        const { data: readyRows, error: readyErr } = await supabase
          .from("cvp_ready_for_approval")
          .select("application_id");
        if (readyErr) throw readyErr;
        appIds = Array.from(
          new Set((readyRows ?? []).map((r) => (r as { application_id: string }).application_id))
        );
        if (appIds.length === 0) {
          setApplications([]);
          setCombosByApp({});
          setTotalCount(0);
          setLoading(false);
          return;
        }
      }

      // In Progress excludes anyone already on Tests to Review, so a single
      // applicant never appears on both tabs (e.g. app.status='test_in_progress'
      // with one cascade-auto-approved combo would otherwise hit both queues).
      let excludeIds: string[] = [];
      if (activeTab === "in_progress" && !isSearching) {
        const [{ data: comboRows }, { data: readyRows }] = await Promise.all([
          supabase
            .from("cvp_test_combinations")
            .select("application_id")
            .or(TESTS_REVIEW_OR_FILTER),
          supabase.from("cvp_ready_for_approval").select("application_id"),
        ]);
        excludeIds = Array.from(
          new Set([
            ...(comboRows ?? []).map(
              (r) => (r as { application_id: string }).application_id
            ),
            ...(readyRows ?? []).map(
              (r) => (r as { application_id: string }).application_id
            ),
          ])
        );
      }

      let query = supabase
        .from("cvp_applications")
        .select(
          "id, application_number, full_name, email, role_type, status, ai_prescreening_score, assigned_tier, country, created_at, updated_at",
          { count: "exact" }
        );

      // ── Apply language filter first because it narrows the id set, which
      //    we can then AND with the tab/status filter via .in("id", ...).
      //    Resolve UPPER(code) → uuid(s) on languages, then pick applications
      //    that have at least one cvp_test_combinations row matching the
      //    requested pair. Empty src/tgt means "any" on that side.
      let languageScopedIds: string[] | null = null;
      if (srcLangFilter || tgtLangFilter) {
        const codes = [srcLangFilter, tgtLangFilter].filter(Boolean);
        const { data: langRows } = await supabase
          .from("languages")
          .select("id, code")
          .in("code", codes.map((c) => c.toLowerCase()));
        // languages.code is stored lowercase (e.g. "en", "es") so we matched
        // case-insensitively. Build the id buckets per direction.
        const srcIds = new Set<string>();
        const tgtIds = new Set<string>();
        for (const l of (langRows ?? []) as { id: string; code: string }[]) {
          const up = (l.code ?? "").toUpperCase();
          if (srcLangFilter && up === srcLangFilter) srcIds.add(l.id);
          if (tgtLangFilter && up === tgtLangFilter) tgtIds.add(l.id);
        }
        let comboQ = supabase
          .from("cvp_test_combinations")
          .select("application_id");
        if (srcLangFilter && srcIds.size > 0) {
          comboQ = comboQ.in("source_language_id", Array.from(srcIds));
        }
        if (tgtLangFilter && tgtIds.size > 0) {
          comboQ = comboQ.in("target_language_id", Array.from(tgtIds));
        }
        const { data: comboRows } = await comboQ;
        languageScopedIds = Array.from(
          new Set(
            (comboRows ?? []).map((r) => (r as { application_id: string }).application_id),
          ),
        );
        if (languageScopedIds.length === 0) {
          // No applications match the language filter — short-circuit.
          setApplications([]);
          setCombosByApp({});
          setTotalCount(0);
          setLoading(false);
          return;
        }
      }

      if (appIds) {
        // Tests tab: intersect with language filter if present.
        const intersected = languageScopedIds
          ? appIds.filter((id) => languageScopedIds!.includes(id))
          : appIds;
        if (intersected.length === 0) {
          setApplications([]);
          setCombosByApp({});
          setTotalCount(0);
          setLoading(false);
          return;
        }
        query = query.in("id", intersected);
      } else if (!isSearching) {
        // Status filter: intersection of explicit selection (if any) with
        // the active tab's allowed statuses. If the explicit selection is
        // disjoint from the tab — empty result.
        const tabStatuses = TAB_STATUSES[activeTab] || [];
        let statuses = tabStatuses;
        if (statusFilter.length > 0) {
          statuses = tabStatuses.filter((s) => statusFilter.includes(s));
          if (statuses.length === 0) {
            setApplications([]);
            setCombosByApp({});
            setTotalCount(0);
            setLoading(false);
            return;
          }
        }
        query = query.in("status", statuses);
        if (excludeIds.length > 0) {
          query = query.not("id", "in", `(${excludeIds.join(",")})`);
        }
        if (languageScopedIds) {
          query = query.in("id", languageScopedIds);
        }
      } else if (languageScopedIds) {
        // Search mode + language filter: scope the search to matching ids.
        query = query.in("id", languageScopedIds);
      }

      if (isSearching) {
        const term = search.trim();
        query = query.or(
          `full_name.ilike.%${term}%,email.ilike.%${term}%,application_number.ilike.%${term}%`
        );
      }

      // Tier + country + role + AI-score filters always apply on top.
      if (tierFilter.length > 0) {
        query = query.in("assigned_tier", tierFilter);
      }
      if (countryFilter) {
        query = query.eq("country", countryFilter);
      }
      if (roleFilter) {
        query = query.eq("role_type", roleFilter);
      }
      if (scoreFilter === "85") {
        query = query.gte("ai_prescreening_score", 85);
      } else if (scoreFilter === "70_84") {
        query = query.gte("ai_prescreening_score", 70).lte("ai_prescreening_score", 84);
      } else if (scoreFilter === "lt70") {
        query = query.lt("ai_prescreening_score", 70);
      }

      query = query.order(sortField, { ascending: sortAsc });

      const from = (page - 1) * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data, count, error } = await query;
      if (error) throw error;

      const rows = (data as Application[]) || [];
      setApplications(rows);
      setTotalCount(count ?? 0);

      // Tests tab: load all combos for the visible applicants so the Status
      // column can render one chip per combo (Domain — Pass/Fail/Borderline/
      // Pending). Other tabs keep the application-level badge — no fetch.
      if (activeTab === "tests" && !isSearching && rows.length > 0) {
        const ids = rows.map((r) => r.id);
        const { data: comboData, error: comboErr } = await supabase
          .from("cvp_test_combinations")
          .select("id, application_id, domain, ai_score, status")
          .in("application_id", ids);
        if (comboErr) throw comboErr;
        const grouped: Record<string, ComboChip[]> = {};
        for (const c of (comboData ?? []) as ComboChip[]) {
          if (!CHIP_VISIBLE_STATUSES.has(c.status)) continue;
          if (c.domain && CHIP_HIDDEN_DOMAINS.has(c.domain)) continue;
          (grouped[c.application_id] ||= []).push(c);
        }
        for (const id of Object.keys(grouped)) {
          grouped[id].sort((a, b) => (a.domain ?? "").localeCompare(b.domain ?? ""));
        }
        setCombosByApp(grouped);
      } else {
        setCombosByApp({});
      }
    } catch (err) {
      console.error("Failed to fetch applications:", err);
      setApplications([]);
      setCombosByApp({});
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [
    activeTab,
    search,
    sortField,
    sortAsc,
    page,
    // Stable string keys for the comma-separated filters so React reruns
    // when the URL changes. Joining with a separator keeps the dep
    // identity-stable when the array re-derives but the contents match.
    statusFilter.join(","),
    tierFilter.join(","),
    srcLangFilter,
    tgtLangFilter,
    countryFilter,
    roleFilter,
    scoreFilter,
  ]);

  useEffect(() => {
    fetchTabCounts();
  }, [fetchTabCounts]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  // URL update helpers
  const setParam = (key: string, value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const handleTabChange = (tab: string) => {
    setSearchParams({ tab, ...(search ? { search } : {}) });
  };

  const handleSearch = () => {
    // setSearchParams from react-router-dom v6 is `navigate(?...)` with
    // the URL computed from searchParamsRef.current at call time — it is
    // NOT a React setState and consecutive calls do NOT chain. Two
    // setParam invocations would each read the pre-search URL; the
    // second navigate then overwrites the first, silently dropping the
    // search param. Always update multiple keys in a single call.
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (searchInput) {
        next.set("search", searchInput);
      } else {
        next.delete("search");
      }
      next.delete("page");
      return next;
    });
  };

  // When a filter changes, also drop page=N so we land on page 1 of the
  // new result set instead of an out-of-range page.
  const setFilterParam = (key: string, value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("page");
      return next;
    });
  };

  const toggleListFilter = (key: "status" | "tier", value: string) => {
    const current = key === "status" ? statusFilter : tierFilter;
    const has = current.includes(value);
    const next = has ? current.filter((v) => v !== value) : [...current, value];
    setFilterParam(key, next.join(","));
  };

  const clearAllFilters = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      ["status", "tier", "src_lang", "tgt_lang", "country", "role", "score", "page"].forEach((k) => next.delete(k));
      return next;
    });
  };

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setParam("asc", sortAsc ? "" : "true");
    } else {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("sort", field);
        next.delete("asc");
        return next;
      });
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (field !== sortField)
      return <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />;
    return sortAsc ? (
      <ArrowUp className="w-3.5 h-3.5 text-teal-600" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-teal-600" />
    );
  };

  const getAiScoreColor = (score: number | null) => {
    if (score === null) return "text-gray-400";
    if (score >= 70) return "text-green-600 font-semibold";
    if (score >= 50) return "text-yellow-600 font-semibold";
    return "text-red-600 font-semibold";
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <UserPlus className="w-6 h-6 text-teal-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Vendor Recruitment
            </h1>
            <p className="text-sm text-gray-500">
              Manage freelance translator and cognitive debriefing applications
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            fetchTabCounts();
            fetchApplications();
          }}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-4">
        {Object.entries(TAB_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === key
                ? "border-teal-600 text-teal-700"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {label}
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                activeTab === key
                  ? "bg-teal-100 text-teal-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {tabCounts[key] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {/* Status — multi-select within the active tab's allowed set. */}
        <details className="relative">
          <summary className="cursor-pointer list-none px-3 py-1.5 bg-white border border-gray-300 rounded-md text-xs text-gray-700 hover:border-gray-400 select-none">
            Status{statusFilter.length > 0 ? ` · ${statusFilter.length}` : ""}
          </summary>
          <div className="absolute z-10 mt-1 bg-white border border-gray-200 rounded-md shadow-lg p-2 w-64 max-h-72 overflow-y-auto">
            {(TAB_STATUSES[activeTab] ?? []).map((s) => (
              <label key={s} className="flex items-center gap-2 px-1.5 py-1 hover:bg-gray-50 rounded text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={statusFilter.includes(s)}
                  onChange={() => toggleListFilter("status", s)}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-gray-700">{STATUS_LABELS[s] ?? s}</span>
              </label>
            ))}
            {statusFilter.length > 0 && (
              <button
                type="button"
                onClick={() => setFilterParam("status", "")}
                className="mt-1 w-full text-[11px] text-gray-500 hover:text-gray-700 text-left px-1.5 py-1"
              >
                Clear status
              </button>
            )}
          </div>
        </details>

        {/* Source language — single-select. */}
        <select
          value={srcLangFilter}
          onChange={(e) => setFilterParam("src_lang", e.target.value)}
          className="px-2.5 py-1.5 bg-white border border-gray-300 rounded-md text-xs text-gray-700 hover:border-gray-400"
        >
          <option value="">Source language: any</option>
          {availableLanguages.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name} ({l.code})
            </option>
          ))}
        </select>

        {/* Target language — single-select. */}
        <select
          value={tgtLangFilter}
          onChange={(e) => setFilterParam("tgt_lang", e.target.value)}
          className="px-2.5 py-1.5 bg-white border border-gray-300 rounded-md text-xs text-gray-700 hover:border-gray-400"
        >
          <option value="">Target language: any</option>
          {availableLanguages.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name} ({l.code})
            </option>
          ))}
        </select>

        {/* Country — single-select. */}
        <select
          value={countryFilter}
          onChange={(e) => setFilterParam("country", e.target.value)}
          className="px-2.5 py-1.5 bg-white border border-gray-300 rounded-md text-xs text-gray-700 hover:border-gray-400"
        >
          <option value="">Country: any</option>
          {availableCountries.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Role — single-select. */}
        <select
          value={roleFilter}
          onChange={(e) => setFilterParam("role", e.target.value)}
          className="px-2.5 py-1.5 bg-white border border-gray-300 rounded-md text-xs text-gray-700 hover:border-gray-400"
        >
          <option value="">Role: any</option>
          <option value="translator">Translator / Reviewer</option>
          <option value="cognitive_debriefing">CD Interviewer</option>
          <option value="cd_clinician_consultant">CD &amp; Clinician Consultant</option>
          <option value="clinician_reviewer">Clinician Reviewer</option>
          <option value="agency">Agency</option>
        </select>

        {/* AI prescreen score — single-select bucket. */}
        <select
          value={scoreFilter}
          onChange={(e) => setFilterParam("score", e.target.value)}
          className="px-2.5 py-1.5 bg-white border border-gray-300 rounded-md text-xs text-gray-700 hover:border-gray-400"
        >
          <option value="">AI score: any</option>
          <option value="85">85+ (strong)</option>
          <option value="70_84">70–84 (pass)</option>
          <option value="lt70">Below 70</option>
        </select>

        {/* Tier — multi-select. */}
        <details className="relative">
          <summary className="cursor-pointer list-none px-3 py-1.5 bg-white border border-gray-300 rounded-md text-xs text-gray-700 hover:border-gray-400 select-none">
            Tier{tierFilter.length > 0 ? ` · ${tierFilter.length}` : ""}
          </summary>
          <div className="absolute z-10 mt-1 bg-white border border-gray-200 rounded-md shadow-lg p-2 w-44">
            {Object.entries(TIER_LABELS).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 px-1.5 py-1 hover:bg-gray-50 rounded text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={tierFilter.includes(key)}
                  onChange={() => toggleListFilter("tier", key)}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-gray-700">{label}</span>
              </label>
            ))}
          </div>
        </details>

        {hasAnyFilter && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
          >
            Clear all filters
          </button>
        )}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, email, or application number..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          />
        </div>
        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 transition-colors"
        >
          Search
        </button>
        {search && (
          <button
            onClick={() => {
              setSearchInput("");
              setParam("search", "");
            }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
            <span className="ml-2 text-gray-500">Loading applications...</span>
          </div>
        ) : applications.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <UserPlus className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-lg font-medium">No applications found</p>
            <p className="text-sm mt-1">
              {search
                ? "Try adjusting your search terms"
                : "No applications in this category yet"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left">
                  <th className="px-4 py-3 font-medium text-gray-600">
                    Application #
                  </th>
                  <th
                    className="px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900"
                    onClick={() => handleSort("full_name")}
                  >
                    <span className="flex items-center gap-1">
                      Name & Email
                      <SortIcon field="full_name" />
                    </span>
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-600">Role</th>
                  <th className="px-4 py-3 font-medium text-gray-600">
                    Country
                  </th>
                  <th
                    className="px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900"
                    onClick={() => handleSort("ai_prescreening_score")}
                  >
                    <span className="flex items-center gap-1">
                      AI Score
                      <SortIcon field="ai_prescreening_score" />
                    </span>
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-600">Tier</th>
                  <th className="px-4 py-3 font-medium text-gray-600">
                    Status
                  </th>
                  <th
                    className="px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900"
                    onClick={() => handleSort("created_at")}
                  >
                    <span className="flex items-center gap-1">
                      Applied
                      <SortIcon field="created_at" />
                    </span>
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-600">
                    Last Update
                  </th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => (
                  <tr
                    key={app.id}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/recruitment/${app.id}`}
                        className="font-mono text-teal-600 hover:text-teal-800 hover:underline"
                      >
                        {app.application_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/recruitment/${app.id}`}
                        className="hover:text-teal-700"
                      >
                        <div className="font-medium text-gray-900">
                          {app.full_name}
                        </div>
                        <div className="text-gray-500 text-xs">
                          {app.email}
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          app.role_type === "translator"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-violet-100 text-violet-700"
                        }`}
                      >
                        {app.role_type === "translator"
                          ? "Translator"
                          : app.role_type === "cd_clinician_consultant"
                          ? "CD & Clinician Consultant"
                          : "CD Interviewer"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{app.country}</td>
                    <td className="px-4 py-3">
                      <span className={getAiScoreColor(app.ai_prescreening_score)}>
                        {app.ai_prescreening_score !== null
                          ? app.ai_prescreening_score
                          : "--"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {app.assigned_tier ? (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            TIER_COLORS[app.assigned_tier] ||
                            "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {TIER_LABELS[app.assigned_tier] || app.assigned_tier}
                        </span>
                      ) : (
                        <span className="text-gray-400">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {activeTab === "tests" && !search.trim() ? (
                        (() => {
                          const combos = combosByApp[app.id] ?? [];
                          if (combos.length === 0) {
                            return <span className="text-xs text-gray-400">—</span>;
                          }
                          return (
                            <div className="flex flex-col gap-1 items-start">
                              {combos.map((c) => {
                                const outcome = chipOutcome(c);
                                const domainLabel = c.domain
                                  ? DOMAIN_LABEL[c.domain] ?? c.domain
                                  : "—";
                                return (
                                  <span
                                    key={c.id}
                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CHIP_COLOR[outcome]}`}
                                  >
                                    {domainLabel} — {CHIP_LABEL[outcome]}
                                  </span>
                                );
                              })}
                            </div>
                          );
                        })()
                      ) : (
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            STATUS_COLORS[app.status] ||
                            "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {STATUS_LABELS[app.status] || app.status}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {format(new Date(app.created_at), "MMM d, yyyy")}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {formatDistanceToNow(new Date(app.updated_at), {
                        addSuffix: true,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <span className="text-sm text-gray-600">
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setParam("page", String(page - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setParam("page", String(page + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
