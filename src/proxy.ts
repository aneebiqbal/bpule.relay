import { NextResponse, type NextRequest } from "next/server";
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
 * Next.js 16 proxy: resolves the session for the active auth provider and
 * handles auth-based redirects. Replaces middleware.ts.
 *
 * The provider is authoritative, so a transient verification failure is
 * inconclusive and never redirects an authenticated user to /login.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isDemoMode()) {
    return NextResponse.next({ request });
  }

  const response = NextResponse.next({ request });

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
