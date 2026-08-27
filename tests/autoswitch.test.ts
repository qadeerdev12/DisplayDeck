import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AutoSwitcher, type AutoSwitchDeps } from '../src/main/autoswitch'
import type { Profile } from '../src/shared/types'

const profile = (overrides: Partial<Profile>): Profile => ({
  id: 'a',
  name: 'Desk',
  args: [],
  screens: [],
  signature: 'A|B|C',
  hotkey: null,
  autoApply: true,
  createdAt: '2026-08-27T00:00:00.000Z',
  ...overrides
})

/** Controllable clock and timer queue: no real waiting, no flake. */
class Harness {
  time = 10_000
  private queue: { at: number; fn: () => void; handle: NodeJS.Timeout }[] = []
  private nextHandle = 1

  apply = vi.fn(async () => true)
  getCurrentSignature = vi.fn(async () => 'A|B|C')
  onError = vi.fn()
  profiles: Profile[] = [profile({})]

  deps(): AutoSwitchDeps {
    return {
      getProfiles: () => this.profiles,
      getCurrentSignature: this.getCurrentSignature,
      apply: this.apply,
      onError: this.onError,
      now: () => this.time,
      schedule: (fn, ms) => {
        const handle = this.nextHandle++ as unknown as NodeJS.Timeout
        this.queue.push({ at: this.time + ms, fn, handle })
        return handle
      },
      cancel: (handle) => {
        this.queue = this.queue.filter((entry) => entry.handle !== handle)
      }
    }
  }

  /** Advance the clock, firing anything scheduled along the way. */
  async advance(ms: number): Promise<void> {
    const target = this.time + ms
    for (;;) {
      const due = this.queue
        .filter((entry) => entry.at <= target)
        .sort((a, b) => a.at - b.at)[0]
      if (!due) break
      this.queue = this.queue.filter((entry) => entry !== due)
      this.time = due.at
      due.fn()
      await Promise.resolve()
      await Promise.resolve()
    }
    this.time = target
    await Promise.resolve()
  }
}

let harness: Harness
let switcher: AutoSwitcher

beforeEach(() => {
  harness = new Harness()
  switcher = new AutoSwitcher(harness.deps())
})

describe('debouncing a dock event', () => {
  it('does nothing before the debounce elapses', async () => {
    switcher.handleDisplayChange()
    await harness.advance(1400)
    expect(harness.apply).not.toHaveBeenCalled()
  })

  it('applies once after the debounce', async () => {
    switcher.handleDisplayChange()
    await harness.advance(1600)
    expect(harness.apply).toHaveBeenCalledTimes(1)
  })

  it('collapses a burst of events into a single apply', async () => {
    // macOS emits several add/remove events for one physical dock action.
    for (let i = 0; i < 6; i += 1) {
      switcher.handleDisplayChange()
      await harness.advance(200)
    }
    await harness.advance(1600)

    expect(harness.apply).toHaveBeenCalledTimes(1)
  })
})

describe('choosing a profile', () => {
  it('ignores profiles that are not marked autoApply', async () => {
    harness.profiles = [profile({ autoApply: false })]
    switcher.handleDisplayChange()
    await harness.advance(1600)

    expect(harness.apply).not.toHaveBeenCalled()
  })

  it('ignores profiles whose signature does not match', async () => {
    harness.profiles = [profile({ signature: 'X|Y' })]
    switcher.handleDisplayChange()
    await harness.advance(1600)

    expect(harness.apply).not.toHaveBeenCalled()
  })

  it('applies the first matching profile when several qualify', async () => {
    harness.profiles = [
      profile({ id: 'first', name: 'First' }),
      profile({ id: 'second', name: 'Second' })
    ]
    switcher.handleDisplayChange()
    await harness.advance(1600)

    expect(harness.apply).toHaveBeenCalledTimes(1)
    expect(harness.apply).toHaveBeenCalledWith(expect.objectContaining({ id: 'first' }))
  })
})

describe('the manual-apply guard', () => {
  it('skips an auto-apply within 5s of a manual one', async () => {
    switcher.noteApplied()
    switcher.handleDisplayChange()
    await harness.advance(1600)

    expect(harness.apply).not.toHaveBeenCalled()
  })

  it('allows an auto-apply once the guard expires', async () => {
    switcher.noteApplied()
    harness.time += 5100
    switcher.handleDisplayChange()
    await harness.advance(1600)

    expect(harness.apply).toHaveBeenCalledTimes(1)
  })
})

describe('not reacting to its own work', () => {
  it('applies exactly once when its own apply causes more display events', async () => {
    // Rotating or enabling a screen makes macOS emit further add/remove events.
    harness.apply = vi.fn(async () => {
      switcher.handleDisplayChange()
      switcher.handleDisplayChange()
      return true
    })
    switcher = new AutoSwitcher(harness.deps())

    switcher.handleDisplayChange()
    await harness.advance(1600)
    await harness.advance(1600)

    expect(harness.apply).toHaveBeenCalledTimes(1)
  })

  it('stays quiet through an echo of events inside the guard window', async () => {
    switcher.handleDisplayChange()
    await harness.advance(1600)
    expect(harness.apply).toHaveBeenCalledTimes(1)

    // Three more settling events, all landing inside the 5s guard.
    for (let i = 0; i < 3; i += 1) {
      switcher.handleDisplayChange()
      await harness.advance(1100)
    }
    expect(harness.apply).toHaveBeenCalledTimes(1)
  })

  it('will apply again for a genuinely later dock event', async () => {
    switcher.handleDisplayChange()
    await harness.advance(1600)

    harness.time += 6000
    switcher.handleDisplayChange()
    await harness.advance(1600)

    expect(harness.apply).toHaveBeenCalledTimes(2)
  })
})

describe('failures', () => {
  it('reports a failed apply and does not retry in a loop', async () => {
    harness.apply = vi.fn(async () => false)
    switcher = new AutoSwitcher(harness.deps())

    switcher.handleDisplayChange()
    await harness.advance(1600)
    switcher.handleDisplayChange()
    await harness.advance(1600)

    expect(harness.apply).toHaveBeenCalledTimes(1)
    expect(harness.onError).toHaveBeenCalledWith(expect.stringContaining('Could not auto-apply'))
  })

  it('reports a signature lookup failure without throwing', async () => {
    harness.getCurrentSignature = vi.fn(async () => {
      throw new Error('displayplacer is not installed')
    })
    switcher = new AutoSwitcher(harness.deps())

    switcher.handleDisplayChange()
    await harness.advance(1600)

    expect(harness.onError).toHaveBeenCalledWith('displayplacer is not installed')
    expect(harness.apply).not.toHaveBeenCalled()
  })
})

describe('dispose', () => {
  it('cancels a pending debounce', async () => {
    switcher.handleDisplayChange()
    switcher.dispose()
    await harness.advance(2000)

    expect(harness.apply).not.toHaveBeenCalled()
  })
})
