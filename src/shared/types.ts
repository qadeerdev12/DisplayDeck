export interface Screen {
  id: string
  name: string
  width: number
  height: number
  boxWidth: number
  boxHeight: number
  x: number
  y: number
  degree: 0 | 90 | 180 | 270
  hz: number | null
  enabled: boolean
  raw: string
}

export interface Profile {
  id: string
  name: string
  args: string[]
  screens: Screen[]
  signature: string
  hotkey: string | null
  autoApply: boolean
  createdAt: string
}

/** On-disk shape of profiles.json. */
export interface StoreFile {
  version: 1
  profiles: Profile[]
}

/** Uniform IPC return shape; main never throws across the bridge. */
export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: string }

export interface SetupState {
  binaryInstalled: boolean
  binaryPath: string | null
  installCommand: string
  /** Ids currently attached, so the UI can disable profiles it cannot apply. */
  attachedScreenIds: string[]
}

/** Result of shelling out to the displayplacer binary. */
export interface RunResult {
  stdout: string
  stderr: string
  code: number
}

/**
 * Injected so tests never spawn the real binary. Main supplies an execFile
 * wrapper; tests supply canned fixture output.
 */
export type ProcessRunner = (bin: string, args: string[]) => Promise<RunResult>
