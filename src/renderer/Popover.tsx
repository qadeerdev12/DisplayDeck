import { useCallback, useEffect, useState } from 'react'
import type { ProfileView, SetupState } from '../shared/types'
import { LayoutPreview } from './components/LayoutPreview'
import { Logo } from './components/Logo'
import { missingScreens } from '../shared/layout'

/** The compact panel that drops from the menu bar icon. */
export function Popover(): React.JSX.Element {
  const [profiles, setProfiles] = useState<ProfileView[]>([])
  const [setup, setSetup] = useState<SetupState | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [list, state] = await Promise.all([
      window.displayDeck.listProfiles(),
      window.displayDeck.getSetupState()
    ])
    if (list.ok) setProfiles(list.value)
    if (state.ok) setSetup(state.value)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    return window.displayDeck.onProfilesChanged(setProfiles)
  }, [load])

  const apply = async (id: string): Promise<void> => {
    setError(null)
    setBusyId(id)
    const result = await window.displayDeck.applyProfile(id)
    if (!result.ok) setError(result.error)
    setBusyId(null)
  }

  const attached = setup?.attachedScreenIds ?? []

  return (
    <div className="flex h-screen flex-col overflow-hidden rounded-xl border border-neutral-700/70 bg-neutral-900/95 text-neutral-100 backdrop-blur-xl">
      <header className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2.5">
        <Logo className="h-4 w-4" />
        <h1 className="text-xs font-semibold">DisplayDeck</h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {error && (
          <p role="alert" className="mb-2 rounded-md bg-red-950/60 px-2.5 py-2 text-[11px] text-red-200">
            {error}
          </p>
        )}

        {profiles.length === 0 && (
          <p className="px-2 py-8 text-center text-[11px] text-neutral-500">
            No profiles yet. Save your current layout to get started.
          </p>
        )}

        <ul className="space-y-1.5">
          {profiles.map((profile) => {
            const missing = missingScreens(profile.screens, attached)
            const applicable = missing.length === 0

            return (
              <li key={profile.id}>
                <button
                  type="button"
                  disabled={!applicable || busyId !== null}
                  onClick={() => void apply(profile.id)}
                  title={applicable ? undefined : `Not attached: ${missing.map((s) => s.name).join(', ')}`}
                  className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-neutral-800 disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 motion-reduce:transition-none"
                >
                  <div className="w-[84px] shrink-0">
                    <LayoutPreview screens={profile.screens} width={168} height={96} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{profile.name}</p>
                    <p className="truncate text-[11px] text-neutral-500">
                      {busyId === profile.id
                        ? 'Applying…'
                        : applicable
                          ? `${profile.screens.length} displays`
                          : 'Displays not attached'}
                    </p>
                  </div>
                  {profile.hotkey && (
                    <kbd className="shrink-0 rounded border border-neutral-700 px-1 py-0.5 font-mono text-[10px] text-neutral-500">
                      {profile.hotkey
                        .replace(/Control/g, '⌃')
                        .replace(/Alt/g, '⌥')
                        .replace(/Shift/g, '⇧')
                        .replace(/Command|Meta/g, '⌘')
                        .replace(/\+/g, '')}
                    </kbd>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <footer className="flex gap-1.5 border-t border-neutral-800 p-2">
        <button
          type="button"
          onClick={() => void window.displayDeck.saveCurrent(`Layout ${profiles.length + 1}`)}
          className="flex-1 rounded-md bg-neutral-800 px-2 py-1.5 text-[11px] font-medium hover:bg-neutral-700"
        >
          Save current layout
        </button>
        <button
          type="button"
          onClick={() => void window.displayDeck.openMainWindow()}
          className="rounded-md bg-neutral-800 px-2 py-1.5 text-[11px] font-medium hover:bg-neutral-700"
        >
          Open
        </button>
      </footer>
    </div>
  )
}
