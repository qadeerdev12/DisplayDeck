import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HotkeyRegistry, type ShortcutApi } from '../src/main/hotkeys'
import type { Profile } from '../src/shared/types'

const profile = (id: string, hotkey: string | null): Profile => ({
  id,
  name: `Profile ${id}`,
  args: [],
  screens: [],
  signature: 'sig',
  hotkey,
  autoApply: false,
  createdAt: '2026-08-27T00:00:00.000Z'
})

let registered: string[]
let refuse: Set<string>
let api: ShortcutApi

beforeEach(() => {
  registered = []
  refuse = new Set()
  api = {
    register: vi.fn((accelerator: string) => {
      if (refuse.has(accelerator)) return false
      registered.push(accelerator)
      return true
    }),
    unregisterAll: vi.fn(() => {
      registered = []
    })
  }
})

describe('syncAll', () => {
  it('registers every profile that has a hotkey', () => {
    const registry = new HotkeyRegistry(api)
    registry.syncAll([profile('a', 'Control+Alt+1'), profile('b', 'Control+Alt+2')], () => {})

    expect(registered).toEqual(['Control+Alt+1', 'Control+Alt+2'])
    expect(registry.statusFor('a')).toBe('registered')
    expect(registry.statusFor('b')).toBe('registered')
  })

  it('leaves profiles without a hotkey alone', () => {
    const registry = new HotkeyRegistry(api)
    registry.syncAll([profile('a', null)], () => {})

    expect(api.register).not.toHaveBeenCalled()
    expect(registry.statusFor('a')).toBe('none')
  })

  it('reports a conflict when another app owns the combo', () => {
    refuse.add('Control+Alt+1')
    const registry = new HotkeyRegistry(api)
    registry.syncAll([profile('a', 'Control+Alt+1'), profile('b', 'Control+Alt+2')], () => {})

    expect(registry.statusFor('a')).toBe('conflict')
    // One failure must not stop the rest from binding.
    expect(registry.statusFor('b')).toBe('registered')
    expect(registered).toEqual(['Control+Alt+2'])
  })

  it('treats a malformed accelerator as a conflict rather than crashing', () => {
    const throwing: ShortcutApi = {
      register: vi.fn(() => {
        throw new Error('Invalid accelerator')
      }),
      unregisterAll: vi.fn()
    }
    const registry = new HotkeyRegistry(throwing)

    expect(() => registry.syncAll([profile('a', 'NotAKey+++')], () => {})).not.toThrow()
    expect(registry.statusFor('a')).toBe('conflict')
  })

  it('lists conflicting profiles for the UI', () => {
    refuse.add('Control+Alt+1')
    const registry = new HotkeyRegistry(api)
    const profiles = [profile('a', 'Control+Alt+1'), profile('b', 'Control+Alt+2')]
    registry.syncAll(profiles, () => {})

    expect(registry.conflicts(profiles).map((p) => p.id)).toEqual(['a'])
  })

  it('releases everything before rebinding so stale combos cannot linger', () => {
    const registry = new HotkeyRegistry(api)
    registry.syncAll([profile('a', 'Control+Alt+1')], () => {})
    registry.syncAll([profile('a', 'Control+Alt+9')], () => {})

    expect(api.unregisterAll).toHaveBeenCalledTimes(2)
    expect(registered).toEqual(['Control+Alt+9'])
  })

  it('forgets the status of a deleted profile', () => {
    const registry = new HotkeyRegistry(api)
    registry.syncAll([profile('a', 'Control+Alt+1')], () => {})
    registry.syncAll([], () => {})

    expect(registry.statusFor('a')).toBe('none')
  })

  it('fires the trigger with the profile that owns the combo', () => {
    const trigger = vi.fn()
    const registry = new HotkeyRegistry({
      register: (_accelerator, callback) => {
        callback()
        return true
      },
      unregisterAll: vi.fn()
    })
    const target = profile('a', 'Control+Alt+1')
    registry.syncAll([target], trigger)

    expect(trigger).toHaveBeenCalledWith(target)
  })
})

describe('releaseAll', () => {
  it('unregisters and clears every status', () => {
    const registry = new HotkeyRegistry(api)
    registry.syncAll([profile('a', 'Control+Alt+1')], () => {})
    registry.releaseAll()

    expect(api.unregisterAll).toHaveBeenCalled()
    expect(registry.statusFor('a')).toBe('none')
  })
})
