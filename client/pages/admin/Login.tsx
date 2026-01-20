import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [staffId, setStaffId] = useState<string | null>(null);
  const navigate = useNavigate();

  const TEST_CODE = '700310';

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!supabase) {
      setMessage('Database not configured');
      return;
    }

    setLoading(true);
    setMessage('');

    // Check staff_users with retry logic
    let attempts = 0;
    let staffData = null;
    let lastError = null;

    while (attempts < 3 && !staffData) {
      attempts++;
      try {
        const { data, error } = await supabase
          .from('staff_users')
          .select('id, is_active')
          .eq('email', email.toLowerCase())
          .maybeSingle();

        if (error) {
          lastError = error;
          await new Promise(r => setTimeout(r, 200));
          continue;
        }

        staffData = data;
        break;
      } catch (err) {
        lastError = err;
        await new Promise(r => setTimeout(r, 200));
      }
    }

    setLoading(false);

    if (!staffData) {
      setMessage('Email not found in staff directory.');
      return;
    }

    if (!staffData.is_active) {
      setMessage('Account deactivated. Contact administrator.');
      return;
    }

    setStaffId(staffData.id);
    setStep('otp');
    setMessage('Enter code 700310 (test mode)');
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setLoading(true);
    setMessage('');

    if (otpCode === TEST_CODE) {
      setMessage('Login successful! Redirecting...');
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
              <p className="text-sm text-center text-red-600">{message}</p>
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
