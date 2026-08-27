import { join } from 'node:path'
import { BrowserWindow, app, shell } from 'electron'
import { applyProfile, captureProfile } from './displayplacer'
import { HotkeyRegistry } from './hotkeys'
import { broadcastProfilesChanged, registerIpcHandlers } from './ipc'
import { ProfileStore } from './store'
import { createTray, destroyTray, refreshTray } from './tray'
import type { Profile, ProfileView } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let store: ProfileStore
const hotkeys = new HotkeyRegistry()

/** Last profile applied this session — drives the tray checkmark. */
let activeProfileId: string | null = null

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 520,
    height: 720,
    show: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.on('ready-to-show', () => window.show())
  window.on('closed', () => {
    mainWindow = null
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

function showWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

async function applyById(profile: Profile): Promise<void> {
  const result = await applyProfile(profile)
  if (result.ok) {
    setActiveProfile(profile.id)
  } else {
    // Surfacing beats swallowing: open the window so the error is visible.
    showWindow()
    broadcastProfilesChanged(decorate(store.list()))
  }
}

function decorate(profiles: Profile[]): ProfileView[] {
  return profiles.map((profile) => ({
    ...profile,
    hotkeyStatus: hotkeys.statusFor(profile.id)
  }))
}

function trayDeps(): Parameters<typeof createTray>[0] {
  return {
    getProfiles: () => store.list(),
    getActiveProfileId: () => activeProfileId,
    onApply: (profile) => void applyById(profile),
    onSaveCurrent: () => void saveCurrentFromTray(),
    onOpen: showWindow
  }
}

function setActiveProfile(id: string | null): void {
  activeProfileId = id
  refreshTray(trayDeps())
}

async function saveCurrentFromTray(): Promise<void> {
  try {
    const profile = store.create(await captureProfile(`Layout ${store.list().length + 1}`))
    onProfilesChanged()
    setActiveProfile(profile.id)
  } catch {
    // The window renders the real error once it reloads its list.
    showWindow()
  }
}

function onProfilesChanged(): void {
  hotkeys.syncAll(store.list(), (profile) => void applyById(profile))
  refreshTray(trayDeps())
  broadcastProfilesChanged(decorate(store.list()))
}

void app.whenReady().then(() => {
  // Menu bar only — no Dock icon, no app switcher entry.
  app.dock?.hide()

  store = new ProfileStore(app.getPath('userData'))

  registerIpcHandlers({
    store,
    decorate,
    onApplied: (profile) => setActiveProfile(profile.id),
    onProfilesChanged
  })

  createTray(trayDeps())
  hotkeys.syncAll(store.list(), (profile) => void applyById(profile))

  mainWindow = createWindow()
})

// The tray keeps the app alive with every window closed; that is the point of
// a menu bar app, so this deliberately does not quit.
app.on('window-all-closed', () => {})

app.on('will-quit', () => {
  hotkeys.releaseAll()
  destroyTray()
})
