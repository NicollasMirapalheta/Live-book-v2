import { Matrix4, type WebGLRenderTarget } from 'three'

export interface FloorReflectionUniforms {
  tReflect: { value: WebGLRenderTarget['texture'] | null }
  reflectMatrix: { value: Matrix4 }
  reflectMix: { value: number }
  reflectStretch: { value: number }
  reflectBoost: { value: number }
}

/** Shared uniforms: the floor material reads them in its patched shader (see Lightmaps.ts). */
export const floorReflection: FloorReflectionUniforms = {
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
		radiance = mix( radiance, refl * reflectBoost, reflectMix );
	}
`
