// Training module data layer.
// All queries run against Supabase with RLS enforcing access (see migration 011_cvp_trainings.sql).

import { supabase } from "@/lib/supabase";

export interface Training {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string;
  is_active: boolean;
}

export interface TrainingLesson {
  id: string;
  training_id: string;
  order_index: number;
  slug: string;
  title: string;
  body_markdown: string;
  screenshot_paths: string[];
  key_rules: { rule: string; reason: string }[];
  route_reference: string | null;
  estimated_minutes: number;
  content_blocks: unknown[] | null;
}

export interface TrainingAssignment {
  id: string;
  training_id: string;
  staff_user_id: string;
  assigned_by: string | null;
  assigned_at: string;
  due_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface LessonProgress {
  id: string;
  assignment_id: string;
  lesson_id: string;
  viewed_at: string;
  acknowledged_at: string | null;
}

export interface StaffUserLite {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
}

export interface TrainingWithStats extends Training {
  lesson_count: number;
  my_assignment: TrainingAssignment | null;
  my_progress_count: number;
}

async function currentStaffId(): Promise<string | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data } = await supabase
    .from("staff_users")
    .select("id")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  return data?.id ?? null;
}

export async function listMyTrainings(): Promise<TrainingWithStats[]> {
  const staffId = await currentStaffId();
  if (!staffId) return [];

  const { data: trainings, error: trainingsError } = await supabase
    .from("cvp_trainings")
    .select("*")
    .eq("is_active", true)
    .order("title");
  if (trainingsError) throw trainingsError;

  const trainingIds = (trainings ?? []).map((t) => t.id);
  if (trainingIds.length === 0) return [];

  const { data: lessonCounts } = await supabase
    .from("cvp_training_lessons")
    .select("training_id")
    .in("training_id", trainingIds);

  const { data: assignments } = await supabase
    .from("cvp_training_assignments")
    .select("*")
    .eq("staff_user_id", staffId)
    .in("training_id", trainingIds);

  const assignmentIds = (assignments ?? []).map((a) => a.id);
  const { data: progress } = assignmentIds.length
    ? await supabase
        .from("cvp_training_lesson_progress")
        .select("assignment_id, acknowledged_at")
        .in("assignment_id", assignmentIds)
    : { data: [] as { assignment_id: string; acknowledged_at: string | null }[] };

  return (trainings ?? []).map((t) => {
    const lesson_count = (lessonCounts ?? []).filter((l) => l.training_id === t.id).length;
    const my_assignment = (assignments ?? []).find((a) => a.training_id === t.id) ?? null;
    const my_progress_count = my_assignment
      ? (progress ?? []).filter(
          (p) => p.assignment_id === my_assignment.id && p.acknowledged_at !== null,
        ).length
      : 0;
    return {
      ...(t as Training),
      lesson_count,
      my_assignment,
      my_progress_count,
    };
  });
}

export async function getTrainingBySlug(slug: string): Promise<Training | null> {
  const { data, error } = await supabase
    .from("cvp_trainings")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as Training) ?? null;
}

export async function getLessons(trainingId: string): Promise<TrainingLesson[]> {
  const { data, error } = await supabase
    .from("cvp_training_lessons")
    .select("*")
    .eq("training_id", trainingId)
    .order("order_index");
  if (error) throw error;
  return (data ?? []) as TrainingLesson[];
}

export async function getMyAssignment(trainingId: string): Promise<TrainingAssignment | null> {
  const staffId = await currentStaffId();
  if (!staffId) return null;
  const { data } = await supabase
    .from("cvp_training_assignments")
    .select("*")
    .eq("training_id", trainingId)
    .eq("staff_user_id", staffId)
    .maybeSingle();
  return (data as TrainingAssignment) ?? null;
}

export async function getLessonProgress(assignmentId: string): Promise<LessonProgress[]> {
  const { data, error } = await supabase
    .from("cvp_training_lesson_progress")
    .select("*")
    .eq("assignment_id", assignmentId);
  if (error) throw error;
  return (data ?? []) as LessonProgress[];
}

