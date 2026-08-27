import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  BinaryNotFoundError,
  ParseError,
  applyProfile,
  captureProfile,
  computeSignature,
  extractArgs,
  isBinaryInstalled,
  parseList,
  resolveBinary
} from '../src/main/displayplacer'
import type { ProcessRunner } from '../src/shared/types'

const fixture = (name: string): string =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf8')

const THREE_SCREENS = fixture('three-screens.txt')
const ROTATED = fixture('three-screens-rotated.txt')

const MAIN_ID = 'F9CEA7EB-ACAC-4971-84D4-C457DC1DAEA2'
const SIDE_ID = '413B42A7-7DBC-496D-9457-542A6F58A7BE'
const STACKED_ID = 'A4F5805B-8517-4518-A253-F86D817C5E2C'

const runnerReturning = (stdout: string, code = 0): ProcessRunner =>
  vi.fn(async () => ({ stdout, stderr: '', code }))

const alwaysExists = (): boolean => true
const neverExists = (): boolean => false

describe('resolveBinary', () => {
  it('probes absolute paths and returns the first hit', () => {
    expect(resolveBinary((p) => p === '/usr/local/bin/displayplacer')).toBe(
      '/usr/local/bin/displayplacer'
    )
  })

  it('prefers homebrew arm64 over intel', () => {
    expect(resolveBinary(alwaysExists)).toBe('/opt/homebrew/bin/displayplacer')
  })

  it('throws a named error when the binary is absent', () => {
    expect(() => resolveBinary(neverExists)).toThrow(BinaryNotFoundError)
    expect(() => resolveBinary(neverExists)).toThrow(/brew install displayplacer/)
    expect(isBinaryInstalled(neverExists)).toBe(false)
  })
})

describe('extractArgs', () => {
  it('takes the quoted args from the trailing command line', () => {
    const args = extractArgs(THREE_SCREENS)
    expect(args).toHaveLength(3)
    expect(args[0]).toContain(`id:${MAIN_ID}`)
    expect(args[0]).toContain('origin:(0,0)')
  })

  it('throws when no command line is present', () => {
    expect(() => extractArgs('some unrelated output')).toThrow(ParseError)
  })
})

describe('parseList — three screens, one stacked above', () => {
  const { args, screens } = parseList(THREE_SCREENS)

  it('returns one screen per quoted arg', () => {
    expect(screens).toHaveLength(3)
    expect(args).toHaveLength(3)
  })

  it('maps friendly names from the Type: lines', () => {
    expect(screens.map((s) => s.name)).toEqual([
      '32 inch external screen',
      '24 inch external screen',
      '27 inch external screen'
    ])
  })

  it('reads geometry including a negative Y origin', () => {
    const stacked = screens.find((s) => s.id === STACKED_ID)
    expect(stacked).toMatchObject({ x: 0, y: -1440, width: 2560, height: 1440 })
  })

  it('reads a non-zero Y offset on the side display', () => {
    expect(screens.find((s) => s.id === SIDE_ID)).toMatchObject({
      x: 2560,
      y: 271,
      width: 1920,
      height: 1080,
      hz: 60
    })
  })

  it('leaves unrotated footprints equal to the framebuffer', () => {
    for (const screen of screens) {
      expect(screen.degree).toBe(0)
      expect(screen.boxWidth).toBe(screen.width)
      expect(screen.boxHeight).toBe(screen.height)
    }
  })

  it('marks every screen enabled and keeps the raw arg', () => {
    for (const screen of screens) {
      expect(screen.enabled).toBe(true)
      expect(screen.raw).toContain(`id:${screen.id}`)
    }
  })
})

describe('parseList — rotated screen', () => {
  const { screens } = parseList(ROTATED)
  const rotated = screens.find((s) => s.id === SIDE_ID)

  // displayplacer emits `res:1080x1920` for this screen: the footprint, not the
  // 1920x1080 panel. box* must stay portrait or the preview draws it sideways.
  it('swaps boxWidth/boxHeight relative to width/height at degree:90', () => {
    expect(rotated).toBeDefined()
    expect(rotated?.degree).toBe(90)
    expect(rotated?.width).toBe(1920)
    expect(rotated?.height).toBe(1080)
    expect(rotated?.boxWidth).toBe(1080)
    expect(rotated?.boxHeight).toBe(1920)
  })

  it('keeps the footprint taller than it is wide', () => {
    expect(rotated!.boxHeight).toBeGreaterThan(rotated!.boxWidth)
  })

  it('preserves the origin of the rotated screen', () => {
    expect(rotated?.x).toBe(2560)
    expect(rotated?.y).toBe(271)
  })

  it('still sees the negative Y origin on the stacked screen', () => {
    expect(screens.find((s) => s.id === STACKED_ID)).toMatchObject({ x: 0, y: -1440 })
  })

  it('leaves the unrotated screens untouched', () => {
    const main = screens.find((s) => s.id === MAIN_ID)
    expect(main?.boxWidth).toBe(2560)
    expect(main?.boxHeight).toBe(1440)
    expect(main?.width).toBe(2560)
    expect(main?.height).toBe(1440)
  })
})

