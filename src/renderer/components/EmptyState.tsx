interface EmptyStateProps {
  onSave: () => void
  busy: boolean
}

export function EmptyState({ onSave, busy }: EmptyStateProps): React.JSX.Element {
  return (
    <div className="mt-10 rounded-xl border border-dashed border-neutral-800 p-10 text-center">
      <h2 className="text-sm font-medium text-neutral-200">No profiles yet</h2>
      <p className="mx-auto mt-2 max-w-xs text-xs text-neutral-500">
        Arrange your displays how you like them, then save the arrangement as a profile you can
        restore any time.
      </p>
      <button
        type="button"
        onClick={onSave}
        disabled={busy}
        className="mt-5 rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
      >
        Save your current layout
      </button>
    </div>
  )
}
