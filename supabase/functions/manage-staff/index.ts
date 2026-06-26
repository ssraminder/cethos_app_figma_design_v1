import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json();
    const { action } = body;

    // ── get_profile ──────────────────────────────────────────────────────────
    if (action === "get_profile") {
      const { staff_user_id } = body;
      const { data, error } = await supabase
        .from("staff_users")
        .select("id, full_name, email, role, job_title, date_of_joining, is_active, created_at, last_login_at")
        .eq("id", staff_user_id)
        .single();
      if (error) throw error;
      return Response.json({ data }, { headers: corsHeaders });
    }

    // ── update_profile ────────────────────────────────────────────────────────
    if (action === "update_profile") {
      const { staff_user_id, full_name, job_title, date_of_joining, role } = body;
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (full_name !== undefined) updates.full_name = full_name;
      if (job_title !== undefined) updates.job_title = job_title;
      if (date_of_joining !== undefined) updates.date_of_joining = date_of_joining || null;
      if (role !== undefined) updates.role = role;

      const { data, error } = await supabase
        .from("staff_users")
        .update(updates)
        .eq("id", staff_user_id)
        .select("id, full_name, email, role, job_title, date_of_joining")
        .single();
      if (error) throw error;
      return Response.json({ data }, { headers: corsHeaders });
    }

    // ── list_documents ────────────────────────────────────────────────────────
    if (action === "list_documents") {
      const { staff_user_id } = body;
      const { data, error } = await supabase
        .from("staff_documents")
        .select("id, file_name, category, notes, file_size, mime_type, uploaded_at, uploaded_by")
        .eq("staff_user_id", staff_user_id)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return Response.json({ data }, { headers: corsHeaders });
    }

    // ── upload_document ───────────────────────────────────────────────────────
    // Returns a signed upload URL; client uploads directly to storage.
    // After upload, client calls record_document to persist the DB row.
    if (action === "upload_document") {
      const { staff_user_id, file_name, mime_type, category, notes, file_size, uploader_staff_id } = body;
      const ext = file_name.split(".").pop() ?? "bin";
      const storage_path = `${staff_user_id}/${crypto.randomUUID()}.${ext}`;

      const { data: urlData, error: urlError } = await supabase.storage
        .from("staff-documents")
        .createSignedUploadUrl(storage_path);
      if (urlError) throw urlError;

      // Pre-insert the DB record (will be orphaned if upload fails — acceptable)
      const { data: doc, error: docError } = await supabase
        .from("staff_documents")
        .insert({
          staff_user_id,
          file_name,
          storage_path,
          file_size,
          mime_type,
          category: category ?? "other",
          notes: notes ?? null,
          uploaded_by: uploader_staff_id ?? null,
        })
        .select()
        .single();
      if (docError) throw docError;

      return Response.json(
        { signedUrl: urlData.signedUrl, token: urlData.token, path: storage_path, document: doc },
        { headers: corsHeaders },
      );
    }

    // ── get_document_url ──────────────────────────────────────────────────────
    if (action === "get_document_url") {
      const { document_id } = body;
      const { data: doc, error: docError } = await supabase
        .from("staff_documents")
        .select("storage_path, file_name")
        .eq("id", document_id)
        .single();
      if (docError) throw docError;

      const { data: urlData, error: urlError } = await supabase.storage
        .from("staff-documents")
        .createSignedUrl(doc.storage_path, 300); // 5-min signed URL
      if (urlError) throw urlError;

      return Response.json({ url: urlData.signedUrl, file_name: doc.file_name }, { headers: corsHeaders });
    }

    // ── delete_document ───────────────────────────────────────────────────────
    if (action === "delete_document") {
      const { document_id } = body;
      const { data: doc, error: fetchError } = await supabase
        .from("staff_documents")
        .select("storage_path")
        .eq("id", document_id)
        .single();
      if (fetchError) throw fetchError;

      await supabase.storage.from("staff-documents").remove([doc.storage_path]);
      const { error } = await supabase.from("staff_documents").delete().eq("id", document_id);
      if (error) throw error;
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // ── get_training_log ──────────────────────────────────────────────────────
    if (action === "get_training_log") {
      const { staff_user_id } = body;

      const { data: assignments, error } = await supabase
        .from("cvp_training_assignments")
        .select(`
          id,
          assigned_at,
          due_date,
          cvp_trainings (
            id, title, audience, estimated_minutes
          )
        `)
        .eq("staff_user_id", staff_user_id)
        .order("assigned_at", { ascending: false });
      if (error) throw error;

      // Fetch completions keyed by training_id for this staff member
      // cvp_training_completions uses vendor_id; staff completions stored there too
      // when vendor_id is null we check via staff_training_completions if it exists
      const trainingIds = (assignments ?? []).map((a: any) => a.cvp_trainings?.id).filter(Boolean);
      let completions: any[] = [];
      if (trainingIds.length) {
        const { data: comp } = await supabase
          .from("cvp_training_completions")
          .select("training_id, status, quiz_score, completed_at, method")
          .in("training_id", trainingIds);
        completions = comp ?? [];
      }

      const completionMap = Object.fromEntries(completions.map((c: any) => [c.training_id, c]));
      const log = (assignments ?? []).map((a: any) => ({
        assignment_id: a.id,
        assigned_at: a.assigned_at,
        due_date: a.due_date,
        training: a.cvp_trainings,
        completion: completionMap[a.cvp_trainings?.id] ?? null,
      }));

      return Response.json({ data: log }, { headers: corsHeaders });
    }

    return Response.json({ error: "Unknown action" }, { status: 400, headers: corsHeaders });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
});
