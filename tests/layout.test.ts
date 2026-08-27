import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseList } from '../src/main/displayplacer'
import { computeLayout, missingScreens, parseInches } from '../src/shared/layout'
import type { Screen } from '../src/shared/types'

const fixture = (name: string): string =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf8')

const STACKED = parseList(fixture('three-screens.txt')).screens
const ROTATED = parseList(fixture('three-screens-rotated.txt')).screens

const CANVAS = { width: 300, height: 180, padding: 8 }

describe('parseInches', () => {
  it('reads the diagonal from a displayplacer name', () => {
    expect(parseInches('27 inch external screen')).toBe(27)
    expect(parseInches('13.6 inch built in screen')).toBe(13.6)
  })

  it('returns null when the name states no size', () => {
    expect(parseInches('Unknown screen')).toBeNull()
  })
})

describe('computeLayout — stacked display at negative Y', () => {
  const layout = computeLayout(STACKED, CANVAS)
  const byName = (needle: string) =>
    layout.rects.find((rect) => rect.name.startsWith(needle))!

  it('draws every screen', () => {
    expect(layout.rects).toHaveLength(3)
  })

  it('keeps all rects inside the canvas despite the negative origin', () => {
    for (const rect of layout.rects) {
      expect(rect.x).toBeGreaterThanOrEqual(0)
      expect(rect.y).toBeGreaterThanOrEqual(0)
      expect(rect.x + rect.width).toBeLessThanOrEqual(CANVAS.width + 0.001)
      expect(rect.y + rect.height).toBeLessThanOrEqual(CANVAS.height + 0.001)
    }
  })

  it('places the stacked screen above the main one', () => {
    expect(byName('27').y).toBeLessThan(byName('32').y)
  })

  it('places the side screen to the right of the main one', () => {
    expect(byName('24').x).toBeGreaterThan(byName('32').x)
  })

  it('aligns the left edges of the two vertically stacked screens', () => {
    expect(byName('27').x).toBeCloseTo(byName('32').x, 5)
  })

  it('marks only the screen at (0,0) as primary', () => {
    expect(layout.rects.filter((rect) => rect.isPrimary).map((rect) => rect.name)).toEqual([
      '32 inch external screen'
    ])
  })

  it('preserves each screen aspect ratio under one shared scale', () => {
    for (const rect of layout.rects) {
      const source = STACKED.find((screen) => screen.id === rect.id)!
      expect(rect.width / rect.height).toBeCloseTo(source.boxWidth / source.boxHeight, 4)
    }
  })

  it('scales the 1920-wide screen smaller than the 2560-wide one', () => {
    expect(byName('24').width).toBeLessThan(byName('32').width)
  })

  it('labels rects with their diagonal size', () => {
    expect(layout.rects.map((rect) => rect.inches).sort()).toEqual([24, 27, 32])
  })
})

describe('computeLayout — rotated display', () => {
  const layout = computeLayout(ROTATED, CANVAS)
  const rotated = layout.rects.find((rect) => rect.name.startsWith('24'))!

  it('draws the rotated screen taller than it is wide', () => {
    expect(rotated.rotated).toBe(true)
    expect(rotated.height).toBeGreaterThan(rotated.width)
  })

  it('matches the 1080x1920 footprint proportion', () => {
    expect(rotated.width / rotated.height).toBeCloseTo(1080 / 1920, 4)
  })

  it('still fits everything inside the canvas', () => {
    for (const rect of layout.rects) {
      expect(rect.x + rect.width).toBeLessThanOrEqual(CANVAS.width + 0.001)
      expect(rect.y + rect.height).toBeLessThanOrEqual(CANVAS.height + 0.001)
    }
  })
})

describe('computeLayout — edge cases', () => {
  const screen = (overrides: Partial<Screen>): Screen => ({
    id: 'a',
    name: '27 inch external screen',
    width: 2560,
    height: 1440,
    boxWidth: 2560,
    boxHeight: 1440,
    x: 0,
    y: 0,
    degree: 0,
    hz: 60,
    enabled: true,
    raw: '',
    ...overrides
  })

  it('returns no rects for an empty set', () => {
    expect(computeLayout([], CANVAS).rects).toEqual([])
  })

  it('skips disabled screens', () => {
    expect(computeLayout([screen({ enabled: false })], CANVAS).rects).toEqual([])
  })

  it('centres a single screen', () => {
    const [rect] = computeLayout([screen({})], CANVAS).rects
    expect(rect!.x + rect!.width / 2).toBeCloseTo(CANVAS.width / 2, 4)
    expect(rect!.y + rect!.height / 2).toBeCloseTo(CANVAS.height / 2, 4)
  })

  it('handles a screen entirely at negative coordinates', () => {
    const layout = computeLayout(
      [screen({ id: 'a', x: -2560, y: -1440 }), screen({ id: 'b', x: 0, y: 0 })],
      CANVAS
    )
    for (const rect of layout.rects) expect(rect.x).toBeGreaterThanOrEqual(0)
    expect(layout.rects.find((r) => r.id === 'a')!.x).toBeLessThan(
      layout.rects.find((r) => r.id === 'b')!.x
    )
  })
})

describe('missingScreens', () => {
  it('is empty when every screen is attached', () => {
    expect(missingScreens(STACKED, STACKED.map((s) => s.id))).toEqual([])
  })

  it('names the screens that are no longer attached', () => {
    const attached = STACKED.slice(0, 2).map((s) => s.id)
    expect(missingScreens(STACKED, attached).map((s) => s.name)).toEqual([
      '27 inch external screen'
    ])
  })
})
