import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  Color,
  HalfFloatType,
  LinearFilter,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  Plane,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type Material,
  type Object3D,
} from 'three'
import { KawaseBlurPass, KernelSize } from 'postprocessing'
import { floorReflection } from './floorReflectionShader'

/** Layer used by the reflection camera: only what is worth reflecting on a blurred floor. */
export const REFLECT_LAYER = 3
const REFLECTED = /^(stone|window_paint|glass|linen|bookcase|wainscot|brass|beam|plaster|chandelier|curtain|tieback|door|desk)/

const REFLECT_CLEAR = new Color(new URLSearchParams(window.location.search).get('debug') === 'reflect-clear' ? '#ff00ff' : '#1a110b')
const prevClear = new Color()

const matName = (m: Material | Material[]) => (Array.isArray(m) ? m[0]?.name : m.name) ?? ''

/**
 * Planar reflection of the room in the floor plane (y = 0), rendered at half resolution from a mirrored
 * camera, blurred (Kawase) and sampled with a vertical streak in the floor shader. The room is static, so
 * the reflection is only re-rendered when the camera moves.
 */
export function FloorReflection({ root, strength = 1.0 }: { root: Object3D; strength?: number }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera) as PerspectiveCamera

  const { rt, blurred, blur, virtualCam } = useMemo(() => {
    const opts = { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: true }
    const rt = new WebGLRenderTarget(1, 1, opts)
    const blurred = new WebGLRenderTarget(1, 1, { ...opts, depthBuffer: false })
    const blur = new KawaseBlurPass({ kernelSize: KernelSize.LARGE, resolutionScale: 0.5 })
    const virtualCam = new PerspectiveCamera()
    virtualCam.layers.set(REFLECT_LAYER)
    return { rt, blurred, blur, virtualCam }
  }, [])

  // re-render the reflection when the camera moves, the target is resized or the layers change
  const dirty = useRef(true)

  useEffect(() => {
    dirty.current = true
    const w = Math.max(1, Math.floor(size.width / 2))
    const h = Math.max(1, Math.floor(size.height / 2))
    rt.setSize(w, h)
    blurred.setSize(w, h)
    blur.setSize(w, h)
  }, [size, rt, blurred, blur])

  useEffect(() => {
    root.traverse((o) => {
      const m = o as Mesh
      if (m.isMesh && REFLECTED.test(matName(m.material))) m.layers.enable(REFLECT_LAYER)
    })
    floorReflection.tReflect.value = blurred.texture
    dirty.current = true
    if (new URLSearchParams(window.location.search).get('debug')) {
      ;(window as unknown as Record<string, unknown>).__REFLECT__ = { rt, blurred, gl, virtualCam }
    }
    floorReflection.reflectMix.value = strength
    return () => {
      floorReflection.reflectMix.value = 0
      floorReflection.tReflect.value = null
    }
  }, [root, blurred, strength, rt, gl, virtualCam])

  useEffect(() => () => {
    rt.dispose()
    blurred.dispose()
    blur.dispose()
  }, [rt, blurred, blur])

  const last = useRef(new Matrix4())
  const lastProj = useRef(new Matrix4())
  const tmp = useMemo(
    () => ({
      normal: new Vector3(0, 1, 0),
      reflectorWorld: new Vector3(),
      cameraWorld: new Vector3(),
      rotation: new Matrix4(),
      lookAt: new Vector3(0, 0, -1),
      target: new Vector3(),
      view: new Vector3(),
      plane: new Plane(),
      clip: new Vector4(),
      q: new Vector4(),
    }),
    [],
  )

  useFrame(() => {
    camera.updateMatrixWorld()
    const moved = !last.current.equals(camera.matrixWorld) || !lastProj.current.equals(camera.projectionMatrix)
    if (!moved && !dirty.current) return
    dirty.current = false
    last.current.copy(camera.matrixWorld)
    lastProj.current.copy(camera.projectionMatrix)

    // Mirror the camera across y = 0 (adapted from three/examples Reflector).
    const t = tmp
    t.cameraWorld.setFromMatrixPosition(camera.matrixWorld)
    t.rotation.extractRotation(camera.matrixWorld)
    t.lookAt.set(0, 0, -1).applyMatrix4(t.rotation).add(t.cameraWorld)
    t.view.copy(t.cameraWorld).reflect(t.normal).negate()
    t.view.y = -t.cameraWorld.y
    t.view.x = t.cameraWorld.x
    t.view.z = t.cameraWorld.z
    t.target.copy(t.lookAt)
    t.target.y = -t.lookAt.y
    virtualCam.position.copy(t.view)
    virtualCam.up.set(0, 1, 0).applyMatrix4(t.rotation)
    virtualCam.up.y = -virtualCam.up.y
    virtualCam.lookAt(t.target)
    virtualCam.far = camera.far
    virtualCam.near = camera.near
    virtualCam.updateMatrixWorld()
    virtualCam.projectionMatrix.copy(camera.projectionMatrix)

    // texture matrix: world → reflection texture UV
    floorReflection.reflectMatrix.value
      .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(virtualCam.projectionMatrix)
      .multiply(virtualCam.matrixWorldInverse)

    // oblique near plane = floor plane (nothing below the floor leaks into the reflection)
    t.plane.setFromNormalAndCoplanarPoint(t.normal, t.reflectorWorld.set(0, 0, 0))
    t.plane.applyMatrix4(virtualCam.matrixWorldInverse)
    t.clip.set(t.plane.normal.x, t.plane.normal.y, t.plane.normal.z, t.plane.constant)
    const p = virtualCam.projectionMatrix
    t.q.x = (Math.sign(t.clip.x) + p.elements[8]) / p.elements[0]
    t.q.y = (Math.sign(t.clip.y) + p.elements[9]) / p.elements[5]
    t.q.z = -1.0
    t.q.w = (1.0 + p.elements[10]) / p.elements[14]
    t.clip.multiplyScalar(2.0 / t.clip.dot(t.q))
    p.elements[2] = t.clip.x
    p.elements[6] = t.clip.y
    p.elements[10] = t.clip.z + 1.0
    p.elements[14] = t.clip.w

    const prevTarget = gl.getRenderTarget()
    const prevAutoClear = gl.autoClear
    gl.getClearColor(prevClear)
    const prevAlpha = gl.getClearAlpha()
    gl.autoClear = true
    gl.setRenderTarget(rt)
    // under the walls the mirrored view sees nothing (clipped at the floor plane): keep it dark, not sky
    gl.setClearColor(REFLECT_CLEAR, 1)
    gl.clear()
    gl.render(scene, virtualCam)
    blur.render(gl, rt, blurred)
    gl.setRenderTarget(prevTarget)
    gl.setClearColor(prevClear, prevAlpha)
    gl.autoClear = prevAutoClear
  }, -50)

  return null
}
