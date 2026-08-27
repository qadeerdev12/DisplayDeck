import { computeLayout } from '../../shared/layout'
import type { Screen } from '../../shared/types'

interface LayoutPreviewProps {
  screens: Screen[]
  width?: number
  height?: number
  dimmed?: boolean
}

const CORNER_RADIUS = 3

export function LayoutPreview({
  screens,
  width = 300,
  height = 150,
  dimmed = false
}: LayoutPreviewProps): React.JSX.Element {
  const layout = computeLayout(screens, { width, height, padding: 6 })

  if (layout.rects.length === 0) {
    return (
      <div className="flex h-[150px] items-center justify-center rounded-lg bg-neutral-900 text-xs text-neutral-500">
        No screens to preview
      </div>
    )
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`w-full rounded-lg bg-neutral-900 ${dimmed ? 'opacity-40' : ''}`}
      role="img"
      aria-label={`Layout of ${layout.rects.length} displays: ${layout.rects
        .map((rect) => `${rect.name}${rect.isPrimary ? ' (primary)' : ''}`)
        .join(', ')}`}
    >
      {layout.rects.map((rect) => {
        const labelSize = Math.min(11, Math.max(7, rect.width / 5))
        const fits = rect.height > labelSize * 1.6 && rect.width > labelSize * 2

        return (
          <g key={rect.id}>
            <rect
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              rx={CORNER_RADIUS}
              className={
                rect.isPrimary
                  ? 'fill-sky-500/25 stroke-sky-400'
                  : 'fill-neutral-700/40 stroke-neutral-500'
              }
              strokeWidth={1}
            />
            {fits && (
              <text
                x={rect.x + rect.width / 2}
                y={rect.y + rect.height / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={labelSize}
                className={rect.isPrimary ? 'fill-sky-100' : 'fill-neutral-300'}
              >
                {rect.inches === null ? '?' : `${rect.inches}″`}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
