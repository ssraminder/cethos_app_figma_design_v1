import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const TEST_CODE = '700310';
  
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setMessage('Database not configured');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      // Use direct fetch to Supabase REST API (bypasses JS client AbortError)
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/staff_users?email=eq.${encodeURIComponent(email.toLowerCase())}&select=id,email,is_active`,
        {
          method: 'GET',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('Fetch response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Fetch error:', errorText);
        setMessage(`Database error: ${response.status}`);
        setLoading(false);
        return;
      }

      const data = await response.json();
      console.log('Staff data:', data);

      if (!data || data.length === 0) {
        setMessage('Email not found in staff directory.');
        setLoading(false);
        return;
      }

      const staffUser = data[0];

      if (!staffUser.is_active) {
        setMessage('Account deactivated. Contact administrator.');
        setLoading(false);
        return;
      }

      // Success - show OTP screen
      setStep('otp');
      setMessage('Enter code 700310 (test mode)');

    } catch (err) {
      console.error('Fetch exception:', err);
      setMessage(`Error: ${err}`);
    }

    setLoading(false);
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setLoading(true);
    setMessage('');

    if (otpCode === TEST_CODE) {
      setMessage('Login successful! Redirecting...');
      
      // Store login state in sessionStorage for now
      sessionStorage.setItem('staffEmail', email.toLowerCase());
      sessionStorage.setItem('staffLoggedIn', 'true');
      
      setTimeout(() => {
        navigate('/admin/hitl', { replace: true });
      }, 500);
      return;
    }

    setMessage('Invalid code. Use 700310 for testing.');
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h1 className="text-center text-3xl font-bold text-blue-600">CETHOS</h1>
          <h2 className="mt-6 text-center text-2xl font-semibold text-gray-900">
            Staff Portal
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {step === 'email' ? 'Enter your staff email' : 'Enter the 6-digit code'}
          </p>
        </div>

        {step === 'email' ? (
          <form className="mt-8 space-y-6" onSubmit={handleSendOTP}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="you@cethos.com"
              />
            </div>

            {message && (
              <p className={`text-sm text-center ${message.includes('700310') ? 'text-blue-600' : 'text-red-600'}`}>
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Checking...' : 'Continue'}
            </button>
          </form>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleVerifyOTP}>
            <p className="text-sm text-center text-gray-500">
              Logging in as: {email}
            </p>
            
            <div>
              <label htmlFor="otp" className="block text-sm font-medium text-gray-700">
                6-Digit Code
              </label>
              <input
                id="otp"
                type="text"
                required
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-center text-2xl tracking-widest"
                placeholder="000000"
              />
            </div>

            {message && (
              <p className={`text-sm text-center ${message.includes('successful') ? 'text-green-600' : message.includes('700310') ? 'text-blue-600' : 'text-red-600'}`}>
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || otpCode.length !== 6}
              className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify Code'}
            </button>

            <button
              type="button"
              onClick={() => { setStep('email'); setOtpCode(''); setMessage(''); }}
              className="w-full py-2 px-4 text-sm text-gray-600 hover:text-gray-900"
            >
              ← Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
