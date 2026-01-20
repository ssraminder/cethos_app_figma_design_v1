import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Timeout fallback - show login form after 2 seconds no matter what
    const timeout = setTimeout(() => {
      setCheckingAuth(false);
    }, 2000);

    const handleAuth = async () => {
      if (!supabase) {
        setCheckingAuth(false);
        return;
      }

      const hash = window.location.hash;
      
      // If we have tokens in the URL (magic link callback)
      if (hash && hash.includes('access_token')) {
        console.log('Magic link detected, processing...');
        
        try {
          const params = new URLSearchParams(hash.substring(1));
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');
          
          if (accessToken && refreshToken) {
            const { data, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (error) {
              console.error('Session error:', error);
              setMessage('Login failed. Please try again.');
              window.history.replaceState(null, '', '/admin/login');
              setCheckingAuth(false);
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
                window.history.replaceState(null, '', '/admin/login');
                navigate('/admin/hitl', { replace: true });
                return;
              } else {
                setMessage('Access denied. Not authorized as staff.');
                await supabase.auth.signOut();
              }
            }
          }
        } catch (err) {
          console.error('Auth error:', err);
          setMessage('Login error. Please try again.');
        }
        
        window.history.replaceState(null, '', '/admin/login');
        setCheckingAuth(false);
        return;
      }

      // No hash - check existing session
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          const { data: staff } = await supabase
            .from('staff_users')
            .select('id')
            .eq('auth_user_id', session.user.id)
            .eq('is_active', true)
            .single();

          if (staff) {
            navigate('/admin/hitl', { replace: true });
            return;
          }
        }
      } catch (err) {
        console.error('Session check error:', err);
      }

      setCheckingAuth(false);
    };

    handleAuth();

    return () => clearTimeout(timeout);
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!supabase) {
      setMessage('Database not configured');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      // Check if email is in staff_users
      const { data: staffCheck } = await supabase
        .from('staff_users')
        .select('id, is_active')
        .eq('email', email.toLowerCase())
        .single();

      if (!staffCheck) {
        setMessage('Email not found in staff directory.');
        setLoading(false);
        return;
      }

      if (!staffCheck.is_active) {
        setMessage('Account deactivated. Contact administrator.');
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
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
            className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send Magic Link'}
          </button>
        </form>
      </div>
    </div>
  );
}
