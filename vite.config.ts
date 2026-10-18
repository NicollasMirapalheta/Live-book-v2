import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * pdf.js decodes scanned images (JBIG2, JPEG 2000) and ICC colours with wasm modules it fetches from one
 * folder (`wasmUrl`): served at /pdfjs-wasm/ in dev and copied there in the build, straight from the
 * installed pdfjs-dist (they always match its version).
 */
function pdfjsWasm(): Plugin {
  const dir = join('node_modules', 'pdfjs-dist', 'wasm')
  const files = ['jbig2.wasm', 'openjpeg.wasm', 'qcms_bg.wasm', 'jbig2_nowasm_fallback.js', 'openjpeg_nowasm_fallback.js']
  const type = (f: string) => (f.endsWith('.wasm') ? 'application/wasm' : 'text/javascript')
  return {
    name: 'pdfjs-wasm',
    configureServer(server) {
      server.middlewares.use('/pdfjs-wasm/', (req, res, next) => {
        const f = (req.url ?? '').replace(/^\//, '').split('?')[0]
        if (!files.includes(f)) return next()
        res.setHeader('content-type', type(f))
        res.end(readFileSync(join(dir, f)))
      })
    },
    generateBundle() {
      for (const f of files) this.emitFile({ type: 'asset', fileName: `pdfjs-wasm/${f}`, source: readFileSync(join(dir, f)) })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), pdfjsWasm()],
})
