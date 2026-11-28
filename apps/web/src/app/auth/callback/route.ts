import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { authCallbackDestination } from '@/lib/auth-redirect';

// E-mail verification / password-reset links land here with a one-time code.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const safe = authCallbackDestination(url.searchParams.get('next'));
  if (code) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safe, url.origin));
  }
  return NextResponse.redirect(new URL('/sign-in?error=link', url.origin));
}
