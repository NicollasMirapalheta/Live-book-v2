import { useEffect, useRef, useState } from 'react'
import { LEVELS, useQuality, type Level } from '../state/quality'
import './ui.css'

/** Full screen on/off (pedido do usuário, 16/10): for the signed-in visitor, next to the account. */
export function FullscreenButton() {
  const [on, setOn] = useState(() => !!document.fullscreenElement)
  useEffect(() => {
    const sync = () => setOn(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])
  // iPhone Safari and some embedded browsers have no fullscreen API for pages
  if (!document.fullscreenEnabled) return null
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen().catch(() => undefined)
  }
  const label = on ? 'Sair da tela cheia' : 'Tela cheia'
  return (
    <button type="button" className="acc-icon" aria-label={label} title={label} aria-pressed={on} onClick={toggle}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {on ? (
          <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
        ) : (
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        )}
      </svg>
    </button>
  )
}

/** The settings button; the panel opens under the account pill. */
export function SettingsButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="acc-icon" aria-label="Configurações" title="Configurações" aria-expanded={open} aria-controls="acc-settings" onClick={onToggle}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
        <circle cx="16" cy="7" r="2" />
        <circle cx="8" cy="17" r="2" />
      </svg>
    </button>
  )
}

/**
 * Settings (pedido do usuário, 16/10): the graphics level, from performance (1) to image quality (5), with
 * the automatic mode (detection and relief while running) as the default. Remembered on this device.
 */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const level = useQuality((s) => s.level)
  const auto = useQuality((s) => s.auto)
  const forced = useQuality((s) => s.forced)
  const choose = useQuality((s) => s.choose)
  const automatic = useQuality((s) => s.automatic)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panel.current?.querySelector<HTMLInputElement>('input')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // a click anywhere else closes it (the button that opened it toggles it itself)
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest('#acc-settings, [aria-controls="acc-settings"]')) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [onClose])

  return (
    <div ref={panel} id="acc-settings" className="ui-card acc-settings" role="dialog" aria-labelledby="acc-settings-t">
      <p id="acc-settings-t" className="ui-kicker">
        Configurações
      </p>
      <div className="acc-set-row">
        <label htmlFor="acc-quality" className="acc-set-label">
          Gráficos
        </label>
        <span className="acc-set-value" aria-live="polite">
          {LEVELS[level].label}
          {auto && ' · automático'}
        </span>
      </div>
      <input
        id="acc-quality"
        className="acc-range"
        type="range"
        min={1}
        max={5}
        step={1}
        value={level}
        disabled={forced}
        aria-valuetext={LEVELS[level].label}
        onChange={(e) => choose(Number(e.target.value) as Level)}
        style={{ '--fill': `${((level - 1) / 4) * 100}%` } as React.CSSProperties}
      />
      <div className="acc-range-ticks" aria-hidden="true">
        {([1, 2, 3, 4, 5] as const).map((l) => (
          <span key={l} data-on={l <= level || undefined} />
        ))}
      </div>
      <div className="acc-range-ends" aria-hidden="true">
        <span>Desempenho</span>
        <span>Qualidade</span>
      </div>
      <p className="acc-set-note">
        {auto
          ? 'No automático, a qualidade se ajusta ao aparelho e baixa sozinha se a imagem travar.'
          : 'Escolha guardada neste aparelho. Mais à esquerda fica mais leve; mais à direita, mais bonito.'}
      </p>
      {!auto && !forced && (
        <button type="button" className="ui-btn ui-btn-small" onClick={automatic}>
          Voltar ao automático
        </button>
      )}
    </div>
  )
}
