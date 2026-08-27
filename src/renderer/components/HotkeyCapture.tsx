import { useEffect, useRef } from 'react'

interface HotkeyCaptureProps {
  onCapture: (accelerator: string) => void
  onCancel: () => void
}

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta'])

/** Translates a DOM keydown into an Electron accelerator string. */
function toAccelerator(event: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null

  const parts: string[] = []
  if (event.ctrlKey) parts.push('Control')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (event.metaKey) parts.push('Command')

  // A bare key would swallow that key system-wide, so require a modifier.
  if (parts.length === 0) return null

  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key
  const named: Record<string, string> = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    ' ': 'Space',
    Escape: 'Escape'
  }

  parts.push(named[key] ?? key)
  return parts.join('+')
}

export function HotkeyCapture({ onCapture, onCancel }: HotkeyCaptureProps): React.JSX.Element {
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    boxRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopPropagation()

      if (event.key === 'Escape') {
        onCancel()
        return
      }
      const accelerator = toAccelerator(event)
      if (accelerator) onCapture(accelerator)
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onCapture, onCancel])

  return (
    <div
      ref={boxRef}
      tabIndex={-1}
      role="dialog"
      aria-label="Press a shortcut combination"
      className="mx-4 mt-3 rounded-lg border border-sky-500/60 bg-sky-950/30 px-3 py-2 text-center outline-none"
    >
      <p className="text-xs font-medium text-sky-200">Press a shortcut…</p>
      <p className="mt-0.5 text-[11px] text-sky-300/60">
        Needs a modifier (⌃ ⌥ ⇧ ⌘). Esc to cancel.
      </p>
    </div>
  )
}
