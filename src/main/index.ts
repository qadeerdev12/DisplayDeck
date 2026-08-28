import { join } from 'node:path'
import { BrowserWindow, app, screen, shell } from 'electron'
import { applyProfile, captureProfile, computeSignature, defaultRunner, parseList, resolveBinary } from './displayplacer'
import { AutoSwitcher } from './autoswitch'
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
let autoSwitcher: AutoSwitcher | null = null
let popoverWindow: BrowserWindow | null = null

const POPOVER_WIDTH = 340
const POPOVER_HEIGHT = 460

function createPopover(): BrowserWindow {
  const window = new BrowserWindow({
    width: POPOVER_WIDTH,
    height: POPOVER_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // Dismiss like a real menu bar panel: clicking away closes it.
  window.on('blur', () => window.hide())

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}?view=popover`)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'), { query: { view: 'popover' } })
  }

  return window
}

function togglePopover(trayBounds: Electron.Rectangle): void {
  if (!popoverWindow || popoverWindow.isDestroyed()) popoverWindow = createPopover()

  if (popoverWindow.isVisible()) {
    popoverWindow.hide()
    return
  }

  const work = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y }).workArea
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - POPOVER_WIDTH / 2)
  popoverWindow.setPosition(
    Math.min(Math.max(x, work.x + 8), work.x + work.width - POPOVER_WIDTH - 8),
    Math.round(trayBounds.y + trayBounds.height + 4)
  )
  popoverWindow.show()
  popoverWindow.focus()
}

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

async function currentSignature(): Promise<string> {
  const { stdout } = await defaultRunner(resolveBinary(), ['list'])
  return computeSignature(parseList(stdout).screens)
}

async function applyById(profile: Profile): Promise<void> {
  // Any apply arms the guard, so auto-switch cannot react to our own work.
  autoSwitcher?.noteApplied()
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
    onTogglePopover: togglePopover,
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
    openMainWindow: () => {
      popoverWindow?.hide()
      showWindow()
    },
    decorate,
    onApplied: (profile) => setActiveProfile(profile.id),
    onProfilesChanged
  })

  createTray(trayDeps())
  hotkeys.syncAll(store.list(), (profile) => void applyById(profile))

  autoSwitcher = new AutoSwitcher({
    getProfiles: () => store.list(),
    getCurrentSignature: currentSignature,
    apply: async (profile) => {
      const result = await applyProfile(profile)
      if (result.ok) setActiveProfile(profile.id)
      return result.ok
    },
    onError: () => {
      showWindow()
      broadcastProfilesChanged(decorate(store.list()))
    }
  })

  // The switcher debounces because macOS reports one dock event as a burst,
  // but the window must not wait 1.5s to stop offering profiles it can no
  // longer apply, so the renderer is told straight away.
  const onDisplayChange = (): void => {
    autoSwitcher?.handleDisplayChange()
    broadcastProfilesChanged(decorate(store.list()))
  }
  screen.on('display-added', onDisplayChange)
  screen.on('display-removed', onDisplayChange)

  mainWindow = createWindow()
})

// The tray keeps the app alive with every window closed; that is the point of
// a menu bar app, so this deliberately does not quit.
app.on('window-all-closed', () => {})

app.on('will-quit', () => {
  hotkeys.releaseAll()
  autoSwitcher?.dispose()
  destroyTray()
})
