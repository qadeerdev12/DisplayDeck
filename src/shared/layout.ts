import type { Screen } from './types'

export interface LayoutRect {
  id: string
  name: string
  /** Position and size in SVG user units, already scaled and centred. */
  x: number
  y: number
  width: number
  height: number
  /** Diagonal inches parsed from the displayplacer name, when it states one. */
  inches: number | null
  rotated: boolean
  isPrimary: boolean
}

export interface Layout {
  width: number
  height: number
  rects: LayoutRect[]
}

export interface LayoutOptions {
  width: number
  height: number
  padding?: number
}

/** displayplacer names screens like "27 inch external screen". */
export function parseInches(name: string): number | null {
  const match = /(\d+(?:\.\d+)?)\s*inch/i.exec(name)
  return match?.[1] ? Number(match[1]) : null
}

/**
 * macOS places the primary display at the origin and everything else relative
 * to it, so a display stacked above sits at a negative Y and one to the left
 * at a negative X. Normalising the bounding box to (0,0) is what lets the
 * preview draw those without clipping them out of the viewBox.
 */
export function computeLayout(screens: Screen[], options: LayoutOptions): Layout {
  const { width: canvasWidth, height: canvasHeight, padding = 8 } = options
  const visible = screens.filter(
    (screen) => screen.enabled && screen.boxWidth > 0 && screen.boxHeight > 0
  )

  if (visible.length === 0) {
    return { width: canvasWidth, height: canvasHeight, rects: [] }
  }

  const minX = Math.min(...visible.map((screen) => screen.x))
  const minY = Math.min(...visible.map((screen) => screen.y))
  const maxX = Math.max(...visible.map((screen) => screen.x + screen.boxWidth))
  const maxY = Math.max(...visible.map((screen) => screen.y + screen.boxHeight))

  const desktopWidth = maxX - minX
  const desktopHeight = maxY - minY

  const availableWidth = Math.max(canvasWidth - padding * 2, 1)
  const availableHeight = Math.max(canvasHeight - padding * 2, 1)

  // One scale for both axes keeps each display's proportions honest.
  const scale = Math.min(availableWidth / desktopWidth, availableHeight / desktopHeight)

  const offsetX = padding + (availableWidth - desktopWidth * scale) / 2
  const offsetY = padding + (availableHeight - desktopHeight * scale) / 2

  return {
    width: canvasWidth,
    height: canvasHeight,
    rects: visible.map((screen) => ({
      id: screen.id,
      name: screen.name,
      x: offsetX + (screen.x - minX) * scale,
      y: offsetY + (screen.y - minY) * scale,
      width: screen.boxWidth * scale,
      height: screen.boxHeight * scale,
      inches: parseInches(screen.name),
      rotated: screen.degree === 90 || screen.degree === 270,
      isPrimary: screen.x === 0 && screen.y === 0
    }))
  }
}

/** A profile can only be applied if every screen it names is attached. */
export function missingScreens(screens: Screen[], attachedIds: string[]): Screen[] {
  const attached = new Set(attachedIds)
  return screens.filter((screen) => !attached.has(screen.id))
}
