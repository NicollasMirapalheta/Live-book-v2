import {
  DoubleSide,
  ImageBitmapLoader,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  SRGBColorSpace,
  ShaderChunk,
  Texture,
  type Material,
  type Mesh,
  type Object3D,
  type WebGLProgramParametersWithUniforms,
} from 'three'
import { FLOOR_REFLECTION_PARS, FLOOR_REFLECTION_SAMPLE, floorReflection } from './floorReflectionShader'

export interface AtlasInfo {
  file: string
  encoding: 'rgbm'
  range: number
  size: number
  mode: 'lightmap' | 'combined'
}

export interface LightmapManifest {
  version: number
  intensity: number
  atlases: Record<string, AtlasInfo>
  objects: Record<string, { atlas: string; mode: 'lightmap' | 'combined' }>
}

export async function loadManifest(): Promise<LightmapManifest | null> {
  try {
    const r = await fetch('/lightmaps/manifest.json')
    if (!r.ok) return null
    return (await r.json()) as LightmapManifest
  } catch {
    return null
  }
}

/**
 * RGBM keeps the multiplier in alpha, so the image must not be premultiplied or color-converted
 * on decode (HTMLImageElement would premultiply and destroy dark texels): ImageBitmap with 'none'.
 */
export async function loadAtlasTexture(info: AtlasInfo): Promise<Texture> {
  const loader = new ImageBitmapLoader()
  loader.setOptions({ premultiplyAlpha: 'none', colorSpaceConversion: 'none', imageOrientation: 'from-image' })
  const bitmap = await loader.loadAsync(`/lightmaps/${info.file}`)
  const tex = new Texture(bitmap as unknown as HTMLImageElement)
  tex.flipY = false // glTF UV convention
  tex.colorSpace = NoColorSpace
  tex.premultiplyAlpha = false
  tex.channel = 1 // TEXCOORD_1 = UV2 `lightmap`
  tex.minFilter = LinearMipmapLinearFilter
  tex.magFilter = LinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}

const LIGHTMAP_RGBM_CHUNK = ShaderChunk.lights_fragment_maps
  .replace(
    'vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;',
    'vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapTexel.a * LB_RGBM_RANGE * lightMapIntensity;',
  )
  // specular occlusion: the env map knows nothing about the room's shadows, the lightmap does
  .replace(
    'radiance += iblRadiance;',
    'radiance += iblRadiance * clamp( smoothstep( 0.0, 1.6, dot( lightMapIrradiance, vec3( 0.2126, 0.7152, 0.0722 ) ) ), 0.15, 1.0 );\n\t// LB_RADIANCE_DONE',
  )
if (!LIGHTMAP_RGBM_CHUNK.includes('LB_RADIANCE_DONE')) throw new Error('lights_fragment_maps mudou: oclusão especular não aplicada')
if (LIGHTMAP_RGBM_CHUNK === ShaderChunk.lights_fragment_maps) {
  throw new Error('three.js mudou o chunk lights_fragment_maps: o patch RGBM não foi aplicado')
}

/** Cycles' diffuse pass stores E/π; three multiplies the lightmap by albedo/π → scale by π. */
const CYCLES_TO_THREE = Math.PI

/** Name of the nearest node (self or ancestor) listed in the manifest. */
export function bakedName(obj: Object3D, manifest: LightmapManifest): string | undefined {
  for (let o: Object3D | null = obj; o; o = o.parent) if (o.name in manifest.objects) return o.name
  return undefined
}

/**
 * Static PBR material lit by the baked lightmap:
 * - RGBM decode of the lightmap,
 * - the env map only as specular (no diffuse IBL: the lightmap already has it),
 * - no direct contribution from the real-time lights (they exist for the dynamic objects).
 */
