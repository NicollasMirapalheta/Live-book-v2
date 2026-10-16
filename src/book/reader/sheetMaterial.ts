import { BufferAttribute, BufferGeometry, DoubleSide, MeshStandardMaterial, Vector2, type Texture, type WebGLProgramParametersWithUniforms } from 'three'

/** Subdivision of the turning sheet: across the width (curl) × along the height. */
export const SHEET_SEGMENTS = { u: 24, v: 6 } as const

export interface PagePlaneOptions {
  segU?: number
  segV?: number
  /** flips u for pages read from the other side */
  mirrorU?: boolean
  /** how far the paper rises out of the gutter (m): an open book's pages curve up from the binding */
  lift?: number
  /** amplitude of a slow wave in the paper (m): real pages are never perfectly flat */
  ripple?: number
  /** the page continues this far past the binding (m), under the facing page: no gap at the gutter */
  extend?: number
  seed?: number
}

/**
 * Page in the closed-book frame (x thickness, y up, z from the spine to the fore-edge), facing +X or −X.
 * u runs from the spine (0) to the fore-edge (1).
 */
export function pagePlaneGeometry(width: number, height: number, y0: number, facing: 1 | -1, opts: PagePlaneOptions = {}): BufferGeometry {
  const { segU = 1, segV = 1, mirrorU = false, lift = 0, ripple = 0, extend = 0, seed = 0 } = opts
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const z0 = -extend
  const span = width + extend
  for (let j = 0; j <= segV; j++) {
    for (let i = 0; i <= segU; i++) {
      const z = z0 + (i / segU) * span
      const u = z / width
      const v = j / segV
      const uc = Math.max(0, u)
      pos.push(facing * (pageLift(uc, lift) + pageWave(uc, v, ripple, seed)), y0 + v * height, z)
      nor.push(facing, 0, 0)
      uv.push(mirrorU ? 1 - u : u, v)
    }
  }
  const row = segU + 1
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const a = j * row + i
      const b = a + 1 // +z
      const c = a + row // +y
      const d = c + 1
      // (a, c, b) faces +X: (c − a) × (b − a) = Y × Z = X
      if (facing > 0) idx.push(a, c, b, b, c, d)
      else idx.push(a, b, c, b, d, c)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  g.setIndex(idx)
  // curved pages: normals from the surface (the winding already faces `facing`)
  if (lift || ripple) g.computeVertexNormals()
  return g
}


/**
 * Rise of an open page above its stack at fraction u of the width (0 = gutter): the paper climbs out of the
 * binding, flattens over the page and drops a little at the fore-edge. Same curve in GLSL (LB_PAGE_LIFT).
 */
export function pageLift(u: number, lift: number) {
  return lift * (1 - Math.pow(1 - u, 2.5)) - lift * 0.2 * Math.pow(u, 6)
}

/** Slow wave in the paper at (u, v); fades toward the gutter, where the binding holds the paper. Same in GLSL. */
export function pageWave(u: number, v: number, ripple: number, seed: number) {
  return ripple * Math.min(1, u * 4) * Math.sin(2 * Math.PI * (u / 0.4) + seed) * (0.6 + 0.4 * Math.sin(Math.PI * v + seed * 0.7))
}

const LB_PAGE_LIFT = /* glsl */ `
float lbPageLift( float u, float lift ) { return lift * ( 1.0 - pow( 1.0 - u, 2.5 ) ) - lift * 0.2 * pow( u, 6.0 ); }
float lbPageWave( float u, float v, float ripple, float seed ) {
  return ripple * min( 1.0, u * 4.0 ) * sin( 6.2831853 * ( u / 0.4 ) + seed ) * ( 0.6 + 0.4 * sin( 3.14159265 * v + seed * 0.7 ) );
}`

/**
 * Light on the paper (fragment): a little darker toward the bottom (the key light is the chandelier above) and,
 * while a sheet is in the air, shaded from the gutter outward under it. `gutterU` is the uv.x of the binding.
 */
const LB_PAPER_LIGHT = /* glsl */ `
float lbPaperLight( vec2 uv, float gutterU, float shade ) {
  // clamped: MSAA samples extrapolate uv past the edge, and pow() of a negative base is NaN (black frame after bloom)
  float fromGutter = clamp( abs( uv.x - gutterU ), 0.0, 1.0 );
  // the sheet in the air darkens the page under it from the gutter out, up to ~0.65 at the binding
  return mix( 0.84, 1.0, clamp( uv.y, 0.0, 1.0 ) ) * ( 1.0 - shade * 0.35 * pow( 1.0 - fromGutter, 0.8 ) );
}`

