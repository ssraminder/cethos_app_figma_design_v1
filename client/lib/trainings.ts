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

export async function deleteAssignment(assignmentId: string): Promise<void> {
  const { error } = await supabase
    .from("cvp_training_assignments")
    .delete()
    .eq("id", assignmentId);
  if (error) throw error;
}
