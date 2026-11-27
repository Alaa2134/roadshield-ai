import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Refreshes the Supabase session cookie on every request and performs an optimistic
// redirect for the authenticated app. Real authorization happens in Postgres (RLS + RPC checks).
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  // Public, sign-in and callback pages must never wait for an auth network call.
  // Protected /app routes still refresh/validate the session below.
  const pathname = request.nextUrl.pathname;
  if (pathname !== '/app' && !pathname.startsWith('/app/')) return response;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  if (!data.user && request.nextUrl.pathname.startsWith('/app')) {
    const to = request.nextUrl.clone();
    to.pathname = '/sign-in';
    to.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(to);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|og.png|robots.txt|sitemap.xml|.*\\.(?:png|jpg|svg|webp)$).*)'],
};
