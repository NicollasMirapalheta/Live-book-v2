import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import { NoToneMapping } from 'three'
import { params } from '../app/params'
import { CameraRig } from '../navigation/CameraRig'
import { LookControls } from '../navigation/LookControls'
import { ReadingZoomControls } from '../book/reader/ReadingZoomControls'
import { BookShelf } from '../book/BookShelf'
import { SelectionPanel } from '../book/SelectionPanel'
import { LibraryUI } from '../ui/LibraryUI'
import { LoadingScreen } from '../ui/LoadingScreen'
import { isReading, useSelection } from '../book/useSelection'
import { NavigationUI } from '../navigation/NavigationUI'
import { NodeMarkers } from '../navigation/NodeMarkers'
import { useQuality } from '../state/quality'
import { useCreator } from '../ui/creator'
import { AdaptiveQuality } from './AdaptiveQuality'
import { DynamicLights } from './DynamicLights'
import { Effects } from './Effects'
import { LightBeams } from './LightBeams'
import { Readiness } from './Readiness'
import { Room } from './Room'
import { ShelfProps } from './ShelfProps'
import { Sky } from './Sky'

export function SceneRoot() {
  const quality = useQuality((s) => s.quality)
  const resolved = useQuality((s) => s.resolved)
  const relief = useQuality((s) => s.relief)
  const reading = useSelection((s) => isReading(s.phase))
  // behind the book form the room is blurred and still: it stops rendering until the form closes
  const formOpen = useCreator((s) => s.mode !== null)
  return (
    <>
      <Canvas
        // Tone mapping happens once, in the post-processing chain (AgX).
        gl={{ antialias: false, toneMapping: NoToneMapping, preserveDrawingBuffer: params.shot }}
        // reading keeps the screen's full pixel ratio in every tier: text drawn at 1× and stretched blurs
        dpr={reading || (quality === 'high' && relief === 0) ? [1, 2] : 1}
        frameloop={formOpen && !params.shot ? 'demand' : 'always'}
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
        {!params.shot && <ReadingZoomControls />}
        {/* the tier is decided before anything loads (src/state/quality.ts): one set of models, not two */}
        {resolved && (
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
            <AdaptiveQuality />
          </Suspense>
        )}
      </Canvas>
      <NavigationUI />
      <SelectionPanel />
      <LibraryUI />
      <LoadingScreen />
    </>
  )
}
