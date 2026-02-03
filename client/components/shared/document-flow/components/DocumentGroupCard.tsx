import React from 'react';
import { RefreshCw } from 'lucide-react';
import { DocumentGroup, CertificationType } from '../types';

interface DocumentGroupCardProps {
  group: DocumentGroup;
  certificationTypes: CertificationType[];
  baseRate: number;
  languageMultiplier: number;
  onReanalyze: () => void;
  onCertificationChange: (certTypeId: string) => void;
  readOnly?: boolean;
}

export const DocumentGroupCard: React.FC<DocumentGroupCardProps> = ({
  group,
  certificationTypes,
  baseRate,
  languageMultiplier,
  onReanalyze,
  onCertificationChange,
  readOnly = false,
}) => {
  return (
    <div className="border rounded-lg bg-white shadow-sm p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg">📄</span>
            <h3 className="font-semibold">
              {group.name}: {group.document_type || 'Unknown Type'}
            </h3>
          </div>
          <div className="text-sm text-gray-600 mt-1">
            {group.holder_name && <span>Holder: {group.holder_name}</span>}
            {group.holder_name && group.country_of_issue && <span> | </span>}
            {group.country_of_issue && <span>Country: {group.country_of_issue}</span>}
          </div>
          <div className="text-sm text-gray-500 mt-1">
            Source: {group.source_filename}
            {group.pages.length > 0 && (
              <span>
                {' '}(
                {group.pages.length === 1
                  ? `Page ${group.pages[0].page_number}`
                  : `Pages ${group.pages[0].page_number}-${group.pages[group.pages.length - 1].page_number}`}
                )
              </span>
            )}
          </div>
        </div>
        {!readOnly && (
          <button
            onClick={onReanalyze}
            className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            Re-analyze
          </button>
        )}
      </div>

      {/* Page Table */}
      <div className="border rounded-lg overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-700">Page</th>
              <th className="px-4 py-2 text-left font-medium text-gray-700">Words</th>
              <th className="px-4 py-2 text-left font-medium text-gray-700">×Complexity</th>
              <th className="px-4 py-2 text-left font-medium text-gray-700">Billable</th>
            </tr>
          </thead>
          <tbody>
            {group.pages.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-center text-gray-500">
                  No page details available
                </td>
              </tr>
            ) : (
              group.pages.map((page, idx) => (
                <tr key={page.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-2">
                    {page.page_number === 0 ? 'All' : page.page_number}
                  </td>
                  <td className="px-4 py-2">{page.word_count?.toLocaleString() ?? 0}</td>
                  <td className="px-4 py-2">×{page.complexity_multiplier?.toFixed(2) ?? '1.00'}</td>
                  <td className="px-4 py-2">{(typeof page.billable_pages === 'number' ? page.billable_pages : parseFloat(page.billable_pages as any) || 0).toFixed(2)}</td>
                </tr>
              ))
            )}
            {/* Total Row */}
            <tr className="bg-gray-100 font-medium">
              <td className="px-4 py-2" colSpan={3}>
                Total:
              </td>
              <td className="px-4 py-2">{group.total_billable_pages?.toFixed(2) ?? '0.00'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Pricing */}
      <div className="space-y-2 text-sm">
        {/* Certification */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>Certification:</span>
            {readOnly ? (
              <span className="font-medium">{group.certification_name || 'Standard'}</span>
            ) : (
              <select
                value={group.certification_type_id || ''}
                onChange={(e) => onCertificationChange(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1"
              >
                {certificationTypes.map((ct) => (
                  <option key={ct.id} value={ct.id}>
                    {ct.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <span className="font-medium">${(group.certification_price ?? 0).toFixed(2)}</span>
        </div>

        {/* Translation */}
        <div className="flex items-center justify-between">
          <span className="text-gray-600">
            Translation: {(group.total_billable_pages ?? 0).toFixed(2)} × ${(baseRate ?? 65).toFixed(2)} ×{' '}
            {(languageMultiplier ?? 1).toFixed(2)} =
          </span>
          <span className="font-medium">${(group.translation_cost ?? 0).toFixed(2)}</span>
        </div>

        {/* Document Total */}
        <div className="flex items-center justify-between pt-2 border-t">
          <span className="font-semibold">Document Total:</span>
          <span className="font-semibold text-lg">${(group.group_total ?? 0).toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};

export default DocumentGroupCard;
