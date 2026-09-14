import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isDemoMode } from "@/lib/ai/config";

const PROTECTED_PREFIXES = [
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

const AUTH_ROUTES = ["/login", "/signup", "/forgot-password", "/reset-password"];

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

  const supabase = createServerClient(url, anonKey, {
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
  try {
    const { data } = await supabase.auth.getUser();
    isAuthenticated = Boolean(data.user);
  } catch {
    // Session refresh failed — let the request through.
  }

  // Authenticated users on auth routes → redirect to dashboard
  if (isAuthenticated && AUTH_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
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
