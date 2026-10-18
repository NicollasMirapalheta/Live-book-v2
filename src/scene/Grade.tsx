import { wrapEffect } from '@react-three/postprocessing'
import { BlendFunction, Effect } from 'postprocessing'
import { Color, Uniform, Vector3 } from 'three'

/**
 * Camera-like white balance in scene-linear light, before tone mapping: the 3200 K sun and 2400 K candles
 * stay warm, but the frame is not "orange flat" (direção de arte: o quente vem da luz).
 */
class WhiteBalanceEffect extends Effect {
  constructor({ gains = new Vector3(0.85, 1.04, 1.22) } = {}) {
    super(
      'WhiteBalance',
      /* glsl */ `
uniform vec3 gains;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // keep luminance: normalize the gains by their luma
  float l = dot(gains, vec3(0.2126, 0.7152, 0.0722));
  outputColor = vec4(inputColor.rgb * gains / l, inputColor.a);
}`,
      { blendFunction: BlendFunction.NORMAL, uniforms: new Map([['gains', new Uniform(gains)]]) },
    )
  }
}

/**
 * After tone mapping: lifts the blacks so the darkest shadow is the art-direction brown (#2A1A12),
 * never pure black ("nunca preto puro"). `strength` scales the lift and the desaturation; `contrast` adds an
 * S-curve (in display space). Reading, the page's ink must stay ink and its paper bright: with the room's grade
 * as it is, the text read as through a haze (user feedback 18/10).
 */
export class ShadowFloorEffect extends Effect {
  constructor({ color = '#2A1A12', saturation = 0.8 } = {}) {
    const c = new Color(color) // three converts the sRGB hex to linear
    super(
      'ShadowFloor',
      /* glsl */ `
uniform vec3 floorColor;
uniform float saturation;
uniform float strength;
uniform float contrast;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  if (contrast > 0.0) {
    // S-curve around the middle grey of the display: paper lighter, ink darker
    vec3 d = pow(max(c, vec3(0.0)), vec3(1.0 / 2.2));
    vec3 s = d * d * (3.0 - 2.0 * d);
    c = pow(clamp(mix(d, s, contrast), 0.0, 1.0), vec3(2.2));
  }
  // slight desaturation after AgX: warm light, not orange paint
  c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, mix(1.0, saturation, strength));
  vec3 f = floorColor * strength;
  outputColor = vec4(f + (1.0 - f) * c, inputColor.a);
}`,
      {
        blendFunction: BlendFunction.NORMAL,
        uniforms: new Map<string, Uniform>([
          ['floorColor', new Uniform(new Vector3(c.r, c.g, c.b))],
          ['saturation', new Uniform(saturation)],
          ['strength', new Uniform(1)],
          ['contrast', new Uniform(0)],
        ]),
      },
    )
  }

  set strength(v: number) {
    this.uniforms.get('strength')!.value = v
  }

  get strength() {
    return this.uniforms.get('strength')!.value as number
  }

  set contrast(v: number) {
    this.uniforms.get('contrast')!.value = v
  }
}

export const WhiteBalance = wrapEffect(WhiteBalanceEffect)
export const ShadowFloor = wrapEffect(ShadowFloorEffect)