describe('computeSignature', () => {
  it('is order-independent', () => {
    const { screens } = parseList(THREE_SCREENS)
    const reversed = [...screens].reverse()
    expect(computeSignature(screens)).toBe(computeSignature(reversed))
    expect(computeSignature(screens)).toBe([MAIN_ID, SIDE_ID, STACKED_ID].sort().join('|'))
  })
})

describe('captureProfile', () => {
  it('shells out to `list` and builds a profile', async () => {
    const runner = runnerReturning(THREE_SCREENS)
    const profile = await captureProfile('Desk', runner, alwaysExists)

    expect(runner).toHaveBeenCalledWith('/opt/homebrew/bin/displayplacer', ['list'])
    expect(profile.name).toBe('Desk')
    expect(profile.args).toHaveLength(3)
    expect(profile.screens).toHaveLength(3)
    expect(profile.hotkey).toBeNull()
    expect(profile.autoApply).toBe(false)
    expect(profile.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(Date.parse(profile.createdAt)).not.toBeNaN()
  })

  it('surfaces a non-zero exit from list', async () => {
    const runner: ProcessRunner = async () => ({ stdout: '', stderr: 'boom', code: 2 })
    await expect(captureProfile('Desk', runner, alwaysExists)).rejects.toThrow(/code 2/)
  })
})

describe('applyProfile', () => {
  it('passes the saved args back verbatim', async () => {
    const runner = runnerReturning('')
    const { args } = parseList(THREE_SCREENS)

    const result = await applyProfile({ args }, runner, alwaysExists)

    expect(result.ok).toBe(true)
    expect(runner).toHaveBeenCalledWith('/opt/homebrew/bin/displayplacer', args)
  })

  it.each(['unable', 'cannot', 'error'])(
    'reports failure when stdout says "%s" despite exit code 0',
    async (marker) => {
      const stdout = `displayplacer ${marker} to set screen 1234 to res:1920x1080`
      const result = await applyProfile({ args: ['id:x'] }, runnerReturning(stdout), alwaysExists)

      expect(result.ok).toBe(false)
      expect(result.error).toContain(marker)
    }
  )

  it('is case-insensitive about failure wording', async () => {
    const result = await applyProfile(
      { args: ['id:x'] },
      runnerReturning('Unable to find screen'),
      alwaysExists
    )
    expect(result.ok).toBe(false)
  })

  it('reports failure on a non-zero exit with clean stdout', async () => {
    const runner: ProcessRunner = async () => ({ stdout: '', stderr: 'killed', code: 9 })
    const result = await applyProfile({ args: ['id:x'] }, runner, alwaysExists)
    expect(result).toEqual({ ok: false, error: 'killed' })
  })

  it('never spawns when the binary is missing', async () => {
    const runner = runnerReturning('')
    await expect(applyProfile({ args: ['id:x'] }, runner, neverExists)).rejects.toThrow(
      BinaryNotFoundError
    )
    expect(runner).not.toHaveBeenCalled()
  })
})

describe('captureProfile — asleep displays', () => {
  // Real output from a machine whose screens had gone to sleep.
  const ASLEEP = [
    'Persistent screen id: AAA',
    'Type: 27 inch external screen',
    '',
    'displayplacer "id:AAA enabled:false" "id:BBB enabled:false"'
  ].join('\n')

  it('refuses to capture a profile that would disable every display', async () => {
    const runner = runnerReturning(ASLEEP)
    await expect(captureProfile('Asleep', runner, alwaysExists)).rejects.toThrow(
      /displays are currently active|asleep/i
    )
  })

  it('still parses the disabled screens without inventing geometry', () => {
    const { screens } = parseList(ASLEEP)
    expect(screens).toHaveLength(2)
    expect(screens.every((screen) => !screen.enabled)).toBe(true)
    expect(screens.every((screen) => screen.boxWidth === 0)).toBe(true)
  })
})
