import React from 'react';
import { QuotePage, LocalDocumentGroup, Complexity, COMPLEXITY_MULTIPLIERS } from '../types';
import { calculatePageBillable } from '../utils/calculations';

interface PageTableProps {
  pages: QuotePage[];
  showGroupColumn: boolean;
  documentGroups: LocalDocumentGroup[];
  pageGroupings: Record<string, string>;
  onPageGroupChange: (pageId: string, groupId: string) => void;
  onComplexityChange: (pageId: string, complexity: Complexity) => void;
  readOnly?: boolean;
}

export const PageTable: React.FC<PageTableProps> = ({
  pages,
  showGroupColumn,
  documentGroups,
  pageGroupings,
  onPageGroupChange,
  onComplexityChange,
  readOnly = false,
}) => {
  const getComplexityClass = (complexity: Complexity) => {
    switch (complexity) {
      case 'easy':
        return 'bg-green-100 text-green-800';
      case 'hard':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const totalWords = pages.reduce((sum, p) => sum + p.word_count, 0);
  const totalBillable = pages.reduce((sum, p) => {
    const multiplier = p.complexity_multiplier || COMPLEXITY_MULTIPLIERS[p.complexity || 'medium'];
    return sum + calculatePageBillable(p.word_count, multiplier);
  }, 0);
  const roundedBillable = Math.max(1.0, Math.ceil(totalBillable * 10) / 10);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {showGroupColumn ? 'Pages & Document Groups' : 'Pages'}
      </label>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-700">Page</th>
              <th className="px-4 py-2 text-left font-medium text-gray-700">Words</th>
              <th className="px-4 py-2 text-left font-medium text-gray-700">Complexity</th>
              <th className="px-4 py-2 text-left font-medium text-gray-700">Billable</th>
              {showGroupColumn && (
                <th className="px-4 py-2 text-left font-medium text-gray-700">Document Group</th>
              )}
            </tr>
          </thead>
          <tbody>
            {pages.map((page, idx) => {
              const complexity = page.complexity || 'medium';
              const multiplier = page.complexity_multiplier || COMPLEXITY_MULTIPLIERS[complexity];
              const billable = calculatePageBillable(page.word_count, multiplier);

              return (
                <tr key={page.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-2">{page.page_number}</td>
                  <td className="px-4 py-2">{page.word_count}</td>
                  <td className="px-4 py-2">
                    {readOnly ? (
                      <span className={`px-2 py-1 rounded text-xs ${getComplexityClass(complexity)}`}>
                        {complexity} (×{multiplier.toFixed(2)})
                      </span>
                    ) : (
                      <select
                        value={complexity}
                        onChange={(e) => onComplexityChange(page.id, e.target.value as Complexity)}
                        className={`px-2 py-1 rounded text-xs border-0 ${getComplexityClass(complexity)}`}
                      >
                        <option value="easy">Easy (×1.00)</option>
                        <option value="medium">Medium (×1.15)</option>
                        <option value="hard">Hard (×1.25)</option>
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-2">{billable.toFixed(2)}</td>
                  {showGroupColumn && (
                    <td className="px-4 py-2">
                      <select
                        value={pageGroupings[page.id] || 'group-1'}
                        onChange={(e) => onPageGroupChange(page.id, e.target.value)}
                        disabled={readOnly}
                        className="border border-gray-300 rounded px-2 py-1 text-sm disabled:bg-gray-100"
                      >
                        {documentGroups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  )}
                </tr>
              );
            })}
            {/* Total Row */}
            <tr className="bg-gray-100 font-medium">
              <td className="px-4 py-2">Total</td>
              <td className="px-4 py-2">{totalWords}</td>
              <td className="px-4 py-2"></td>
              <td className="px-4 py-2">{roundedBillable.toFixed(2)}</td>
              {showGroupColumn && <td className="px-4 py-2"></td>}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PageTable;
