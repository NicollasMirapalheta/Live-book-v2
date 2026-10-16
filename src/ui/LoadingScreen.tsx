import { useProgress } from '@react-three/drei'
import { useEffect, useState } from 'react'
import { params } from '../app/params'
import { useSceneReady } from '../state/ready'
import './ui.css'

const FADE_MS = 700
const HINT_KEY = 'livebook.hint.seen'

/**
 * While the room loads: the name and a thin progress bar over the dark (spec Fase 6), fading out once the
 * first frames are drawn. Then, on a first visit only, how to move around.
 */
export function LoadingScreen() {
  const ready = useSceneReady((s) => s.ready)
  const { progress } = useProgress()
  const [gone, setGone] = useState(false)
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => setGone(true), FADE_MS)
    return () => clearTimeout(t)
  }, [ready])
  if (params.shot) return null
  return (
    <>
      {!gone && (
        <div className="ls" data-ready={ready ? '' : undefined} role="status" aria-live="polite" aria-label={ready ? 'Sala pronta' : 'Carregando a sala'}>
          <p className="ls-name">Live Book</p>
          <div className="ls-bar" aria-hidden="true">
            <div className="ls-fill" style={{ width: `${Math.max(6, ready ? 100 : progress)}%` }} />
          </div>
        </div>
      )}
      {gone && <FirstVisitHint />}
    </>
  )
}

function readSeen() {
  try {
    return localStorage.getItem(HINT_KEY) === '1'
  } catch {
    return false
  }
}

/** "arraste para olhar · ↑ para andar", until the first interaction (remembered in this browser). */
function FirstVisitHint() {
  const [shown, setShown] = useState(() => !readSeen())
  useEffect(() => {
    if (!shown) return
    const done = () => {
      setShown(false)
      try {
        localStorage.setItem(HINT_KEY, '1')
      } catch {
        // private mode: it will show again next time
      }
    }
    window.addEventListener('pointerdown', done, { once: true })
    window.addEventListener('keydown', done, { once: true })
    return () => {
      window.removeEventListener('pointerdown', done)
      window.removeEventListener('keydown', done)
    }
  }, [shown])
  if (!shown) return null
  return (
    <p className="ls-hint" role="note">
      arraste para olhar · <kbd>↑</kbd> para andar
    </p>
  )
}
