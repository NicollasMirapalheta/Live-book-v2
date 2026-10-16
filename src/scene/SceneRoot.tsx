import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import { NoToneMapping } from 'three'
import { params } from '../app/params'
import { CameraRig } from '../navigation/CameraRig'
import { LookControls } from '../navigation/LookControls'
import { BookShelf } from '../book/BookShelf'
import { SelectionPanel } from '../book/SelectionPanel'
import { LibraryUI } from '../ui/LibraryUI'
import { LoadingScreen } from '../ui/LoadingScreen'
import { useSelection } from '../book/useSelection'
import { NavigationUI } from '../navigation/NavigationUI'
import { NodeMarkers } from '../navigation/NodeMarkers'
import { useQuality } from '../state/quality'
import { DynamicLights } from './DynamicLights'
import { Effects } from './Effects'
import { LightBeams } from './LightBeams'
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
        onCreated={({ gl }) => {
          // +0.3 EV over the Cycles setup (the reference reads brighter); AgX reads this uniform
          gl.toneMappingExposure = 1.23
        }}
        camera={{ near: 0.05, far: 60 }}
        // a click that hits no book: "outside". Only a closed book in the hand goes back to the shelf;
        // an open book never closes by accident.
        onPointerMissed={(e) => {
          const sel = useSelection.getState()
          if (e.type === 'click' && sel.phase === 'hand') sel.clear()
        }}
      >
        <CameraRig />
        {!params.shot && <LookControls />}
        <Suspense fallback={null}>
          <Room />
          {!params.off.has('props') && <ShelfProps />}
          {!params.off.has('books') && <BookShelf />}
          {!params.off.has('sky') && <Sky />}
          {!params.off.has('lights') && <DynamicLights />}
          {!params.off.has('beams') && <LightBeams />}
          <NodeMarkers />
          {!params.off.has('effects') && <Effects />}
          <Readiness />
        </Suspense>
      </Canvas>
      <NavigationUI />
      <SelectionPanel />
      <LibraryUI />
      <LoadingScreen />
    </>
  )
}
