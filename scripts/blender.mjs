#!/usr/bin/env node
// Portable Blender wrapper. Usage: node scripts/blender.mjs <step> [-- args...]
// Reads BLENDER_BIN from the environment (loaded from .env.local by npm scripts), falls back to `blender`.
// Never builds a command line string: spawn with an argument array (Windows paths have spaces).
// Never uses --factory-startup (it discards the saved GPU preferences).

import { spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BLENDER_DIR = join(ROOT, 'blender')
const LOGS = join(ROOT, 'logs')

// step -> python scripts run in order (each in its own Blender process)
const STEPS = {
  check: ['check.py'],
  assets: ['render_assets.py'],
  build: ['build_room.py', 'build_bookcase.py', 'build_props.py', 'sim_curtains.py'],
  preview: ['preview.py'],
  bake: ['bake.py'],
  denoise: ['denoise.py'],
  export: ['export.py'],
}

const [step, ...rest] = process.argv.slice(2)
if (!step || !(step in STEPS)) {
  console.error(`Uso: node scripts/blender.mjs <${Object.keys(STEPS).join('|')}> [-- args]`)
  process.exit(2)
}
const extra = rest[0] === '--' ? rest.slice(1) : rest
const bin = process.env.BLENDER_BIN?.trim() || 'blender'

if (bin !== 'blender' && !existsSync(bin)) {
  console.error(`Blender não encontrado em BLENDER_BIN="${bin}".`)
  console.error('Instale o Blender 5.2 LTS e ajuste BLENDER_BIN no .env.local (ver docs/noite/preparo.md).')
  process.exit(3)
}

mkdirSync(LOGS, { recursive: true })

function runScript(script) {
  return new Promise((resolvePromise) => {
    const scriptPath = join(BLENDER_DIR, script)
    if (!existsSync(scriptPath)) {
      console.error(`Script ausente: ${scriptPath}`)
      resolvePromise(4)
      return
    }
    const log = createWriteStream(join(LOGS, `blender-${step}-${script.replace(/\.py$/, '')}.log`))
    const args = ['-b', '--python-exit-code', '1', '-P', scriptPath, '--', '--root', ROOT, ...extra]
    console.log(`[blender] ${script} ${extra.join(' ')}`)
    const child = spawn(bin, args, { shell: false, cwd: ROOT })
    const forward = (stream, out) =>
      stream.on('data', (chunk) => {
        log.write(chunk)
        // Only forward our own log lines and errors, not Blender's per-sample spam.
        for (const line of chunk.toString().split(/\r?\n/)) {
          if (/^\[lb\]|Error|Traceback|error:/i.test(line)) out.write(line + '\n')
        }
      })
    forward(child.stdout, process.stdout)
    forward(child.stderr, process.stderr)
    child.on('error', (err) => {
      console.error(`Falha ao iniciar o Blender (${bin}): ${err.message}`)
      console.error('Instale o Blender 5.2 LTS e ajuste BLENDER_BIN no .env.local.')
      log.end()
      resolvePromise(3)
    })
    child.on('close', (code) => {
      log.end()
      resolvePromise(code ?? 1)
    })
  })
}

for (const script of STEPS[step]) {
  const code = await runScript(script)
  if (code !== 0) {
    console.error(`[blender] ${script} saiu com código ${code} (log em logs/)`)
    process.exit(code)
  }
}
