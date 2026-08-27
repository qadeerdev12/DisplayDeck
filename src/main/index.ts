import { join } from 'node:path'
import { BrowserWindow, app, shell } from 'electron'
import { registerIpcHandlers } from './ipc'
import { ProfileStore } from './store'

let mainWindow: BrowserWindow | null = null
let store: ProfileStore

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

export function showWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow()
    return
  }
  mainWindow.show()
  mainWindow.focus()
}

void app.whenReady().then(() => {
  store = new ProfileStore(app.getPath('userData'))
  registerIpcHandlers({ store })

  mainWindow = createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
})

// The tray takes over in M4; until then, closing the last window quits.
app.on('window-all-closed', () => {
  app.quit()
})
