const encoder = new TextEncoder()

export type StreamEmitter = (event: object) => void

/**
 * Builds an SSE response. The handler runs async on the server and emits
 * typed JSON events to the client; network flakiness surfaces as an error
 * event rather than a blank screen.
 */
export function sseStream(
  handler: (emit: StreamEmitter) => Promise<void>,
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
      try {
        await handler(emit)
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Something went wrong. Try again.'
        emit({ type: 'error', message })
      } finally {
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