export async function markLessonAcknowledged(
  assignmentId: string,
  lessonId: string,
): Promise<void> {
  const now = new Date().toISOString();

  // Mark assignment started if not yet
  await supabase
    .from("cvp_training_assignments")
    .update({ started_at: now })
    .eq("id", assignmentId)
    .is("started_at", null);

  const { data: existing } = await supabase
    .from("cvp_training_lesson_progress")
    .select("id, acknowledged_at")
    .eq("assignment_id", assignmentId)
    .eq("lesson_id", lessonId)
    .maybeSingle();

  if (existing) {
    if (!existing.acknowledged_at) {
      await supabase
        .from("cvp_training_lesson_progress")
        .update({ acknowledged_at: now })
        .eq("id", existing.id);
    }
  } else {
    await supabase.from("cvp_training_lesson_progress").insert({
      assignment_id: assignmentId,
      lesson_id: lessonId,
      viewed_at: now,
      acknowledged_at: now,
    });
  }

  // If all lessons acknowledged, stamp completed_at on the assignment
  const { data: assignment } = await supabase
    .from("cvp_training_assignments")
    .select("training_id, completed_at")
    .eq("id", assignmentId)
    .maybeSingle();

  if (assignment && !assignment.completed_at) {
    const { count: totalLessons } = await supabase
      .from("cvp_training_lessons")
      .select("id", { count: "exact", head: true })
      .eq("training_id", assignment.training_id);

    const { count: ackedCount } = await supabase
      .from("cvp_training_lesson_progress")
      .select("id", { count: "exact", head: true })
      .eq("assignment_id", assignmentId)
      .not("acknowledged_at", "is", null);

    if (totalLessons && ackedCount && ackedCount >= totalLessons) {
      await supabase
        .from("cvp_training_assignments")
        .update({ completed_at: now })
        .eq("id", assignmentId);
    }
  }
}

/**
 * Single-confirmation completion: the learner reads the whole training and
 * confirms once. Acknowledges every lesson (so the per-lesson audit trail is
 * preserved) and stamps started_at + completed_at on the assignment in one go.
 */
export async function confirmTrainingComplete(
  assignmentId: string,
  trainingId: string,
): Promise<void> {
  const now = new Date().toISOString();

  const { data: lessons } = await supabase
    .from("cvp_training_lessons")
    .select("id")
    .eq("training_id", trainingId);
  const lessonIds = (lessons ?? []).map((l) => l.id);

  const { data: existing } = await supabase
    .from("cvp_training_lesson_progress")
    .select("id, lesson_id, acknowledged_at")
    .eq("assignment_id", assignmentId);
  const existingByLesson = new Map(
    (existing ?? []).map((e) => [e.lesson_id, e]),
  );

  const toInsert: {
    assignment_id: string;
    lesson_id: string;
    viewed_at: string;
    acknowledged_at: string;
  }[] = [];
  const toAck: string[] = [];
  for (const lessonId of lessonIds) {
    const row = existingByLesson.get(lessonId);
    if (!row) {
      toInsert.push({
        assignment_id: assignmentId,
        lesson_id: lessonId,
        viewed_at: now,
        acknowledged_at: now,
      });
    } else if (!row.acknowledged_at) {
      toAck.push(row.id);
    }
  }
  if (toInsert.length) {
    await supabase.from("cvp_training_lesson_progress").insert(toInsert);
  }
  if (toAck.length) {
    await supabase
      .from("cvp_training_lesson_progress")
      .update({ acknowledged_at: now })
      .in("id", toAck);
  }

  await supabase
    .from("cvp_training_assignments")
    .update({ started_at: now, completed_at: now })
    .eq("id", assignmentId);
}

export async function recordLessonViewed(
  assignmentId: string,
  lessonId: string,
): Promise<void> {
  const { data: existing } = await supabase
    .from("cvp_training_lesson_progress")
    .select("id")
    .eq("assignment_id", assignmentId)
    .eq("lesson_id", lessonId)
    .maybeSingle();

  if (!existing) {
    await supabase.from("cvp_training_lesson_progress").insert({
      assignment_id: assignmentId,
      lesson_id: lessonId,
      viewed_at: new Date().toISOString(),
    });
  }
}

export async function countIncompleteAssignments(): Promise<number> {
  const staffId = await currentStaffId();
  if (!staffId) return 0;
  const { count } = await supabase
    .from("cvp_training_assignments")
    .select("id", { count: "exact", head: true })
    .eq("staff_user_id", staffId)
    .is("completed_at", null);
  return count ?? 0;
}

