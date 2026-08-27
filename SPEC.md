# DisplayDeck — Product Specification

> Read this file fully before writing code. Work milestone by milestone.
> Do not begin a milestone until the previous one's acceptance criteria pass.

---

## 1. Problem

I run three external displays on macOS: two stacked vertically and a third
to the side that I rotate between landscape and portrait depending on what
I'm doing. Rearranging them means opening System Settings > Displays and
dragging boxes around — several times a day.

**One sentence:** save named display arrangements and restore them from the
menu bar or a hotkey.

## 2. Scope

### In scope (v1)
- Save the current display arrangement as a named profile
- Restore a saved profile from a menu bar dropdown
- Global hotkey per profile
- Visual preview of each profile's layout
- Auto-apply a matching profile when displays are connected/disconnected
- Signed-adjacent DMG build with a README covering Gatekeeper

### Explicitly out of scope (v1) — do not build these
- Restoring window positions (v2; large and separate)
- Windows or Linux support
- Cloud sync, accounts, telemetry, auto-update
- Per-display colour profiles, night shift, brightness

## 3. Users and stories

Single user: a developer with a multi-monitor desk setup.

1. As a user, I arrange my displays how I like, click **Save current layout**,
   name it "Portrait side", and see it in my profile list.
2. As a user, I click a profile in the menu bar and my displays rearrange
   within a few seconds.
3. As a user, I press `⌃⌥1` and the same thing happens without opening the app.
4. As a user, I undock my laptop and re-dock it, and my desk profile is applied
   automatically without me touching anything.
5. As a user, I open the app for the first time without `displayplacer`
   installed and I'm told exactly what to run.

## 4. Technical approach

