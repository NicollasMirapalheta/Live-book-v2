import { OrbitControls, useTexture } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { Bloom, DepthOfField, EffectComposer, N8AO, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { lazy, Suspense, use, useLayoutEffect, useState } from 'react'
import { EquirectangularReflectionMapping, NoToneMapping, PMREMGenerator, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { params } from '../app/params'
import { ShadowFloor, WhiteBalance } from '../scene/Grade'
import { Readiness } from '../scene/Readiness'
import { Book } from './Book'
import { FIXTURE_BOOKS, SHOT_PRESETS, type FixtureBook } from './fixtures'
import { bookDimensions } from './geometry'

const DevControls = import.meta.env.DEV && !params.shot ? lazy(() => import('./DevControls')) : null

let envPromise: Promise<Texture> | null = null
function loadEnv() {
  envPromise ??= (async () => {
    // the room's env map when the pipeline ran; else the exterior sky (spec Fase 2)
    for (const url of ['/env/room_N1.hdr', '/env/exterior_sky.hdr']) {
      try {
        const t = await new HDRLoader().loadAsync(url)
        t.mapping = EquirectangularReflectionMapping
        return t
      } catch {
        // try the next one
      }
    }
    throw new Error('nenhum env map em public/env/ (rode npm run pipeline)')
  })()
  return envPromise
}

function Environment() {
  const hdr = use(loadEnv())
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useLayoutEffect(() => {
    const pmrem = new PMREMGenerator(gl)
    const rt = pmrem.fromEquirectangular(hdr)
    pmrem.dispose()
    scene.environment = rt.texture
    scene.background = rt.texture
    scene.backgroundBlurriness = 0.55
    scene.backgroundIntensity = 0.35
    scene.environmentIntensity = 1.25
    return () => {
      scene.environment = null
      scene.background = null
      rt.dispose()
    }
  }, [gl, scene, hdr])
  return null
}

function Table() {
  const [map, normalMap, arm] = useTexture(['/textures/book/table_color.jpg', '/textures/book/table_normal.jpg', '/textures/book/table_arm.jpg'])
  useLayoutEffect(() => {
    for (const t of [map, normalMap, arm]) {
      t.wrapS = t.wrapT = RepeatWrapping
      t.repeat.set(3.2, 2.2)
      t.anisotropy = 8
    }
    map.colorSpace = SRGBColorSpace
  }, [map, normalMap, arm])
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow name="table">
      <planeGeometry args={[1.6, 1.1]} />
      <meshStandardMaterial map={map} normalMap={normalMap} roughnessMap={arm} roughness={1} metalness={0} />
    </mesh>
  )
}

/** Book lying cover-up on the table, its center at the origin. */
function LyingBook({ book }: { book: FixtureBook }) {
  const d = bookDimensions(book.pageCount, book.trim)
  // local +X (front cover) → world up; local height → world −X; fore-edge at −Z
  return <Book book={book} rotation={[0, 0, Math.PI / 2]} position={[d.coverHeight / 2, d.totalThickness / 2, d.coverWidth / 2 - d.spineBulge / 2]} />
}

const SHOT_CAMERA = { position: [-0.2, 0.2, 0.25] as [number, number, number], fov: 32 }

export default function BookDevScene() {
  const presetId = params.preset !== undefined ? SHOT_PRESETS[params.preset] : undefined
  const initial = FIXTURE_BOOKS.find((b) => b.id === presetId) ?? FIXTURE_BOOKS[0]
  const [book, setBook] = useState<FixtureBook>(initial)

  return (
    <>
      <Canvas
        shadows
        camera={{ position: SHOT_CAMERA.position, fov: SHOT_CAMERA.fov, near: 0.01, far: 20 }}
        gl={{ antialias: false, toneMapping: NoToneMapping, preserveDrawingBuffer: params.shot }}
        dpr={[1, 2]}
      >
        <Suspense fallback={null}>
          <Environment />
          <directionalLight
            position={[-0.6, 0.9, 0.5]}
            intensity={2.4}
            color="#FFDDB8"
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-bias={-0.0002}
            shadow-normalBias={0.01}
            shadow-camera-left={-0.4}
            shadow-camera-right={0.4}
            shadow-camera-top={0.4}
            shadow-camera-bottom={-0.4}
          />
          <Table />
          <LyingBook key={`${book.id}-${book.pageCount}-${book.trim}-${book.coverMaterial}-${book.color}`} book={book} />
          {!params.off.has('effects') && (
          <EffectComposer multisampling={4}>
            <N8AO aoRadius={0.012} distanceFalloff={0.2} intensity={1.6} quality="high" />
            <Bloom luminanceThreshold={1.4} intensity={0.3} mipmapBlur />
            <DepthOfField focusDistance={0.0} focalLength={0.08} bokehScale={0.9} target={[0, 0.01, 0]} />
            <Vignette offset={0.3} darkness={0.45} />
            <WhiteBalance />
            <ToneMapping mode={ToneMappingMode.AGX} />
            <ShadowFloor />
          </EffectComposer>
          )}
          <Readiness />
        </Suspense>
        {!params.shot && <OrbitControls target={[0, 0.01, 0]} minDistance={0.15} maxDistance={1.2} maxPolarAngle={Math.PI * 0.48} enableDamping />}
      </Canvas>
      {DevControls && (
        <Suspense fallback={null}>
          <DevControls book={book} onChange={setBook} />
        </Suspense>
      )}
    </>
  )
}
