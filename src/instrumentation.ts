/**
 * Server startup hook. Registers the runtime guards that keep an expected
 * database transport failure from taking the production server down.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { installUncaughtExceptionGuard } = await import(
    '@/lib/runtime/uncaught-exception'
  )
  installUncaughtExceptionGuard()
}
