import { BrowserWindow, ipcMain } from 'electron'
import type { IpcResult, Profile, ProfileView, SetupState } from '../shared/types'
import {
  applyProfile as runApply,
  captureProfile,
  defaultRunner,
  isBinaryInstalled,
  parseList,
  resolveBinary
} from './displayplacer'
import type { ProfileStore } from './store'

export const CHANNELS = {
  listProfiles: 'profiles:list',
  saveCurrent: 'profiles:saveCurrent',
  applyProfile: 'profiles:apply',
  renameProfile: 'profiles:rename',
  deleteProfile: 'profiles:delete',
  setHotkey: 'profiles:setHotkey',
  getSetupState: 'setup:get',
  setAutoApply: 'profiles:setAutoApply',
  /** Push-only: main → renderer. The renderer cannot invoke this. */
  profilesChanged: 'profiles:changed'
} as const

export const INSTALL_COMMAND = 'brew install displayplacer'

export async function getSetupState(): Promise<SetupState> {
  const installed = isBinaryInstalled()
  if (!installed) {
    return {
      binaryInstalled: false,
      binaryPath: null,
      installCommand: INSTALL_COMMAND,
      attachedScreenIds: []
    }
  }

  const binary = resolveBinary()
  // A listing failure must not hide the setup panel, so fall back to "nothing
  // attached" and let the profile rows explain themselves.
  let attachedScreenIds: string[]
  try {
    const { stdout } = await defaultRunner(binary, ['list'])
    attachedScreenIds = parseList(stdout).screens.map((screen) => screen.id)
  } catch {
    attachedScreenIds = []
  }

  return {
    binaryInstalled: true,
    binaryPath: binary,
    installCommand: INSTALL_COMMAND,
    attachedScreenIds
  }
}

/**
 * Typed errors from main stop here. The renderer only ever sees a result
 * object, never a rejected promise it might not be handling.
 */
async function guard<T>(work: () => Promise<T> | T): Promise<IpcResult<T>> {
  try {
    return { ok: true, value: await work() }
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : String(cause) }
  }
}

export interface IpcDeps {
  store: ProfileStore
  /** Attaches main-only state (hotkey registration status) to each profile. */
  decorate?: (profiles: Profile[]) => ProfileView[]
  /** Lets M5 suppress an auto-apply that would race a manual one. */
  onApplied?: (profile: Profile) => void
  onProfilesChanged?: () => void
}

export function broadcastProfilesChanged(profiles: ProfileView[]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(CHANNELS.profilesChanged, profiles)
  }
}

export function registerIpcHandlers({
  store,
  decorate = (profiles) => profiles.map((profile) => ({ ...profile, hotkeyStatus: 'none' as const })),
  onApplied,
  onProfilesChanged
}: IpcDeps): void {
  // Main owns the broadcast when it has extra state to attach; otherwise the
  // handler broadcasts the plain list itself.
  const changed = (): void => {
    if (onProfilesChanged) onProfilesChanged()
    else broadcastProfilesChanged(decorate(store.list()))
  }

  ipcMain.handle(CHANNELS.listProfiles, () => guard(() => decorate(store.list())))

  ipcMain.handle(CHANNELS.getSetupState, () => guard(() => getSetupState()))

  ipcMain.handle(CHANNELS.saveCurrent, (_event, name: unknown) =>
    guard(async () => {
      if (typeof name !== 'string') throw new TypeError('A profile name is required.')
      const profile = store.create(await captureProfile(name))
      changed()
      return profile
    })
  )

  ipcMain.handle(CHANNELS.applyProfile, (_event, id: unknown) =>
    guard(async () => {
      if (typeof id !== 'string') throw new TypeError('A profile id is required.')
      const profile = store.find(id)
      if (!profile) throw new Error(`No profile with id ${id}`)

      const result = await runApply(profile)
      if (!result.ok) throw new Error(result.error ?? 'displayplacer reported a failure.')

      onApplied?.(profile)
      return profile
    })
  )

  ipcMain.handle(CHANNELS.renameProfile, (_event, id: unknown, name: unknown) =>
    guard(() => {
      if (typeof id !== 'string' || typeof name !== 'string') {
        throw new TypeError('rename requires an id and a name.')
      }
      const profile = store.rename(id, name)
      changed()
      return profile
    })
  )

  ipcMain.handle(CHANNELS.deleteProfile, (_event, id: unknown) =>
    guard(() => {
      if (typeof id !== 'string') throw new TypeError('A profile id is required.')
      store.delete(id)
      changed()
      return true
    })
  )

  ipcMain.handle(CHANNELS.setAutoApply, (_event, id: unknown, autoApply: unknown) =>
    guard(() => {
      if (typeof id !== 'string' || typeof autoApply !== 'boolean') {
        throw new TypeError('setAutoApply requires an id and a boolean.')
      }
      const profile = store.setAutoApply(id, autoApply)
      changed()
      return profile
    })
  )

  ipcMain.handle(CHANNELS.setHotkey, (_event, id: unknown, hotkey: unknown) =>
    guard(() => {
      if (typeof id !== 'string') throw new TypeError('A profile id is required.')
      if (hotkey !== null && typeof hotkey !== 'string') {
        throw new TypeError('A hotkey must be an accelerator string or null.')
      }
      const profile = store.setHotkey(id, hotkey)
      changed()
      return profile
    })
  )
}
