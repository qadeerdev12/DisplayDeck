import { useEffect, useRef, useState } from 'react'
import { missingScreens } from '../../shared/layout'
import type { Profile } from '../../shared/types'
import { LayoutPreview } from './LayoutPreview'

interface ProfileCardProps {
  profile: Profile
  attachedScreenIds: string[]
  isActive: boolean
  busy: boolean
  onApply: (id: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}

export function ProfileCard({
  profile,
  attachedScreenIds,
  isActive,
  busy,
  onApply,
  onRename,
  onDelete
}: ProfileCardProps): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
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
      className={`rounded-xl border p-4 ${
        isActive ? 'border-sky-500/60 bg-sky-950/20' : 'border-neutral-800 bg-neutral-900/40'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
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
            <h2 className="truncate text-sm font-medium text-neutral-100">
              {profile.name}
              {isActive && (
                <span className="ml-2 align-middle text-xs font-normal text-sky-400">
                  active
                </span>
              )}
            </h2>
          )}
          <p className="mt-0.5 text-xs text-neutral-500">
            {profile.screens.length} {profile.screens.length === 1 ? 'display' : 'displays'}
          </p>
        </div>

        {profile.hotkey && (
          <kbd className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-0.5 font-mono text-[11px] text-neutral-400">
            {profile.hotkey.replace(/Control/g, '⌃').replace(/Alt/g, '⌥').replace(/\+/g, '')}
          </kbd>
        )}

        <div className="relative">
          <button
            type="button"
            aria-label={`More actions for ${profile.name}`}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            onBlur={() => window.setTimeout(() => setMenuOpen(false), 120)}
            className="rounded-md px-2 py-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-10 mt-1 w-32 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  setRenaming(true)
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-800"
              >
                Rename
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  onDelete(profile.id)
                }}
                className="block w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-neutral-800"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3">
        <LayoutPreview screens={profile.screens} dimmed={!applicable} />
      </div>

      {applicable ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onApply(profile.id)}
          className="mt-3 w-full rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 transition-opacity hover:opacity-90 disabled:opacity-50 motion-reduce:transition-none"
        >
          {busy ? 'Applying…' : 'Apply'}
        </button>
      ) : (
        <p className="mt-3 rounded-lg bg-amber-950/50 px-3 py-2 text-xs text-amber-300" role="note">
          Cannot apply — {missing.length === 1 ? 'this display is' : 'these displays are'} not
          attached: {missing.map((screen) => screen.name).join(', ')}
        </p>
      )}
    </li>
  )
}
