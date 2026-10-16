import { BufferAttribute, BufferGeometry, DoubleSide, MeshStandardMaterial, Vector2, Vector3, type Texture, type WebGLProgramParametersWithUniforms } from 'three'

/** Subdivision of the turning sheet: across the width (curl) × along the height. */
export const SHEET_SEGMENTS = { u: 24, v: 6 } as const

/**
 * Flat page in the closed-book frame (x thickness, y up, z from the spine to the fore-edge), facing +X or −X.
 * u runs from the spine (0) to the fore-edge (1); `mirrorU` flips it for pages read from the other side.
 */
export function pagePlaneGeometry(
  width: number,
  height: number,
  y0: number,
  facing: 1 | -1,
  segU = 1,
  segV = 1,
  mirrorU = false,
  /** how far the paper rises out of the gutter (m): an open book's pages curve up from the binding */
  lift = 0,
): BufferGeometry {
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const n = new Vector3()
  for (let j = 0; j <= segV; j++) {
    for (let i = 0; i <= segU; i++) {
      const u = i / segU
      const v = j / segV
      // rise f(u) = lift·(1 − (1 − u)^5): steep at the gutter, flat over most of the page
      const f = lift * (1 - Math.pow(1 - u, 5))
      const df = (lift * 5 * Math.pow(1 - u, 4)) / width
      pos.push(facing * f, y0 + v * height, u * width)
      n.set(1, 0, -df).normalize().multiplyScalar(facing)
      nor.push(n.x, n.y, n.z)
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
  return g
}

export function pageMaterial() {
  return new MeshStandardMaterial({ roughness: 0.88, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1 })
}

export interface SheetUniforms {
  uTurn: { value: number }
  uTheta: { value: number }
  uPivot: { value: Vector2 }
  uWidth: { value: number }
  uCurl: { value: number }
  uDir: { value: number }
  backMap: { value: Texture | null }
}

/**
 * The sheet in the air: rotates around the spine by uTheta·turn with the fore-edge leading (curl), integrated
 * along the width in the vertex shader so the paper keeps its length. Front face = recto (map), back face =
 * verso (backMap, read from the other side).
 */
export function sheetMaterial(width: number) {
  const uniforms: SheetUniforms = {
    uTurn: { value: 0 },
    uTheta: { value: Math.PI },
    uPivot: { value: new Vector2() },
    uWidth: { value: width },
    uCurl: { value: 0.35 },
    uDir: { value: 1 },
    backMap: { value: null },
  }
  const mat = new MeshStandardMaterial({ roughness: 0.88, metalness: 0, side: DoubleSide })
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
// angle of the paper at fraction f of the width: the fore-edge leads the turn in its direction
float lbAngle( float f ) {
  return uTheta * clamp( uTurn + uDir * uCurl * f * sin( 3.14159265 * uTurn ), 0.0, 1.0 );
}
vec2 lbDir( float a ) { return vec2( sin( a ), cos( a ) ); }`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
	float lbA = lbAngle( clamp( position.z / uWidth, 0.0, 1.0 ) );
	objectNormal = vec3( cos( lbA ), 0.0, -sin( lbA ) );`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
	vec2 lbP = vec2( 0.0 );
	float lbDs = position.z / 16.0;
	for ( int i = 0; i < 16; i++ ) lbP += lbDir( lbAngle( ( float( i ) + 0.5 ) * lbDs / uWidth ) ) * lbDs;
	// a hair above whichever stack it lies on
	lbP += vec2( cos( lbA ), -sin( lbA ) ) * 0.0004 * ( 1.0 - 2.0 * uTurn );
	transformed.x = uPivot.x + lbP.x;
	transformed.z = uPivot.y + lbP.y;`,
      )
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D backMap;').replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
	vec4 lbPage = gl_FrontFacing ? texture2D( map, vMapUv ) : texture2D( backMap, vec2( 1.0 - vMapUv.x, vMapUv.y ) );
	diffuseColor *= lbPage;
#endif`,
    )
  }
  mat.customProgramCacheKey = () => 'lb-sheet'
  return mat
}
