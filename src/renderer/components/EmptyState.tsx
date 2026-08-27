import { Logo } from './Logo'

interface EmptyStateProps {
  onSave: () => void
  busy: boolean
}

export function EmptyState({ onSave, busy }: EmptyStateProps): React.JSX.Element {
  return (
    <div className="mt-12 flex flex-col items-center rounded-xl border border-dashed border-neutral-800 px-8 py-12 text-center">
      <Logo className="h-10 w-10 opacity-40" />
      <h2 className="mt-5 text-sm font-medium text-neutral-200">No profiles yet</h2>
      <p className="mt-2 max-w-xs text-xs leading-relaxed text-neutral-500">
        Arrange your displays how you like them, then save the arrangement as a profile you can
        restore from the menu bar or a shortcut.
      </p>
      <button
        type="button"
        onClick={onSave}
        disabled={busy}
        className="mt-6 rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 motion-reduce:transition-none"
      >
        {busy ? 'Saving\u2026' : 'Save your current layout'}
      </button>
    </div>
  )
}
