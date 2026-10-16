import { params } from '../app/params'
import { stepTarget } from './nodes'
import { useNavigation } from './useNavigation'
import './navigation.css'

function Arrow({ dir }: { dir: 'up' | 'down' }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d={dir === 'up' ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Forward/back buttons at the bottom of the screen plus the reduced-motion fade overlay. */
export function NavigationUI() {
  const currentNode = useNavigation((s) => s.currentNode)
  const busy = useNavigation((s) => s.isTransitioning)
  const locked = useNavigation((s) => s.locked)
  const fade = useNavigation((s) => s.fade)
  const step = useNavigation((s) => s.step)
  if (params.shot) return null
  if (locked) return fade > 0 ? <div className="nav-fade" style={{ opacity: fade }} /> : null

  const canBack = !!stepTarget(currentNode, -1)
  const canForward = !!stepTarget(currentNode, 1)

  return (
    <>
      <nav className="nav-ui" aria-label="Navegação pela sala">
        {/* an arrow with nowhere to go is not shown (a faded one read as broken over the wood) */}
        {canBack && (
          <button type="button" className="nav-btn" aria-label="Voltar" disabled={busy} onClick={() => void step(-1)}>
            <Arrow dir="down" />
          </button>
        )}
        {canForward && (
          <button type="button" className="nav-btn" aria-label="Avançar" disabled={busy} onClick={() => void step(1)}>
            <Arrow dir="up" />
          </button>
        )}
      </nav>
      {fade > 0 && <div className="nav-fade" style={{ opacity: fade }} />}
    </>
  )
}
