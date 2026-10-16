import {
  Color,
  MeshBasicMaterial,
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
  weaveNormal?: Texture,
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
    // a thin coat: a stronger one mirrored the sky at grazing angles (cyan pixels along the tooling)
    mat.clearcoat = 0.1
    mat.clearcoatRoughness = 0.45
    mat.normalScale.set(0.8, 0.8)
  } else {
    mat.sheen = 0.35
    mat.sheenRoughness = 0.7
    mat.sheenColor = new Color(SPINE_COLORS[color]).multiplyScalar(1.6)
    mat.normalScale.set(1.2, 1.2)
    if (weaveNormal) {
      // real bookcloth weave (procedural) instead of the curtain linen's coarse normal
      mat.normalMap = prepare(weaveNormal, tile)
      mat.normalMap.anisotropy = 16
      mat.normalScale.set(0.6, 0.6)
    }
  }
  const open: CoverOpenUniforms = { uOpenAngle: { value: 0 }, uOpenPivot: { value: new Vector2() }, uSpineShift: { value: 0 } }
  mat.userData.open = open
  mat.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.wearMap = { value: wear }
    shader.uniforms.wearScale = { value: wearScale }
    Object.assign(shader.uniforms, open)
    // Fase 4: the front board (aPanel = 2) turns around the hinge, a vertical axis through uOpenPivot (x, z)
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 lbUv;
attribute float aPanel;
uniform float uOpenAngle;
uniform vec2 uOpenPivot;
uniform float uSpineShift;
vec2 lbRotY( vec2 xz, float a ) { float c = cos( a ), s = sin( a ); return vec2( xz.x * c + xz.y * s, -xz.x * s + xz.y * c ); }`,
      )
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n\tlbUv = uv;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n\tif ( aPanel > 1.5 ) objectNormal.xz = lbRotY( objectNormal.xz, uOpenAngle );')
      .replace(
        '#include <begin_vertex>',
        // …and the spine (aPanel = 1) sinks behind the gutter, as the spine of an open book does
        '#include <begin_vertex>\n\tif ( aPanel > 1.5 ) transformed.xz = uOpenPivot + lbRotY( transformed.xz - uOpenPivot, uOpenAngle );\n\telse if ( aPanel > 0.5 ) transformed.x -= uSpineShift;',
      )
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

export interface CoverOpenUniforms {
  uOpenAngle: { value: number }
  uOpenPivot: { value: Vector2 }
  uSpineShift: { value: number }
}

/**
 * Opens the front board of a cover material by `angle` (rad) around the vertical axis through (x, z), and
 * moves the spine back by `spineShift` (m) along −X.
 */
export function setCoverOpen(mat: MeshPhysicalMaterial, angle: number, pivotX: number, pivotZ: number, spineShift = 0) {
  const open = mat.userData.open as CoverOpenUniforms | undefined
  if (!open) return
  open.uOpenAngle.value = angle
  open.uOpenPivot.value.set(pivotX, pivotZ)
  open.uSpineShift.value = spineShift
}

/** Endpapers (inside of the boards): a darker laid paper than the text block, so the inside of the cover never reads as a page. */
export function endpaperMaterial(paper: Texture) {
  return new MeshStandardMaterial({ color: new Color('#CBB386'), map: paper, roughness: 0.85, envMapIntensity: 0.5, side: DoubleSide })
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
    // less red than #C9A35A: under the warm key light and AgX the pure palette value reads as copper
    color: new Color(GOLD).lerp(new Color('#B9A867'), 0.55),
    metalness: 1,
    // satin, not mirror: a sharp gold rule aliased into a row of sparkling dots
    roughness: 0.42,
    alphaMap: mask,
    alphaTest: 0.35,
    // smooth thin rules under MSAA instead of the shimmering of a hard alpha cut
    alphaToCoverage: true,
    normalMap: normal,
    normalScale: new Vector2(0.2, 0.2),
    polygonOffset: true,
    polygonOffsetFactor: -2,
  })
}

export function polaroidCardMaterial(paper?: Texture) {
  // aged instant-film card: cream, never pure white, with the paper fibre texture
  return new MeshStandardMaterial({ color: new Color('#E4D9C2'), map: paper ?? null, roughness: 0.8, metalness: 0, side: DoubleSide })
}

/** Soft contact shadow under the polaroid, inside the recess (multiplied over the cover). */
export function contactShadowMaterial(shadow: Texture) {
  return new MeshBasicMaterial({ color: new Color('#000000'), alphaMap: shadow, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 })
}

export function polaroidPhotoMaterial(photo: Texture) {
  // glossy photographic surface: sharp reflections of the room on top of a slightly matte emulsion
  return new MeshPhysicalMaterial({
    map: photo,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.3,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    side: DoubleSide,
  })
}
