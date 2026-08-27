import { describe, expect, it, vi } from 'vitest'
import type { Profile } from '../src/shared/types'

// tray.ts imports electron for Tray/nativeImage, which does not exist outside
// the app; only the pure template function is under test here.
vi.mock('electron', () => ({
  Menu: { buildFromTemplate: vi.fn() },
  Tray: class {},
  app: { isPackaged: false },
  nativeImage: { createFromPath: vi.fn() }
}))

const { trayMenuTemplate } = await import('../src/main/tray')

const profile = (id: string, name: string, hotkey: string | null = null): Profile => ({
  id,
  name,
  args: [],
  screens: [],
  signature: 'sig',
  hotkey,
  autoApply: false,
  createdAt: '2026-08-27T00:00:00.000Z'
})

const deps = (profiles: Profile[], activeId: string | null = null) => ({
  getProfiles: () => profiles,
  getActiveProfileId: () => activeId,
  onApply: vi.fn(),
  onSaveCurrent: vi.fn(),
  onOpen: vi.fn()
})

const labels = (template: Electron.MenuItemConstructorOptions[]): string[] =>
  template.map((item) => item.label ?? `[${item.type}]`)

describe('trayMenuTemplate', () => {
  it('lists every profile above the fixed actions', () => {
    const template = trayMenuTemplate(deps([profile('a', 'Desk'), profile('b', 'Portrait side')]))

    expect(labels(template)).toEqual([
      'Desk',
      'Portrait side',
      '[separator]',
      'Save current layout',
      'Open DisplayDeck',
      '[separator]',
      'Quit DisplayDeck'
    ])
  })

  it('checkmarks only the active profile', () => {
    const template = trayMenuTemplate(deps([profile('a', 'Desk'), profile('b', 'Side')], 'b'))

    expect(template[0]).toMatchObject({ label: 'Desk', checked: false, type: 'checkbox' })
    expect(template[1]).toMatchObject({ label: 'Side', checked: true, type: 'checkbox' })
  })

  it('checkmarks nothing when no profile has been applied', () => {
    const template = trayMenuTemplate(deps([profile('a', 'Desk')], null))
    expect(template[0]).toMatchObject({ checked: false })
  })

  it('shows the accelerator but does not let the menu register it', () => {
    const template = trayMenuTemplate(deps([profile('a', 'Desk', 'Control+Alt+1')]))

    // globalShortcut owns the real binding; a menu accelerator would double-fire.
    expect(template[0]).toMatchObject({
      accelerator: 'Control+Alt+1',
      registerAccelerator: false
    })
  })

  it('falls back to a disabled placeholder with no profiles', () => {
    const template = trayMenuTemplate(deps([]))

    expect(template[0]).toMatchObject({ label: 'No profiles yet', enabled: false })
    expect(labels(template)).toContain('Save current layout')
  })

  it('applies the profile that was clicked', () => {
    const d = deps([profile('a', 'Desk'), profile('b', 'Side')])
    const template = trayMenuTemplate(d)

    template[1]?.click?.(
      {} as Electron.MenuItem,
      undefined,
      {} as Electron.KeyboardEvent
    )
    expect(d.onApply).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }))
  })
})
