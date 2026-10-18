import { Bloom, DepthOfField, EffectComposer, N8AO, Noise, ToneMapping, Vignette } from '@react-three/postprocessing'
import { useFrame } from '@react-three/fiber'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import { useRef } from 'react'
import { isReading, readFocus, useSelection } from '../book/useSelection'
import { useLevel, useQuality } from '../state/quality'
import { ShadowFloor, ShadowFloorEffect, WhiteBalance } from './Grade'

/** Shadow floor while a book is open: a fraction of the room's lift, so the ink stays dark (Grade.tsx). */
const READING_FLOOR = 0.25
/** S-curve while a book is open (0..1): paper lighter, ink darker; the room behind is out of focus anyway */
const READING_CONTRAST = 0.45
/** seconds for the grade to settle when a book opens or closes (about the cover's opening) */
const FLOOR_EASE_S = 0.8

/**
 * N8AO → Bloom (high threshold: windows, candles, lamp) → Vignette → Noise → white balance → AgX → shadow floor.
 * Tone mapping happens only here (the Canvas renders with NoToneMapping).
 * DOF only while a book is open (art direction: "DOF só no modo livro"), focused on the book, tier high.
 */
export function Effects() {
  const quality = useQuality((s) => s.quality)
  const high = quality === 'high'
  // MSAA and ambient occlusion follow the graphics level (state/quality.ts)
  const { msaa, ao } = useLevel()
  const reading = useSelection((s) => isReading(s.phase))
  const floor = useRef<ShadowFloorEffect>(null)
  useFrame((_, delta) => {
    const f = floor.current
    if (!f) return
    const reading = isReading(useSelection.getState().phase) ? 1 : 0
    // eased together: 0 = the room's grade, 1 = the reading grade
    const k = (1 - f.strength) / (1 - READING_FLOOR)
    const next = k + Math.sign(reading - k) * Math.min(Math.abs(reading - k), Math.min(1, delta / FLOOR_EASE_S))
    f.strength = 1 - next * (1 - READING_FLOOR)
    f.contrast = next * READING_CONTRAST
  })
  return (
    <EffectComposer multisampling={msaa} enableNormalPass={false}>
      {ao ? <N8AO aoRadius={0.35} intensity={1.6} distanceFalloff={0.6} halfRes quality="medium" /> : <></>}
      {high && reading ? <DepthOfField focusDistance={readFocus.distance} focusRange={0.6} bokehScale={5.5} /> : <></>}
      <Bloom luminanceThreshold={1.6} luminanceSmoothing={0.4} intensity={high ? 0.55 : 0.35} mipmapBlur radius={0.7} />
      <Vignette offset={0.32} darkness={0.42} eskil={false} />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.06} />
      <WhiteBalance />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <ShadowFloor ref={floor} />
    </EffectComposer>
  )
}
