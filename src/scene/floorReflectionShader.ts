import { Matrix4, Vector4, type WebGLRenderTarget } from 'three'
import { room } from '../config/room'

const bc = room.bookcase

export interface FloorReflectionUniforms {
  roomBounds: { value: Vector4 }
  contactBox: { value: Vector4 }
  tReflect: { value: WebGLRenderTarget['texture'] | null }
  reflectMatrix: { value: Matrix4 }
  reflectMix: { value: number }
  reflectStretch: { value: number }
  reflectBoost: { value: number }
}

/** Shared uniforms: the floor material reads them in its patched shader (see Lightmaps.ts). */
export const floorReflection: FloorReflectionUniforms = {
  roomBounds: { value: new Vector4(room.walls.left.x, room.walls.right.x, room.walls.back.z, room.walls.front.z) },
  contactBox: {
    value: new Vector4(bc.center[0] - bc.width / 2, bc.center[0] + bc.width / 2, bc.center[2] - bc.depth / 2, bc.center[2] + bc.depth / 2),
  },
  tReflect: { value: null },
  reflectMatrix: { value: new Matrix4() },
  reflectMix: { value: 0 },
  reflectStretch: { value: 0.06 },
  reflectBoost: { value: new URLSearchParams(window.location.search).get('debug') === 'reflect' ? 30 : 1.0 },
}

/** GLSL injected into the floor material (Lightmaps.ts). Replaces the env radiance by the blurred reflection. */
export const FLOOR_REFLECTION_PARS = /* glsl */ `
uniform sampler2D tReflect;
uniform mat4 reflectMatrix;
uniform float reflectMix;
uniform float reflectStretch;
uniform float reflectBoost;
uniform vec4 roomBounds; // xMin, xMax, zMin, zMax (inner faces of the walls)
uniform vec4 contactBox; // bookcase footprint: xMin, xMax, zMin, zMax
varying vec3 lbWorldPos;
`

export const FLOOR_REFLECTION_SAMPLE = /* glsl */ `
	{
		vec4 rc = reflectMatrix * vec4( lbWorldPos + normal * 0.0, 1.0 );
		vec2 ruv = rc.xy / rc.w;
		// perturb with the shading normal (plank bumps) and streak vertically toward the viewer
		ruv += ( normal.xz ) * 0.015;
		vec3 refl = vec3( 0.0 );
		float wsum = 0.0;
		for ( int i = -4; i <= 4; i ++ ) {
			float w = exp( - float( i * i ) / 8.0 );
			refl += texture2D( tReflect, ruv + vec2( 0.0, float( i ) * reflectStretch / 4.0 ) ).rgb * w;
			wsum += w;
		}
		refl /= wsum;
		// contact: the reflection fades near the walls and under the bookcase (nothing is mirrored that close
		// to a vertical surface in a rough varnish; avoids the "set standing on the floor" look)
		float dWall = min( min( lbWorldPos.x - roomBounds.x, roomBounds.y - lbWorldPos.x ), min( lbWorldPos.z - roomBounds.z, roomBounds.w - lbWorldPos.z ) );
		vec2 dBox = max( vec2( contactBox.x - lbWorldPos.x, lbWorldPos.x - contactBox.y ), vec2( contactBox.z - lbWorldPos.z, lbWorldPos.z - contactBox.w ) );
		float dCase = max( max( dBox.x, dBox.y ), 0.0 );
		float contact = smoothstep( 0.0, 0.5, min( dWall, dCase ) );
		radiance = mix( radiance, refl * reflectBoost * mix( 0.3, 1.0, contact ), reflectMix );
	}
`
