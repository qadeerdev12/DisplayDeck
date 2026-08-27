import { globalShortcut } from 'electron'
import type { HotkeyStatus, Profile } from '../shared/types'

/** The slice of Electron's globalShortcut this module needs, so tests can fake it. */
export interface ShortcutApi {
  register: (accelerator: string, callback: () => void) => boolean
  unregisterAll: () => void
}

const electronShortcuts: ShortcutApi = {
  register: (accelerator, callback) => globalShortcut.register(accelerator, callback),
  unregisterAll: () => globalShortcut.unregisterAll()
}

export class HotkeyRegistry {
  private statuses = new Map<string, HotkeyStatus>()

  constructor(private readonly api: ShortcutApi = electronShortcuts) {}

  /**
   * Registration is all-or-nothing per launch: everything is released first so
   * a renamed or reassigned combo cannot leave a stale shortcut behind.
   */
  syncAll(profiles: Profile[], trigger: (profile: Profile) => void): Map<string, HotkeyStatus> {
    this.api.unregisterAll()
    this.statuses = new Map()

    for (const profile of profiles) {
      if (!profile.hotkey) {
        this.statuses.set(profile.id, 'none')
        continue
      }

      let ok: boolean
      try {
        ok = this.api.register(profile.hotkey, () => trigger(profile))
      } catch {
        // Electron throws on a malformed accelerator; treat it as a conflict
        // so the UI explains it instead of the app dying on startup.
        ok = false
      }
      this.statuses.set(profile.id, ok ? 'registered' : 'conflict')
    }

    return new Map(this.statuses)
  }

  statusFor(profileId: string): HotkeyStatus {
    return this.statuses.get(profileId) ?? 'none'
  }

  conflicts(profiles: Profile[]): Profile[] {
    return profiles.filter((profile) => this.statusFor(profile.id) === 'conflict')
  }

  releaseAll(): void {
    this.api.unregisterAll()
    this.statuses = new Map()
  }
}
