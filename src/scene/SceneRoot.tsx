import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import { NoToneMapping } from 'three'
import { params } from '../app/params'
import { CameraRig } from '../navigation/CameraRig'
import { LookControls } from '../navigation/LookControls'
import { NavigationUI } from '../navigation/NavigationUI'
import { NodeMarkers } from '../navigation/NodeMarkers'
import { useQuality } from '../state/quality'
import { Readiness } from './Readiness'
import { Room } from './Room'

export function SceneRoot() {
  const quality = useQuality((s) => s.quality)
  return (
    <>
      <Canvas
        // Tone mapping happens once, in the post-processing chain (AgX).
        gl={{ antialias: quality === 'high', toneMapping: NoToneMapping, preserveDrawingBuffer: params.shot }}
        dpr={quality === 'high' ? [1, 2] : 1}
        camera={{ near: 0.05, far: 60 }}
      >
        <CameraRig />
        {!params.shot && <LookControls />}
        <Suspense fallback={null}>
          <Room />
          <NodeMarkers />
          <Readiness />
        </Suspense>
      </Canvas>
      <NavigationUI />
    </>
  )
}
