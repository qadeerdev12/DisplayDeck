import { join } from 'node:path'
import { Menu, Tray, app, nativeImage } from 'electron'
import type { Profile } from '../shared/types'

export interface TrayDeps {
  getProfiles: () => Profile[]
  getActiveProfileId: () => string | null
  onApply: (profile: Profile) => void
  onSaveCurrent: () => void
  onOpen: () => void
}

let tray: Tray | null = null

/**
 * Named *Template so macOS treats it as a mask and inverts it for dark menu
 * bars. The suffix is the whole mechanism — renaming the file breaks it.
 */
function trayImage(): Electron.NativeImage {
  const base = app.isPackaged
    ? join(process.resourcesPath, 'trayTemplate.png')
    : join(__dirname, '../../resources/trayTemplate.png')

  const image = nativeImage.createFromPath(base)
  image.setTemplateImage(true)
  return image
}

/** Pure so the menu's contents can be asserted without an Electron runtime. */
export function trayMenuTemplate(deps: TrayDeps): Electron.MenuItemConstructorOptions[] {
  const profiles = deps.getProfiles()
  const activeId = deps.getActiveProfileId()

  const profileItems: Electron.MenuItemConstructorOptions[] = profiles.map((profile) => ({
    label: profile.name,
    type: 'checkbox',
    checked: profile.id === activeId,
    accelerator: profile.hotkey ?? undefined,
    // The accelerator is drawn for reference only; globalShortcut already owns
    // the real binding and would double-fire if the menu claimed it too.
    registerAccelerator: false,
    click: () => deps.onApply(profile)
  }))

  return [
    ...(profileItems.length > 0
      ? profileItems
      : [{ label: 'No profiles yet', enabled: false } as Electron.MenuItemConstructorOptions]),
    { type: 'separator' },
    { label: 'Save current layout', click: () => deps.onSaveCurrent() },
    { label: 'Open DisplayDeck', click: () => deps.onOpen() },
    { type: 'separator' },
    { label: 'Quit DisplayDeck', role: 'quit' }
  ]
}

export function buildTrayMenu(deps: TrayDeps): Electron.Menu {
  return Menu.buildFromTemplate(trayMenuTemplate(deps))
}

export function createTray(deps: TrayDeps): Tray {
  tray = new Tray(trayImage())
  tray.setToolTip('DisplayDeck')
  refreshTray(deps)
  return tray
}

export function refreshTray(deps: TrayDeps): void {
  tray?.setContextMenu(buildTrayMenu(deps))
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
