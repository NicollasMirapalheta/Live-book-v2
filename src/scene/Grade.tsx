import { wrapEffect } from '@react-three/postprocessing'
import { BlendFunction, Effect } from 'postprocessing'
import { Color, Uniform, Vector3 } from 'three'

/**
 * Camera-like white balance in scene-linear light, before tone mapping: the 3200 K sun and 2400 K candles
 * stay warm, but the frame is not "orange flat" (direção de arte: o quente vem da luz).
 */
class WhiteBalanceEffect extends Effect {
  constructor({ gains = new Vector3(0.9, 1.0, 1.18) } = {}) {
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
 * never pure black ("nunca preto puro").
 */
class ShadowFloorEffect extends Effect {
  constructor({ color = '#2A1A12' } = {}) {
    const c = new Color(color) // three converts the sRGB hex to linear
    super(
      'ShadowFloor',
      /* glsl */ `
uniform vec3 floorColor;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  outputColor = vec4(floorColor + (1.0 - floorColor) * inputColor.rgb, inputColor.a);
}`,
      { blendFunction: BlendFunction.NORMAL, uniforms: new Map([['floorColor', new Uniform(new Vector3(c.r, c.g, c.b))]]) },
    )
  }
}

export const WhiteBalance = wrapEffect(WhiteBalanceEffect)
export const ShadowFloor = wrapEffect(ShadowFloorEffect)
