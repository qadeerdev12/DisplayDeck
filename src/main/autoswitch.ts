import type { Profile } from '../shared/types'

export interface AutoSwitchDeps {
  getProfiles: () => Profile[]
  /** Reads the signature of whatever is attached right now. */
  getCurrentSignature: () => Promise<string>
  apply: (profile: Profile) => Promise<boolean>
  now?: () => number
  schedule?: (callback: () => void, ms: number) => NodeJS.Timeout
  cancel?: (handle: NodeJS.Timeout) => void
  /** macOS fires display events in bursts during one dock event. */
  debounceMs?: number
  /** A manual apply owns the layout briefly; auto-switch must not fight it. */
  guardMs?: number
  onError?: (message: string) => void
}

export class AutoSwitcher {
  private readonly deps: Required<Omit<AutoSwitchDeps, 'onError'>> &
    Pick<AutoSwitchDeps, 'onError'>

  private timer: NodeJS.Timeout | null = null
  private lastAppliedAt = 0
  private applying = false

  constructor(deps: AutoSwitchDeps) {
    this.deps = {
      now: () => Date.now(),
      schedule: (callback, ms) => setTimeout(callback, ms),
      cancel: (handle) => clearTimeout(handle),
      debounceMs: 1500,
      guardMs: 5000,
      ...deps
    }
  }

  /** Call for every display-added / display-removed event. */
  handleDisplayChange(): void {
    if (this.timer) this.deps.cancel(this.timer)
    this.timer = this.deps.schedule(() => {
      this.timer = null
      void this.run()
    }, this.deps.debounceMs)
  }

  /** Records an apply from any source, arming the guard window. */
  noteApplied(): void {
    this.lastAppliedAt = this.deps.now()
  }

  private withinGuard(): boolean {
    return this.deps.now() - this.lastAppliedAt < this.deps.guardMs
  }

  private async run(): Promise<void> {
    // Applying a profile rotates and re-enables screens, which makes macOS emit
    // the very events that woke us. Without both of these the app would apply
    // its own result forever.
    if (this.applying || this.withinGuard()) return

    this.applying = true
    try {
      const signature = await this.deps.getCurrentSignature()
      const match = this.deps
        .getProfiles()
        .find((profile) => profile.autoApply && profile.signature === signature)

      if (!match) return

      const ok = await this.deps.apply(match)
      // The guard arms on attempt, not success: a failed apply still disturbs
      // the displays, and retrying in a loop would be worse than stopping.
      this.noteApplied()
      if (!ok) this.deps.onError?.(`Could not auto-apply "${match.name}".`)
    } catch (cause) {
      this.deps.onError?.(cause instanceof Error ? cause.message : String(cause))
    } finally {
      this.applying = false
    }
  }

  dispose(): void {
    if (this.timer) this.deps.cancel(this.timer)
    this.timer = null
  }
}
