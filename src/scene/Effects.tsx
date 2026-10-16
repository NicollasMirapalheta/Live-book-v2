import { Bloom, DepthOfField, EffectComposer, N8AO, Noise, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import { isReading, readFocus, useSelection } from '../book/useSelection'
import { useQuality } from '../state/quality'
import { ShadowFloor, WhiteBalance } from './Grade'

/**
 * N8AO → Bloom (high threshold: windows, candles, lamp) → Vignette → Noise → white balance → AgX → shadow floor.
 * Tone mapping happens only here (the Canvas renders with NoToneMapping).
 * DOF only while a book is open (art direction: "DOF só no modo livro"), focused on the book, tier high.
 */
export function Effects() {
  const quality = useQuality((s) => s.quality)
  const high = quality === 'high'
  // a machine that cannot keep up gets relief first in MSAA and AO (state/quality.ts)
  const relief = useQuality((s) => s.relief)
  const reading = useSelection((s) => isReading(s.phase))
  return (
    <EffectComposer multisampling={high ? [4, 2, 0][relief] : 0} enableNormalPass={false}>
      {high && relief < 2 ? <N8AO aoRadius={0.35} intensity={1.6} distanceFalloff={0.6} halfRes quality="medium" /> : <></>}
      {high && reading ? <DepthOfField focusDistance={readFocus.distance} focusRange={0.6} bokehScale={5.5} /> : <></>}
      <Bloom luminanceThreshold={1.6} luminanceSmoothing={0.4} intensity={high ? 0.55 : 0.35} mipmapBlur radius={0.7} />
      <Vignette offset={0.32} darkness={0.42} eskil={false} />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.06} />
      <WhiteBalance />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <ShadowFloor />
    </EffectComposer>
  )
}
