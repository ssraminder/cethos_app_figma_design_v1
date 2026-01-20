import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const navigate = useNavigate();
  const isMounted = useRef(true);
  const hasProcessedCallback = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    
    const handleAuthCallback = async () => {
      // Prevent double processing
      if (hasProcessedCallback.current) {
        return;
      }

      if (!supabase) {
        if (isMounted.current) setCheckingAuth(false);
        return;
      }

      // Check if we have a hash with access_token (magic link redirect)
      const hash = window.location.hash;
      
      if (hash && hash.includes('access_token')) {
        hasProcessedCallback.current = true;
        console.log('Processing magic link callback...');
        
        try {
          // Parse the hash to extract tokens
          const params = new URLSearchParams(hash.substring(1));
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');
          
          if (accessToken && refreshToken) {
            // Set the session manually
            const { data, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (error) {
              console.error('Error setting session:', error);
              if (isMounted.current) {
                setMessage('Error processing login. Please try again.');
                setCheckingAuth(false);
              }
              return;
            }

            if (data.session) {
              console.log('Session established, checking staff status...');
              
              // Check if user is a staff member
              const { data: staffData, error: staffError } = await supabase
                .from('staff_users')
                .select('id, email, full_name, role, is_active')
                .eq('auth_user_id', data.session.user.id)
                .eq('is_active', true)
                .single();

              if (!isMounted.current) return;

              if (staffError || !staffData) {
                console.error('Not a staff user:', staffError);
                setMessage('Access denied. You are not authorized as staff.');
                await supabase.auth.signOut();
                setCheckingAuth(false);
                return;
              }

              console.log('Staff user verified, redirecting...');
              // Clear the hash from URL
              window.history.replaceState(null, '', window.location.pathname);
              navigate('/admin/hitl', { replace: true });
              return;
            }
          }
        } catch (err) {
          console.error('Auth callback error:', err);
          if (isMounted.current) {
            setMessage('Error processing login. Please try again.');
            setCheckingAuth(false);
          }
          return;
        }
      }

      // No hash, check for existing session
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!isMounted.current) return;

        if (session) {
          // Check if user is staff
          const { data: staffData } = await supabase
            .from('staff_users')
            .select('id')
            .eq('auth_user_id', session.user.id)
            .eq('is_active', true)
            .single();

          if (!isMounted.current) return;

          if (staffData) {
            navigate('/admin/hitl', { replace: true });
            return;
          }
        }
      } catch (err) {
        console.error('Session check error:', err);
      }

      if (isMounted.current) {
        setCheckingAuth(false);
      }
    };

    handleAuthCallback();

    return () => {
      isMounted.current = false;
    };
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!supabase) {
      setMessage('Supabase not configured');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      // First check if the email exists in staff_users
      const { data: staffCheck, error: staffCheckError } = await supabase
        .from('staff_users')
        .select('id, is_active')
        .eq('email', email.toLowerCase())
        .single();

      if (staffCheckError || !staffCheck) {
        setMessage('Email not found in staff directory.');
        setLoading(false);
        return;
      }

      if (!staffCheck.is_active) {
        setMessage('Your account has been deactivated. Contact an administrator.');
        setLoading(false);
        return;
      }

      // Send magic link
      const { error } = await supabase.auth.signInWithOtp({
        email: email.toLowerCase(),
        options: {
          emailRedirectTo: `${window.location.origin}/admin/login`,
        },
      });

      if (error) {
        setMessage(error.message);
      } else {
        setMessage('Check your email for the magic link!');
      }
    } catch (err) {
      console.error('Login error:', err);
      setMessage('An error occurred. Please try again.');
    }

    setLoading(false);
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Verifying authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h1 className="text-center text-3xl font-bold text-blue-600">CETHOS</h1>
          <h2 className="mt-6 text-center text-2xl font-semibold text-gray-900">
            Staff Portal
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Sign in to access the admin dashboard
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="you@cethos.com"
            />
          </div>

          {message && (
            <div className={`text-sm text-center ${message.includes('Check your email') ? 'text-green-600' : 'text-red-600'}`}>
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Sending...' : 'Send Magic Link'}
          </button>
        </form>
      </div>
    </div>
  );
}
