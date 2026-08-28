import { useCallback, useEffect, useState } from 'react'
import type { ProfileView, SetupState } from '../shared/types'
import { missingScreens } from '../shared/layout'
import { DisplayNotice } from './components/DisplayNotice'
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
  const [notice, setNotice] = useState<string | null>(null)

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
    // Fires on tray saves, auto-switch, and display connect/disconnect. The
    // setup state has to be re-read too, or the window keeps offering profiles
    // whose displays have just been unplugged.
    return window.displayDeck.onProfilesChanged((next) => {
      setProfiles(next)
      void loadSetup()
    })
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

  const flash = (message: string): void => {
    setNotice(message)
    window.setTimeout(() => setNotice((current) => (current === message ? null : current)), 2400)
  }

  const apply = async (id: string): Promise<void> => {
    setError(null)
    setBusyId(id)
    const result = await window.displayDeck.applyProfile(id)
    if (result.ok) {
      setActiveId(id)
      flash(`Applied “${result.value.name}”`)
    } else {
      setError(result.error)
    }
    setBusyId(null)
    void loadSetup()
  }

  const setHotkey = async (id: string, hotkey: string | null): Promise<void> => {
    const result = await window.displayDeck.setHotkey(id, hotkey)
    if (!result.ok) setError(result.error)
    else flash(hotkey ? `Shortcut set to ${hotkey}` : 'Shortcut cleared')
  }

  const move = async (id: string, direction: -1 | 1): Promise<void> => {
    const index = profiles.findIndex((profile) => profile.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= profiles.length) return

    const ids = profiles.map((profile) => profile.id)
    const [moved] = ids.splice(index, 1)
    ids.splice(target, 0, moved!)

    const result = await window.displayDeck.reorderProfiles(ids)
    if (!result.ok) setError(result.error)
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
  const attachedScreens = setup?.attachedScreens ?? []
  const attachedIds = attachedScreens.map((screen) => screen.id)
  const noneApplicable =
    setup !== null &&
    profiles.length > 0 &&
    profiles.every((profile) => missingScreens(profile.screens, attachedIds).length > 0)

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
        {notice && (
          <p
            role="status"
            className="mt-4 rounded-lg border border-sky-900/60 bg-sky-950/40 px-4 py-2.5 text-xs text-sky-200"
          >
            {notice}
          </p>
        )}

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

        {!needsSetup && noneApplicable && (
          <DisplayNotice attachedScreens={attachedScreens} profileCount={profiles.length} />
        )}

        {!needsSetup && profiles.length > 0 && (
          <ul className="mt-5 space-y-3 pb-2">
            {profiles.map((profile, index) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                attachedScreenIds={attachedIds}
                isActive={profile.id === activeId}
                busy={busyId === profile.id}
                onApply={(id) => void apply(id)}
                onRename={(id, name) => void rename(id, name)}
                onDelete={(id) => void remove(id)}
                onToggleAutoApply={(id, value) => void toggleAutoApply(id, value)}
                onSetHotkey={(id, hotkey) => void setHotkey(id, hotkey)}
                onMove={(id, direction) => void move(id, direction)}
                canMoveUp={index > 0}
                canMoveDown={index < profiles.length - 1}
              />
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
