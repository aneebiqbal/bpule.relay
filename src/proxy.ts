import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isDemoMode } from "@/lib/ai/config";

const PROTECTED_PREFIXES = [
  "/onboarding",
  "/leads",
  "/content",
  "/upwork",
  "/archive",
  "/team",
  "/profiles",
  "/facts",
  "/manage-profiles",
  "/account",
  "/activate",
  "/dashboard",
  "/prospect",
  "/settings",
  "/admin",
];

/**
 * Next.js 16 proxy: refreshes the Supabase session cookie and handles
 * auth-based redirects. Replaces middleware.ts.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isDemoMode()) {
    return NextResponse.next({ request });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.next({ request });
  }

  const response = NextResponse.next({ request });
  const isHttps = request.nextUrl.protocol === 'https:';

  const supabase = createServerClient(url, anonKey, {
    cookieOptions: {
      path: '/',
      sameSite: 'lax',
      secure: isHttps,
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookieList) {
        for (const { name, value, options } of cookieList) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  let isAuthenticated = false;
  let authCheckInconclusive = false;
  try {
    // Proxy is the route-gatekeeper. Use the authoritative Auth service check
    // so we do not treat transient local-claims verification issues as logout
    // and redirect authenticated users to /login.
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      authCheckInconclusive = true;
    } else {
      isAuthenticated = Boolean(data.user);
    }
  } catch {
    authCheckInconclusive = true;
  }

  if (authCheckInconclusive) {
    return response;
  }

  // Unauthenticated users on protected routes → redirect to login
  if (
    !isAuthenticated &&
    PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    const redirect = new URL("/login", request.url);
    redirect.searchParams.set("next", pathname);
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon\\.svg|favicon|api/).*)"],
};
