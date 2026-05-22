import * as XLSX from "xlsx";

export interface SheetData {
  name: string;
  rows: (string | number | null)[][];
  colWidths?: number[];
}

/**
 * Write a multi-sheet .xlsx workbook and trigger a browser download.
 * Each sheet takes a 2-D array where row 0 is the header.
 */
export function downloadXlsx(filename: string, sheets: SheetData[]): void {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    if (s.colWidths) {
      ws["!cols"] = s.colWidths.map((w) => ({ wch: w }));
    }
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}

/** Snapshot the current filter context as a key/value sheet. */
export function filterSnapshotSheet(
  filters: Record<string, unknown>,
): SheetData {
  const rows: (string | number | null)[][] = [["Filter", "Value"]];
  for (const [k, v] of Object.entries(filters)) {
    const display =
      v === null || v === undefined
        ? ""
        : Array.isArray(v)
          ? v.join(", ")
          : typeof v === "object"
            ? JSON.stringify(v)
            : String(v);
    rows.push([k, display]);
  }
  return { name: "Filters", rows, colWidths: [22, 60] };
}