// Admin-only: list all staff users for the assign UI.
export async function listAssignableStaff(): Promise<StaffUserLite[]> {
  const { data, error } = await supabase
    .from("staff_users")
    .select("id, full_name, email, role, is_active")
    .eq("is_active", true)
    .order("full_name");
  if (error) throw error;
  return (data ?? []) as StaffUserLite[];
}

// Admin-only: list all assignments for a training (to show who has it).
export async function listAssignments(trainingId: string): Promise<
  (TrainingAssignment & { staff: StaffUserLite | null })[]
> {
  const { data, error } = await supabase
    .from("cvp_training_assignments")
    .select("*")
    .eq("training_id", trainingId)
    .order("assigned_at", { ascending: false });
  if (error) throw error;

  const staffIds = Array.from(new Set((data ?? []).map((a) => a.staff_user_id)));
  const { data: staffRows } = staffIds.length
    ? await supabase
        .from("staff_users")
        .select("id, full_name, email, role, is_active")
        .in("id", staffIds)
    : { data: [] as StaffUserLite[] };

  return (data ?? []).map((a) => ({
    ...(a as TrainingAssignment),
    staff: (staffRows ?? []).find((s) => s.id === a.staff_user_id) ?? null,
  }));
}

export async function createAssignments(
  trainingId: string,
  staffUserIds: string[],
  dueAt: string | null,
): Promise<void> {
  const assignedBy = await currentStaffId();
  const rows = staffUserIds.map((id) => ({
    training_id: trainingId,
    staff_user_id: id,
    assigned_by: assignedBy,
    due_at: dueAt,
  }));
  if (rows.length === 0) return;
  const { error } = await supabase
    .from("cvp_training_assignments")
    .upsert(rows, { onConflict: "training_id,staff_user_id", ignoreDuplicates: true });
  if (error) throw error;
}

/**
 * Bulk-assign: assign every selected training to every selected staff member in
 * one go (the cross-product). Idempotent — re-assigning an existing pair is a
 * no-op. Returns the number of (training × staff) pairs written.
 */
export async function createAssignmentsBulk(
  trainingIds: string[],
  staffUserIds: string[],
  dueAt: string | null,
): Promise<number> {
  if (trainingIds.length === 0 || staffUserIds.length === 0) return 0;
  const assignedBy = await currentStaffId();
  const rows = trainingIds.flatMap((trainingId) =>
    staffUserIds.map((staffUserId) => ({
      training_id: trainingId,
      staff_user_id: staffUserId,
      assigned_by: assignedBy,
      due_at: dueAt,
    })),
  );
  const { error } = await supabase
    .from("cvp_training_assignments")
    .upsert(rows, {
      onConflict: "training_id,staff_user_id",
      ignoreDuplicates: true,
    });
  if (error) throw error;
  return rows.length;
}

export async function deleteAssignment(assignmentId: string): Promise<void> {
  const { error } = await supabase
    .from("cvp_training_assignments")
    .delete()
    .eq("id", assignmentId);
  if (error) throw error;
}

/**
 * Admin-only: change a training's type (audience). 'staff' shows it in the admin
 * portal; 'linguist' (= "Vendor") shows it to vendors in the vendor portal via
 * cvp_linguist_trainings_for_vendor. Gated server-side by the cvp_is_training_admin()
 * RLS policy on cvp_trainings.
 */
export async function updateTrainingAudience(
  trainingId: string,
  audience: "staff" | "linguist",
): Promise<void> {
  const { error } = await supabase
    .from("cvp_trainings")
    .update({ audience })
    .eq("id", trainingId);
  if (error) throw error;
}

export interface VendorLite {
  id: string;
  full_name: string | null;
  business_name: string | null;
  email: string | null;
  country: string | null;
  vendor_type: string | null;
  status: string | null;
  availability_status: string | null;
}

export interface VendorAssignFilters {
  search?: string;
  status?: string;
  availability?: string;
  vendorType?: string;
  language?: string;
  country?: string;
}

