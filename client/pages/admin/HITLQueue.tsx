import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function HITLQueue() {
  const [staffEmail, setStaffEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Check sessionStorage for login state
    const isLoggedIn = sessionStorage.getItem('staffLoggedIn');
    const email = sessionStorage.getItem('staffEmail');

    if (isLoggedIn !== 'true' || !email) {
      navigate('/admin/login', { replace: true });
      return;
    }

    setStaffEmail(email);
    setLoading(false);
  }, [navigate]);

  const handleLogout = () => {
    sessionStorage.removeItem('staffLoggedIn');
    sessionStorage.removeItem('staffEmail');
    navigate('/admin/login', { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-blue-600">CETHOS</h1>
            <p className="text-sm text-gray-500">Staff Portal - HITL Queue</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{staffEmail}</span>
            <button
              onClick={handleLogout}
              className="px-3 py-1 text-sm text-red-600 hover:text-red-800 border border-red-300 rounded hover:bg-red-50"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Human-in-the-Loop Review Queue
          </h2>
          
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
            <p className="text-gray-500 text-lg">No reviews pending</p>
            <p className="text-gray-400 text-sm mt-2">
              Reviews will appear here when quotes need manual verification
            </p>
          </div>

          {/* Placeholder stats */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-sm text-blue-600 font-medium">Pending</p>
              <p className="text-2xl font-bold text-blue-900">0</p>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4">
              <p className="text-sm text-yellow-600 font-medium">In Progress</p>
              <p className="text-2xl font-bold text-yellow-900">0</p>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <p className="text-sm text-green-600 font-medium">Completed Today</p>
              <p className="text-2xl font-bold text-green-900">0</p>
            </div>
            <div className="bg-red-50 rounded-lg p-4">
              <p className="text-sm text-red-600 font-medium">SLA Breached</p>
              <p className="text-2xl font-bold text-red-900">0</p>
            </div>
          </div>
        </div>

        {/* Test Mode Notice */}
        <div className="mt-4 bg-orange-50 border border-orange-200 rounded-lg p-4">
          <p className="text-sm text-orange-800">
            <strong>Test Mode:</strong> Authentication is using test code (700310). 
            Full Supabase auth will be implemented later.
          </p>
        </div>
      </main>
    </div>
  );
}
