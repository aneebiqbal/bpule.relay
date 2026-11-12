import { getNeonAuthInstance } from '@/lib/auth/neon-server'

/**
 * Neon Auth API proxy.
 *
 * The Neon Auth browser client calls its own endpoints (`sign-in/email`,
 * `sign-up/email`, `get-session`, `sign-out`, …). This catch-all forwards them
 * to Neon Auth with the caller's cookies, so the session is established on the
 * app's origin rather than a cross-origin request.
 *
 * Supabase needs no equivalent: its browser client talks to Supabase directly.
 */

type RouteContext = { params: Promise<{ path: string[] }> }

/**
 * Neon Auth's SDK always marks its session cookies `Secure`, and their names
 * carry the `__Secure-` prefix — which browsers refuse to store without that
 * attribute. Production is always HTTPS, so nothing is stripped there.
 *
 * On an insecure origin (plain-HTTP local dev) the cookies are unusable either
 * way; stripping `Secure` at least lets the rest of the flow be inspected. On
 * HTTPS the attribute must be preserved or the browser silently drops the
 * session.
 */
export function forwardResponse(response: Response, secureContext: boolean): Response {
  if (secureContext || process.env.NODE_ENV === 'production') return response

  const cookies = response.headers.getSetCookie()
  if (cookies.length === 0 || !cookies.some((c) => /;\s*Secure/i.test(c))) return response

  const headers = new Headers(response.headers)
  headers.delete('set-cookie')
  for (const cookie of cookies) {
    // A `__Secure-` prefixed name is refused by browsers unless the Secure
    // attribute is present, so both must be stripped together on plain HTTP.
    headers.append('set-cookie', cookie
      .replace(/;\s*Secure/i, '')
      .replace(/(^|\s)__Secure-/i, '$1'))
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

/**
 * On plain HTTP the browser cannot store a `__Secure-` prefixed cookie, so the
 * outbound filter below strips the prefix. The SDK still looks for the prefixed
 * name, so inbound requests must restore it or every call appears signed out.
 */
function restoreSecureCookiePrefix(request: Request): Request {
  const cookies = request.headers.get('cookie')
  if (!cookies || cookies.includes('__Secure-')) return request
  const rewritten = cookies.replace(/(^|;\s*)(neon-auth\.)/g, '$1__Secure-$2')
  if (rewritten === cookies) return request
  const headers = new Headers(request.headers)
  headers.set('cookie', rewritten)
  return new Request(request.url, {
    method: request.method,
    headers,
    body: request.body,
    // Node's undici requires duplex when a streaming body is supplied.
    duplex: 'half',
  } as RequestInit)
}

async function handler(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const auth = await getNeonAuthInstance()
  const secureContext = (request as Request & { nextUrl?: URL }).nextUrl?.protocol === 'https:'
  const devRequest =
    !secureContext && process.env.NODE_ENV !== 'production'
      ? restoreSecureCookiePrefix(request)
      : request
  return forwardResponse(await auth.handler()[method](devRequest, context), secureContext)
}

export function GET(request: Request, context: RouteContext) {
  return handler('GET', request, context)
}

export function POST(request: Request, context: RouteContext) {
  return handler('POST', request, context)
}

export function PUT(request: Request, context: RouteContext) {
  return handler('PUT', request, context)
}

export function PATCH(request: Request, context: RouteContext) {
  return handler('PATCH', request, context)
}

export function DELETE(request: Request, context: RouteContext) {
  return handler('DELETE', request, context)
}
