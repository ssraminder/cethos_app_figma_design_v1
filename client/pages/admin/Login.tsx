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

    console.log('=== DATABASE DEBUG START ===');

    if (!supabase) {
      console.error('Supabase client is NULL');
      setMessage('Database not configured');
      return;
    }

    setLoading(true);
    setMessage('Checking database...');

    try {
      // 1. Log connection info
      console.log('Supabase URL:', import.meta.env.VITE_SUPABASE_URL);
      console.log('Email to check:', email.toLowerCase());

      // 2. First, try to list ALL staff_users to see if table is accessible
      console.log('Step 1: Fetching ALL staff_users...');
      const { data: allStaff, error: allError } = await supabase
        .from('staff_users')
        .select('id, email, is_active')
        .limit(10);

      console.log('All staff result:', { data: allStaff, error: allError });

      if (allError) {
        console.error('Error fetching all staff:', allError);
        setMessage(`Database error: ${allError.message}`);
        setLoading(false);
        return;
      }

      if (!allStaff || allStaff.length === 0) {
        console.log('No staff records found in database');
        setMessage('No staff records in database. Check RLS policies.');
        setLoading(false);
        return;
      }

      // 3. Log all emails in database
      console.log('Emails in database:');
      allStaff.forEach((s, i) => {
        console.log(`  ${i + 1}. "${s.email}" (active: ${s.is_active})`);
      });

      // 4. Now try to find specific email
      console.log('Step 2: Looking for specific email:', email.toLowerCase());
      const { data: staffData, error: staffError } = await supabase
        .from('staff_users')
        .select('id, email, is_active')
        .eq('email', email.toLowerCase())
        .maybeSingle();

      console.log('Specific email result:', { data: staffData, error: staffError });

      if (staffError) {
        console.error('Error finding email:', staffError);
        setMessage(`Query error: ${staffError.message}`);
        setLoading(false);
        return;
      }

      // 5. Check if email matches exactly
      const matchingEmail = allStaff.find(s => s.email === email.toLowerCase());
      console.log('Manual match check:', matchingEmail);

      const matchingEmailTrimmed = allStaff.find(s => s.email.trim() === email.toLowerCase().trim());
      console.log('Trimmed match check:', matchingEmailTrimmed);

      if (!staffData) {
        // Show what emails ARE in the database
        const emailList = allStaff.map(s => s.email).join(', ');
        setMessage(`Email not found. Available: ${emailList}`);
        setLoading(false);
        return;
      }

      if (!staffData.is_active) {
        setMessage('Account deactivated.');
        setLoading(false);
        return;
      }

      // Success!
      console.log('Staff found:', staffData);
      setStaffId(staffData.id);
      setStep('otp');
      setMessage('Enter code 700310 (test mode)');

    } catch (err) {
      console.error('Caught exception:', err);
      setMessage(`Exception: ${err}`);
    }

    setLoading(false);
    console.log('=== DATABASE DEBUG END ===');
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
