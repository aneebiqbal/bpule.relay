const encoder = new TextEncoder()

export type StreamEmitter = (event: object) => void

const DEFAULT_STREAM_TIMEOUT_MS = 90_000

/**
 * Builds an SSE response. The handler runs async on the server and emits
 * typed JSON events to the client; network flakiness surfaces as an error
 * event rather than a blank screen.
 *
 * A hard timeout ensures the stream always terminates, even if the handler
 * hangs. Without this, a stuck provider call can leave the client spinning
 * forever with no error and no recovery path.
 */
export function sseStream(
  handler: (emit: StreamEmitter) => Promise<void>,
  timeoutMs: number = DEFAULT_STREAM_TIMEOUT_MS,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit: StreamEmitter = (event) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          // Client went away; stop writing.
        }
      }

      let timedOut = false
      let timeoutId: ReturnType<typeof setTimeout> | null = null

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          timedOut = true
          reject(new Error(`Operation timed out after ${Math.round(timeoutMs / 1000)}s`))
        }, timeoutMs)
      })

      try {
        await Promise.race([
          handler(emit).then(() => {
            if (timeoutId) clearTimeout(timeoutId)
            return undefined
          }),
          timeoutPromise,
        ])

        if (timedOut) {
          emit({ type: 'error', message: `Operation timed out after ${Math.round(timeoutMs / 1000)}s. Please try again.` })
        }
      } catch (err) {
        if (!timedOut) {
          const message =
            err instanceof Error ? err.message : 'Something went wrong. Try again.'
          emit({ type: 'error', message })
        }
      } finally {
        if (timeoutId) clearTimeout(timeoutId)
        try {
          controller.close()
        } catch {
          // Already closed.
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}