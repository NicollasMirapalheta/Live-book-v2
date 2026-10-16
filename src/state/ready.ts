import { create } from 'zustand'

/** The room has rendered its first frames (the loading screen fades out on it). */
export const useSceneReady = create<{ ready: boolean }>(() => ({ ready: false }))
