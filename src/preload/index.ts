import { contextBridge, ipcRenderer } from 'electron'
import type { IpcResult, Profile, ProfileView, SetupState } from '../shared/types'

const CHANNELS = {
  listProfiles: 'profiles:list',
  saveCurrent: 'profiles:saveCurrent',
  applyProfile: 'profiles:apply',
  renameProfile: 'profiles:rename',
  deleteProfile: 'profiles:delete',
  setHotkey: 'profiles:setHotkey',
  getSetupState: 'setup:get',
  setAutoApply: 'profiles:setAutoApply',
  profilesChanged: 'profiles:changed'
} as const

export interface DisplayDeckApi {
  listProfiles: () => Promise<IpcResult<ProfileView[]>>
  saveCurrent: (name: string) => Promise<IpcResult<Profile>>
  applyProfile: (id: string) => Promise<IpcResult<Profile>>
  renameProfile: (id: string, name: string) => Promise<IpcResult<Profile>>
  deleteProfile: (id: string) => Promise<IpcResult<boolean>>
  setHotkey: (id: string, hotkey: string | null) => Promise<IpcResult<Profile>>
  setAutoApply: (id: string, autoApply: boolean) => Promise<IpcResult<Profile>>
  getSetupState: () => Promise<IpcResult<SetupState>>
  /** Receive-only. Returns an unsubscribe function. */
  onProfilesChanged: (listener: (profiles: ProfileView[]) => void) => () => void
}

const api: DisplayDeckApi = {
  listProfiles: () => ipcRenderer.invoke(CHANNELS.listProfiles),
  saveCurrent: (name) => ipcRenderer.invoke(CHANNELS.saveCurrent, name),
  applyProfile: (id) => ipcRenderer.invoke(CHANNELS.applyProfile, id),
  renameProfile: (id, name) => ipcRenderer.invoke(CHANNELS.renameProfile, id, name),
  deleteProfile: (id) => ipcRenderer.invoke(CHANNELS.deleteProfile, id),
  setHotkey: (id, hotkey) => ipcRenderer.invoke(CHANNELS.setHotkey, id, hotkey),
  setAutoApply: (id, autoApply) => ipcRenderer.invoke(CHANNELS.setAutoApply, id, autoApply),
  getSetupState: () => ipcRenderer.invoke(CHANNELS.getSetupState),
  onProfilesChanged: (listener) => {
    // The raw IpcRendererEvent is deliberately not forwarded — it carries a
    // sender handle the renderer has no business holding.
    const handler = (_event: unknown, profiles: ProfileView[]): void => listener(profiles)
    ipcRenderer.on(CHANNELS.profilesChanged, handler)
    return () => ipcRenderer.removeListener(CHANNELS.profilesChanged, handler)
  }
}

contextBridge.exposeInMainWorld('displayDeck', api)