// Admin: list vendors matching the vendor-directory filters (to assign a vendor
// training in bulk). Mirrors AdminVendorsList's core filters.
export async function listVendorsForAssign(
  f: VendorAssignFilters,
): Promise<VendorLite[]> {
  let q = supabase
    .from("vendors")
    .select(
      "id, full_name, business_name, email, country, vendor_type, status, availability_status",
    )
    .order("full_name")
    .limit(2000);
  if (f.search) {
    const s = f.search.replace(/[,%()]/g, " ").trim();
    if (s)
      q = q.or(
        `full_name.ilike.%${s}%,business_name.ilike.%${s}%,email.ilike.%${s}%,country.ilike.%${s}%`,
      );
  }
  if (f.status) q = q.eq("status", f.status);
  if (f.availability) q = q.eq("availability_status", f.availability);
  if (f.vendorType === "cd_all")
    q = q.in("vendor_type", ["cognitive_debriefing", "cd_clinician_consultant"]);
  else if (f.vendorType === "external") q = q.ilike("email", "%@ext.cethos.com");
  else if (f.vendorType === "unassigned") q = q.is("vendor_type", null);
  else if (f.vendorType) q = q.eq("vendor_type", f.vendorType);
  if (f.language) q = q.contains("target_languages", [f.language.toUpperCase()]);
  if (f.country) q = q.eq("country", f.country);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as VendorLite[];
}

function slugify(s: string): string {
  return (
    (s || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "training"
  );
}

// Admin: create a new training (cvp_trainings). Generates a unique slug from the
// title. Gated by the cvp_is_training_admin() RLS policy.
export async function createTraining(fields: {
  title: string;
  audience: "staff" | "linguist";
  category: string;
  description: string;
}): Promise<{ id: string; slug: string }> {
  const base = slugify(fields.title);
  let slug = base;
  for (let i = 2; i < 100; i++) {
    const { data } = await supabase
      .from("cvp_trainings")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!data) break;
    slug = `${base}-${i}`;
  }
  const { data, error } = await supabase
    .from("cvp_trainings")
    .insert({
      title: fields.title.trim(),
      slug,
      audience: fields.audience,
      category: fields.category.trim() || "general",
      description: fields.description.trim() || null,
      is_active: true,
      quiz_enabled: false,
    })
    .select("id, slug")
    .single();
  if (error) throw error;
  return data as { id: string; slug: string };
}

// Admin: replace a training's lessons with the supplied ordered set. Used by the
// training editor on save (delete-then-insert for a clean ordering).
export async function saveLessons(
  trainingId: string,
  lessons: { title: string; estimated_minutes: number; content_blocks: unknown[] }[],
): Promise<void> {
  await supabase.from("cvp_training_lessons").delete().eq("training_id", trainingId);
  if (!lessons.length) return;
  const seen = new Set<string>();
  const rows = lessons.map((l, i) => {
    let s = slugify(l.title) || `lesson-${i + 1}`;
    let u = s;
    let n = 2;
    while (seen.has(u)) u = `${s}-${n++}`;
    seen.add(u);
    return {
      training_id: trainingId,
      order_index: i + 1,
      slug: u,
      title: l.title.trim(),
      estimated_minutes: l.estimated_minutes || 5,
      content_blocks: l.content_blocks,
      body_markdown: "",
    };
  });
  const { error } = await supabase.from("cvp_training_lessons").insert(rows);
  if (error) throw error;
}

// Admin: assign a vendor training to many vendors in one go. Idempotent (skips
// vendors already assigned this training).
export async function assignVendorsBulk(
  trainingId: string,
  vendorIds: string[],
  dueAt: string | null,
): Promise<number> {
  if (!vendorIds.length) return 0;
  const assignedBy = await currentStaffId();
  const { data: existing } = await supabase
    .from("cvp_training_assignments")
    .select("vendor_id")
    .eq("training_id", trainingId)
    .not("vendor_id", "is", null);
  const have = new Set((existing ?? []).map((r) => r.vendor_id as string));
  const rows = vendorIds
    .filter((v) => !have.has(v))
    .map((v) => ({
      training_id: trainingId,
      vendor_id: v,
      assigned_by: assignedBy,
      due_at: dueAt,
    }));
  if (!rows.length) return 0;
  const { error } = await supabase.from("cvp_training_assignments").insert(rows);
  if (error) throw error;
  return rows.length;
}
