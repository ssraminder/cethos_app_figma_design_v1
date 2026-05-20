// Translation Review — new-job intake. Phase 1 scope:
// - Job metadata (kind, lang pair, methodology, round, project, PM, client)
// - File pairs: 1+ pair rows, each with source + target file slots
// - Slots accept Upload-new OR Select-from-project picker (single-select)
// - Reference files area: upload + select-from-project (multi-select)
//
// Submit creates the job, then uploads/links files in sequence. After all files
// are attached, navigates to the job detail (Pre-flight tab).

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  trApi,
  listLanguages,
  listMethodologyTemplates,
  listRoundColors,
  listProjects,
  type LanguageRow,
  type TRMethodologyTemplate,
  type TRRoundColor,
  type ProjectPickRow,
  type TRJobKind,
  type TRFileRole,
} from "@/lib/tr";
import { supabase } from "@/lib/supabase";
import ProjectFilePicker from "@/components/admin/tr/ProjectFilePicker";

type PendingFile =
  | { kind: "upload"; file: File }
  | {
      kind: "link";
      source_kind: "linked_quote_file" | "linked_project_asset" | "linked_order_deliverable";
      link_ref: Record<string, unknown>;
      label: string;
    };

type PairDraft = {
  uid: string;
  label: string;
  source: PendingFile | null;
  target: PendingFile | null;
  expected_source_marker: string;
  expected_target_marker: string;
};

type RefDraft = { uid: string; file: PendingFile; category: string };

function fileLabel(p: PendingFile | null): string {
  if (!p) return "(empty)";
  if (p.kind === "upload") return `${p.file.name} (uploaded)`;
  return `${p.label} (linked)`;
}

