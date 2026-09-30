/**
 * pdf-parse v2 bundles pdfjs, which touches browser globals (DOMMatrix,
 * Path2D, ImageData) at module-evaluation time. Node has none of them, so a
 * static `import 'pdf-parse'` crashes the whole server route with
 * "ReferenceError: DOMMatrix is not defined" — even for requests that never
 * touch a PDF.
 *
 * `pdf-parse/worker` polyfills those globals from @napi-rs/canvas and exposes
 * the pdfjs worker, so it MUST be loaded first. Everything is loaded lazily,
 * on the first PDF only.
 */

type PdfParseModule = typeof import('pdf-parse')
type WorkerModule = typeof import('pdf-parse/worker')

let loading: Promise<{ PDFParse: PdfParseModule['PDFParse']; CanvasFactory: WorkerModule['CanvasFactory'] }> | null = null

export function loadPdfParse() {
  loading ??= (async () => {
    const worker = await import('pdf-parse/worker')
    const { PDFParse } = await import('pdf-parse')
    PDFParse.setWorker(worker.getData())
    return { PDFParse, CanvasFactory: worker.CanvasFactory }
  })().catch((err) => {
    loading = null // allow a retry on the next request
    throw err
  })
  return loading
}
