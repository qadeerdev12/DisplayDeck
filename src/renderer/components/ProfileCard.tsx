import { useEffect, useRef, useState } from 'react'
import { missingScreens } from '../../shared/layout'
import type { ProfileView, Screen } from '../../shared/types'
import { HotkeyCapture } from './HotkeyCapture'
import { LayoutPreview } from './LayoutPreview'

interface ProfileCardProps {
  profile: ProfileView
  attachedScreenIds: string[]
  isActive: boolean
  busy: boolean
  onApply: (id: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onToggleAutoApply: (id: string, autoApply: boolean) => void
  onSetHotkey: (id: string, hotkey: string | null) => void
  onMove: (id: string, direction: -1 | 1) => void
  canMoveUp: boolean
  canMoveDown: boolean
}

const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950'

/** "32″ · 27″ · 24″ portrait" — the arrangement in words, for scanning. */
function describeScreens(screens: Screen[]): string {
  const active = screens.filter((screen) => screen.enabled)
  if (active.length === 0) return 'No active displays'

  return active
    .map((screen) => {
      const inches = /(\d+(?:\.\d+)?)\s*inch/i.exec(screen.name)?.[1]
      const label = inches ? `${inches}″` : 'Display'
      return screen.degree === 90 || screen.degree === 270 ? `${label} portrait` : label
    })
    .join(' · ')
}

export function ProfileCard({
  profile,
  attachedScreenIds,
  isActive,
  busy,
  onApply,
  onRename,
  onDelete,
  onToggleAutoApply,
  onSetHotkey,
  onMove,
  canMoveUp,
  canMoveDown
}: ProfileCardProps): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [draft, setDraft] = useState(profile.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renaming) inputRef.current?.select()
  }, [renaming])

  const missing = missingScreens(profile.screens, attachedScreenIds)
  const applicable = missing.length === 0

  const commitRename = (): void => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== profile.name) onRename(profile.id, trimmed)
    else setDraft(profile.name)
    setRenaming(false)
  }

  return (
    <li
      className={`group rounded-xl border transition-colors motion-reduce:transition-none ${
        isActive
          ? 'border-sky-500/50 bg-sky-500/[0.04]'
          : 'border-neutral-800/80 bg-neutral-900/30 hover:border-neutral-700'
      }`}
    >
      <div className="flex items-start gap-3 p-4 pb-3">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitRename()
                if (event.key === 'Escape') {
                  setDraft(profile.name)
                  setRenaming(false)
                }
              }}
              aria-label="Profile name"
              className="w-full rounded-md border border-sky-500 bg-neutral-950 px-2 py-1 text-sm font-medium outline-none"
            />
          ) : (
            <div className="flex items-center gap-2">
              {isActive && (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400"
                  title="Applied most recently"
                />
              )}
              <h2 className="truncate text-sm font-medium text-neutral-100">{profile.name}</h2>
            </div>
          )}
          <p className="mt-1 truncate text-xs text-neutral-500">
            {describeScreens(profile.screens)}
          </p>
        </div>

        {profile.hotkey && (
          <kbd
            title={
              profile.hotkeyStatus === 'conflict'
                ? 'Another app already owns this shortcut'
                : 'Global shortcut'
            }
            className={`shrink-0 rounded-md border px-1.5 py-1 font-mono text-[11px] leading-none ${
              profile.hotkeyStatus === 'conflict'
                ? 'border-amber-700/70 bg-amber-950/50 text-amber-400 line-through'
                : 'border-neutral-700 bg-neutral-950 text-neutral-400'
            }`}
          >
            {profile.hotkey.replace(/Control/g, '⌃').replace(/Alt/g, '⌥').replace(/Shift/g, '⇧').replace(/Command|Meta/g, '⌘').replace(/\+/g, '')}
          </kbd>
        )}

        <div className="relative shrink-0">
          <button
            type="button"
            aria-label={`More actions for ${profile.name}`}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            onBlur={() => window.setTimeout(() => setMenuOpen(false), 120)}
            className={`rounded-md px-2 py-1 leading-none text-neutral-600 hover:bg-neutral-800 hover:text-neutral-200 ${FOCUS}`}
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-10 mt-1 w-36 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 py-1 shadow-2xl">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  setRenaming(true)
                }}
                className="block w-full px-3 py-1.5 text-left text-sm text-neutral-200 hover:bg-neutral-800"
              >
                Rename
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  setCapturing(true)
                }}
                className="block w-full px-3 py-1.5 text-left text-sm text-neutral-200 hover:bg-neutral-800"
              >
                Set shortcut…
              </button>
              {profile.hotkey && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onSetHotkey(profile.id, null)
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm text-neutral-200 hover:bg-neutral-800"
                >
                  Clear shortcut
                </button>
              )}
              <div className="my-1 border-t border-neutral-800" />
              <button
                type="button"
                disabled={!canMoveUp}
                onClick={() => {
                  setMenuOpen(false)
                  onMove(profile.id, -1)
                }}
                className="block w-full px-3 py-1.5 text-left text-sm text-neutral-200 hover:bg-neutral-800 disabled:text-neutral-600 disabled:hover:bg-transparent"
              >
                Move up
              </button>
              <button
                type="button"
                disabled={!canMoveDown}
                onClick={() => {
                  setMenuOpen(false)
                  onMove(profile.id, 1)
                }}
                className="block w-full px-3 py-1.5 text-left text-sm text-neutral-200 hover:bg-neutral-800 disabled:text-neutral-600 disabled:hover:bg-transparent"
              >
                Move down
              </button>
              <div className="my-1 border-t border-neutral-800" />
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  onDelete(profile.id)
                }}
                className="block w-full px-3 py-1.5 text-left text-sm text-red-400 hover:bg-neutral-800"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {capturing && (
        <HotkeyCapture
          onCapture={(accelerator) => {
            setCapturing(false)
            onSetHotkey(profile.id, accelerator)
          }}
          onCancel={() => setCapturing(false)}
        />
      )}

      <div className="px-4">
        <LayoutPreview screens={profile.screens} dimmed={!applicable} />
      </div>

      {profile.hotkeyStatus === 'conflict' && (
        <p className="mx-4 mt-3 rounded-md bg-amber-950/40 px-2.5 py-1.5 text-xs text-amber-400" role="note">
          Shortcut unavailable — another app owns this combination.
        </p>
      )}

      <div className="flex items-center gap-3 p-4 pt-3">
        <label className="flex flex-1 cursor-pointer items-center gap-2 text-xs text-neutral-400 hover:text-neutral-300">
          <input
            type="checkbox"
            checked={profile.autoApply}
            onChange={(event) => onToggleAutoApply(profile.id, event.target.checked)}
            className={`h-3.5 w-3.5 rounded accent-sky-500 ${FOCUS}`}
          />
          Apply automatically
        </label>

        {applicable ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onApply(profile.id)}
            className={`rounded-lg bg-neutral-100 px-4 py-1.5 text-sm font-medium text-neutral-900 transition-opacity hover:opacity-90 disabled:opacity-50 motion-reduce:transition-none ${FOCUS}`}
          >
            {busy ? 'Applying…' : 'Apply'}
          </button>
        ) : (
          <span className="text-xs text-neutral-600">Unavailable</span>
        )}
      </div>

      {!applicable && (
        <p className="mx-4 mb-4 rounded-md bg-amber-950/30 px-2.5 py-1.5 text-xs text-amber-400/90" role="note">
          {missing.length === 1 ? 'Not attached: ' : 'Not attached: '}
          {missing.map((screen) => screen.name).join(', ')}
        </p>
      )}
    </li>
  )
}
