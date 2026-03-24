import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Plus, Trash2, RefreshCw } from "lucide-react";
import SearchableSelect from "@/components/ui/SearchableSelect";
import type { TabProps } from "./types";
import { SOURCE_TYPE_COLORS } from "./constants";
import { LANGUAGE_OPTIONS, LANGUAGE_GROUP_ORDER, getLanguageName } from "./data/languages";

export default function VendorLanguagesTab({
  vendorData,
  onRefresh,
}: TabProps) {
  const { vendor, languagePairs } = vendorData;

  const [addSource, setAddSource] = useState("");
  const [addTarget, setAddTarget] = useState("");
  const [adding, setAdding] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!addSource || !addTarget) {
      setValidationError("Please select both source and target language");
      return;
    }
    if (addSource === addTarget) {
      setValidationError("Source and target language cannot be identical");
      return;
    }
    setValidationError("");
    setAdding(true);

    const { error } = await supabase.from("vendor_language_pairs").insert({
      vendor_id: vendor.id,
      source_language: addSource,
      target_language: addTarget,
      source_type: "admin",
      is_active: true,
    });

    setAdding(false);
    if (error) {
      toast.error(`Failed to add: ${error.message}`);
    } else {
      toast.success("Language pair added");
      setAddSource("");
      setAddTarget("");
      await onRefresh();
    }
  };

  const handleToggleActive = async (id: string, currentlyActive: boolean) => {
    setTogglingId(id);
    const { error } = await supabase
      .from("vendor_language_pairs")
      .update({ is_active: !currentlyActive })
      .eq("id", id);

    setTogglingId(null);
    if (error) {
      toast.error(`Failed to update: ${error.message}`);
    } else {
      await onRefresh();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this language pair?")) return;
    setDeletingId(id);
    const { error } = await supabase
      .from("vendor_language_pairs")
      .delete()
      .eq("id", id);

    setDeletingId(null);
    if (error) {
      toast.error(`Failed to delete: ${error.message}`);
    } else {
      toast.success("Language pair removed");
      await onRefresh();
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
      <h3 className="text-xs font-semibold text-gray-500 mb-4 uppercase tracking-wider">
        Language Pairs ({languagePairs.length})
      </h3>

      {/* Add form */}
      <div className="flex items-end gap-3 mb-6 pb-4 border-b border-gray-100">
        <div className="flex-1">
          <SearchableSelect
            options={LANGUAGE_OPTIONS}
            value={addSource}
            onChange={(v) => {
              setAddSource(v);
              setValidationError("");
            }}
            placeholder="Source language..."
            label="Source Language"
            groupOrder={LANGUAGE_GROUP_ORDER}
          />
        </div>
        <div className="flex-1">
          <SearchableSelect
            options={LANGUAGE_OPTIONS}
            value={addTarget}
            onChange={(v) => {
              setAddTarget(v);
              setValidationError("");
            }}
            placeholder="Target language..."
            label="Target Language"
            groupOrder={LANGUAGE_GROUP_ORDER}
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={adding}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 shrink-0 h-[42px]"
        >
          {adding ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          Add
        </button>
      </div>

      {validationError && (
        <p className="text-sm text-red-500 mb-4 -mt-2">{validationError}</p>
      )}

      {/* Table */}
      {languagePairs.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-100">
                <th className="pb-2 text-xs font-medium text-gray-500 uppercase">
                  Source Language
                </th>
                <th className="pb-2 text-xs font-medium text-gray-500 uppercase">
                  Target Language
                </th>
                <th className="pb-2 text-xs font-medium text-gray-500 uppercase">
                  Source
                </th>
                <th className="pb-2 text-xs font-medium text-gray-500 uppercase text-center">
                  Active
                </th>
                <th className="pb-2 text-xs font-medium text-gray-500 uppercase text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {languagePairs.map((lp) => (
                <tr key={lp.id} className={!lp.is_active ? "opacity-50" : ""}>
                  <td className="py-2.5 text-gray-800">
                    {getLanguageName(lp.source_language)}
                    <span className="ml-1 text-xs text-gray-400 font-mono">
                      ({lp.source_language})
                    </span>
                  </td>
                  <td className="py-2.5 text-gray-800">
                    {getLanguageName(lp.target_language)}
                    <span className="ml-1 text-xs text-gray-400 font-mono">
                      ({lp.target_language})
                    </span>
                  </td>
                  <td className="py-2.5">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        SOURCE_TYPE_COLORS[lp.source_type ?? "admin"] ??
                        "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {(lp.source_type ?? "admin").replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="py-2.5 text-center">
                    <button
                      onClick={() => handleToggleActive(lp.id, lp.is_active)}
                      disabled={togglingId === lp.id}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        lp.is_active ? "bg-teal-500" : "bg-gray-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          lp.is_active ? "translate-x-4.5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      onClick={() => handleDelete(lp.id)}
                      disabled={deletingId === lp.id}
                      className="text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                      title="Remove"
                    >
                      {deletingId === lp.id ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-gray-400 text-center py-8">
          No language pairs on file
        </p>
      )}
    </div>
  );
}
