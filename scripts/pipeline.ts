// npm run pipeline -- --quality draft|final [--from build|bake|denoise|export|optimize]
// textures → blender:build → blender:bake → blender:denoise → blender:export → optimize
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const arg = (n: string) => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const quality = arg('quality') ?? 'draft'
if (quality !== 'draft' && quality !== 'final') {
  console.error('--quality draft|final')
  process.exit(2)
}
const STEPS: [string, string[]][] = [
  ['textures', ['run', 'textures']],
  ['build', ['run', 'blender:build']],
  ['bake', ['run', 'blender:bake', '--', '--quality', quality]],
  ['denoise', ['run', 'blender:denoise']],
  ['export', ['run', 'blender:export']],
  ['optimize', ['run', 'optimize']],
]
const from = arg('from') ?? (existsSync(join(ROOT, 'blender', 'out', 'textures', 'textures.json')) ? 'build' : 'textures')
const start = STEPS.findIndex(([n]) => n === from)
if (start < 0) {
  console.error(`--from ${STEPS.map(([n]) => n).join('|')}`)
  process.exit(2)
}
const t0 = Date.now()
for (const [name, args] of STEPS.slice(start)) {
  const t = Date.now()
  console.log(`\n[pipeline] ${name}…`)
  const r = spawnSync('npm', args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.status !== 0) {
    console.error(`[pipeline] ${name} falhou (código ${r.status})`)
    process.exit(r.status ?? 1)
  }
  console.log(`[pipeline] ${name} ok em ${((Date.now() - t) / 1000).toFixed(0)}s`)
}
console.log(`\n[pipeline] ${quality} completo em ${((Date.now() - t0) / 60000).toFixed(1)} min`)
