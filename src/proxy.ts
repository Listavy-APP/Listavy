import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/** Routes that need a signed-in user. Each page also checks, as a second layer. */
// Browsing (/buscar, /pro/[id]) is public. Applying and account pages need sign-in.
const PROTECTED_PREFIXES = ["/cuenta", "/pro/registro", "/pro/estado", "/pro/solicitudes", "/pedir", "/trabajos"];

/**
 * Refreshes the Supabase session cookie and redirects anonymous visitors
 * away from protected routes. This is an optimistic check. RLS remains the
 * real access control.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const isProtected = PROTECTED_PREFIXES.some((p) => request.nextUrl.pathname.startsWith(p));

  if (isProtected && !data.user) {
    // Keep the full destination (path and query, e.g. /pedir?pro=<ids>) so sign-in returns there.
    const next = request.nextUrl.pathname + request.nextUrl.search;
    const redirect = NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, request.url));
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    // Skip static files, the PWA manifest, and the service worker.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icon.svg|icon-192.png|icon-512.png|icon-maskable-512.png|apple-touch-icon.png).*)",
  ],
};
