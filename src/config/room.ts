// Typed access to config/room.json, the single source of measurements, nodes and light parameters.
import roomJson from '../../config/room.json'

export type Vec3 = [number, number, number]

export interface NodeConfig {
  position: Vec3
  yawDeg: number
  pitchDeg: number
  fovDeg: number
  lensShiftY: number
  role: string
}

export interface WindowConfig {
  id: string
  centerX: number
  sillY: number
  width: number
  height: number
  panes: { cols: number; rows: number }
  frameDepth: number
}

export interface RoomConfig {
  room: { width: number; depth: number; height: number; wallThickness: number }
  walls: { back: { z: number }; front: { z: number }; left: { x: number }; right: { x: number } }
  vestibule: { zFrom: number; zTo: number; width: number; height: number }
  wainscot: { height: number; panelWidth: number; railHeight: number; baseboardHeight: number }
  ceiling: { beams: { axis: string; width: number; height: number; zPositions: number[] } }
  bookcase: {
    center: Vec3
    width: number
    height: number
    depth: number
    baseCabinetHeight: number
    corniceHeight: number
    shelfLevels: number
    boardThickness: number
    sidePilasterWidth: number
    baseDoors: number
  }
  windows: WindowConfig[]
  door: { wallZ: number; centerX: number; openingWidth: number; openingHeight: number; leaves: number; openInwardDeg: number }
  rug: { center: Vec3; size: [number, number] }
  chandelier: { anchor: Vec3; bottomY: number; candles: number }
  desk: { position: Vec3; rotationYDeg: number; lamp: { offset: Vec3 } }
  picture: { wall: string; center: Vec3; size: [number, number] }
  lighting: {
    sun: { elevationDeg: number; lateralDeg: number; colorHex: string; kelvin: number }
    chandelier: { kelvin: number; colorHex: string }
    deskLamp: { kelvin: number }
    darkestShadowHex: string
  }
  nodes: Record<string, NodeConfig>
  edges: [string, string][]
  screenshot: { width: number; height: number; approval: { width: number; height: number } }
}

export const room = roomJson as unknown as RoomConfig

/** lighting.sun.travelDirectionFormula: direction the light travels, three.js axes. */
export function sunTravelDirection(sun = room.lighting.sun): Vec3 {
  const e = (sun.elevationDeg * Math.PI) / 180
  const l = (sun.lateralDeg * Math.PI) / 180
  return [Math.sin(l) * Math.cos(e), -Math.sin(e), Math.cos(l) * Math.cos(e)]
}
