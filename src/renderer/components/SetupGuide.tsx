import { useState } from 'react'

interface SetupGuideProps {
  installCommand: string
}

export function SetupGuide({ installCommand }: SetupGuideProps): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(installCommand)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mt-6 rounded-xl border border-amber-900/60 bg-amber-950/30 p-5">
      <h2 className="text-sm font-medium text-amber-200">displayplacer is not installed</h2>
      <p className="mt-2 text-xs text-amber-200/70">
        DisplayDeck uses the displayplacer command line tool to read and set your display
        arrangement. Run this in Terminal, then reopen DisplayDeck.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 rounded-lg bg-neutral-950 px-3 py-2 font-mono text-xs text-neutral-200">
          {installCommand}
        </code>
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded-lg border border-amber-800 px-3 py-2 text-xs font-medium text-amber-200 hover:bg-amber-900/40"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}
