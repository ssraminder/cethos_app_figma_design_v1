// Project-file picker popover. Used by AdminReviewJobNew for both pair slots
// (single-select) and the references area (multi-select).

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trApi, listProjects, type ProjectPickRow } from "@/lib/tr";

export type PickResult = {
  source_kind: "linked_quote_file" | "linked_project_asset" | "linked_order_deliverable";
  link_ref: Record<string, unknown>;
  label: string;
};

export default function ProjectFilePicker({
  projectId,
  allowMulti,
  onClose,
  onPick,
}: {
  projectId?: string;
  allowMulti: boolean;
  onClose: () => void;
  onPick: (picked: PickResult[]) => void;
}) {
  const [projects, setProjects] = useState<ProjectPickRow[]>([]);
  const [currentProject, setCurrentProject] = useState<string>(projectId ?? "");
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ project_assets: Record<string, unknown>[]; quote_files: Record<string, unknown>[]; order_deliverables: Record<string, unknown>[] } | null>(null);
  const [selected, setSelected] = useState<Record<string, PickResult>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projects.length) {
      void listProjects().then(setProjects).catch((e) => setError(String(e)));
    }
  }, [projects.length]);

  async function runSearch() {
    if (!currentProject) {
      setError("Pick a project first.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const r = await trApi.searchProjectFiles({ project_id: currentProject, search_text: searchText || null });
      setResult(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (currentProject) void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject]);

  function toggle(key: string, pick: PickResult) {
    setSelected((prev) => {
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      if (!allowMulti) return { [key]: pick };
      return { ...prev, [key]: pick };
    });
  }

  function commit() {
    onPick(Object.values(selected));
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <div className="border-b px-4 py-2 flex items-center justify-between">
          <h3 className="font-semibold">Select file{allowMulti ? "s" : ""} from project</h3>
          <Button size="sm" variant="ghost" onClick={onClose}>×</Button>
        </div>
        <div className="p-4 border-b grid grid-cols-2 gap-2">
          <div>
            <Label>Project</Label>
            <select className="w-full border rounded px-2 py-1.5 mt-1" value={currentProject} onChange={(e) => { setCurrentProject(e.target.value); setResult(null); setSelected({}); }}>
              <option value="">(pick one)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.project_number} — {p.name ?? "(unnamed)"}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Search filename</Label>
            <div className="flex gap-2 mt-1">
              <Input value={searchText} onChange={(e) => setSearchText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void runSearch(); }} />
              <Button size="sm" onClick={runSearch}>Search</Button>
            </div>
          </div>
        </div>
        {error && <div className="m-3 bg-red-50 border border-red-200 text-red-800 p-2 rounded text-sm">{error}</div>}
        <div className="overflow-auto flex-1 p-4 space-y-4 text-sm">
          {loading && <div className="text-gray-500">Loading...</div>}
          {!loading && result && (
            <>
              {/* Project assets */}
              {result.project_assets.length > 0 && (
                <section>
                  <div className="font-semibold mb-1">Project assets</div>
                  <ul className="space-y-1">
                    {result.project_assets.map((a, i) => {
                      const key = `pa-${i}`;
                      const pick: PickResult = {
                        source_kind: "linked_project_asset",
                        link_ref: { project_id: currentProject, asset_kind: a.kind },
                        label: `${a.filename} (${a.kind})`,
                      };
                      return (
                        <li key={key} className="flex items-center gap-2 border rounded px-2 py-1">
                          <input type={allowMulti ? "checkbox" : "radio"} checked={!!selected[key]} onChange={() => toggle(key, pick)} />
                          <span className="flex-1">{a.filename as string}</span>
                          <span className="text-xs text-gray-500">{a.kind as string}</span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
              {/* Quote files */}
              {result.quote_files.length > 0 && (
                <section>
                  <div className="font-semibold mb-1">Quote files</div>
                  <ul className="space-y-1">
                    {result.quote_files.map((qf, i) => {
                      const key = `qf-${qf.file_id ?? i}`;
                      const pick: PickResult = {
                        source_kind: "linked_quote_file",
                        link_ref: { quote_file_id: qf.file_id },
                        label: `${qf.filename} (${qf.quote_number ?? "?"})`,
                      };
                      return (
                        <li key={key} className="flex items-center gap-2 border rounded px-2 py-1">
                          <input type={allowMulti ? "checkbox" : "radio"} checked={!!selected[key]} onChange={() => toggle(key, pick)} />
                          <span className="flex-1">{qf.filename as string}</span>
                          <span className="text-xs text-gray-500">{qf.quote_number as string} · {qf.category as string}</span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
              {/* Order deliverables */}
              {result.order_deliverables.length > 0 && (
                <section>
                  <div className="font-semibold mb-1">Order deliverables</div>
                  <ul className="space-y-1">
                    {result.order_deliverables.map((od, i) => {
                      const key = `od-${od.deliverable_id ?? i}`;
                      const pick: PickResult = {
                        source_kind: "linked_order_deliverable",
                        link_ref: { order_id: od.order_id, step_id: od.step_id, deliverable_id: od.deliverable_id },
                        label: `${od.filename} (${od.order_number ?? "?"})`,
                      };
                      return (
                        <li key={key} className="flex items-center gap-2 border rounded px-2 py-1">
                          <input type={allowMulti ? "checkbox" : "radio"} checked={!!selected[key]} onChange={() => toggle(key, pick)} />
                          <span className="flex-1">{od.filename as string}</span>
                          <span className="text-xs text-gray-500">{od.order_number as string}</span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
              {result.project_assets.length === 0 && result.quote_files.length === 0 && result.order_deliverables.length === 0 && (
                <div className="text-center py-8 text-gray-500">No files found in this project.</div>
              )}
            </>
          )}
        </div>
        <div className="border-t px-4 py-2 flex items-center justify-end gap-2 bg-gray-50">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={Object.keys(selected).length === 0} onClick={commit}>
            Use {Object.keys(selected).length} file{Object.keys(selected).length === 1 ? "" : "s"}
          </Button>
        </div>
      </div>
    </div>
  );
}