export function staticLightmapMaterial(
  src: Material,
  lightMap: Texture,
  range: number,
  intensity: number,
  envMap: Texture | null,
  reflect = false,
) {
  const mat = (src as MeshStandardMaterial).isMeshStandardMaterial ? (src.clone() as MeshStandardMaterial) : new MeshStandardMaterial()
  mat.lightMap = lightMap
  mat.lightMapIntensity = intensity * CYCLES_TO_THREE
  // the floor and the rug are seen at grazing angles: sharpen with anisotropic filtering
  for (const t of [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap]) {
    if (t && t.anisotropy < 8) {
      t.anisotropy = 8
      t.needsUpdate = true
    }
  }
  if (debugMode === 'static') {
    // look-dev: white albedo, lightmap + specular only
    mat.map = null
    mat.vertexColors = false
    mat.color.set('#ffffff')
  }
  mat.envMap = envMap
  mat.envMapIntensity = 1
  mat.aoMap = null
  mat.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    let chunk = LIGHTMAP_RGBM_CHUNK
    if (reflect) {
      Object.assign(shader.uniforms, floorReflection)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 lbWorldPos;')
        .replace('#include <project_vertex>', '#include <project_vertex>\n\tlbWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;')
      chunk = chunk.replace('// LB_RADIANCE_DONE', FLOOR_REFLECTION_SAMPLE)
    }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n#define LB_RGBM_RANGE ${range.toFixed(4)}\n${reflect ? FLOOR_REFLECTION_PARS : ''}`)
      // includes are expanded only after onBeforeCompile: patch the chunk text itself
      .replace('#include <lights_fragment_maps>', `${chunk}\n\tiblIrradiance = vec3( 0.0 );`)
      .replace(
        '#include <lights_fragment_end>',
        '#include <lights_fragment_end>\n\treflectedLight.directDiffuse = vec3( 0.0 );\n\treflectedLight.directSpecular = vec3( 0.0 );',
      )
  }
  mat.customProgramCacheKey = () => `lb-static-${range}-${reflect}`
  return mat
}

/** Small or translucent pieces: the baked texture already holds light × color. */
export function combinedMaterial(src: Material, baked: Texture, range: number, intensity: number) {
  // thin pieces (curtains, fringe) are single sheets: draw both sides
  const mat = new MeshBasicMaterial({ map: baked, side: DoubleSide, transparent: src.transparent, alphaTest: (src as MeshStandardMaterial).alphaTest })
  mat.name = `${src.name}_baked`
  mat.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n#define LB_RGBM_RANGE ${range.toFixed(4)}\n#define LB_INTENSITY ${intensity.toFixed(4)}`)
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
\tvec4 lbTexel = texture2D( map, vMapUv );
\tdiffuseColor.rgb *= lbTexel.rgb * lbTexel.a * LB_RGBM_RANGE * LB_INTENSITY;
#endif`,
      )
  }
  mat.customProgramCacheKey = () => `lb-combined-${range}-${intensity}`
  return mat
}

const debugMode = new URLSearchParams(window.location.search).get('debug')
const debugLightmap = debugMode === 'lightmap'

/** After optimize merges meshes, the material name carries `<name>@<atlas>:<mode>`. */
function entryFromMaterial(mat: Material | undefined): { atlas: string; mode: 'lightmap' | 'combined' } | undefined {
  const m = mat?.name?.match(/@([\w-]+):(lightmap|combined)$/)
  return m ? { atlas: m[1], mode: m[2] as 'lightmap' | 'combined' } : undefined
}

/** Applies the manifest to a loaded room scene. Returns the meshes that were not baked. */
export function applyLightmaps(
  root: Object3D,
  manifest: LightmapManifest,
  atlases: Record<string, Texture>,
  envMap: Texture | null,
  reflectFloor = false,
): Mesh[] {
  const unbaked: Mesh[] = []
  const cache = new Map<string, Material>()
  root.traverse((obj) => {
    const mesh = obj as Mesh
    if (!mesh.isMesh) return
    const name = bakedName(mesh, manifest)
    const entry = name ? manifest.objects[name] : entryFromMaterial(mesh.material as Material)
    const atlas = entry ? manifest.atlases[entry.atlas] : undefined
    const tex = entry ? atlases[entry.atlas] : undefined
    if (!entry || !atlas || !tex || !mesh.geometry.getAttribute('uv1')) {
      unbaked.push(mesh)
      return
    }
    const convert = (m: Material) => {
      const key = `${m.uuid}-${entry.atlas}-${entry.mode}`
      let out = cache.get(key)
      if (!out) {
        out =
          debugLightmap
            ? combinedMaterial(m, tex, atlas.range, entry.mode === 'lightmap' ? manifest.intensity : manifest.intensity)
            : entry.mode === 'lightmap'
              ? staticLightmapMaterial(m, tex, atlas.range, manifest.intensity, envMap, reflectFloor && /^floor@/.test(m.name))
              : combinedMaterial(m, tex, atlas.range, manifest.intensity)
        cache.set(key, out)
      }
      return out
    }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material)
    mesh.receiveShadow = false
    mesh.matrixAutoUpdate = false
    mesh.updateMatrix()
  })
  return unbaked
}

export function srgb(tex: Texture) {
  tex.colorSpace = SRGBColorSpace
  return tex
}
