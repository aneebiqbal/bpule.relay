/**
 * Minimal HTTPS→HTTP proxy so the QA harness can run against a production
 * `next start` build. The app sets `Secure` auth cookies, so a plain-HTTP
 * origin cannot hold a session in a real browser.
 *
 *   node scripts/qa/https-proxy.mjs [httpsPort] [httpPort]
 */
import http from 'node:http'
import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'

const httpsPort = Number(process.argv[2] ?? 3000)
const httpPort = Number(process.argv[3] ?? 3001)
const certDir = process.env.RELAY_QA_CERT_DIR ?? '/private/var/folders/m_/fv6fjwk9751_3_tknv5ff7ww0000gn/T/opencode/relay-cert'

const options = {
  key: fs.readFileSync(path.join(certDir, 'key.pem')),
  cert: fs.readFileSync(path.join(certDir, 'cert.pem')),
}

https.createServer(options, (req, res) => {
  const upstream = http.request(
    { host: '127.0.0.1', port: httpPort, method: req.method, path: req.url, headers: req.headers },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers)
      up.pipe(res)
    },
  )
  upstream.on('error', (err) => {
    res.writeHead(502, { 'content-type': 'text/plain' })
    res.end(`upstream error: ${err.message}`)
  })
  req.pipe(upstream)
}).listen(httpsPort, () => {
  console.log(`https://localhost:${httpsPort} -> http://127.0.0.1:${httpPort}`)
})
