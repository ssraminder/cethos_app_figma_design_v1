import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!supabase) {
      setMessage('Database not configured');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      // Check if email exists in staff_users
      const { data: staffCheck, error: staffError } = await supabase
        .from('staff_users')
        .select('id, is_active')
        .eq('email', email.toLowerCase())
        .single();

      if (staffError || !staffCheck) {
        setMessage('Email not found in staff directory.');
        setLoading(false);
        return;
      }

      if (!staffCheck.is_active) {
        setMessage('Account deactivated. Contact administrator.');
        setLoading(false);
        return;
      }

      // Send OTP code (not magic link)
      const { error } = await supabase.auth.signInWithOtp({
        email: email.toLowerCase(),
        options: {
          shouldCreateUser: false,
        },
      });

      if (error) {
        setMessage(error.message);
      } else {
        setStep('otp');
        setMessage('Check your email for the 6-digit code.');
      }
    } catch (err) {
      console.error('Error:', err);
      setMessage('An error occurred. Please try again.');
    }

    setLoading(false);
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!supabase) {
      setMessage('Database not configured');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.toLowerCase(),
        token: otpCode,
        type: 'email',
      });

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      if (data.session) {
        // Verify staff status
        const { data: staff } = await supabase
          .from('staff_users')
          .select('id')
          .eq('auth_user_id', data.session.user.id)
          .eq('is_active', true)
          .single();

        if (staff) {
          navigate('/admin/hitl', { replace: true });
        } else {
          setMessage('Access denied. Not authorized as staff.');
          await supabase.auth.signOut();
        }
      }
    } catch (err) {
      console.error('Error:', err);
      setMessage('An error occurred. Please try again.');
    }

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
            {step === 'email' ? 'Enter your email to receive a login code' : 'Enter the 6-digit code from your email'}
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
              <p className={`text-sm text-center ${message.includes('Check your email') ? 'text-green-600' : 'text-red-600'}`}>
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send Login Code'}
            </button>
          </form>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleVerifyOTP}>
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
              <p className={`text-sm text-center ${message.includes('Check your email') ? 'text-green-600' : 'text-red-600'}`}>
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
              ← Back to email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
