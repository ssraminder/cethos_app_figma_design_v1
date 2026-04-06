// client/pages/admin/PdfManager.tsx
// Main PDF Manager page with Workspace / Library tabs

import { useState } from 'react';
import { Wrench, Library } from 'lucide-react';
import { PdfManagerProvider } from '../../context/PdfManagerContext';
import PdfManagerLayout from '../../components/pdf-manager/PdfManagerLayout';
import DocumentLibrary from '../../components/pdf-manager/DocumentLibrary';

type TopTab = 'workspace' | 'library';

export default function PdfManager() {
  const [tab, setTab] = useState<TopTab>('workspace');

  return (
    <div className="p-4 lg:p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">PDF Manager</h1>
          <p className="text-sm text-gray-500 mt-1">
            Upload, combine, split, annotate, and manage PDF documents
          </p>
        </div>

        {/* Top-level tab toggle */}
        <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
          <button
            onClick={() => setTab('workspace')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${
              tab === 'workspace'
                ? 'bg-teal-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Wrench className="h-4 w-4" />
            Workspace
          </button>
          <button
            onClick={() => setTab('library')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${
              tab === 'library'
                ? 'bg-teal-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Library className="h-4 w-4" />
            Library
          </button>
        </div>
      </div>

      <PdfManagerProvider>
        <div className="flex-1 min-h-0">
          {tab === 'workspace' ? (
            <PdfManagerLayout />
          ) : (
            <div className="h-full bg-white rounded-lg border border-gray-200 overflow-hidden">
              <DocumentLibrary />
            </div>
          )}
        </div>
      </PdfManagerProvider>
    </div>
  );
}
