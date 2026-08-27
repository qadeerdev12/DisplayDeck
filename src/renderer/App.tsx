import { useCallback, useEffect, useState } from 'react'
import type { Profile, SetupState } from '../shared/types'

export function App(): React.JSX.Element {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [setup, setSetup] = useState<SetupState | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const result = await window.displayDeck.listProfiles()
    if (result.ok) setProfiles(result.value)
    else setError(result.error)
  }, [])

  useEffect(() => {
    // Loading over IPC on mount is the intended use of an effect; the rule
    // cannot tell these setState calls are in async callbacks, not the body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
    void window.displayDeck.getSetupState().then((result) => {
      if (result.ok) setSetup(result.value)
      else setError(result.error)
    })
    // Keeps the list truthful when the tray saves or auto-switch fires.
    return window.displayDeck.onProfilesChanged(setProfiles)
  }, [refresh])

  const save = async (): Promise<void> => {
    setError(null)
    const result = await window.displayDeck.saveCurrent(`Layout ${profiles.length + 1}`)
    if (!result.ok) setError(result.error)
  }

  return (
    <main className="min-h-screen bg-neutral-950 p-8 text-neutral-100">
      <h1 className="text-xl font-semibold">DisplayDeck</h1>

      {setup && !setup.binaryInstalled && (
        <p className="mt-4 rounded-lg bg-amber-950 p-4 text-sm text-amber-200">
          displayplacer is not installed. Run{' '}
          <code className="font-mono">{setup.installCommand}</code>
        </p>
      )}

      {error && (
        <p className="mt-4 rounded-lg bg-red-950 p-4 text-sm text-red-200" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void save()}
        className="mt-6 rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900"
      >
        Save current layout
      </button>

      <ul className="mt-6 space-y-2">
        {profiles.map((profile) => (
          <li key={profile.id} className="rounded-lg bg-neutral-900 p-4">
            <span className="font-medium">{profile.name}</span>
            <span className="ml-2 text-sm text-neutral-400">
              {profile.screens.length} screens
            </span>
          </li>
        ))}
      </ul>
    </main>
  )
}
