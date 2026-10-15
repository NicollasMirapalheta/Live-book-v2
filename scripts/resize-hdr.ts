// node --import tsx scripts/resize-hdr.ts <in.hdr> <out.hdr> <width> — box-downsample a Radiance HDR (RGBE).
import { readFileSync, writeFileSync } from 'node:fs'

const [src, dst, widthArg] = process.argv.slice(2)
const buf = readFileSync(src)
let p = 0
const line = () => {
  const s = p
  while (buf[p] !== 0x0a) p++
  return buf.toString('latin1', s, p++)
}
for (let l = line(); l !== ''; l = line()) {
  // header lines until the blank line
}
const [, hy, , wx] = line().split(' ')
const H = Number(hy)
const W = Number(wx)
const img = new Float32Array(W * H * 3)
for (let y = 0; y < H; y++) {
  const scan = new Uint8Array(W * 4)
  if (buf[p] === 2 && buf[p + 1] === 2) {
    p += 4
    for (let c = 0; c < 4; c++) {
      for (let x = 0; x < W; ) {
        let n = buf[p++]
        if (n > 128) {
          n -= 128
          const v = buf[p++]
          while (n--) scan[x++ * 4 + c] = v
        } else while (n--) scan[x++ * 4 + c] = buf[p++]
      }
    }
  } else {
    scan.set(buf.subarray(p, p + W * 4))
    p += W * 4
  }
  for (let x = 0; x < W; x++) {
    const e = scan[x * 4 + 3]
    const f = e ? Math.pow(2, e - 136) : 0
    for (let c = 0; c < 3; c++) img[(y * W + x) * 3 + c] = scan[x * 4 + c] * f
  }
}
const w = Number(widthArg)
const h = Math.round((H * w) / W)
const k = W / w
const out: number[] = []
const header = Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${h} +X ${w}\n`, 'latin1')
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const acc = [0, 0, 0]
    let n = 0
    for (let yy = Math.floor(y * k); yy < Math.floor((y + 1) * k); yy++)
      for (let xx = Math.floor(x * k); xx < Math.floor((x + 1) * k); xx++) {
        for (let c = 0; c < 3; c++) acc[c] += img[(yy * W + xx) * 3 + c]
        n++
      }
    const [r, g, b] = acc.map((v) => v / n)
    const m = Math.max(r, g, b)
    if (m < 1e-32) out.push(0, 0, 0, 0)
    else {
      const e = Math.ceil(Math.log2(m))
      const s = 256 / Math.pow(2, e)
      out.push(Math.min(255, Math.floor(r * s)), Math.min(255, Math.floor(g * s)), Math.min(255, Math.floor(b * s)), e + 128)
    }
  }
}
writeFileSync(dst, Buffer.concat([header, Buffer.from(out)]))
console.log(`[resize-hdr] ${W}×${H} → ${w}×${h}`)
