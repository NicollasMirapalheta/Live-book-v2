import { room, type NodeConfig } from '../config/room'

export type NodeId = string

export interface NavNode extends NodeConfig {
  id: NodeId
}

export type NavEdge = [NodeId, NodeId]

export const navNodes: Record<NodeId, NavNode> = Object.fromEntries(
  Object.entries(room.nodes).map(([id, node]) => [id, { ...node, id }]),
)

export const navEdges: NavEdge[] = room.edges

/** Node order along the path, starting at the entrance (first node of the first edge). */
export const nodeOrder: NodeId[] = (() => {
  const order: NodeId[] = []
  const start = navEdges[0]?.[0] ?? Object.keys(navNodes)[0]
  let current: NodeId | undefined = start
  while (current && !order.includes(current)) {
    order.push(current)
    current = getNeighbors(current).find((n) => !order.includes(n))
  }
  return order
})()

export function getNeighbors(id: NodeId): NodeId[] {
  return navEdges.flatMap(([a, b]) => (a === id ? [b] : b === id ? [a] : []))
}

export function isNode(id: string | undefined): id is NodeId {
  return id !== undefined && id in navNodes
}

/** Next node forward (+1) or back (−1) along the path, if any. */
export function stepTarget(from: NodeId, dir: 1 | -1): NodeId | undefined {
  const i = nodeOrder.indexOf(from)
  const target = nodeOrder[i + dir]
  return target && getNeighbors(from).includes(target) ? target : undefined
}
