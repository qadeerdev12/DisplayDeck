interface DisplayNoticeProps {
  attachedScreens: { id: string; name: string }[]
  profileCount: number
}

/**
 * Shown when nothing can be applied. Without it the window is a list of
 * uniformly greyed cards with no explanation of what changed.
 */
export function DisplayNotice({
  attachedScreens,
  profileCount
}: DisplayNoticeProps): React.JSX.Element {
  const nothingDetected = attachedScreens.length === 0

  return (
    <div className="mt-5 rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
      <h2 className="text-sm font-medium text-neutral-100">
        {nothingDetected
          ? 'No displays detected'
          : attachedScreens.length === 1
            ? 'Only one display is connected'
            : 'None of your profiles match what is connected'}
      </h2>

      <p className="mt-2 text-xs leading-relaxed text-neutral-400">
        {nothingDetected ? (
          'DisplayDeck could not read any displays. If your Mac is asleep or the screens are off, wake them and this will update on its own.'
        ) : (
          <>
            {profileCount === 1 ? 'Your profile needs' : 'Your profiles need'} displays that are
            not attached right now. Reconnect them and the list becomes available again — nothing
            has been lost.
          </>
        )}
      </p>

      {attachedScreens.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
            Connected now
          </p>
          <ul className="mt-1.5 space-y-1">
            {attachedScreens.map((screen) => (
              <li key={screen.id} className="flex items-center gap-2 text-xs text-neutral-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {screen.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
