import { NextResponse, NextRequest } from "next/server";
import { isDemoMode } from "@/lib/ai/config";
import { getAuthProvider } from "@/lib/auth/provider";

const PROTECTED_PREFIXES = [
  "/onboarding",
  "/leads",
  "/content",
  "/upwork",
  "/archive",
  "/team",
  "/profiles",
  "/profile-intelligence",
  "/facts",
  "/manage-profiles",
  "/account",
  "/accounts",
  "/accountability",
  "/content-v2",
  "/home",
  "/activate",
  "/dashboard",
  "/prospect",
  "/settings",
  "/admin",
  "/reports",
  "/tasks",
  "/chats",
  "/relay",
  "/notifications",
  "/performance",
  "/workspace",
  "/revenue",
  "/rep",
  "/studio",
  "/qa-v4",
];

/**
 * Neon Auth's session cookies are named with a `__Secure-` prefix, which a
 * browser will only store over HTTPS. On plain-HTTP local development the
 * `/api/auth` proxy strips the prefix so the cookie can be stored at all, but
 * the SDK then looks for the prefixed name and sees no session.
 *
 * Restoring the prefix on the incoming request lets the SDK read the session.
 * Production (HTTPS) is untouched: the prefix is present end to end.
 */
function restoreSecureCookiePrefix(request: NextRequest): NextRequest {
  if (request.nextUrl.protocol === 'https:') return request;
  if (process.env.NODE_ENV === 'production') return request;
  const cookies = request.headers.get('cookie');
  if (!cookies || cookies.includes('__Secure-')) return request;
  const rewritten = cookies.replace(/(^|;\s*)(neon-auth\.)/g, '$1__Secure-$2');
  if (rewritten === cookies) return request;
  const headers = new Headers(request.headers);
  headers.set('cookie', rewritten);
  return new NextRequest(request, { headers });
}

/**
 * Next.js 16 proxy: resolves the session for the active auth provider and
 * handles auth-based redirects. Replaces middleware.ts.
 *
 * The provider is authoritative, so a transient verification failure is
 * inconclusive and never redirects an authenticated user to /login.
 */
export async function proxy(originalRequest: NextRequest) {
  const request = restoreSecureCookiePrefix(originalRequest);
  const { pathname } = request.nextUrl;

  if (isDemoMode()) {
    return NextResponse.next({ request });
  }

  const response = NextResponse.next({ request });

  // The proxy's own session check reads the original (unprefixed) cookie via
  // next/headers, so on plain-HTTP dev it cannot see the session. The
  // downstream request carries the restored prefix, so defer to it instead of
  // redirecting an authenticated user to /login.
  if (process.env.NODE_ENV !== 'production' && request.nextUrl.protocol !== 'https:') {
    return response;
  }

  let isAuthenticated = false;
  let authCheckInconclusive = false;
  try {
    const auth = await getAuthProvider();
    const { user } = await auth.getSession();
    isAuthenticated = Boolean(user);
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