export default function AdminReviewJobNew() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const initialKind = searchParams.get("kind") as TRJobKind | null;
  const fromStepId = searchParams.get("from_step");

  const [langs, setLangs] = useState<LanguageRow[]>([]);
  const [templates, setTemplates] = useState<TRMethodologyTemplate[]>([]);
  const [roundColors, setRoundColors] = useState<TRRoundColor[]>([]);
  const [projects, setProjects] = useState<ProjectPickRow[]>([]);

  const [jobKind, setJobKind] = useState<TRJobKind>(
    initialKind === "qm_certified" ? "qm_certified" : "translation_review",
  );
  const [projectId, setProjectId] = useState<string>("");
  const [clientName, setClientName] = useState("");
  const [pmContact, setPmContact] = useState("");
  const [title, setTitle] = useState("");
  const [sourceLang, setSourceLang] = useState("");
  const [targetLang, setTargetLang] = useState("");
  const [methodology, setMethodology] = useState("translation_quality_v1");
  const [round, setRound] = useState(1);
  const [notes, setNotes] = useState("");
  const [clientEmailText, setClientEmailText] = useState("");
  const [prefillBanner, setPrefillBanner] = useState<string | null>(null);

  const [pairs, setPairs] = useState<PairDraft[]>([
    { uid: crypto.randomUUID(), label: "Pair 1", source: null, target: null, expected_source_marker: "", expected_target_marker: "" },
  ]);
  const [refs, setRefs] = useState<RefDraft[]>([]);

  const [pickerOpenFor, setPickerOpenFor] = useState<{ pairUid: string; slot: "source" | "target" } | "references" | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [ls, tpls, rcs, ps] = await Promise.all([
          listLanguages(),
          listMethodologyTemplates(),
          listRoundColors(),
          listProjects(),
        ]);
        setLangs(ls);
        setTemplates(tpls);
        setRoundColors(rcs);
        setProjects(ps);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  // Default methodology when job kind changes
  useEffect(() => {
    setMethodology(jobKind === "qm_certified" ? "qm_certified_v1" : "translation_quality_v1");
  }, [jobKind]);

  // Prefill from a delivered workflow step. Pulls the step + its order +
  // delivered files + source files so the QM job starts with the right
  // language pair, project, and a pre-staged source/target file pair.
  useEffect(() => {
    if (!fromStepId) return;
    void (async () => {
      try {
        const { data: step, error: stepErr } = await supabase
          .from("order_workflow_steps")
          .select(
            "id, name, workflow_id, source_language, target_language, delivered_file_paths, order_workflows!workflow_id(order_id, orders(id, order_number, customer_id, internal_project_id, quote_id, customers(full_name)))",
          )
          .eq("id", fromStepId)
          .maybeSingle();
        if (stepErr || !step) return;
        const orderRow: any = (step as any).order_workflows?.orders;
        const order_number = orderRow?.order_number ?? "";
        const customer_full_name = orderRow?.customers?.full_name ?? "";
        const internal_project_id = orderRow?.internal_project_id ?? "";
        const quote_id = orderRow?.quote_id ?? null;

        // order_workflow_steps.source_language / target_language are already
        // language UUIDs (FK to public.languages.id) — no lookup needed.
        if (step.source_language) setSourceLang(step.source_language);
        if (step.target_language) setTargetLang(step.target_language);
        if (internal_project_id) setProjectId(internal_project_id);
        if (customer_full_name) setClientName(customer_full_name);
        if (order_number) setTitle(`QM · ${order_number} · ${step.name}`);

        // Pre-stage the delivered file as the target slot of pair 1.
        const deliveredPath: string | undefined = (step.delivered_file_paths ?? [])[0];
        if (deliveredPath) {
          const { data: deliveryRow } = await supabase
            .from("step_deliveries")
            .select("id, file_paths")
            .eq("step_id", fromStepId)
            .order("version", { ascending: false })
            .limit(1)
            .maybeSingle();
          setPairs((prev) =>
            prev.map((p, i) =>
              i === 0
                ? {
                    ...p,
                    label: `${step.name}`,
                    target: {
                      kind: "link",
                      source_kind: "linked_order_deliverable",
                      link_ref: {
                        step_id: fromStepId,
                        delivery_id: deliveryRow?.id ?? null,
                        storage_path: deliveredPath,
                      },
                      label: deliveredPath.split("/").pop() ?? deliveredPath,
                    },
                  }
                : p,
            ),
          );
        }

        // Look for a source file from the quote. quote_files.file_category_id
        // joins file_categories.slug — match by slug, but also fall back to
        // ANY non-deleted file when categorization is missing (older quotes
        // routinely have file_category_id IS NULL).
        if (quote_id) {
          const { data: catSourceFiles } = await supabase
            .from("quote_files")
            .select("id, original_filename, file_category_id, created_at, file_categories!file_category_id(slug)")
            .eq("quote_id", quote_id)
            .is("deleted_at", null)
            .order("created_at", { ascending: true });
          const all = (catSourceFiles ?? []) as any[];
          const matchedBySlug = all.find((r) => {
            const slug = r.file_categories?.slug;
            return slug === "source" || slug === "source_document";
          });
          const fallback = all[0];
          const src = matchedBySlug ?? fallback;
          if (src) {
            setPairs((prev) =>
              prev.map((p, i) =>
                i === 0
                  ? {
                      ...p,
                      source: {
                        kind: "link",
                        source_kind: "linked_quote_file",
                        link_ref: { quote_file_id: src.id },
                        label: src.original_filename ?? "source",
                      },
                    }
                  : p,
              ),
            );
          }
        }

        setPrefillBanner(
          `Prefilled from ${order_number || "order"} · step "${step.name}". Review the file pair below before creating the job.`,
        );
      } catch (e) {
        console.error("Prefill from_step failed:", e);
      }
    })();
  }, [fromStepId]);

  const roundColor = useMemo(
    () => roundColors.find((rc) => rc.round === round)?.color_hex ?? "#000000",
    [round, roundColors],
  );

  function updatePair(uid: string, patch: Partial<PairDraft>) {
    setPairs((prev) => prev.map((p) => (p.uid === uid ? { ...p, ...patch } : p)));
  }
  function addPair() {
    setPairs((prev) => [
      ...prev,
      {
        uid: crypto.randomUUID(),
        label: `Pair ${prev.length + 1}`,
        source: null,
        target: null,
        expected_source_marker: "",
        expected_target_marker: "",
      },
    ]);
  }
  function removePair(uid: string) {
    setPairs((prev) => prev.filter((p) => p.uid !== uid));
  }
  function setSlotFromUpload(file: File, target: { pairUid?: string; slot?: "source" | "target"; refDraft?: boolean }) {
    if (target.pairUid && target.slot) {
      updatePair(target.pairUid, { [target.slot]: { kind: "upload", file } } as Partial<PairDraft>);
    } else if (target.refDraft) {
      setRefs((prev) => [...prev, { uid: crypto.randomUUID(), file: { kind: "upload", file }, category: "reference_file" }]);
    }
  }

  function handlePickerResult(result: { source_kind: "linked_quote_file" | "linked_project_asset" | "linked_order_deliverable"; link_ref: Record<string, unknown>; label: string } | null) {
    if (!result || !pickerOpenFor) {
      setPickerOpenFor(null);
      return;
    }
    const pending: PendingFile = { kind: "link", source_kind: result.source_kind, link_ref: result.link_ref, label: result.label };
    if (pickerOpenFor === "references") {
      setRefs((prev) => [...prev, { uid: crypto.randomUUID(), file: pending, category: "reference_file" }]);
    } else {
      updatePair(pickerOpenFor.pairUid, { [pickerOpenFor.slot]: pending } as Partial<PairDraft>);
    }
    setPickerOpenFor(null);
  }

  async function submit() {
    setError(null);
    if (!sourceLang || !targetLang) {
      setError("Source and target language are required.");
      return;
    }
    const hasAnyContent = pairs.some((p) => p.source || p.target);
    if (!hasAnyContent) {
      setError("Add at least one source or target file in a pair.");
      return;
    }
    setSubmitting(true);
    try {
      const { job_id } = await trApi.createJob({
        job_kind: jobKind,
        project_id: projectId || null,
        client_name: clientName || null,
        pm_contact: pmContact || null,
        title: title || null,
        notes: notes || null,
        source_language_id: sourceLang,
        target_language_id: targetLang,
        methodology_template_code: methodology,
        review_round: round,
        round_color_hex: roundColor,
        deliverable_format_spec: {},
      });

      // Create file pairs + their files
      for (const p of pairs) {
        if (!p.source && !p.target) continue;
        // Create the pair record by inserting via direct supabase call
        // (alternative: a tr-create-pair edge function — not required for Phase 1)
        const { createFilePair } = await import("@/lib/tr");
        const pair = await createFilePair({ job_id, label: p.label, display_order: pairs.indexOf(p) });

        for (const [slot, role, expected_marker] of [
          ["source", "source" as TRFileRole, p.expected_source_marker],
          ["target", "target" as TRFileRole, p.expected_target_marker],
        ] as const) {
          const pending = p[slot as "source" | "target"];
          if (!pending) continue;
          if (pending.kind === "upload") {
            await trApi.uploadFile({
              job_id, role, pair_id: pair.id,
              category: slot === "source" ? "source_document" : "work_files",
              expected_marker: expected_marker || null,
              file: pending.file,
            });
          } else {
            await trApi.linkExistingFile({
              job_id, role, pair_id: pair.id,
              category: slot === "source" ? "source_document" : "work_files",
              expected_marker: expected_marker || null,
              source_kind: pending.source_kind, link_ref: pending.link_ref,
            });
          }
        }
      }

      // Reference files
      for (const r of refs) {
        if (r.file.kind === "upload") {
          await trApi.uploadFile({ job_id, role: "reference", category: r.category, file: r.file.file });
        } else {
          await trApi.linkExistingFile({ job_id, role: "reference", category: r.category, source_kind: r.file.source_kind, link_ref: r.file.link_ref });
        }
      }

      // Client email content stored as a file (role=client_email)
      if (clientEmailText.trim()) {
        const blob = new Blob([clientEmailText], { type: "text/plain" });
        const f = new File([blob], "client_email.txt", { type: "text/plain" });
        await trApi.uploadFile({ job_id, role: "client_email", file: f });
      }

      nav(`/admin/tr/jobs/${job_id}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">
        {jobKind === "qm_certified" ? "New QM (Certified) Job" : "New Translation Review Job"}
      </h1>

      {prefillBanner && (
        <div className="bg-purple-50 border border-purple-200 text-purple-800 p-3 rounded mb-3 text-sm">
          {prefillBanner}
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded mb-3">{error}</div>}

      {/* Metadata */}
      <div className="border rounded p-4 bg-white space-y-3 mb-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Job kind</Label>
            <div className="flex gap-3 mt-1">
              <label className="flex items-center gap-1"><input type="radio" checked={jobKind === "translation_review"} onChange={() => setJobKind("translation_review")} />Translation Review</label>
              <label className="flex items-center gap-1"><input type="radio" checked={jobKind === "qm_certified"} onChange={() => setJobKind("qm_certified")} />QM Certified</label>
            </div>
          </div>
          <div>
            <Label>Project</Label>
            <select className="w-full border rounded px-2 py-1.5 mt-1" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">(none)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.project_number} — {p.name ?? p.client_project_number ?? "(unnamed)"}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Client name</Label>
            <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
          </div>
          <div>
            <Label>PM contact</Label>
            <Input value={pmContact} onChange={(e) => setPmContact(e.target.value)} placeholder="email@example.com" />
          </div>
          <div>
            <Label>Source language *</Label>
            <select className="w-full border rounded px-2 py-1.5 mt-1" value={sourceLang} onChange={(e) => setSourceLang(e.target.value)}>
              <option value="">(select)</option>
              {langs.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
            </select>
          </div>
          <div>
            <Label>Target language *</Label>
            <select className="w-full border rounded px-2 py-1.5 mt-1" value={targetLang} onChange={(e) => setTargetLang(e.target.value)}>
              <option value="">(select)</option>
              {langs.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
            </select>
          </div>
          <div>
            <Label>Methodology</Label>
            <select className="w-full border rounded px-2 py-1.5 mt-1" value={methodology} onChange={(e) => setMethodology(e.target.value)}>
              {templates.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <Label>Review round</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input type="number" min={1} value={round} onChange={(e) => setRound(Number(e.target.value || 1))} className="w-24" />
              <span className="inline-block w-4 h-4 rounded border" style={{ backgroundColor: roundColor }} />
              <span className="text-xs text-gray-500 font-mono">{roundColor}</span>
            </div>
          </div>
          <div className="col-span-2">
            <Label>Title (internal label)</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
      </div>

      {/* File pairs */}
      <div className="border rounded p-4 bg-white space-y-4 mb-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">File pairs</h2>
          <Button size="sm" onClick={addPair}>+ Add pair</Button>
        </div>
        <p className="text-xs text-gray-500">
          Each pair is a source ↔ target unit. Every slot accepts either an upload or a file picked from the project.
        </p>
        {pairs.map((p) => (
          <div key={p.uid} className="border rounded p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Input value={p.label} onChange={(e) => updatePair(p.uid, { label: e.target.value })} className="flex-1" />
              {pairs.length > 1 && <Button size="sm" variant="outline" onClick={() => removePair(p.uid)}>Remove</Button>}
            </div>
            {(["source", "target"] as const).map((slot) => (
              <div key={slot} className="border rounded p-2 bg-gray-50">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold uppercase w-16">{slot}</span>
                  <span className="flex-1 text-sm">{fileLabel(p[slot])}</span>
                  {p[slot] && <Button size="sm" variant="ghost" onClick={() => updatePair(p.uid, { [slot]: null } as Partial<PairDraft>)}>Clear</Button>}
                </div>
                <div className="flex gap-2">
                  <label className="text-xs px-2 py-1 border rounded cursor-pointer bg-white hover:bg-gray-100">
                    Upload new
                    <input type="file" className="hidden" onChange={(e) => {
                      const f = e.target.files?.[0]; if (!f) return;
                      setSlotFromUpload(f, { pairUid: p.uid, slot });
                      e.target.value = "";
                    }} />
                  </label>
                  <Button size="sm" variant="outline" onClick={() => setPickerOpenFor({ pairUid: p.uid, slot })}>
                    Select from project
                  </Button>
                  <Input
                    placeholder={`expected marker (${slot})`}
                    value={slot === "source" ? p.expected_source_marker : p.expected_target_marker}
                    onChange={(e) => updatePair(p.uid, slot === "source"
                      ? { expected_source_marker: e.target.value }
                      : { expected_target_marker: e.target.value })}
                    className="flex-1"
                  />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* References */}
      <div className="border rounded p-4 bg-white mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Reference files (unpaired)</h2>
          <div className="flex gap-2">
            <label className="text-xs px-2 py-1 border rounded cursor-pointer bg-white hover:bg-gray-100">
              Upload new
              <input type="file" multiple className="hidden" onChange={(e) => {
                Array.from(e.target.files ?? []).forEach((f) => setSlotFromUpload(f, { refDraft: true }));
                e.target.value = "";
              }} />
            </label>
            <Button size="sm" variant="outline" onClick={() => setPickerOpenFor("references")}>
              Select from project
            </Button>
          </div>
        </div>
        {refs.length === 0 && <div className="text-xs text-gray-500">No reference files yet.</div>}
        {refs.length > 0 && (
          <ul className="space-y-1 text-sm">
            {refs.map((r) => (
              <li key={r.uid} className="flex items-center justify-between border rounded px-2 py-1 bg-gray-50">
                <span>{r.file.kind === "upload" ? r.file.file.name : r.file.label}</span>
                <Button size="sm" variant="ghost" onClick={() => setRefs((prev) => prev.filter((x) => x.uid !== r.uid))}>Remove</Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Client email */}
      <div className="border rounded p-4 bg-white mb-6">
        <Label>Client email content (paste — Phase 2 will accept .eml/.msg attachments)</Label>
        <Textarea value={clientEmailText} onChange={(e) => setClientEmailText(e.target.value)} rows={6} placeholder="Paste the client request email here." />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => nav("/admin/tr/jobs")}>Cancel</Button>
        <Button disabled={submitting} onClick={submit}>{submitting ? "Creating..." : "Create job"}</Button>
      </div>

      {pickerOpenFor && (
        <ProjectFilePicker
          projectId={projectId || undefined}
          allowMulti={pickerOpenFor === "references"}
          onClose={() => setPickerOpenFor(null)}
          onPick={(picked) => {
            if (pickerOpenFor === "references") {
              for (const item of picked) handlePickerResult(item);
            } else {
              handlePickerResult(picked[0] ?? null);
            }
          }}
        />
      )}
    </div>
  );
}
