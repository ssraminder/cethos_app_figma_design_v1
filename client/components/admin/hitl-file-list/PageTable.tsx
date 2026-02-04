// client/components/admin/hitl-file-list/PageTable.tsx

import React from 'react';
import { QuotePage, PageUpdateData, COMPLEXITY_OPTIONS } from './types';

interface PageTableProps {
  pages: QuotePage[];
  readOnly: boolean;
  onUpdatePage: (update: PageUpdateData) => void;
}

export function PageTable({
  pages,
  readOnly,
  onUpdatePage,
}: PageTableProps) {
  const handleChange = (pageId: string, field: PageUpdateData['field'], value: string | boolean) => {
    let parsedValue: number | string | boolean = value;

    if (field === 'word_count' || field === 'billable_pages') {
      parsedValue = field === 'billable_pages'
        ? parseFloat(value as string) || 0
        : parseInt(value as string) || 0;
    }

    onUpdatePage({ pageId, field, value: parsedValue });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="px-3 py-2 font-medium text-gray-700 w-16">Include</th>
            <th className="px-3 py-2 font-medium text-gray-700 w-16">Page</th>
            <th className="px-3 py-2 font-medium text-gray-700 w-28">Words</th>
            <th className="px-3 py-2 font-medium text-gray-700 w-28">Billable</th>
            <th className="px-3 py-2 font-medium text-gray-700 w-32">Complexity</th>
            <th className="px-3 py-2 font-medium text-gray-700">Status</th>
          </tr>
        </thead>
        <tbody>
          {pages.map((page, idx) => (
            <tr
              key={page.id}
              className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${!page.is_included ? 'opacity-50' : ''}`}
            >
              {/* Include Checkbox */}
              <td className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={page.is_included}
                  onChange={(e) => handleChange(page.id, 'is_included', e.target.checked)}
                  disabled={readOnly}
                  className="w-4 h-4 text-teal-600 rounded border-gray-300 focus:ring-teal-500"
                />
              </td>

              {/* Page Number */}
              <td className="px-3 py-2 font-medium text-gray-900">{page.page_number}</td>

              {/* Word Count */}
              <td className="px-3 py-2">
                {readOnly ? (
                  <span className="text-gray-700">{page.word_count || '—'}</span>
                ) : (
                  <input
                    type="number"
                    value={page.word_count || ''}
                    onChange={(e) => handleChange(page.id, 'word_count', e.target.value)}
                    className="w-20 px-2 py-1 border border-gray-300 rounded text-right focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                    min="0"
                    placeholder="0"
                  />
                )}
              </td>

              {/* Billable Pages */}
              <td className="px-3 py-2">
                {readOnly ? (
                  <span className="text-gray-700">{page.billable_pages?.toFixed(2) || '—'}</span>
                ) : (
                  <input
                    type="number"
                    value={page.billable_pages || ''}
                    onChange={(e) => handleChange(page.id, 'billable_pages', e.target.value)}
                    className="w-20 px-2 py-1 border border-gray-300 rounded text-right focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                  />
                )}
              </td>

              {/* Complexity */}
              <td className="px-3 py-2">
                <select
                  value={page.complexity}
                  onChange={(e) => handleChange(page.id, 'complexity', e.target.value)}
                  disabled={readOnly}
                  className={`px-2 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-teal-500 ${
                    page.complexity === 'easy' ? 'bg-green-50 text-green-700' :
                    page.complexity === 'hard' ? 'bg-red-50 text-red-700' :
                    'bg-yellow-50 text-yellow-700'
                  }`}
                >
                  {COMPLEXITY_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} (×{opt.multiplier.toFixed(2)})
                    </option>
                  ))}
                </select>
              </td>

              {/* Status */}
              <td className="px-3 py-2">
                {page.word_count > 0 ? (
                  <span className="text-green-600 text-xs">✓ Has data</span>
                ) : (
                  <span className="text-yellow-600 text-xs">⚠ No data</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {pages.length === 0 && (
        <p className="text-center py-4 text-gray-500 text-sm">No pages found</p>
      )}
    </div>
  );
}

export default PageTable;
