import { useState, useRef, useEffect } from "react";
import { Settings, Eye, EyeOff } from "lucide-react";

export interface ColumnDef {
  key: string;
  label: string;
  defaultVisible: boolean;
}

interface ColumnToggleProps {
  columns: ColumnDef[];
  visibleColumns: Set<string>;
  onToggle: (key: string) => void;
  onShowAll: () => void;
  onReset: () => void;
}

export default function ColumnToggle({
  columns,
  visibleColumns,
  onToggle,
  onShowAll,
  onReset,
}: ColumnToggleProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        title="Toggle columns"
      >
        <Settings className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Columns
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={onShowAll}
                className="text-xs text-teal-600 hover:text-teal-700 px-1.5 py-0.5 rounded hover:bg-teal-50"
              >
                All
              </button>
              <button
                type="button"
                onClick={onReset}
                className="text-xs text-gray-500 hover:text-gray-700 px-1.5 py-0.5 rounded hover:bg-gray-50"
              >
                Reset
              </button>
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {columns.map((col) => {
              const visible = visibleColumns.has(col.key);
              return (
                <button
                  key={col.key}
                  type="button"
                  onClick={() => onToggle(col.key)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  {visible ? (
                    <Eye className="w-3.5 h-3.5 text-teal-600" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-gray-300" />
                  )}
                  <span
                    className={visible ? "text-gray-700" : "text-gray-400"}
                  >
                    {col.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
