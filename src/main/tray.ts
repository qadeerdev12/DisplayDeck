import { join } from 'node:path'
import { Menu, Tray, app, nativeImage } from 'electron'
import { missingScreens } from '../shared/layout'
import type { Profile } from '../shared/types'

export interface TrayDeps {
  onTogglePopover?: (trayBounds: Electron.Rectangle) => void
  getProfiles: () => Profile[]
  /** Ids attached right now; profiles needing anything else cannot be applied. */
  getAttachedScreenIds: () => string[]
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
  const attached = deps.getAttachedScreenIds()

  const profileItems: Electron.MenuItemConstructorOptions[] = profiles.map((profile) => {
    // Offering a profile whose displays are gone just produces a failure the
    // menu has no way to report, so it is greyed out and says why instead.
    const missing = missingScreens(profile.screens, attached)
    const applicable = missing.length === 0

    return {
      label: applicable ? profile.name : `${profile.name} (displays not attached)`,
      type: 'checkbox',
      checked: applicable && profile.id === activeId,
      enabled: applicable,
      accelerator: profile.hotkey ?? undefined,
      // The accelerator is drawn for reference only; globalShortcut already owns
      // the real binding and would double-fire if the menu claimed it too.
      registerAccelerator: false,
      click: () => deps.onApply(profile)
    }
  })

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

  // Left click opens the visual popover; right click keeps the native menu.
  // setContextMenu() would bind the menu to left click and take the click
  // event away, so the menu is popped up manually instead.
  tray.on('click', (_event, bounds) => deps.onTogglePopover?.(bounds))
  tray.on('right-click', () => tray?.popUpContextMenu(buildTrayMenu(deps)))

  return tray
}

export function refreshTray(deps: TrayDeps): void {
  // Kept as a no-op hook: the menu is now rebuilt lazily on right click so it
  // always reflects current state.
  void deps
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
