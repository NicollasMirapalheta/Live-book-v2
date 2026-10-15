import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, ShaderMaterial, Vector2, Vector3 } from 'three'
import { params } from '../app/params'
import { room, sunTravelDirection } from '../config/room'
import { useQuality } from '../state/quality'

/**
 * Sun beams through the back windows: a skewed prism per window, from the window opening along the sun's
 * travel direction down to the floor. Points are parametrized (u across, v up the window, w along the beam),
 * so the dust can live in the same space and never leaves the beams.
 */

const SHOT_TIME = 12.0

interface Beam {
  /** world position of window point (u, v) */
  origin: (u: number, v: number) => Vector3
  /** distance along the travel direction from (u, v) to the floor */
  length: (v: number) => number
}

function beams(): Beam[] {
  const d = sunTravelDirection()
  const zWin = room.walls.back.z - room.room.wallThickness / 2
  return room.windows.map((w) => {
    const x0 = w.centerX - w.width / 2 + 0.06
    const x1 = w.centerX + w.width / 2 - 0.06
    const y0 = w.sillY + 0.11
    const y1 = w.sillY + w.height - 0.06
    return {
      origin: (u, v) => new Vector3(x0 + (x1 - x0) * u, y0 + (y1 - y0) * v, zWin),
      length: (v) => (y0 + (y1 - y0) * v) / -d[1],
    }
  })
}

/** Point in a beam: window point + travel direction × w × length. */
function beamPoint(b: Beam, u: number, v: number, w: number, d: Vector3) {
  return b.origin(u, v).addScaledVector(d, w * b.length(v))
}

const beamVertex = /* glsl */ `
attribute vec3 aParam;
varying vec3 vParam;
varying vec3 vNormalV;
varying vec3 vViewDir;
varying vec3 vWorld;
void main() {
  vParam = aParam;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 mv = viewMatrix * world;
  vNormalV = normalize(normalMatrix * normal);
  vViewDir = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`

const beamFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uTime;
varying vec3 vParam;
varying vec3 vNormalV;
varying vec3 vViewDir;
varying vec3 vWorld;

float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}

