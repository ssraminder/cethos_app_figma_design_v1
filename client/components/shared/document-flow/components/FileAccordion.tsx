import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, FileText, Brain, Edit, Loader2 } from 'lucide-react';
import { QuoteFile, QuotePage, AnalysisResult, DocumentType, LocalDocumentGroup, PageGrouping, Complexity } from '../types';
import PageTable from './PageTable';

interface FileAccordionProps {
  file: QuoteFile;
  documentTypes: DocumentType[];
  isExpanded: boolean;
  isAnalyzing: boolean;
  isSubmitted: boolean;
  onToggleExpand: () => void;
  onAnalyze: () => Promise<void>;
  onManualEntry: () => void;
  onSubmit: (groupings: PageGrouping[], isMultiDocument: boolean, metadata: {
    documentType: string;
    holderName: string;
    countryOfIssue: string;
  }) => Promise<void>;
  readOnly?: boolean;
}

export const FileAccordion: React.FC<FileAccordionProps> = ({
  file,
  documentTypes,
  isExpanded,
  isAnalyzing,
  isSubmitted,
  onToggleExpand,
  onAnalyze,
  onManualEntry,
  onSubmit,
  readOnly = false,
}) => {
  // State
  const [isOneDocument, setIsOneDocument] = useState(true);
  const [documentGroups, setDocumentGroups] = useState<LocalDocumentGroup[]>([
    { id: 'group-1', name: 'Document 1', pageIds: [] },
  ]);
  const [pageGroupings, setPageGroupings] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Metadata
  const [documentType, setDocumentType] = useState(file.analysis?.detected_document_type || '');
  const [holderName, setHolderName] = useState(file.analysis?.holder_name || '');
  const [countryOfIssue, setCountryOfIssue] = useState(file.analysis?.country_of_issue || '');

  // Initialize page groupings
  useEffect(() => {
    if (file.pages.length > 0 && Object.keys(pageGroupings).length === 0) {
      const initial: Record<string, string> = {};
      file.pages.forEach((p) => {
        initial[p.id] = 'group-1';
      });
      setPageGroupings(initial);
    }
  }, [file.pages]);

  // Update metadata when analysis changes
  useEffect(() => {
    if (file.analysis) {
      setDocumentType(file.analysis.detected_document_type || '');
      setHolderName(file.analysis.holder_name || '');
      setCountryOfIssue(file.analysis.country_of_issue || '');
    }
  }, [file.analysis]);

  const handleAddGroup = () => {
    const newId = `group-${documentGroups.length + 1}`;
    setDocumentGroups([
      ...documentGroups,
      { id: newId, name: `Document ${documentGroups.length + 1}`, pageIds: [] },
    ]);
  };

  const handlePageGroupChange = (pageId: string, groupId: string) => {
    setPageGroupings({ ...pageGroupings, [pageId]: groupId });
  };

  const handleComplexityChange = (pageId: string, complexity: Complexity) => {
    // This would update the page complexity - handled by parent
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const groupings: PageGrouping[] = file.pages.map((p) => ({
        pageId: p.id,
        groupId: isOneDocument ? 'group-1' : (pageGroupings[p.id] || 'group-1'),
        groupName: isOneDocument
          ? 'Document 1'
          : documentGroups.find(g => g.id === pageGroupings[p.id])?.name || 'Document 1',
      }));

      await onSubmit(groupings, !isOneDocument, {
        documentType,
        holderName,
        countryOfIssue,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusBadge = () => {
    if (isSubmitted) {
      return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">✓ Submitted</span>;
    }
    if (isAnalyzing) {
      return (
        <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" /> Analyzing...
        </span>
      );
    }
    if (file.analysis) {
      return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">✓ Analyzed</span>;
    }
    return <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600">○ Not analyzed</span>;
  };

  const getGroupSummary = () => {
    const groupCounts: Record<string, number[]> = {};
    file.pages.forEach((p) => {
      const groupId = pageGroupings[p.id] || 'group-1';
      if (!groupCounts[groupId]) groupCounts[groupId] = [];
      groupCounts[groupId].push(p.page_number);
    });
    return Object.entries(groupCounts).map(([groupId, pageNums]) => {
      const group = documentGroups.find((g) => g.id === groupId);
      const sortedPages = pageNums.sort((a, b) => a - b);
      const rangeStr = sortedPages.length === 1
        ? `Page ${sortedPages[0]}`
        : `Pages ${sortedPages[0]}-${sortedPages[sortedPages.length - 1]}`;
      return { name: group?.name || groupId, pages: rangeStr };
    });
  };

  const groupCount = isOneDocument ? 1 : new Set(Object.values(pageGroupings)).size;

  return (
    <div className="border rounded-lg bg-white shadow-sm">
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-500" />
          )}
          <FileText className="w-5 h-5 text-blue-500" />
          <div>
            <span className="font-medium">{file.original_filename}</span>
            <span className="text-gray-500 text-sm ml-2">
              ({file.pages.length} {file.pages.length === 1 ? 'page' : 'pages'}, {formatFileSize(file.file_size)})
            </span>
          </div>
        </div>
        {getStatusBadge()}
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t p-4">
          {/* Not Analyzed State */}
          {!file.analysis && !isAnalyzing && !readOnly && (
            <div className="flex gap-4 justify-center py-8">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAnalyze();
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Brain className="w-4 h-4" />
                Analyze with AI
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onManualEntry();
                }}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Edit className="w-4 h-4" />
                Enter Manually
              </button>
            </div>
          )}

          {/* Analyzing State */}
          {isAnalyzing && (
            <div className="flex flex-col items-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-2" />
              <p className="text-gray-600">Analyzing document...</p>
            </div>
          )}

          {/* Analyzed State */}
          {file.analysis && !isAnalyzing && !isSubmitted && (
            <div className="space-y-6">
              {/* Document Metadata */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Document Type
                  </label>
                  <select
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value)}
                    disabled={readOnly}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 disabled:bg-gray-100"
                  >
                    <option value="">Select type...</option>
                    {documentTypes.map((dt) => (
                      <option key={dt.id} value={dt.code}>
                        {dt.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Holder's Name
                  </label>
                  <input
                    type="text"
                    value={holderName}
                    onChange={(e) => setHolderName(e.target.value)}
                    disabled={readOnly}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 disabled:bg-gray-100"
                    placeholder="Enter name..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Country of Issue
                  </label>
                  <input
                    type="text"
                    value={countryOfIssue}
                    onChange={(e) => setCountryOfIssue(e.target.value)}
                    disabled={readOnly}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 disabled:bg-gray-100"
                    placeholder="Enter country..."
                  />
                </div>
              </div>

              {/* Document Structure */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Document Structure
                </label>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={`structure-${file.id}`}
                      checked={isOneDocument}
                      onChange={() => setIsOneDocument(true)}
                      disabled={readOnly}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span>One Document</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={`structure-${file.id}`}
                      checked={!isOneDocument}
                      onChange={() => setIsOneDocument(false)}
                      disabled={readOnly}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span>Multiple Documents</span>
                  </label>
                </div>
              </div>

              {/* Page Table */}
              <PageTable
                pages={file.pages}
                showGroupColumn={!isOneDocument}
                documentGroups={documentGroups}
                pageGroupings={pageGroupings}
                onPageGroupChange={handlePageGroupChange}
                onComplexityChange={handleComplexityChange}
                readOnly={readOnly}
              />

              {/* Document Groups Summary */}
              {!isOneDocument && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Document Groups
                  </label>
                  <div className="space-y-2">
                    {getGroupSummary().map((g, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500">•</span>
                        <span className="font-medium">{g.name}</span>
                        <span className="text-gray-500">({g.pages})</span>
                      </div>
                    ))}
                    {!readOnly && (
                      <button
                        onClick={handleAddGroup}
                        className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
                      >
                        + Add Document Group
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Submit Button */}
              {!readOnly && (
                <div className="flex justify-end pt-4 border-t">
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    Submit {groupCount === 1 ? 'as 1 Document' : `${groupCount} Documents`}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Submitted State */}
          {isSubmitted && (
            <div className="py-4 text-center text-green-600">
              <p className="font-medium">✓ Groupings submitted successfully</p>
              <p className="text-sm text-gray-500 mt-1">Created {groupCount} document group(s)</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FileAccordion;
