import { toNextJsHandler } from 'better-auth/next-js'
import { getBetterAuthInstance } from '@/lib/auth/better-auth'
import { resolveAuthProvider } from '@/lib/auth/contract'

/**
 * Auth API.
 *
 * `RELAY_AUTH_PROVIDER=aiven` serves Better Auth locally against Aiven (the
 * default after the Neon cutover); any other value keeps proxying to Neon Auth,
 * which is the instant rollback.
 *
 * On plain-HTTP local development a `__Secure-` prefixed cookie cannot be
 * stored, so the prefix and the Secure attribute are stripped outbound and
 * restored inbound — exactly as the previous Neon proxy did. HTTPS production
 * is untouched.
 */

type RouteContext = { params: Promise<{ path: string[] }> }

let betterAuthHandler: ReturnType<typeof toNextJsHandler> | null = null

function getHandler() {
  if (!betterAuthHandler) betterAuthHandler = toNextJsHandler(getBetterAuthInstance())
  return betterAuthHandler
}

/** Outbound: make a `__Secure-` cookie storable on plain HTTP. */
function forwardResponse(response: Response, secureContext: boolean): Response {
  if (secureContext || process.env.NODE_ENV === 'production') return response
  const cookies = response.headers.getSetCookie()
  if (cookies.length === 0 || !cookies.some((c) => /;\s*Secure/i.test(c))) return response
  const headers = new Headers(response.headers)
  headers.delete('set-cookie')
  for (const cookie of cookies) {
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

/** Inbound: restore the prefix the SDK looks for. */
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
    duplex: 'half',
  } as RequestInit)
}

async function aivenHandler(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  request: Request,
): Promise<Response> {
  const secureContext = (request as Request & { nextUrl?: URL }).nextUrl?.protocol === 'https:'
  const devRequest =
    !secureContext && process.env.NODE_ENV !== 'production'
      ? restoreSecureCookiePrefix(request)
      : request
  const handler = getHandler()
  const response = await handler[method](devRequest)
  return forwardResponse(response, secureContext)
}

async function neonHandler(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { getNeonAuthInstance } = await import('@/lib/auth/neon-server')
  const auth = await getNeonAuthInstance()
  const secureContext = (request as Request & { nextUrl?: URL }).nextUrl?.protocol === 'https:'
  return forwardResponse(await auth.handler()[method](request, context), secureContext)
}

async function handle(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  request: Request,
  context: RouteContext,
): Promise<Response> {
  if (resolveAuthProvider() === 'aiven') return aivenHandler(method, request)
  return neonHandler(method, request, context)
}

export function GET(request: Request, context: RouteContext) {
  return handle('GET', request, context)
}
export function POST(request: Request, context: RouteContext) {
  return handle('POST', request, context)
}
export function PUT(request: Request, context: RouteContext) {
  return handle('PUT', request, context)
}
export function PATCH(request: Request, context: RouteContext) {
  return handle('PATCH', request, context)
}
export function DELETE(request: Request, context: RouteContext) {
  return handle('DELETE', request, context)
}

// Kept for reference: the proxy must be dynamic so the provider env is read per
// request rather than frozen at build time.
export const dynamic = 'force-dynamic'
