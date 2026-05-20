// ============================================================================
// get-staff-tasks v1.1
// Aggregates 6 categories of work-items staff need to action, feeding the
// /admin/tasks dashboard.
//
// Output: { success, summary, tasks, current_staff_id }
//   summary: { my_assignments, pending_counters, overdue_steps,
//              unreviewed_deliveries, unassigned_steps, expiring_offers, total }
//   tasks:   Task[] (see StaffTasks.tsx for the exact shape)
//
// v1.1 — adds `my_assignment` personal queue: `order_workflow_steps` where
// `assigned_staff_id = <current staff>` and status in ('accepted',
// 'in_progress', 'revision_requested'). Current staff is resolved from the
// Authorization bearer (Supabase JWT → auth.users.id → staff_users.auth_user_id).
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXPIRING_WINDOW_HOURS = 24;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date();
    const nowIso = now.toISOString();
    const expiringCutoff = new Date(
      now.getTime() + EXPIRING_WINDOW_HOURS * 3600 * 1000,
    ).toISOString();

    // Helper: enrich step rows with order_number from a join
    const orderNumberFor = async (orderIds: string[]) => {
      if (orderIds.length === 0) return new Map<string, string>();
      const { data } = await sb
        .from("orders")
        .select("id, order_number")
        .in("id", orderIds);
      const m = new Map<string, string>();
      for (const o of data || []) m.set(o.id, o.order_number);
      return m;
    };

    const vendorNameFor = async (vendorIds: string[]) => {
      if (vendorIds.length === 0) return new Map<string, string>();
      const { data } = await sb
        .from("vendors")
        .select("id, full_name")
        .in("id", vendorIds);
      const m = new Map<string, string>();
      for (const v of data || []) m.set(v.id, v.full_name);
      return m;
    };

    const tasks: any[] = [];

    // Resolve current staff from the Authorization bearer so we can build
    // the personal "assigned to me" queue. Failures here only disable the
    // my_assignment category — the rest of the ops queue still works.
    let currentStaffId: string | null = null;
    let currentStaffName: string | null = null;
    try {
      const authHeader = req.headers.get("Authorization") || "";
      const userToken = authHeader.replace(/^Bearer\s+/i, "");
      if (userToken) {
        const { data: userData } = await sb.auth.getUser(userToken);
        const authUserId = userData?.user?.id;
        if (authUserId) {
          const { data: staff } = await sb
            .from("staff_users")
            .select("id, full_name, is_active")
            .eq("auth_user_id", authUserId)
            .maybeSingle();
          if (staff && staff.is_active !== false) {
            currentStaffId = staff.id;
            currentStaffName = staff.full_name ?? null;
          }
        }
      }
    } catch (e: any) {
      console.warn("get-staff-tasks: staff resolution failed:", e?.message || e);
    }

    // ── 0. my_assignment — internal_work / internal_review steps assigned
    //      to the current staff member, still actionable.
    if (currentStaffId) {
      const { data: myRows } = await sb
        .from("order_workflow_steps")
        .select(
          "id, name, step_number, order_id, source_language, target_language, status, deadline, actor_type, requires_file_upload, instructions, delivered_file_paths",
        )
        .eq("assigned_staff_id", currentStaffId)
        .in("status", ["accepted", "in_progress", "revision_requested"])
        .order("deadline", { ascending: true, nullsFirst: false });

      if (myRows && myRows.length > 0) {
        const orderMap = await orderNumberFor(
          Array.from(new Set(myRows.map((s: any) => s.order_id))),
        );
        for (const s of myRows) {
          const deadlineMs = s.deadline ? new Date(s.deadline).getTime() : null;
          const hoursToDeadline =
            deadlineMs != null
              ? Math.floor((deadlineMs - now.getTime()) / 3600000)
              : null;
          let urgency: "critical" | "high" | "medium" = "medium";
          if (s.status === "revision_requested") urgency = "high";
          if (hoursToDeadline != null && hoursToDeadline < 0) urgency = "critical";
          else if (hoursToDeadline != null && hoursToDeadline < 24) urgency = "high";

          tasks.push({
            task_type: "my_assignment",
            urgency,
            step_id: s.id,
            order_id: s.order_id,
            order_number: orderMap.get(s.order_id) || null,
            step_name: s.name,
            step_number: s.step_number,
            source_language: s.source_language,
            target_language: s.target_language,
            actor_type: s.actor_type,
            step_status: s.status,
            requires_file_upload: !!s.requires_file_upload,
            instructions: s.instructions ?? null,
            deadline: s.deadline ?? null,
            hours_to_deadline: hoursToDeadline,
            file_count: Array.isArray(s.delivered_file_paths)
              ? s.delivered_file_paths.length
              : 0,
          });
        }
      }
    }

    // ── 1. pending_counter — vendor counter-offers awaiting staff response
    const { data: counterOffers } = await sb
      .from("vendor_step_offers")
      .select(
        "id, step_id, vendor_id, vendor_rate, vendor_total, counter_rate, counter_total, counter_deadline, counter_note, counter_at",
      )
      .eq("counter_status", "proposed")
      .order("counter_at", { ascending: true });

    if (counterOffers && counterOffers.length > 0) {
      const stepIds = counterOffers.map((o: any) => o.step_id);
      const { data: steps } = await sb
        .from("order_workflow_steps")
        .select("id, name, order_id, source_language, target_language")
        .in("id", stepIds);
      const stepMap = new Map((steps || []).map((s: any) => [s.id, s]));
      const orderMap = await orderNumberFor(
        Array.from(new Set((steps || []).map((s: any) => s.order_id))),
      );
      const vendorMap = await vendorNameFor(
        Array.from(new Set(counterOffers.map((o: any) => o.vendor_id))),
      );

      for (const o of counterOffers) {
        const step = stepMap.get(o.step_id) as any;
        if (!step) continue;
        tasks.push({
          task_type: "pending_counter",
          urgency: "high",
          step_id: o.step_id,
          order_id: step.order_id,
          order_number: orderMap.get(step.order_id) || null,
          step_name: step.name,
          source_language: step.source_language,
          target_language: step.target_language,
          offer_id: o.id,
          vendor_id: o.vendor_id,
          vendor_name: vendorMap.get(o.vendor_id) || null,
          original_rate: o.vendor_rate,
          original_total: o.vendor_total,
          counter_rate: o.counter_rate,
          counter_total: o.counter_total,
          counter_deadline: o.counter_deadline,
          counter_note: o.counter_note,
          submitted_at: o.counter_at,
        });
      }
    }

    // ── 2. overdue_step — accepted/in-progress past their deadline
    const { data: overdue } = await sb
      .from("order_workflow_steps")
      .select(
        "id, name, order_id, source_language, target_language, deadline, vendor_id",
      )
      .in("status", ["accepted", "in_progress"])
      .lt("deadline", nowIso)
      .not("deadline", "is", null)
      .order("deadline", { ascending: true });

    if (overdue && overdue.length > 0) {
      const orderMap = await orderNumberFor(
        Array.from(new Set(overdue.map((s: any) => s.order_id))),
      );
      const vendorMap = await vendorNameFor(
        Array.from(
          new Set(overdue.map((s: any) => s.vendor_id).filter(Boolean)),
        ),
      );
      for (const s of overdue) {
        const hoursOverdue = Math.floor(
          (now.getTime() - new Date(s.deadline).getTime()) / 3600000,
        );
        tasks.push({
          task_type: "overdue_step",
          urgency: hoursOverdue > 24 ? "critical" : "high",
          step_id: s.id,
          order_id: s.order_id,
          order_number: orderMap.get(s.order_id) || null,
          step_name: s.name,
          source_language: s.source_language,
          target_language: s.target_language,
          vendor_id: s.vendor_id,
          vendor_name: s.vendor_id ? vendorMap.get(s.vendor_id) || null : null,
          deadline: s.deadline,
          hours_overdue: hoursOverdue,
        });
      }
    }

    // ── 3. unreviewed_delivery — delivered but no approved_at
    const { data: unreviewed } = await sb
      .from("order_workflow_steps")
      .select(
        "id, name, order_id, source_language, target_language, vendor_id, delivered_at, delivered_file_paths",
      )
      .eq("status", "delivered")
      .is("approved_at", null)
      .order("delivered_at", { ascending: true });

    if (unreviewed && unreviewed.length > 0) {
      const orderMap = await orderNumberFor(
        Array.from(new Set(unreviewed.map((s: any) => s.order_id))),
      );
      const vendorMap = await vendorNameFor(
        Array.from(
          new Set(unreviewed.map((s: any) => s.vendor_id).filter(Boolean)),
        ),
      );
      for (const s of unreviewed) {
        const ageMs = s.delivered_at
          ? now.getTime() - new Date(s.delivered_at).getTime()
          : 0;
        tasks.push({
          task_type: "unreviewed_delivery",
          urgency: ageMs > 48 * 3600 * 1000 ? "high" : "medium",
          step_id: s.id,
          order_id: s.order_id,
          order_number: orderMap.get(s.order_id) || null,
          step_name: s.name,
          source_language: s.source_language,
          target_language: s.target_language,
          vendor_id: s.vendor_id,
          vendor_name: s.vendor_id ? vendorMap.get(s.vendor_id) || null : null,
          delivered_at: s.delivered_at,
          file_count: Array.isArray(s.delivered_file_paths)
            ? s.delivered_file_paths.length
            : 0,
        });
      }
    }

    // ── 4. unassigned_step — vendor steps with no vendor assigned/offered
    const { data: unassigned } = await sb
      .from("order_workflow_steps")
      .select(
        "id, name, step_number, order_id, source_language, target_language",
      )
      .eq("actor_type", "external_vendor")
      .in("status", ["pending"])
      .is("vendor_id", null)
      .order("created_at", { ascending: true });

    if (unassigned && unassigned.length > 0) {
      const orderMap = await orderNumberFor(
        Array.from(new Set(unassigned.map((s: any) => s.order_id))),
      );
      for (const s of unassigned) {
        tasks.push({
          task_type: "unassigned_step",
          urgency: "medium",
          step_id: s.id,
          order_id: s.order_id,
          order_number: orderMap.get(s.order_id) || null,
          step_name: s.name,
          step_number: s.step_number,
          source_language: s.source_language,
          target_language: s.target_language,
        });
      }
    }

    // ── 5. expiring_offer — pending offers expiring in the next 24h
    const { data: expiring } = await sb
      .from("vendor_step_offers")
      .select("id, step_id, vendor_id, expires_at")
      .eq("status", "pending")
      .not("expires_at", "is", null)
      .gt("expires_at", nowIso)
      .lt("expires_at", expiringCutoff)
      .order("expires_at", { ascending: true });

    if (expiring && expiring.length > 0) {
      const stepIds = expiring.map((o: any) => o.step_id);
      const { data: steps } = await sb
        .from("order_workflow_steps")
        .select("id, name, order_id, source_language, target_language")
        .in("id", stepIds);
      const stepMap = new Map((steps || []).map((s: any) => [s.id, s]));
      const orderMap = await orderNumberFor(
        Array.from(new Set((steps || []).map((s: any) => s.order_id))),
      );
      const vendorMap = await vendorNameFor(
        Array.from(new Set(expiring.map((o: any) => o.vendor_id))),
      );

      for (const o of expiring) {
        const step = stepMap.get(o.step_id) as any;
        if (!step) continue;
        const hoursRemaining = Math.max(
          0,
          Math.floor(
            (new Date(o.expires_at).getTime() - now.getTime()) / 3600000,
          ),
        );
        tasks.push({
          task_type: "expiring_offer",
          urgency: hoursRemaining < 4 ? "critical" : "high",
          step_id: o.step_id,
          order_id: step.order_id,
          order_number: orderMap.get(step.order_id) || null,
          step_name: step.name,
          source_language: step.source_language,
          target_language: step.target_language,
          offer_id: o.id,
          vendor_id: o.vendor_id,
          vendor_name: vendorMap.get(o.vendor_id) || null,
          expires_at: o.expires_at,
          hours_remaining: hoursRemaining,
        });
      }
    }

    // ── Build summary
    const summary = {
      my_assignments: tasks.filter((t) => t.task_type === "my_assignment").length,
      pending_counters: tasks.filter((t) => t.task_type === "pending_counter").length,
      overdue_steps: tasks.filter((t) => t.task_type === "overdue_step").length,
      unreviewed_deliveries: tasks.filter((t) => t.task_type === "unreviewed_delivery").length,
      unassigned_steps: tasks.filter((t) => t.task_type === "unassigned_step").length,
      expiring_offers: tasks.filter((t) => t.task_type === "expiring_offer").length,
      total: tasks.length,
    };

    return json({
      success: true,
      summary,
      tasks,
      current_staff_id: currentStaffId,
      current_staff_name: currentStaffName,
    });
  } catch (err: any) {
    console.error("get-staff-tasks error:", err);
    return json({ success: false, error: err.message || "Internal server error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