### The core decision
Do **not** call CoreGraphics display APIs directly. Shell out to
[`displayplacer`](https://github.com/jakehilborn/displayplacer).

`displayplacer list` ends its output with a ready-to-run command that
reproduces the current arrangement. Saving a profile means capturing the
quoted arguments from that line. Applying a profile means passing those
arguments straight back to the binary. This is the entire engine.

### Stack
| Concern | Choice | Notes |
|---|---|---|
| Shell | Electron | Needs a tray + global hotkeys |
| Scaffold | electron-vite | React + HMR out of the box |
| UI | React 18 + TypeScript | |
| Styling | Tailwind | |
| Storage | JSON in `app.getPath('userData')` | No database. ~10 profiles max. |
| Packaging | electron-builder | DMG target, arm64 + x64 |
| Tests | Vitest | Parser logic only; no E2E |

### Structure
```
src/
  main/          # Node context
    index.ts     # app lifecycle, window, display-change watcher
    displayplacer.ts  # binary resolution, parsing, capture, apply
    store.ts     # profile CRUD against JSON
    tray.ts      # menu bar icon + menu
    hotkeys.ts   # globalShortcut registration
    ipc.ts       # channel handlers
  preload/
    index.ts     # contextBridge surface only
  renderer/
    App.tsx
    components/  # ProfileCard, LayoutPreview, EmptyState, SetupGuide
```

### Security
`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
The renderer never spawns processes or touches the filesystem — everything
goes through named IPC channels defined in the preload bridge.

## 5. Data model

```ts
interface Screen {
  id: string;          // persistent UUID from displayplacer
  name: string;        // e.g. "27 inch external screen"
  width: number;       // framebuffer width
  height: number;
  boxWidth: number;    // on-desktop footprint — w/h swapped when rotated
  boxHeight: number;
  x: number;           // origin, may be negative
  y: number;
  degree: 0 | 90 | 180 | 270;
  hz: number | null;
  enabled: boolean;
  raw: string;         // original arg string
}

interface Profile {
  id: string;
  name: string;
  args: string[];      // passed verbatim to displayplacer
  screens: Screen[];   // for rendering the preview
  signature: string;   // sorted screen ids joined by "|"
  hotkey: string | null;   // Electron accelerator, e.g. "Control+Alt+1"
  autoApply: boolean;
  createdAt: string;
}
```

Persisted as `{ version: 1, profiles: Profile[] }` at
`<userData>/profiles.json`. Write atomically (temp file + rename) so a crash
mid-write can't corrupt it.

## 6. Milestones

### M1 — Engine
Implement `src/main/displayplacer.ts`:
- `resolveBinary()` — probe `/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`
  by absolute path. **Do not** rely on `PATH` lookup (see §8).
- `parseList(stdout)` — extract quoted args from the final `displayplacer "…"`
  line; map screen ids to friendly names from the `Type:` lines above it.
- `captureProfile(name)`, `applyProfile(profile)`.

**Acceptance:** unit tests pass against a fixture of `displayplacer list`
output containing three screens, one at a negative Y origin and one at
`degree:90`. The rotated screen must report `boxWidth`/`boxHeight` swapped
relative to `width`/`height`. `applyProfile` must pass saved args verbatim,
and must return `ok: false` when stdout contains "unable"/"cannot"/"error"
(displayplacer exits 0 even on per-screen failure).

### M2 — Persistence + IPC
`store.ts` with list/create/rename/delete/reorder. Preload bridge exposing
exactly: `listProfiles`, `saveCurrent`, `applyProfile`, `renameProfile`,
`deleteProfile`, `setHotkey`, `getSetupState`.

**Acceptance:** profiles survive an app restart. Renderer has no access to
`require`, `fs`, or `child_process` — verify from devtools console.

### M3 — UI
Profile list with, per profile: name, `LayoutPreview`, hotkey badge, apply
button, overflow menu (rename/delete).

`LayoutPreview` renders screens as SVG rectangles. Normalise: find the
bounding box across all screens, translate so min x/y is 0, scale to fit the
container preserving aspect ratio. Label each rect with its diagonal size.
Mark the screen at origin `(0,0)` as primary. **Origins can be negative** —
a stacked-above display sits at negative Y.

Empty state prompts "Save your current layout". Setup state (binary missing)
shows a copyable `brew install displayplacer`.

**Acceptance:** a three-screen profile with a stacked and a rotated display
renders in correct relative position and proportion.

### M4 — Tray and hotkeys
- `app.dock.hide()` and `"LSUIElement": true` in the builder config —
  menu bar only, no Dock icon.
- Template image tray icon so it inverts correctly in dark mode.
- Tray menu: profile list (checkmark on the active one), Save current layout,
  Open DisplayDeck, Quit.
- `globalShortcut.register` per profile on ready; `unregisterAll()` on quit.
  Registration can fail if another app owns the combo — surface that in the UI
  rather than failing silently.

**Acceptance:** hotkey works with the window closed. Quitting releases all
shortcuts (a second launch registers cleanly).

### M5 — Auto-switch
Watch `screen.on('display-added')` and `screen.on('display-removed')`.
Debounce ~1500ms — macOS fires these in bursts during a single dock event.
After the debounce, compute the current signature and apply the first profile
with `autoApply: true` and a matching signature. Never auto-apply within 5s
of a manual apply.

**Acceptance:** unplugging and replugging a display applies the matching
profile exactly once, not repeatedly.

### M6 — Packaging
electron-builder DMG, arm64 + x64. Ad-hoc signed. README documents the
right-click → Open workaround and the `displayplacer` prerequisite.

**Acceptance:** DMG installs and runs on a machine that has never had the
dev environment on it.

## 7. Non-functional

- Apply completes in under 3s for three displays (rotation is the slow part —
  displayplacer waits for the screen to finish rotating).
- Idle memory under 150MB.
- Every failure path shows a message naming the cause. No silent catches.
- Keyboard navigable; respects `prefers-reduced-motion`.

## 8. Known traps

1. **PATH.** An `.app` launched from Finder does not inherit the shell
   environment. `displayplacer` will be found in `npm run dev` and not found
   in the packaged build. Resolve by absolute path.
2. **Exit code 0 on failure.** displayplacer reports per-screen problems on
   stdout while exiting successfully. Parse the output; don't trust the code.
3. **Display ids.** Persistent ids are stable across ports but change if the
   monitor itself is swapped. If a profile's ids don't match any attached
   display, disable it in the UI with an explanation — don't try to apply it.
4. **Bundling the binary** requires codesigning it as a nested executable and
   checking its licence. v1 requires the user to `brew install` it.
5. **Rotation crashes SystemUIServer** on some macOS versions when rotating
   the internal display. Out of our control; note it in the README.

## 9. Definition of done

- All milestone acceptance criteria pass
- `npm test` green, `npm run lint` clean, no TypeScript errors
- README with screenshot, install steps, and the Gatekeeper note
- Fresh clone → `npm install && npm run build` produces a working DMG
