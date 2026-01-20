// app/admin/hitl/page.tsx
// HITL Queue Dashboard - Replace with Builder.io component later

'use client';

import { useStaffAuth } from '@/contexts/StaffAuthContext';
import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

interface HITLReview {
  review_id: string;
  quote_id: string;
  quote_number: string;
  status: string;
  priority: number;
  is_rush: boolean;
  customer_email: string;
  customer_name: string | null;
  file_count: number;
  estimated_value: number;
  trigger_reasons: string[];
  sla_status: string;
  minutes_to_sla: number;
  assigned_to_name: string | null;
  created_at: string;
}

export default function HITLQueuePage() {
  const { staff, isLoading: authLoading, signOut } = useStaffAuth();
  const [reviews, setReviews] = useState<HITLReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClientComponentClient();

  useEffect(() => {
    if (staff) {
      fetchReviews();
    }
  }, [staff]);

  const fetchReviews = async () => {
    try {
      const { data, error } = await supabase
        .from('v_hitl_queue')
        .select('*')
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      setReviews(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const claimReview = async (reviewId: string) => {
    if (!staff) return;

    try {
      const response = await supabase.functions.invoke('claim-hitl-review', {
        body: { reviewId, staffId: staff.id }
      });

      if (response.error) throw response.error;
      
      // Refresh the list
      fetchReviews();
    } catch (err: any) {
      alert(`Failed to claim review: ${err.message}`);
    }
  };

  const formatSLA = (minutes: number, status: string) => {
    if (status === 'breached') return 'OVERDUE';
    if (minutes < 0) return 'OVERDUE';
    
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const getSLAColor = (status: string) => {
    switch (status) {
      case 'breached': return 'text-red-600 bg-red-100';
      case 'critical': return 'text-red-600';
      case 'warning': return 'text-orange-600';
      default: return 'text-green-600';
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">HITL Review Queue</h1>
            <p className="text-sm text-gray-500">
              Logged in as {staff?.fullName} ({staff?.role})
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={fetchReviews}
              className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
            >
              Refresh
            </button>
            <button
              onClick={signOut}
              className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-2">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900">No reviews in queue</h3>
            <p className="text-gray-500">All caught up! Check back later.</p>
          </div>
        ) : (
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quote</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Files</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reasons</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SLA</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {reviews.map((review) => (
                  <tr 
                    key={review.review_id} 
                    className={`${review.is_rush ? 'border-l-4 border-orange-400' : ''} ${review.sla_status === 'breached' ? 'bg-red-50' : 'hover:bg-gray-50'}`}
                  >
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                        review.priority <= 2 ? 'bg-red-100 text-red-700' :
                        review.priority <= 4 ? 'bg-orange-100 text-orange-700' :
                        review.priority <= 6 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {review.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <a href={`/admin/hitl/${review.review_id}`} className="text-indigo-600 hover:text-indigo-800 font-medium">
                        {review.quote_number}
                      </a>
                      {review.is_rush && (
                        <span className="ml-2 px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full">
                          RUSH
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {review.customer_name || review.customer_email}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {review.file_count} file{review.file_count !== 1 ? 's' : ''}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium">
                      ${review.estimated_value?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {review.trigger_reasons?.slice(0, 2).map((reason, i) => (
                          <span key={i} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                            {reason.replace(/_/g, ' ')}
                          </span>
                        ))}
                        {review.trigger_reasons?.length > 2 && (
                          <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                            +{review.trigger_reasons.length - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-medium ${getSLAColor(review.sla_status)}`}>
                        {formatSLA(review.minutes_to_sla, review.sla_status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {review.assigned_to_name || <span className="text-gray-400">Unassigned</span>}
                    </td>
                    <td className="px-4 py-3">
                      {!review.assigned_to_name ? (
                        <button
                          onClick={() => claimReview(review.review_id)}
                          className="px-3 py-1 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
                        >
                          Claim
                        </button>
                      ) : (
                        <a
                          href={`/admin/hitl/${review.review_id}`}
                          className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                        >
                          View
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
