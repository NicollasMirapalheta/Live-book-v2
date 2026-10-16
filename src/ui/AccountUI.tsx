import { useEffect, useRef, useState } from 'react'
import { params } from '../app/params'
import { cloudConfigured, useAccount } from '../data/cloud'
import { useLibrary } from '../data/library'
import './ui.css'

/**
 * The account (spec Fase 7), top right: "Entrar com Google", or who is signed in and "Sair". Nothing at
 * all without the Supabase keys (the books stay in this browser, as in Fase 6). `visible` false (a book in
 * the hand or open, the form) hides it, except while the offer to move local books is waiting.
 */
export function AccountUI({ visible }: { visible: boolean }) {
  const status = useAccount((s) => s.status)
  const account = useAccount((s) => s.account)
  const signIn = useAccount((s) => s.signIn)
  const signOut = useAccount((s) => s.signOut)
  const offering = useLibrary((s) => s.localPending.length > 0) && status === 'in'
  if (!cloudConfigured || params.shot || status === 'loading' || (!visible && !offering)) return null
  return (
    <div className="acc">
      {status === 'in' && account ? (
        <div className="acc-in">
          {account.avatar ? (
            <img className="acc-avatar" src={account.avatar} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className="acc-avatar acc-initial">{account.name.slice(0, 1).toUpperCase()}</span>
          )}
          <span className="acc-name">{account.name}</span>
          <button type="button" className="acc-out" onClick={() => void signOut()}>
            Sair
          </button>
        </div>
      ) : (
        <button type="button" className="acc-signin" onClick={() => void signIn()}>
          Entrar com Google
        </button>
      )}
      <MigrationOffer />
    </div>
  )
}

/** First sign-in with books made in this browser: offer to keep them in the account. */
function MigrationOffer() {
  const pending = useLibrary((s) => s.localPending)
  const signedIn = useAccount((s) => s.status === 'in')
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!signedIn || !pending.length) return null
  const n = pending.length
  const move = () => {
    setBusy(0)
    setError(null)
    useLibrary
      .getState()
      .migrate((done) => setBusy(done))
      .catch((err: unknown) => {
        console.warn('[conta] não levou os livros locais', err)
        setError('Não foi possível guardar os livros. Tente de novo.')
      })
      .finally(() => setBusy(null))
  }
  return (
    <div className="ui-card acc-offer" role="dialog" aria-labelledby="acc-offer-t">
      <p className="ui-kicker">Sua conta</p>
      <p id="acc-offer-t">
        {n === 1 ? '1 livro está' : `${n} livros estão`} só neste navegador. Guardar na sua conta para abrir em qualquer lugar?
      </p>
      {error && <p className="ui-error">{error}</p>}
      <div className="ui-actions">
        <button type="button" className="ui-btn ui-btn-primary ui-btn-small" disabled={busy !== null} onClick={move}>
          {busy === null ? 'Guardar na conta' : `Guardando ${busy}/${n}…`}
        </button>
        <button type="button" className="ui-btn ui-btn-small" disabled={busy !== null} onClick={() => useLibrary.getState().dismissMigration()}>
          Agora não
        </button>
      </div>
    </div>
  )
}

/** "Novo livro" (or a dropped PDF) while signed out: a book needs an owner first. */
export function SignInFirst({ onClose }: { onClose: () => void }) {
  const signIn = useAccount((s) => s.signIn)
  const primary = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    primary.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="ui-overlay" onClick={onClose}>
      <div className="ui-card acc-first" role="dialog" aria-modal="true" aria-labelledby="acc-first-t" onClick={(e) => e.stopPropagation()}>
        <p className="ui-kicker">Novo livro</p>
        <h2 id="acc-first-t" className="ui-title">
          Entre para guardar os seus livros
        </h2>
        <p className="acc-first-text">Com a sua conta Google, os livros ficam guardados e abrem em qualquer navegador. Só você vê a sua estante.</p>
        <div className="ui-actions">
          <button ref={primary} type="button" className="ui-btn ui-btn-primary" onClick={() => void signIn()}>
            Entrar com Google
          </button>
          <button type="button" className="ui-btn" onClick={onClose}>
            Agora não
          </button>
        </div>
      </div>
    </div>
  )
}
