import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // If no password is configured, skip auth entirely
  if (!process.env.DASHBOARD_PASSWORD) return NextResponse.next();

  const auth = request.cookies.get('uxgsol_auth');
  if (!auth?.value) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Protect everything except Next.js internals, API routes, and the login page
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api|login).*)'],
};
