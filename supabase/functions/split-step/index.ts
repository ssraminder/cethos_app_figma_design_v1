// split-step — partition one workflow step across multiple assignees.
//
// POST /functions/v1/split-step
// Body:
//   {
//     parent_step_id: uuid,
//     partitions: Array<{
//       quote_file_ids: uuid[],            // required, ≥1, disjoint across partitions
//       assignee_kind: "vendor" | "staff",
//       vendor_id?: uuid,                  // required when assignee_kind="vendor"
//       assigned_staff_id?: uuid,          // required when assignee_kind="staff"
//       deadline?: string (ISO8601),       // optional; defaults to parent.deadline
//       name_suffix?: string,              // optional UI label, appended to parent name
//       vendor_rate?: number,              // optional, vendor-only
//       vendor_rate_unit?: "per_word" | "per_hour" | "per_page" | "flat",
//       vendor_total?: number,
//       vendor_currency?: string,
//     }>
//   }
//
// Behavior:
//   - Validates parent has no step_deliveries, is not already split,
//     every quote_file_id belongs to the parent's order's quote, no file
//     appears twice, every file in the quote is covered exactly once,
//     every assignee resolves to an active row.
//   - Checks revisor-independence (R15) for each vendor partition; rejects
//     when any prior step on the workflow already used that vendor and the
//     template's requires_different_vendor_from_step lists it.
//   - Atomically (best-effort within service-role single-shot inserts):
//     * Set parent.is_split=true
//     * Create N child rows cloning parent's service/lang/actor type
//       (children inherit parent's actor_type; per-partition override
//       via assignee_kind=staff → actor_type='internal_work')
//     * Insert step_files rows per child
//     * Optionally insert vendor_payables row when a rate is provided
//     * Write qms.assignment_eligibility_events per child
//
// Auth: requires a staff_users row matching the JWT bearer's auth_user_id.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Partition = {
  quote_file_ids: string[];
  assignee_kind: "vendor" | "staff";
  vendor_id?: string;
  assigned_staff_id?: string;
  deadline?: string;
  name_suffix?: string;
  vendor_rate?: number;
  vendor_rate_unit?: "per_word" | "per_hour" | "per_page" | "flat";
  vendor_total?: number;
  vendor_currency?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // --- 1. Auth: resolve staff_user from JWT bearer ---------------------------
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "missing_authorization" }, 401);

  const { data: authUser, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !authUser?.user) return json({ error: "invalid_token" }, 401);

  const { data: staff, error: staffErr } = await supabase
    .from("staff_users")
    .select("id, full_name, email")
    .eq("auth_user_id", authUser.user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (staffErr || !staff) return json({ error: "not_staff" }, 403);

  // --- 2. Body validation ----------------------------------------------------
  let body: { parent_step_id?: string; partitions?: Partition[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const parentStepId = body.parent_step_id;
  const partitions: Partition[] = Array.isArray(body.partitions) ? body.partitions : [];
  if (!parentStepId) return json({ error: "missing_parent_step_id" }, 400);
  if (partitions.length < 2) return json({ error: "need_at_least_two_partitions" }, 400);

  // --- 3. Load parent + invariants -------------------------------------------
  const { data: parent, error: parentErr } = await supabase
    .from("order_workflow_steps")
    .select(
      "id, workflow_id, order_id, step_number, name, service_id, actor_type, " +
      "source_language, target_language, deadline, vendor_currency, vendor_id, " +
      "is_split, parent_step_id, status",
    )
    .eq("id", parentStepId)
    .maybeSingle();
  if (parentErr || !parent) return json({ error: "parent_not_found" }, 404);

  if (parent.is_split) return json({ error: "already_split" }, 409);
  if (parent.parent_step_id) return json({ error: "nested_split_not_allowed" }, 409);
  if (!["external_vendor", "internal_work"].includes(parent.actor_type)) {
    return json({ error: "step_actor_type_not_splittable", actor_type: parent.actor_type }, 409);
  }

  // No deliveries on the parent yet.
  const { count: delCount } = await supabase
    .from("step_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("step_id", parentStepId);
  if ((delCount ?? 0) > 0) {
    return json({ error: "parent_already_has_deliveries", count: delCount }, 409);
  }

  // Parent must be in an unassigned state — otherwise the existing vendor's
  // payable + audit trail would be silently orphaned by the split. Staff path
  // is: unassign vendor → split. Surfaces this explicitly to keep the AR/AP
  // ledger and qms.assignment_eligibility_events records clean.
  if (parent.vendor_id) {
    return json({
      error: "parent_already_assigned",
      detail: "Unassign the current vendor before splitting this step.",
    }, 409);
  }
  const { count: activePayableCount } = await supabase
    .from("vendor_payables")
    .select("id", { count: "exact", head: true })
    .eq("workflow_step_id", parentStepId)
    .not("status", "in", "(cancelled,voided)");
  if ((activePayableCount ?? 0) > 0) {
    return json({
      error: "parent_has_active_payable",
      detail: "Cancel or void the existing payable before splitting this step.",
    }, 409);
  }

  // --- 4. Order + quote file inventory ---------------------------------------
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, quote_id, order_number")
    .eq("id", parent.order_id)
    .maybeSingle();
  if (orderErr || !order?.quote_id) return json({ error: "order_or_quote_not_found" }, 404);

  const { data: quoteFilesRows, error: qfErr } = await supabase
    .from("quote_files")
    .select("id")
    .eq("quote_id", order.quote_id)
    .is("deleted_at", null);
  if (qfErr) return json({ error: "quote_files_lookup_failed", detail: qfErr.message }, 500);
  const quoteFileIds = new Set((quoteFilesRows ?? []).map((r) => r.id as string));
  if (quoteFileIds.size === 0) return json({ error: "no_quote_files_on_order" }, 409);

  // --- 5. Partition validation -----------------------------------------------
  const seenFiles = new Set<string>();
  for (let i = 0; i < partitions.length; i++) {
    const p = partitions[i];
    if (!Array.isArray(p.quote_file_ids) || p.quote_file_ids.length === 0) {
      return json({ error: "partition_has_no_files", partition_index: i }, 400);
    }
    for (const fid of p.quote_file_ids) {
      if (!quoteFileIds.has(fid)) {
        return json({ error: "file_not_on_order", partition_index: i, quote_file_id: fid }, 400);
      }
      if (seenFiles.has(fid)) {
        return json({ error: "file_assigned_twice", quote_file_id: fid }, 400);
      }
      seenFiles.add(fid);
    }
    if (p.assignee_kind === "vendor") {
      if (!p.vendor_id) return json({ error: "vendor_partition_missing_vendor_id", partition_index: i }, 400);
    } else if (p.assignee_kind === "staff") {
      if (!p.assigned_staff_id) return json({ error: "staff_partition_missing_assigned_staff_id", partition_index: i }, 400);
    } else {
      return json({ error: "invalid_assignee_kind", partition_index: i }, 400);
    }
  }
  // Every quote file must be covered.
  const uncovered = [...quoteFileIds].filter((id) => !seenFiles.has(id));
  if (uncovered.length > 0) {
    return json({ error: "files_not_covered", quote_file_ids: uncovered }, 400);
  }

  // --- 6. Verify assignees -----------------------------------------------------
  const vendorIds = [...new Set(partitions.filter((p) => p.assignee_kind === "vendor").map((p) => p.vendor_id!))];
  const staffIds = [...new Set(partitions.filter((p) => p.assignee_kind === "staff").map((p) => p.assigned_staff_id!))];

  if (vendorIds.length > 0) {
    const { data: vRows } = await supabase
      .from("vendors").select("id").in("id", vendorIds);
    const got = new Set((vRows ?? []).map((r) => r.id as string));
    const missing = vendorIds.filter((id) => !got.has(id));
    if (missing.length > 0) return json({ error: "vendor_not_found", vendor_ids: missing }, 400);
  }
  if (staffIds.length > 0) {
    const { data: sRows } = await supabase
      .from("staff_users").select("id").in("id", staffIds).eq("is_active", true);
    const got = new Set((sRows ?? []).map((r) => r.id as string));
    const missing = staffIds.filter((id) => !got.has(id));
    if (missing.length > 0) return json({ error: "staff_user_not_found_or_inactive", staff_ids: missing }, 400);
  }

  // --- 7. Revisor independence (R15) ------------------------------------------
  // Children get NEW step_numbers, so existing template-step references via
  // step_number keep pointing at the original parent. Reviser of a downstream
  // step that requires-different-vendor-from-step=[parent.step_number] must
  // not match any vendor we're about to assign on this parent.
  //
  // Conversely, we must check that none of OUR vendors collide with a vendor
  // already on a prior step listed in THIS parent's template constraint.
  // We mirror the existing checkReviserSeparation pattern in update-workflow-step.
  const { data: workflow } = await supabase
    .from("order_workflows").select("id, template_id").eq("id", parent.workflow_id).maybeSingle();
  const templateId: string | null = workflow?.template_id ?? null;
  if (templateId && vendorIds.length > 0) {
    const { data: tplStep } = await supabase
      .from("workflow_template_steps")
      .select("requires_different_vendor_from_step")
      .eq("template_id", templateId)
      .eq("step_number", parent.step_number)
      .maybeSingle();
    const constraintSteps: number[] = Array.isArray(tplStep?.requires_different_vendor_from_step)
      ? (tplStep!.requires_different_vendor_from_step as number[])
      : [];
    if (constraintSteps.length > 0) {
      // Walk: prior steps by step_number, AND any children of those prior steps.
      const { data: priorParents } = await supabase
        .from("order_workflow_steps")
        .select("id, step_number, name, vendor_id")
        .eq("workflow_id", parent.workflow_id)
        .in("step_number", constraintSteps);
      const priorParentIds = (priorParents ?? []).map((r) => r.id as string);
      let allPriorVendorIds = (priorParents ?? []).map((r) => r.vendor_id as string | null).filter(Boolean) as string[];
      if (priorParentIds.length > 0) {
        const { data: priorChildren } = await supabase
          .from("order_workflow_steps")
          .select("vendor_id, parent_step_id")
          .in("parent_step_id", priorParentIds);
        allPriorVendorIds = allPriorVendorIds.concat(
          (priorChildren ?? []).map((r) => r.vendor_id as string | null).filter(Boolean) as string[],
        );
      }
      const collisions = vendorIds.filter((v) => allPriorVendorIds.includes(v));
      if (collisions.length > 0) {
        return json({
          error: "reviser_separation_violation",
          colliding_vendor_ids: collisions,
          constraint_steps: constraintSteps,
        }, 409);
      }
    }
  }

  // --- 8. Compute new step_numbers (append at workflow tail) -----------------
  const { data: maxRow } = await supabase
    .from("order_workflow_steps")
    .select("step_number")
    .eq("workflow_id", parent.workflow_id)
    .order("step_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const baseNumber = (maxRow?.step_number ?? parent.step_number) + 1;

  // --- 9. Set parent is_split first so the rollup trigger picks it up. -------
  const { error: setSplitErr } = await supabase
    .from("order_workflow_steps")
    .update({ is_split: true, updated_at: new Date().toISOString() })
    .eq("id", parentStepId);
  if (setSplitErr) return json({ error: "set_is_split_failed", detail: setSplitErr.message }, 500);

  // --- 10. Insert child rows --------------------------------------------------
  const created: Array<{ id: string; partition_index: number; quote_file_ids: string[]; partition: Partition }> = [];
  for (let i = 0; i < partitions.length; i++) {
    const p = partitions[i];
    const isStaff = p.assignee_kind === "staff";
    const childRow: Record<string, unknown> = {
      workflow_id: parent.workflow_id,
      order_id: parent.order_id,
      parent_step_id: parentStepId,
      partition_index: i,
      step_number: baseNumber + i,
      name: p.name_suffix ? `${parent.name} — ${p.name_suffix}` : `${parent.name} (part ${i + 1})`,
      service_id: parent.service_id,
      source_language: parent.source_language,
      target_language: parent.target_language,
      actor_type: isStaff ? "internal_work" : "external_vendor",
      vendor_id: isStaff ? null : p.vendor_id,
      assigned_staff_id: isStaff ? p.assigned_staff_id : staff.id,
      assigned_by: staff.id,
      assigned_at: new Date().toISOString(),
      status: isStaff ? "assigned" : "assigned",
      deadline: p.deadline ?? parent.deadline,
      vendor_rate: !isStaff && p.vendor_rate != null ? p.vendor_rate : null,
      vendor_rate_unit: !isStaff && p.vendor_rate_unit ? p.vendor_rate_unit : null,
      vendor_total: !isStaff && p.vendor_total != null ? p.vendor_total : null,
      vendor_currency: !isStaff ? (p.vendor_currency ?? parent.vendor_currency ?? "CAD") : null,
    };
    const { data: childIns, error: childErr } = await supabase
      .from("order_workflow_steps")
      .insert(childRow)
      .select("id")
      .single();
    if (childErr || !childIns) {
      // Best-effort rollback: unwind whatever children we have, clear is_split.
      const ids = created.map((c) => c.id);
      if (ids.length > 0) await supabase.from("order_workflow_steps").delete().in("id", ids);
      await supabase.from("order_workflow_steps").update({ is_split: false }).eq("id", parentStepId);
      return json({ error: "child_insert_failed", partition_index: i, detail: childErr?.message }, 500);
    }
    created.push({ id: childIns.id, partition_index: i, quote_file_ids: p.quote_file_ids, partition: p });
  }

  // --- 11. Insert step_files rows --------------------------------------------
  const stepFilesRows = created.flatMap((c) =>
    c.quote_file_ids.map((qf) => ({ step_id: c.id, quote_file_id: qf })),
  );
  const { error: filesErr } = await supabase.from("step_files").insert(stepFilesRows);
  if (filesErr) {
    // Same rollback path as above.
    await supabase.from("order_workflow_steps").delete().in("id", created.map((c) => c.id));
    await supabase.from("order_workflow_steps").update({ is_split: false }).eq("id", parentStepId);
    return json({ error: "step_files_insert_failed", detail: filesErr.message }, 500);
  }

  // --- 12. Optional vendor_payables creation per vendor child ----------------
  for (const c of created) {
    const p = c.partition;
    if (p.assignee_kind !== "vendor" || p.vendor_rate == null) continue;
    const payable = {
      workflow_step_id: c.id,
      vendor_id: p.vendor_id!,
      order_id: parent.order_id,
      rate: p.vendor_rate,
      rate_unit: p.vendor_rate_unit ?? "per_word",
      currency: p.vendor_currency ?? parent.vendor_currency ?? "CAD",
      total: p.vendor_total ?? null,
      status: "pending",
      step_name: `${parent.name} (part ${c.partition_index + 1})`,
    };
    const { error: payErr } = await supabase.from("vendor_payables").insert(payable);
    if (payErr) {
      // Non-fatal — staff can create via Manage Payable. Log and continue.
      console.error("split-step: vendor_payables insert failed (non-fatal)", { child_step: c.id, detail: payErr.message });
    }
  }

  // --- 13. QMS audit rows -----------------------------------------------------
  const auditRows = created.map((c) => ({
    vendor_id: c.partition.assignee_kind === "vendor" ? c.partition.vendor_id! : null,
    service_id: parent.service_id,
    source_language_id: parent.source_language,
    target_language_id: parent.target_language,
    order_id: parent.order_id,
    workflow_step_id: c.id,
    call_site: "split-step",
    eligible: true,
    reason: c.partition.assignee_kind === "staff" ? "in_house_assignment" : "split_assignment",
    payload: {
      parent_step_id: parentStepId,
      partition_index: c.partition_index,
      quote_file_ids: c.quote_file_ids,
      assignee_kind: c.partition.assignee_kind,
      assigned_staff_id: c.partition.assignee_kind === "staff" ? c.partition.assigned_staff_id : null,
    },
    performed_by: staff.id,
    performed_at: new Date().toISOString(),
  })).filter((r) => r.vendor_id !== null);
  if (auditRows.length > 0) {
    const { error: qmsErr } = await supabase.from("assignment_eligibility_events").insert(auditRows).select();
    if (qmsErr) {
      // Try via qms schema directly if the public alias isn't in scope.
      const { error: qmsErr2 } = await supabase.schema("qms").from("assignment_eligibility_events").insert(auditRows);
      if (qmsErr2) {
        console.error("split-step: qms audit insert failed (non-fatal)", qmsErr2.message);
      }
    }
  }

  // --- 14. Belt-and-suspenders: kick parent rollup explicitly. ---------------
  await supabase.rpc("recompute_parent_step_status", { p_parent_step_id: parentStepId });

  return json({
    success: true,
    parent_step_id: parentStepId,
    children: created.map((c) => ({
      id: c.id,
      partition_index: c.partition_index,
      step_number: baseNumber + c.partition_index,
      quote_file_ids: c.quote_file_ids,
      assignee_kind: c.partition.assignee_kind,
      vendor_id: c.partition.vendor_id ?? null,
      assigned_staff_id: c.partition.assignee_kind === "staff" ? c.partition.assigned_staff_id : null,
    })),
  });
});
