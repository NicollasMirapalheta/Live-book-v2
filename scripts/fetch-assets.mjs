#!/usr/bin/env node
// Downloads the CC0 assets listed in assets/manifest.json into assets/source/<key>/.
// Idempotent: files whose md5 already matches are skipped.
// Usage: node scripts/fetch-assets.mjs [--only key1,key2] [--res 2k] [--dry-run]
// Requires Node 22+ (global fetch). ambientCG zips need the `fflate` dev dependency.

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = join(ROOT, 'assets', 'manifest.json')
const OUT = join(ROOT, 'assets', 'source')
const USER_AGENT = 'LiveBook-asset-fetch/1.0 (personal prototype)'
const POLYHAVEN_API = process.env.POLYHAVEN_API ?? 'https://api.polyhaven.com'
const AMBIENTCG_API = process.env.AMBIENTCG_API ?? 'https://ambientcg.com/api/v2/full_json'

const args = process.argv.slice(2)
const argValue = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const onlyRaw = argValue('--only')
if (args.includes('--only') && (!onlyRaw || onlyRaw.startsWith('--'))) {
  console.error('--only precisa de uma lista: --only floor_wood,chandelier')
  process.exit(2)
}
const only = onlyRaw?.split(',').map((s) => s.trim()).filter(Boolean)
const resOverride = argValue('--res')
const dryRun = args.includes('--dry-run')

const md5 = (buf) => createHash('md5').update(buf).digest('hex')

