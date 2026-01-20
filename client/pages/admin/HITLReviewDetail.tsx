import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

interface QuoteFile {
  id: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  storage_path: string;
}

interface AIAnalysis {
  document_type: string;
  document_type_confidence: number;
  detected_language: string;
  language_confidence: number;
  complexity_assessment: string;
  complexity_confidence: number;
  word_count: number;
  billable_pages: number;
}

interface ReviewDetail {
  review_id: string;
  quote_number: string;
  customer_name: string;
  customer_email: string;
  status: string;
  sla_status: string;
  minutes_to_sla: number;
  source_language: string;
  target_language: string;
  intended_use: string;
  is_rush: boolean;
  estimated_delivery: string;
  subtotal: number;
  certification_fee: number;
  rush_fee: number;
  delivery_fee: number;
  tax: number;
  total: number;
  files: QuoteFile[];
  ai_analysis: AIAnalysis | null;
}

export default function HITLReviewDetail() {
  const { reviewId } = useParams<{ reviewId: string }>();
  const navigate = useNavigate();
  const [staffEmail, setStaffEmail] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [showCorrections, setShowCorrections] = useState(false);
  const [internalNotes, setInternalNotes] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Correction form state
  const [corrections, setCorrections] = useState({
    documentType: '',
    complexity: '',
    wordCount: '',
    reason: '',
  });

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

  useEffect(() => {
    // Check sessionStorage for login state
    const isLoggedIn = sessionStorage.getItem('staffLoggedIn');
    const email = sessionStorage.getItem('staffEmail');

    if (isLoggedIn !== 'true' || !email) {
      navigate('/admin/login', { replace: true });
      return;
    }

    setStaffEmail(email);
    fetchReviewDetail();
  }, [reviewId, navigate]);

  const fetchReviewDetail = async () => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !reviewId) {
      setError('Configuration or review ID missing');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch review detail from v_hitl_review_detail
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/v_hitl_review_detail?review_id=eq.${reviewId}&select=*`,
        {
          method: 'GET',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Fetch error:', errorText);
        setError(`Failed to load review: ${response.status}`);
        setLoading(false);
        return;
      }

      const data = await response.json();
      console.log('Review detail data:', data);

      if (!data || data.length === 0) {
        setError('Review not found');
        setLoading(false);
        return;
      }

      const reviewData = data[0];

      // Fetch quote files
      const filesResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/quote_files?quote_id=eq.${reviewData.quote_id}&select=*`,
        {
          method: 'GET',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
        }
      );

      const filesData = filesResponse.ok ? await filesResponse.json() : [];

      // Fetch AI analysis if available
      const aiResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/ai_analysis_results?review_id=eq.${reviewId}&select=*`,
        {
          method: 'GET',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
        }
      );

      const aiData = aiResponse.ok ? await aiResponse.json() : [];

      const completeReview: ReviewDetail = {
        ...reviewData,
        files: filesData,
        ai_analysis: aiData.length > 0 ? aiData[0] : null,
      };

      setReview(completeReview);
      setLoading(false);
    } catch (err) {
      console.error('Fetch exception:', err);
      setError(`Error: ${err}`);
      setLoading(false);
    }
  };

  const claimReview = async () => {
    if (!review) return;
    setSubmitting(true);
    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/claim-hitl-review`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reviewId: review.review_id,
            staffId: staffEmail,
          }),
        }
      );
      if (!response.ok) throw new Error('Failed to claim review');
      // Refresh the review data
      fetchReviewDetail();
    } catch (err) {
      alert('Error claiming review: ' + (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const approveReview = async () => {
    if (!review) return;
    if (!confirm('Are you sure you want to approve this quote?')) return;
    setSubmitting(true);
    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/approve-hitl-review`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reviewId: review.review_id,
            staffId: staffEmail,
            notes: internalNotes,
          }),
        }
      );
      if (!response.ok) throw new Error('Failed to approve review');
      alert('Quote approved successfully!');
      navigate('/admin/hitl');
    } catch (err) {
      alert('Error approving review: ' + (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const rejectReview = async () => {
    if (!review) return;
    const reason = prompt('Please provide a reason for requesting a better scan:');
    if (!reason) return;
    setSubmitting(true);
    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/reject-hitl-review`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reviewId: review.review_id,
            staffId: staffEmail,
            reason: reason,
            fileIds: review.files.map(f => f.id),
          }),
        }
      );
      if (!response.ok) throw new Error('Failed to reject review');
      alert('Better scan requested. Customer will be notified.');
      navigate('/admin/hitl');
    } catch (err) {
      alert('Error rejecting review: ' + (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const escalateReview = async () => {
    if (!review) return;
    if (!confirm('Are you sure you want to escalate this to an admin?')) return;
    setSubmitting(true);
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/hitl_reviews?id=eq.${review.review_id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            status: 'escalated',
            resolution_notes: internalNotes || 'Escalated by reviewer',
          }),
        }
      );
      if (!response.ok) throw new Error('Failed to escalate review');
      alert('Review escalated to admin.');
      navigate('/admin/hitl');
    } catch (err) {
      alert('Error escalating review: ' + (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const saveCorrections = async () => {
    if (!review || !corrections.reason.trim()) {
      alert('Please provide a reason for the corrections.');
      return;
    }
    setSubmitting(true);
    try {
      const correctionsToSave = [];

      if (corrections.documentType && review.ai_analysis?.document_type !== corrections.documentType) {
        correctionsToSave.push({
          field: 'document_type',
          aiValue: review.ai_analysis?.document_type,
          correctedValue: corrections.documentType,
        });
      }
      if (corrections.complexity && review.ai_analysis?.complexity_assessment !== corrections.complexity) {
        correctionsToSave.push({
          field: 'complexity',
          aiValue: review.ai_analysis?.complexity_assessment,
          correctedValue: corrections.complexity,
        });
      }
      if (corrections.wordCount && review.ai_analysis?.word_count !== parseInt(corrections.wordCount)) {
        correctionsToSave.push({
          field: 'word_count',
          aiValue: review.ai_analysis?.word_count,
          correctedValue: parseInt(corrections.wordCount),
        });
      }

      for (const correction of correctionsToSave) {
        const response = await fetch(
          `${SUPABASE_URL}/functions/v1/save-hitl-correction`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              reviewId: review.review_id,
              analysisId: review.ai_analysis?.id,
              staffId: staffEmail,
              field: correction.field,
              aiValue: correction.aiValue,
              correctedValue: correction.correctedValue,
              reason: corrections.reason,
            }),
          }
        );
        if (!response.ok) throw new Error(`Failed to save ${correction.field} correction`);
      }

      alert('Corrections saved successfully!');
      setShowCorrections(false);
      setCorrections({ documentType: '', complexity: '', wordCount: '', reason: '' });
      setHasChanges(false);
      fetchReviewDetail();
    } catch (err) {
      alert('Error saving corrections: ' + (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const formatSLA = (minutes: number) => {
    if (minutes < 0) return 'OVERDUE';
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const getSLAColor = (status: string) => {
    switch (status) {
      case 'breached':
        return 'bg-red-100 text-red-800';
      case 'critical':
        return 'bg-orange-100 text-orange-800';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-green-100 text-green-800';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !review) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-7xl mx-auto">
          <button
            onClick={() => navigate('/admin/hitl')}
            className="mb-4 text-blue-600 hover:text-blue-800 font-medium"
          >
            ← Back to Queue
          </button>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <p className="text-red-800">{error || 'Review not found'}</p>
          </div>
        </div>
      </div>
    );
  }

  const currentFile = review.files[selectedFileIndex];
  const isPDF = currentFile?.mime_type === 'application/pdf';
  const isImage = currentFile?.mime_type.startsWith('image/');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <button
            onClick={() => navigate('/admin/hitl')}
            className="mb-2 text-blue-600 hover:text-blue-800 font-medium"
          >
            ← Back to Queue
          </button>
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{review.quote_number}</h1>
              <p className="text-gray-600">{review.customer_name}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${getSLAColor(review.sla_status)}`}>
                {formatSLA(review.minutes_to_sla)}
              </div>
              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                {review.status.replace(/_/g, ' ').toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Document Preview */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Document Preview</h2>

              {/* File Tabs */}
              {review.files.length > 0 && (
                <div className="mb-4 border-b border-gray-200">
                  <div className="flex gap-2 overflow-x-auto">
                    {review.files.map((file, index) => (
                      <button
                        key={file.id}
                        onClick={() => setSelectedFileIndex(index)}
                        className={`px-4 py-2 font-medium text-sm whitespace-nowrap ${
                          selectedFileIndex === index
                            ? 'border-b-2 border-blue-600 text-blue-600'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        {file.original_filename}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Document Viewer */}
              <div className="bg-gray-100 rounded-lg p-12 text-center min-h-96 flex items-center justify-center">
                {!currentFile ? (
                  <p className="text-gray-500">No files attached</p>
                ) : isPDF ? (
                  <div className="text-gray-500">
                    <p className="mb-2">📄 PDF Preview</p>
                    <p className="text-sm">{currentFile.original_filename}</p>
                    <p className="text-xs text-gray-400 mt-2">
                      {(currentFile.file_size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                ) : isImage ? (
                  <div className="text-gray-500">
                    <p className="mb-2">🖼️ Image Preview</p>
                    <p className="text-sm">{currentFile.original_filename}</p>
                  </div>
                ) : (
                  <div className="text-gray-500">
                    <p className="mb-2">📁 File</p>
                    <p className="text-sm">{currentFile.original_filename}</p>
                  </div>
                )}
              </div>

              {currentFile && (
                <div className="mt-4 flex justify-between items-center">
                  <div className="text-sm text-gray-600">
                    {currentFile.original_filename}
                    <span className="ml-2 text-gray-400">
                      ({(currentFile.file_size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                  </div>
                  <a
                    href="#"
                    className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                  >
                    ↓ Download
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Review Details */}
          <div className="lg:col-span-1 space-y-6">
            {/* Quote Summary */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Quote Summary</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-gray-600">Customer</p>
                  <p className="font-medium text-gray-900">{review.customer_name}</p>
                  <p className="text-gray-600">{review.customer_email}</p>
                </div>
                <div>
                  <p className="text-gray-600">Language Pair</p>
                  <p className="font-medium text-gray-900">
                    {review.source_language} → {review.target_language}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600">Intended Use</p>
                  <p className="font-medium text-gray-900">{review.intended_use || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-gray-600">Rush Status</p>
                  <p>
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                      review.is_rush ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {review.is_rush ? 'RUSH' : 'STANDARD'}
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-gray-600">Est. Delivery</p>
                  <p className="font-medium text-gray-900">{review.estimated_delivery || 'N/A'}</p>
                </div>
              </div>
            </div>

            {/* AI Analysis */}
            {review.ai_analysis && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="font-semibold text-gray-900 mb-4">AI Analysis</h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="flex justify-between">
                      <p className="text-gray-600">Document Type</p>
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                        {(review.ai_analysis.document_type_confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="font-medium text-gray-900">{review.ai_analysis.document_type}</p>
                  </div>
                  <div>
                    <div className="flex justify-between">
                      <p className="text-gray-600">Detected Language</p>
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                        {(review.ai_analysis.language_confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="font-medium text-gray-900">{review.ai_analysis.detected_language}</p>
                  </div>
                  <div>
                    <div className="flex justify-between">
                      <p className="text-gray-600">Complexity</p>
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                        {(review.ai_analysis.complexity_confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="font-medium text-gray-900">{review.ai_analysis.complexity_assessment}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <div>
                      <p className="text-gray-600 text-xs">Word Count</p>
                      <p className="font-bold text-lg text-gray-900">{review.ai_analysis.word_count}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 text-xs">Billable Pages</p>
                      <p className="font-bold text-lg text-gray-900">{review.ai_analysis.billable_pages}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Pricing Summary */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Pricing</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-medium">${review.subtotal.toFixed(2)}</span>
                </div>
                {review.certification_fee > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Certification</span>
                    <span className="font-medium">${review.certification_fee.toFixed(2)}</span>
                  </div>
                )}
                {review.rush_fee > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Rush Fee</span>
                    <span className="font-medium">${review.rush_fee.toFixed(2)}</span>
                  </div>
                )}
                {review.delivery_fee > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Delivery</span>
                    <span className="font-medium">${review.delivery_fee.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-gray-200">
                  <span className="text-gray-600">Tax</span>
                  <span className="font-medium">${review.tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t-2 border-gray-900">
                  <span className="font-bold text-gray-900">Total</span>
                  <span className="font-bold text-lg text-gray-900">${review.total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Correction Form */}
        <div className="mt-6 bg-white rounded-lg shadow">
          <button
            onClick={() => setShowCorrections(!showCorrections)}
            className="w-full px-6 py-4 text-left font-semibold text-gray-900 hover:bg-gray-50 flex justify-between items-center"
          >
            <span>Make Corrections</span>
            <span>{showCorrections ? '▼' : '▶'}</span>
          </button>

          {showCorrections && (
            <div className="border-t border-gray-200 p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Document Type
                  </label>
                  <select
                    value={corrections.documentType}
                    onChange={(e) => {
                      setCorrections({ ...corrections, documentType: e.target.value });
                      setHasChanges(true);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                  >
                    <option value="">Select type</option>
                    <option value="certificate">Certificate</option>
                    <option value="contract">Contract</option>
                    <option value="technical">Technical Document</option>
                    <option value="medical">Medical Document</option>
                    <option value="legal">Legal Document</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Complexity
                  </label>
                  <select
                    value={corrections.complexity}
                    onChange={(e) => {
                      setCorrections({ ...corrections, complexity: e.target.value });
                      setHasChanges(true);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                  >
                    <option value="">Select complexity</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Word Count (Override)
                </label>
                <input
                  type="number"
                  value={corrections.wordCount}
                  onChange={(e) => {
                    setCorrections({ ...corrections, wordCount: e.target.value });
                    setHasChanges(true);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                  placeholder="Leave blank to keep AI value"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Correction Reason *
                </label>
                <textarea
                  value={corrections.reason}
                  onChange={(e) => {
                    setCorrections({ ...corrections, reason: e.target.value });
                    setHasChanges(true);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                  rows={2}
                  placeholder="Why are you making these changes?"
                />
              </div>
              <button
                onClick={saveCorrections}
                disabled={submitting || !corrections.reason.trim()}
                className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium"
              >
                Save Corrections
              </button>
            </div>
          )}
        </div>

        {/* Internal Notes */}
        <div className="mt-6 bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Internal Notes</h3>
          <textarea
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
            rows={3}
            placeholder="Add internal notes for other reviewers..."
          />
        </div>
      </main>

      {/* Sticky Action Buttons */}
      <footer className="sticky bottom-0 bg-white border-t border-gray-200 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex gap-2 justify-end">
            {review.status === 'pending' && (
              <button
                onClick={claimReview}
                disabled={submitting}
                className="px-4 py-2 bg-gray-100 text-gray-900 rounded-md hover:bg-gray-200 disabled:opacity-50 font-medium text-sm"
              >
                Claim Review
              </button>
            )}
            <button
              onClick={rejectReview}
              disabled={submitting}
              className="px-4 py-2 bg-orange-100 text-orange-700 rounded-md hover:bg-orange-200 disabled:opacity-50 font-medium text-sm"
            >
              Request Better Scan
            </button>
            <button
              onClick={escalateReview}
              disabled={submitting}
              className="px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 disabled:opacity-50 font-medium text-sm"
            >
              Escalate
            </button>
            <button
              onClick={approveReview}
              disabled={submitting}
              className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 font-medium"
            >
              {submitting ? 'Processing...' : 'Approve'}
            </button>
          </div>
          {hasChanges && (
            <p className="text-sm text-orange-600 mt-2">⚠️ You have unsaved changes</p>
          )}
        </div>
      </footer>
    </div>
  );
}
