import { useCallback, useEffect, useState } from 'react'
import type { ProfileView, SetupState } from '../shared/types'
import { EmptyState } from './components/EmptyState'
import { Logo } from './components/Logo'
import { ProfileCard } from './components/ProfileCard'
import { SetupGuide } from './components/SetupGuide'

export function App(): React.JSX.Element {
  const [profiles, setProfiles] = useState<ProfileView[]>([])
  const [setup, setSetup] = useState<SetupState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const loadSetup = useCallback(async () => {
    const result = await window.displayDeck.getSetupState()
    if (result.ok) setSetup(result.value)
    else setError(result.error)
  }, [])

  useEffect(() => {
    void window.displayDeck.listProfiles().then((result) => {
      if (result.ok) setProfiles(result.value)
      else setError(result.error)
    })
    // Loading over IPC on mount is the intended use of an effect; the rule
    // cannot tell these setState calls are in async callbacks, not the body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSetup()
    // Keeps the list truthful when the tray saves or auto-switch fires.
    return window.displayDeck.onProfilesChanged(setProfiles)
  }, [loadSetup])

  const save = async (): Promise<void> => {
    setError(null)
    setSaving(true)
    const name = `Layout ${profiles.length + 1}`
    const result = await window.displayDeck.saveCurrent(name)
    if (!result.ok) setError(result.error)
    setSaving(false)
    void loadSetup()
  }

  const apply = async (id: string): Promise<void> => {
    setError(null)
    setBusyId(id)
    const result = await window.displayDeck.applyProfile(id)
    if (result.ok) setActiveId(id)
    else setError(result.error)
    setBusyId(null)
    void loadSetup()
  }

  const rename = async (id: string, name: string): Promise<void> => {
    const result = await window.displayDeck.renameProfile(id, name)
    if (!result.ok) setError(result.error)
  }

  const toggleAutoApply = async (id: string, autoApply: boolean): Promise<void> => {
    const result = await window.displayDeck.setAutoApply(id, autoApply)
    if (!result.ok) setError(result.error)
  }

  const remove = async (id: string): Promise<void> => {
    const result = await window.displayDeck.deleteProfile(id)
    if (!result.ok) setError(result.error)
    else if (activeId === id) setActiveId(null)
  }

  const needsSetup = setup !== null && !setup.binaryInstalled

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-neutral-900 bg-neutral-950/80 px-6 pb-4 pt-10 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <Logo className="h-[18px] w-[18px]" />
          <div>
            <h1 className="text-sm font-semibold leading-tight">DisplayDeck</h1>
            {profiles.length > 0 && (
              <p className="text-[11px] leading-tight text-neutral-500">
                {profiles.length} {profiles.length === 1 ? 'profile' : 'profiles'}
              </p>
            )}
          </div>
        </div>
        {!needsSetup && profiles.length > 0 && (
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 motion-reduce:transition-none"
          >
            {saving ? 'Saving…' : 'Save current layout'}
          </button>
        )}
      </header>

      <div className="px-6 pb-10">
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-xs text-red-200"
          >
            {error}
          </p>
        )}

        {needsSetup && setup && <SetupGuide installCommand={setup.installCommand} />}

        {!needsSetup && profiles.length === 0 && <EmptyState onSave={() => void save()} busy={saving} />}

        {!needsSetup && profiles.length > 0 && (
          <ul className="mt-5 space-y-3 pb-2">
            {profiles.map((profile) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                attachedScreenIds={setup?.attachedScreenIds ?? []}
                isActive={profile.id === activeId}
                busy={busyId === profile.id}
                onApply={(id) => void apply(id)}
                onRename={(id, name) => void rename(id, name)}
                onDelete={(id) => void remove(id)}
                onToggleAutoApply={(id, value) => void toggleAutoApply(id, value)}
              />
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
