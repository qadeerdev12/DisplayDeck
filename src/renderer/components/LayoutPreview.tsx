import { computeLayout } from '../../shared/layout'
import type { Screen } from '../../shared/types'

interface LayoutPreviewProps {
  screens: Screen[]
  width?: number
  height?: number
  dimmed?: boolean
}

export function LayoutPreview({
  screens,
  width = 300,
  height = 150,
  dimmed = false
}: LayoutPreviewProps): React.JSX.Element {
  const layout = computeLayout(screens, { width, height, padding: 10 })

  if (layout.rects.length === 0) {
    return (
      <div className="flex h-[150px] items-center justify-center rounded-lg border border-dashed border-neutral-800 text-xs text-neutral-600">
        No active displays to preview
      </div>
    )
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`w-full rounded-lg border border-neutral-800/80 bg-neutral-950 ${
        dimmed ? 'opacity-40' : ''
      }`}
      role="img"
      aria-label={`Layout of ${layout.rects.length} displays: ${layout.rects
        .map((rect) => `${rect.name}${rect.isPrimary ? ' (primary)' : ''}`)
        .join(', ')}`}
    >
      {layout.rects.map((rect) => {
        const labelSize = Math.min(12, Math.max(7, rect.width / 4.5))
        const showLabel = rect.height > labelSize * 1.8 && rect.width > labelSize * 2.2
        const showDot = rect.isPrimary && rect.height > 34 && rect.width > 34

        return (
          <g key={rect.id}>
            <title>
              {rect.name}
              {rect.rotated ? ' (rotated)' : ''}
              {rect.isPrimary ? ' — primary' : ''}
            </title>
            <rect
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              rx={4}
              className={
                rect.isPrimary
                  ? 'fill-sky-500/20 stroke-sky-400/80'
                  : 'fill-neutral-800/60 stroke-neutral-600/80'
              }
              strokeWidth={1.25}
            />
            {showLabel && (
              <text
                x={rect.x + rect.width / 2}
                y={rect.y + rect.height / 2 + (showDot ? -3 : 0)}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={labelSize}
                className={`font-medium ${rect.isPrimary ? 'fill-sky-100' : 'fill-neutral-400'}`}
              >
                {rect.inches === null ? '?' : `${rect.inches}″`}
              </text>
            )}
            {showDot && (
              // A dot rather than the word "primary": the rects get small.
              <circle
                cx={rect.x + rect.width / 2}
                cy={rect.y + rect.height / 2 + labelSize * 0.75}
                r={1.8}
                className="fill-sky-400"
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}
