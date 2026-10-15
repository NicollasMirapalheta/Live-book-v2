// PLACEHOLDER: flat-shaded shell of the room, used only while public/models/room.glb
// does not exist (before the Blender pipeline ran). Listed in docs/placeholders.md.
import { room } from '../config/room'

export function PlaceholderRoom() {
  const { width, depth, height } = room.room
  const { bookcase } = room
  return (
    <group name="placeholder_room">
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, depth + 3]} />
        <meshStandardMaterial color="#5a3a24" roughness={0.5} />
      </mesh>
      <mesh position={[0, height / 2, room.walls.back.z]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color="#b8a58a" roughness={0.9} />
      </mesh>
      <mesh position={[room.walls.left.x, height / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[depth, height]} />
        <meshStandardMaterial color="#a8957a" roughness={0.9} />
      </mesh>
      <mesh position={[room.walls.right.x, height / 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[depth, height]} />
        <meshStandardMaterial color="#a8957a" roughness={0.9} />
      </mesh>
      <mesh position={[0, height, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, depth + 3]} />
        <meshStandardMaterial color="#d9cfbf" roughness={1} />
      </mesh>
      <mesh position={[bookcase.center[0], bookcase.height / 2, bookcase.center[2]]}>
        <boxGeometry args={[bookcase.width, bookcase.height, bookcase.depth]} />
        <meshStandardMaterial color="#3a2216" roughness={0.6} />
      </mesh>
      <ambientLight intensity={0.6} color="#ffd9b0" />
      <pointLight position={[0, 2.4, -0.6]} intensity={6} color="#ff9e40" />
    </group>
  )
}