void main() {
  // thicker where the sheet is seen edge-on: reads as a volume, never as a solid cone
  float grazing = clamp(1.0 - abs(dot(normalize(vNormalV), normalize(vViewDir))), 0.0, 1.0);
  float body = pow(grazing, 1.6);
  // soft borders across the beam, fade along it (strongest near the window, gone at the floor)
  float edge = smoothstep(0.0, 0.18, vParam.x) * (1.0 - smoothstep(0.82, 1.0, vParam.x)) * smoothstep(0.0, 0.12, vParam.y) * (1.0 - smoothstep(0.9, 1.0, vParam.y));
  float along = pow(clamp(1.0 - vParam.z, 0.0, 1.0), 1.3) * smoothstep(0.0, 0.08, vParam.z + 0.02);
  float n = 0.65 + 0.35 * noise(vWorld * 2.2 + vec3(0.0, uTime * 0.05, uTime * 0.03));
  float a = uIntensity * body * edge * along * n;
  gl_FragColor = vec4(uColor * max(a, 0.0), 1.0);
}
`

const dustVertex = /* glsl */ `
attribute vec3 aSeed;
attribute float aBeam;
uniform float uTime;
uniform float uPixel;
uniform vec3 uO0[2]; uniform vec3 uO1[2]; uniform vec3 uO2[2]; uniform vec3 uO3[2];
uniform vec2 uLen[2];
uniform vec3 uDir;
varying float vFade;
void main() {
  int b = int(aBeam);
  // slow brownian-like drift inside the beam's (u, v, w) box
  vec3 p = fract(aSeed + vec3(sin(uTime * 0.07 + aSeed.y * 40.0), sin(uTime * 0.05 + aSeed.z * 31.0), sin(uTime * 0.04 + aSeed.x * 23.0)) * 0.02 + vec3(0.0, -uTime * 0.004, uTime * 0.002));
  vec3 o0 = b == 0 ? uO0[0] : uO0[1];
  vec3 o1 = b == 0 ? uO1[0] : uO1[1];
  vec3 o2 = b == 0 ? uO2[0] : uO2[1];
  vec3 o3 = b == 0 ? uO3[0] : uO3[1];
  vec2 len = b == 0 ? uLen[0] : uLen[1];
  vec3 win = mix(mix(o0, o1, p.x), mix(o2, o3, p.x), p.y);
  vec3 world = win + uDir * p.z * mix(len.x, len.y, p.y);
  vFade = pow(clamp(1.0 - p.z, 0.0, 1.0), 1.2) * smoothstep(0.0, 0.15, p.x) * (1.0 - smoothstep(0.85, 1.0, p.x)) * (0.5 + 0.5 * sin(uTime * 0.8 + aSeed.x * 60.0));
  vec4 mv = viewMatrix * vec4(world, 1.0);
  gl_PointSize = uPixel * (0.6 + aSeed.z) / -mv.z;
  gl_Position = projectionMatrix * mv;
}
`

const dustFragment = /* glsl */ `
uniform vec3 uColor;
varying float vFade;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = 1.0 - smoothstep(0.0, 0.5, length(c));
  gl_FragColor = vec4(uColor * r * vFade, 1.0);
}
`

export function LightBeams() {
  const quality = useQuality((s) => s.quality)
  const high = quality === 'high'
  const sunColor = useMemo(() => new Color(room.lighting.sun.colorHex), [])
  const dir = useMemo(() => new Vector3(...sunTravelDirection()), [])
  const list = useMemo(() => beams(), [])

  const beamGeo = useMemo(() => {
    // the four long sides of each prism (window and floor faces are left open)
    const pos: number[] = []
    const prm: number[] = []
    const seg = 12
    const sides: [number, number, number, number][] = [
      [0, 0, 1, 0], // bottom edge u 0→1, v = 0
      [1, 0, 1, 1], // right side
      [1, 1, 0, 1], // top
      [0, 1, 0, 0], // left
    ]
    for (const b of list) {
      for (const [ua, va, ub, vb] of sides) {
        for (let i = 0; i < seg; i++) {
          const w0 = i / seg
          const w1 = (i + 1) / seg
          const quad = [
            [ua, va, w0],
            [ub, vb, w0],
            [ub, vb, w1],
            [ua, va, w1],
          ]
          for (const k of [0, 1, 2, 0, 2, 3]) {
            const [u, v, w] = quad[k]
            const p = beamPoint(b, u, v, w, dir)
            pos.push(p.x, p.y, p.z)
            prm.push(u, v, w)
          }
        }
      }
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    g.setAttribute('aParam', new BufferAttribute(new Float32Array(prm), 3))
    g.computeVertexNormals()
    return g
  }, [list, dir])

  const beamMat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: beamVertex,
        fragmentShader: beamFragment,
        uniforms: { uColor: { value: sunColor }, uIntensity: { value: 1.3 }, uTime: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        toneMapped: false,
      }),
    [sunColor],
  )

  const count = high ? 480 : 130
  const dust = useMemo(() => {
    const seeds = new Float32Array(count * 3)
    const beamIdx = new Float32Array(count)
    let s = 1234567
    const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
    for (let i = 0; i < count; i++) {
      seeds[i * 3] = rand()
      seeds[i * 3 + 1] = rand()
      seeds[i * 3 + 2] = Math.pow(rand(), 1.4)
      beamIdx[i] = i % list.length
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3))
    g.setAttribute('aSeed', new BufferAttribute(seeds, 3))
    g.setAttribute('aBeam', new BufferAttribute(beamIdx, 1))
    const corner = (b: Beam, u: number, v: number) => b.origin(u, v)
    const mat = new ShaderMaterial({
      vertexShader: dustVertex,
      fragmentShader: dustFragment,
      uniforms: {
        uTime: { value: 0 },
        uPixel: { value: 9 },
        uColor: { value: sunColor.clone().multiplyScalar(1.1) },
        uDir: { value: dir },
        uO0: { value: list.map((b) => corner(b, 0, 0)) },
        uO1: { value: list.map((b) => corner(b, 1, 0)) },
        uO2: { value: list.map((b) => corner(b, 0, 1)) },
        uO3: { value: list.map((b) => corner(b, 1, 1)) },
        uLen: { value: list.map((b) => new Vector2(b.length(0), b.length(1))) },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    })
    return { g, mat }
  }, [count, list, dir, sunColor])

  useFrame(({ clock, size, viewport }) => {
    const t = params.shot ? SHOT_TIME : clock.elapsedTime
    beamMat.uniforms.uTime.value = t
    dust.mat.uniforms.uTime.value = t
    dust.mat.uniforms.uPixel.value = 0.008 * size.height * viewport.dpr
  })

  return (
    <group name="light_beams">
      <mesh geometry={beamGeo} material={beamMat} frustumCulled={false} renderOrder={3} />
      <points geometry={dust.g} material={dust.mat} frustumCulled={false} renderOrder={4} />
    </group>
  )
}
