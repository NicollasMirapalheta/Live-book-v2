import { Color } from 'three'

/**
 * Colour of a realtime light for the books and the shelf objects. With the Cycles colours as they are
 * (2400 K chandelier = #FF9E40, almost no blue in linear) a petrol-blue cover turned olive, and the colour
 * chosen in the book form was not the colour on the shelf. These lights take the same hue a bit toward
 * white; the room's warmth comes from the bake and the env map, untouched.
 */
export function objectLight(hex: string, towardWhite: number) {
  return new Color(hex).lerp(new Color('#ffffff'), towardWhite)
}

/** The sun and chandelier mixes used by DynamicLights (and the book form's preview). */
export const SUN_TO_WHITE = 0.3
export const CHANDELIER_TO_WHITE = 0.4
