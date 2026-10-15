import { Bloom, EffectComposer, N8AO, Noise, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import { useQuality } from '../state/quality'

/**
 * N8AO → Bloom (high threshold: windows, candles, lamp) → Vignette → Noise → AgX.
 * Tone mapping happens only here (the Canvas renders with NoToneMapping).
 * DOF is prepared for the book mode and off in the room.
 */
export function Effects() {
  const quality = useQuality((s) => s.quality)
  const high = quality === 'high'
  return (
    <EffectComposer multisampling={high ? 4 : 0} enableNormalPass={false}>
      {high ? <N8AO aoRadius={0.35} intensity={1.6} distanceFalloff={0.6} halfRes quality="medium" /> : <></>}
      <Bloom luminanceThreshold={1.6} luminanceSmoothing={0.4} intensity={high ? 0.55 : 0.35} mipmapBlur radius={0.7} />
      <Vignette offset={0.32} darkness={0.42} eskil={false} />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.06} />
      <ToneMapping mode={ToneMappingMode.AGX} />
    </EffectComposer>
  )
}
