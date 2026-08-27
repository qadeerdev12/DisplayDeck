# DisplayDeck

macOS menu bar app for saving and restoring multi-display arrangements.
Full requirements are in `SPEC.md` — read it before starting a milestone.

## Commands
```
npm run dev      # electron-vite dev server
npm test         # vitest
npm run lint     # eslint + tsc --noEmit
npm run build    # electron-builder → DMG in release/
```

## Architecture
- Electron. Main process owns all privileged work; the renderer is pure UI.
- The renderer NEVER imports `fs`, `child_process`, or `electron` directly.
  Everything crosses via the preload `contextBridge`. If a feature seems to
  need renderer-side Node access, add an IPC channel instead.
- Display manipulation is delegated to the `displayplacer` CLI. Do not add
  native modules or CoreGraphics bindings.

## Conventions
- TypeScript strict mode. No `any` — use `unknown` and narrow.
- Named exports. No default exports except React components.
- Errors: throw typed error classes from main, catch at the IPC boundary,
  return `{ ok: false, error: string }` to the renderer. Never swallow.
- Tailwind only. No CSS files, no inline `style` except computed SVG geometry.
- Comments explain *why*, not *what*. Absence of a comment is fine.

## Testing
- Unit tests for parsing and layout maths. Inject the process runner as a
  dependency — never spawn a real binary in tests.
- No E2E. Manual verification against the milestone acceptance criteria.

## Working agreement
- Follow the milestone order in `SPEC.md`. Finish one before starting the next.
- State a milestone's acceptance criteria as met only when you have actually
  run the check. If you cannot verify something (needs real hardware), say so
  explicitly rather than assuming.
- Prefer editing existing files over creating new ones.
- Ask before adding a dependency that isn't in `SPEC.md` §4.
