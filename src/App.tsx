import { lazy, Suspense, useEffect } from 'react'
import { params } from './app/params'
import { SceneRoot } from './scene/SceneRoot'
import { detectInitialQuality } from './state/quality'

const BookDevScene = lazy(() => import('./book/BookDevScene'))

export default function App() {
  useEffect(() => {
    void detectInitialQuality()
  }, [])

  if (params.dev === 'book') {
    return (
      <Suspense fallback={null}>
        <BookDevScene />
      </Suspense>
    )
  }
  return <SceneRoot />
}
