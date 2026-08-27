import { BrowserWindow, ipcMain } from 'electron'
import type { IpcResult, Profile, SetupState } from '../shared/types'
import {
  applyProfile as runApply,
  captureProfile,
  isBinaryInstalled,
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
  /** Push-only: main → renderer. The renderer cannot invoke this. */
  profilesChanged: 'profiles:changed'
} as const

export const INSTALL_COMMAND = 'brew install displayplacer'

export function getSetupState(): SetupState {
  const installed = isBinaryInstalled()
  return {
    binaryInstalled: installed,
    binaryPath: installed ? resolveBinary() : null,
    installCommand: INSTALL_COMMAND
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
  /** Lets M5 suppress an auto-apply that would race a manual one. */
  onApplied?: (profile: Profile) => void
  onProfilesChanged?: () => void
}

export function broadcastProfilesChanged(profiles: Profile[]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(CHANNELS.profilesChanged, profiles)
  }
}

export function registerIpcHandlers({ store, onApplied, onProfilesChanged }: IpcDeps): void {
  const changed = (): void => {
    broadcastProfilesChanged(store.list())
    onProfilesChanged?.()
  }

  ipcMain.handle(CHANNELS.listProfiles, () => guard(() => store.list()))

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
