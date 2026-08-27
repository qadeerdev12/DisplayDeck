interface LogoProps {
  className?: string
}

/** The app icon's motif: two stacked displays with a portrait one beside them. */
export function Logo({ className = 'h-5 w-5' }: LogoProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <rect x="1.4" y="2" width="8" height="5.2" rx="1" className="fill-sky-500" />
      <rect x="1.4" y="8.2" width="8" height="5.2" rx="1" className="fill-neutral-600" />
      <rect x="10.2" y="4.4" width="4.4" height="7.8" rx="1" className="fill-neutral-600" />
    </svg>
  )
}