async function fileMd5(path) {
  try {
    await stat(path)
    return md5(await readFile(path))
  } catch {
    return null
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// fetch with 3 retries (backoff 2s, 4s, 8s). 4xx other than 429 fail immediately.
async function fetchRetry(url) {
  let lastErr
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(2000 * 2 ** (attempt - 1))
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
      if (res.ok) return res
      lastErr = new Error(`HTTP ${res.status} em ${url}`)
      if (res.status >= 400 && res.status < 500 && res.status !== 429) break
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr
}

async function getJson(url) {
  return (await fetchRetry(url)).json()
}

async function download(url, dest, expectedMd5, { requireImage = false } = {}) {
  if (expectedMd5 && (await fileMd5(dest)) === expectedMd5) return 'skip'
  if (dryRun) return 'dry'
  const res = await fetchRetry(url)
  const type = res.headers.get('content-type') ?? ''
  if (requireImage && !type.startsWith('image/')) throw new Error(`esperava imagem, recebeu "${type}" em ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (expectedMd5 && md5(buf) !== expectedMd5) throw new Error(`md5 diferente em ${url}`)
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, buf)
  return 'ok'
}

// Pick the requested resolution, falling back to the closest lower one, then any.
function pickRes(byRes, wanted) {
  const order = ['8k', '4k', '2k', '1k']
  if (byRes[wanted]) return wanted
  const start = order.indexOf(wanted)
  for (const r of order.slice(start >= 0 ? start : 0)) if (byRes[r]) return r
  return Object.keys(byRes)[0]
}

async function fetchPolyHaven(item, res) {
  const files = await getJson(`${POLYHAVEN_API}/files/${item.id}`)
  const dir = join(OUT, item.key)
  const jobs = []

  if (item.type === 'texture') {
    for (const map of item.maps) {
      const byRes = files[map]
      if (!byRes) throw new Error(`mapa "${map}" não existe em ${item.id} (disponíveis: ${Object.keys(files).join(', ')})`)
      const r = pickRes(byRes, res)
      // Prefer the requested format, then png, jpg, and only then exr (can be huge).
      const fmt = [item.format ?? 'jpg', 'png', 'jpg', 'exr'].find((x) => byRes[r][x])
      if (!fmt) throw new Error(`mapa "${map}" ${r} sem formato utilizável em ${item.id}`)
      const f = byRes[r][fmt]
      const ext = f.url.split('.').pop()
      jobs.push([f.url, join(dir, `${item.id}_${map}_${r}.${ext}`), f.md5])
    }
  } else if (item.type === 'model') {
    const byRes = files.gltf
    if (!byRes) throw new Error(`${item.id} não tem glTF`)
    const r = pickRes(byRes, res)
    const g = byRes[r].gltf
    jobs.push([g.url, join(dir, g.url.split('/').pop()), g.md5])
    for (const [rel, inc] of Object.entries(g.include ?? {})) jobs.push([inc.url, join(dir, rel), inc.md5])
  } else if (item.type === 'hdri') {
    const byRes = files.hdri
    const r = pickRes(byRes, res)
    const fmt = [item.format ?? 'hdr', 'hdr', 'exr'].find((x) => byRes[r][x])
    const f = byRes[r][fmt]
    jobs.push([f.url, join(dir, `${item.id}_${r}.${fmt}`), f.md5])
  } else {
    throw new Error(`tipo desconhecido: ${item.type}`)
  }

  const results = []
  for (const [url, dest, hash] of jobs) results.push(await download(url, dest, hash))
  return { files: jobs.map(([, d]) => d), results }
}

async function fetchAmbientCG(item, res) {
  const attr = `${res.toUpperCase()}-${(item.format ?? 'jpg').toUpperCase()}`
  const data = await getJson(`${AMBIENTCG_API}?id=${encodeURIComponent(item.id)}&include=downloadData`)
  const asset = data.foundAssets?.[0]
  if (!asset) throw new Error(`ambientCG: ${item.id} não encontrado`)
  const downloads = asset.downloadFolders?.default?.downloadFiletypeCategories?.zip?.downloads ?? []
  const pick = downloads.find((d) => d.attribute === attr) ?? downloads.find((d) => d.attribute.endsWith('-JPG')) ?? downloads[0]
  if (!pick) throw new Error(`ambientCG: nenhum zip para ${item.id}`)
  const dir = join(OUT, item.key)
  const zipPath = join(dir, pick.fileName ?? `${item.id}_${attr}.zip`)
  const status = await download(pick.downloadLink ?? pick.fullDownloadPath, zipPath, null)
  if (status === 'ok') {
    const { unzipSync } = await import('fflate').catch(() => {
      throw new Error('instale a dependência: npm i -D fflate')
    })
    const entries = unzipSync(new Uint8Array(await readFile(zipPath)))
    for (const [name, content] of Object.entries(entries)) {
      if (name.endsWith('/')) continue
      await mkdir(dirname(join(dir, name)), { recursive: true })
      await writeFile(join(dir, name), content)
    }
  }
  return { files: [zipPath], results: [status] }
}

// Direct public-domain file (e.g. Met Museum Open Access images). No md5 available.
async function fetchDirect(item) {
  const dest = join(OUT, item.key, item.filename ?? item.url.split('/').pop())
  const exists = await fileMd5(dest)
  const status = exists ? 'skip' : await download(item.url, dest, null, { requireImage: true })
  return { files: [dest], results: [status] }
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'))
  const items = manifest.assets.filter((a) => !only || only.includes(a.key))
  const report = []
  let failedRequired = 0

  for (const item of items) {
    const res = resOverride ?? item.resolution ?? '2k'
    try {
      const out =
        item.source === 'polyhaven' ? await fetchPolyHaven(item, res)
        : item.source === 'ambientcg' ? await fetchAmbientCG(item, res)
        : item.source === 'direct' ? await fetchDirect(item)
        : (() => { throw new Error(`source desconhecido: ${item.source}`) })()
      const meta = { key: item.key, source: item.source, id: item.id, license: item.license ?? 'CC0-1.0', page: item.page, fetchedAt: new Date().toISOString(), resolution: res, files: out.files.map((f) => relative(ROOT, f)) }
      if (!dryRun) await writeFile(join(OUT, item.key, 'meta.json'), JSON.stringify(meta, null, 2))
      const summary = out.results.reduce((acc, r) => ({ ...acc, [r]: (acc[r] ?? 0) + 1 }), {})
      report.push({ key: item.key, status: 'ok', ...summary })
      console.log(`✓ ${item.key} (${item.source}:${item.id})`, summary)
    } catch (err) {
      if (item.required) failedRequired++
      report.push({ key: item.key, status: 'erro', required: !!item.required, error: String(err.message ?? err) })
      console.error(`✗ ${item.key} (${item.source}:${item.id}) — ${err.message ?? err}`)
    }
  }

  if (!dryRun) {
    await mkdir(OUT, { recursive: true })
    await writeFile(join(OUT, '_report.json'), JSON.stringify({ at: new Date().toISOString(), report }, null, 2))
  }
  console.log(`\n${report.filter((r) => r.status === 'ok').length}/${report.length} assets ok. Obrigatórios com falha: ${failedRequired}`)
  process.exit(failedRequired > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
