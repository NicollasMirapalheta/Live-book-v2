import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'

export interface SceneStats {
  calls: number
  triangles: number
  textures: number
  gpu: string
}

declare global {
  interface Window {
    __SCENE_READY__?: boolean
    __SCENE_STATS__?: SceneStats
  }
}

const FRAMES_BEFORE_READY = 30

function gpuName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  const ext = gl.getExtension('WEBGL_debug_renderer_info')
  return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
}

/**
 * Mount inside the same <Suspense> as the scene content: it only renders once everything loaded.
 * After 30 frames sets window.__SCENE_READY__ and keeps window.__SCENE_STATS__ updated with
 * the totals of a whole frame (including post-processing passes).
 */
export function Readiness() {
  const gl = useThree((s) => s.gl)
  const frames = useRef(0)

  useEffect(() => {
    gl.info.autoReset = false
    return () => {
      gl.info.autoReset = true
      window.__SCENE_READY__ = false
    }
  }, [gl])

  // Runs first in each frame: the counters still hold the previous full frame.
  useFrame(() => {
    frames.current++
    if (frames.current > 2) {
      window.__SCENE_STATS__ = {
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        textures: gl.info.memory.textures,
        gpu: gpuName(gl.getContext()),
      }
    }
    gl.info.reset()
    if (frames.current === FRAMES_BEFORE_READY) window.__SCENE_READY__ = true
  }, -1000)

  return null
}
