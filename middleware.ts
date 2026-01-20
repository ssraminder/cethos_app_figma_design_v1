// middleware.ts
// Place this in the root of your Next.js app
// Protects all /admin/* routes except /admin/login

import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const pathname = req.nextUrl.pathname;

  // Only protect /admin routes
  if (!pathname.startsWith('/admin')) {
    return res;
  }

  // Allow access to login page and auth callback
  if (pathname === '/admin/login' || pathname === '/admin/auth/callback') {
    return res;
  }

  try {
    const supabase = createMiddlewareClient({ req, res });
    const { data: { session } } = await supabase.auth.getSession();

    // No session, redirect to login
    if (!session) {
      const loginUrl = new URL('/admin/login', req.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Verify user is staff by checking staff_users table
    // Using service role would be better but middleware can't use it safely
    // Instead, we check via an Edge Function
    const staffCheckUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/staff-auth`;
    
    const staffCheck = await fetch(staffCheckUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!staffCheck.ok) {
      console.error('Staff auth check failed:', staffCheck.status);
      return NextResponse.redirect(new URL('/admin/login?error=auth_failed', req.url));
    }

    const staffData = await staffCheck.json();

    if (!staffData.isStaff) {
      // Not staff, redirect to login with error
      return NextResponse.redirect(new URL('/admin/login?error=not_authorized', req.url));
    }

    // Add staff info to headers for use in pages
    res.headers.set('x-staff-id', staffData.staff.id);
    res.headers.set('x-staff-role', staffData.staff.role);

    return res;
  } catch (error) {
    console.error('Middleware error:', error);
    return NextResponse.redirect(new URL('/admin/login?error=server_error', req.url));
  }
}

export const config = {
  matcher: [
    '/admin/:path*',
  ],
};