export interface PageUniforms {
  /** 0..1: how much the sheet in the air shades this page */
  uShade: { value: number }
  /** uv.x of the binding side */
  uGutterU: { value: number }
}

export function pageMaterial(gutterU: 0 | 1) {
  const uniforms: PageUniforms = { uShade: { value: 0 }, uGutterU: { value: gutterU } }
  const mat = new MeshStandardMaterial({ roughness: 0.88, metalness: 0, envMapIntensity: 0.5, polygonOffset: true, polygonOffsetFactor: -1 })
  mat.userData.page = uniforms
  mat.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uShade;\nuniform float uGutterU;${LB_PAPER_LIGHT}`)
      .replace('#include <map_fragment>', '#include <map_fragment>\n\tdiffuseColor.rgb *= lbPaperLight( vMapUv, uGutterU, uShade );')
  }
  mat.customProgramCacheKey = () => 'lb-page'
  return mat
}

export interface SheetUniforms {
  uTurn: { value: number }
  uTheta: { value: number }
  uPivot: { value: Vector2 }
  uWidth: { value: number }
  uCurl: { value: number }
  uDir: { value: number }
  uLift: { value: number }
  uRipple: { value: number }
  uSeed: { value: number }
  backMap: { value: Texture | null }
}

/**
 * The sheet in the air: rotates around the spine by uTheta·turn with the fore-edge leading (curl), integrated
 * along the width in the vertex shader so the paper keeps its length. At rest it has the same rise as the
 * open pages (so it starts exactly on the page it lifts). Front face = recto (map), back face = verso
 * (backMap, read from the other side).
 */
export function sheetMaterial(width: number, lift: number, ripple = 0, seed = 0) {
  const uniforms: SheetUniforms = {
    uTurn: { value: 0 },
    uTheta: { value: Math.PI },
    uPivot: { value: new Vector2() },
    uWidth: { value: width },
    uCurl: { value: 0.35 },
    uDir: { value: 1 },
    uLift: { value: lift },
    uRipple: { value: ripple },
    uSeed: { value: seed },
    backMap: { value: null },
  }
  const mat = new MeshStandardMaterial({ roughness: 0.88, metalness: 0, envMapIntensity: 0.5, side: DoubleSide })
  mat.userData.sheet = uniforms
  mat.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTurn;
uniform float uTheta;
uniform vec2 uPivot;
uniform float uWidth;
uniform float uCurl;
uniform float uDir;
uniform float uLift;
uniform float uRipple;
uniform float uSeed;${LB_PAGE_LIFT}
// angle of the paper at fraction f of the width: the fore-edge leads the turn in its direction
float lbAngle( float f ) {
  return uTheta * clamp( uTurn + uDir * uCurl * f * sin( 3.14159265 * uTurn ), 0.0, 1.0 );
}
vec2 lbDir( float a ) { return vec2( sin( a ), cos( a ) ); }`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
	float lbF = clamp( position.z / uWidth, 0.0, 1.0 );
	float lbA = lbAngle( lbF );
	objectNormal = vec3( cos( lbA ), 0.0, -sin( lbA ) );`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
	vec2 lbP = vec2( 0.0 );
	float lbDs = position.z / 16.0;
	for ( int i = 0; i < 16; i++ ) lbP += lbDir( lbAngle( ( float( i ) + 0.5 ) * lbDs / uWidth ) ) * lbDs;
	// resting rise on whichever stack it lies on (flat mid-air), plus a hair above the page under it
	float lbRest = 1.0 - 2.0 * uTurn;
	// same rise and wave as the page under it (else the crests of that page poke through the sheet and its
	// letters mix with this one's), fading out mid-air
	float lbSurface = lbPageLift( lbF, uLift ) + lbPageWave( lbF, uv.y, uRipple, uSeed );
	lbP += vec2( cos( lbA ), -sin( lbA ) ) * ( 0.0006 + lbSurface * abs( lbRest ) ) * sign( lbRest );
	transformed.x = uPivot.x + lbP.x;
	transformed.z = uPivot.y + lbP.y;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D backMap;\nuniform float uTurn;${LB_PAPER_LIGHT}`)
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
	vec4 lbPage = gl_FrontFacing ? texture2D( map, vMapUv ) : texture2D( backMap, vec2( 1.0 - vMapUv.x, vMapUv.y ) );
	diffuseColor *= lbPage;
	diffuseColor.rgb *= lbPaperLight( vMapUv, 0.0, 0.0 );
#endif`,
      )
      // backlight through the paper: the windows are behind the book, a lifted sheet glows a little
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * 0.05 * sin( 3.14159265 * uTurn );',
      )
  }
  mat.customProgramCacheKey = () => 'lb-sheet'
  return mat
}
