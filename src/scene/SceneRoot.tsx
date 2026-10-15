import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import { NoToneMapping } from 'three'
import { params } from '../app/params'
import { CameraRig } from '../navigation/CameraRig'
import { LookControls } from '../navigation/LookControls'
import { NavigationUI } from '../navigation/NavigationUI'
import { NodeMarkers } from '../navigation/NodeMarkers'
import { useQuality } from '../state/quality'
import { DynamicLights } from './DynamicLights'
import { Effects } from './Effects'
import { Readiness } from './Readiness'
import { Room } from './Room'
import { ShelfProps } from './ShelfProps'
import { Sky } from './Sky'

export function SceneRoot() {
  const quality = useQuality((s) => s.quality)
  return (
    <>
      <Canvas
        // Tone mapping happens once, in the post-processing chain (AgX).
        gl={{ antialias: false, toneMapping: NoToneMapping, preserveDrawingBuffer: params.shot }}
        dpr={quality === 'high' ? [1, 2] : 1}
        shadows={quality === 'high' ? 'soft' : false}
        camera={{ near: 0.05, far: 60 }}
      >
        <CameraRig />
        {!params.shot && <LookControls />}
        <Suspense fallback={null}>
          <Room />
          <ShelfProps />
          <Sky />
          <DynamicLights />
          <NodeMarkers />
          <Effects />
          <Readiness />
        </Suspense>
      </Canvas>
      <NavigationUI />
    </>
  )
}
