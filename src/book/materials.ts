import {
  Color,
  DoubleSide,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  RepeatWrapping,
  Vector2,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from 'three'
import { GOLD, SPINE_COLORS } from './palette'
import type { CoverMaterial, SpineColor } from './types'

export interface CoverTextures {
  lum: Texture
  normal: Texture
  arm: Texture
}

/** Real-world size of one texture tile (m). */
const TILE: Record<CoverMaterial, number> = { leather: 0.16, cloth: 0.11 }

function prepare(t: Texture, tile: number) {
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(1 / tile, 1 / tile)
  t.colorSpace = NoColorSpace
  t.anisotropy = 8
  t.needsUpdate = true
  return t
}

/**
 * Cover: the luminance texture (linear mean 0.5) times twice the spine color keeps the grain of the
 * leather/cloth and lands on the palette color on average (never a flat color multiplied on top of a
 * colored photo). Edge wear lightens the color and roughens the surface.
 */
export function coverMaterial(
  kind: CoverMaterial,
  color: SpineColor,
  tex: CoverTextures,
  wear: Texture,
  wearScale: Vector2,
): MeshPhysicalMaterial {
  const tile = TILE[kind]
  const mat = new MeshPhysicalMaterial({
    color: new Color(SPINE_COLORS[color]).multiplyScalar(2),
    map: prepare(tex.lum.clone(), tile),
    normalMap: prepare(tex.normal.clone(), tile),
    roughnessMap: prepare(tex.arm.clone(), tile),
    roughness: 1,
    metalness: 0,
    side: DoubleSide,
  })
  if (kind === 'leather') {
    mat.clearcoat = 0.25
    mat.clearcoatRoughness = 0.45
    mat.normalScale.set(0.8, 0.8)
  } else {
    mat.sheen = 0.35
    mat.sheenRoughness = 0.7
    mat.sheenColor = new Color(SPINE_COLORS[color]).multiplyScalar(1.6)
    mat.normalScale.set(1.2, 1.2)
  }
  mat.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.wearMap = { value: wear }
    shader.uniforms.wearScale = { value: wearScale }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 lbUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n\tlbUv = uv;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D wearMap;\nuniform vec2 wearScale;\nvarying vec2 lbUv;\nfloat lbWear;')
      .replace(
        '#include <map_fragment>',
        '#include <map_fragment>\n\tlbWear = texture2D( wearMap, lbUv * wearScale ).r;\n\tdiffuseColor.rgb = mix( diffuseColor.rgb, mix( diffuseColor.rgb * 1.8, vec3( dot( diffuseColor.rgb, vec3( 0.33 ) ) * 1.6 ), 0.35 ), lbWear );',
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\n\troughnessFactor = mix( roughnessFactor, min( 1.0, roughnessFactor + 0.35 ), lbWear );',
      )
  }
  mat.customProgramCacheKey = () => `lb-cover-${kind}`
  return mat
}

/** Endpapers (inside of the boards). */
export function endpaperMaterial(paper: Texture) {
  return new MeshStandardMaterial({ color: new Color('#E9DDC3'), map: paper, roughness: 0.85, side: DoubleSide })
}

export function pageEdgeMaterial(edge: Texture) {
  return new MeshStandardMaterial({ map: edge, roughness: 0.9, side: DoubleSide })
}

export function pageSideMaterial(paper: Texture) {
  return new MeshStandardMaterial({ map: paper, roughness: 0.85, side: DoubleSide })
}

/** Gold tooling: metal where the mask is set, slightly debossed via the normal map from the mask. */
export function foilMaterial(mask: Texture, normal: Texture) {
  return new MeshStandardMaterial({
    color: new Color(GOLD).lerp(new Color('#B8A16A'), 0.3),
    metalness: 1,
    roughness: 0.34,
    alphaMap: mask,
    alphaTest: 0.5,
    normalMap: normal,
    normalScale: new Vector2(0.6, 0.6),
    polygonOffset: true,
    polygonOffsetFactor: -2,
  })
}

export function polaroidCardMaterial() {
  return new MeshStandardMaterial({ color: new Color('#EEE7D6'), roughness: 0.78, metalness: 0, side: DoubleSide })
}

export function polaroidPhotoMaterial(photo: Texture) {
  return new MeshPhysicalMaterial({ map: photo, roughness: 0.22, clearcoat: 0.6, clearcoatRoughness: 0.2, polygonOffset: true, polygonOffsetFactor: -1, side: DoubleSide })
}
